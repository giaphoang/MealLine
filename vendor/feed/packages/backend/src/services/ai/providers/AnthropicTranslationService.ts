// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import Anthropic from '@anthropic-ai/sdk';
import { AITranslationService, TranslationRequest, TranslationResult, ClassificationRequest, ClassificationResult, BatchTranslationRequest, BatchTranslationResult, ServiceCapabilities, ServiceLimits, ProviderAccessResult } from '../base/AITranslationService';
import { limitEnforcement } from '../../limits';
import { estimateInputTokensAndCost } from '../../token';
import { convertToPerTokenRate } from '../../token/calculation';
import ApiUsageTracker from '../../token/usage-tracker';
import { translationRecovery } from '../../translation-recovery';
import { decryptApiKey } from '../../encryption';
import { PromptBuilder } from '../prompts/PromptBuilder';
import { TemplateEngine } from '../prompts/TemplateEngine';
import {
  capabilitiesFor,
  findCatalogueEntry,
  languageCoverageFor,
  normalizeCatalogueLanguage,
  resolveReasoning,
  supportedLanguagesFor,
} from '../catalogue';

// Add delay function for rate limiting and backoff
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Optimal batch size for Anthropic tool calling with Claude 4.5 models.
// Balances throughput (fewer API calls) with quality and token efficiency.
// 40 segments × ~80 tokens/classification ≈ 3,200 tokens output (within 16K ceiling).
const ANTHROPIC_OPTIMAL_BATCH_SIZE = 40;

export class AnthropicTranslationService extends AITranslationService {
  private anthropicClient: Anthropic | null = null;
  private cachedApiKey: string | null = null;

  protected async getApiKey(): Promise<string> {
    if (!this.config?.encryptedApiKey || !this.config?.salt) {
      throw new Error('Anthropic API configuration required. Please configure API settings in Tools → AI Configuration.');
    }
    return decryptApiKey(this.config.encryptedApiKey, this.config.salt);
  }

  private async getAnthropicClient(): Promise<Anthropic> {
    if (!this.anthropicClient || !this.cachedApiKey) {
      const apiKey = await this.getApiKey();
      if (this.cachedApiKey !== apiKey) {
        // Reset client if API key changed
        this.anthropicClient = new Anthropic({ apiKey });
        this.cachedApiKey = apiKey;
      }
    }
    if (!this.anthropicClient) {
      throw new Error('Anthropic client not initialized');
    }
    return this.anthropicClient;
  }

  /**
   * How little this model can be asked to think, spelled the way it expects.
   *
   * Returns a fragment to spread into `messages.create`, empty for the models
   * FEED has always used. Every catalogued Anthropic model until now was
   * `kind: 'extended'` — manual thinking, off unless a budget is sent — so
   * sending nothing was correct and this service sent nothing.
   *
   * Claude 5 is different in a way that costs money silently: adaptive
   * thinking is **on by default at effort `high`**, and thinking is billed as
   * output. A Claude 5 model catalogued without this method would resolve
   * `low` and then run at `high` on models charging $5–$50 per million.
   *
   * Three cases, and the first is why this is not simply "send the effort".
   * D2 asks for thinking off, *or* the lowest level a model allows, and
   * measurement on 2026-09-12 shows those are different models:
   *
   *   claude-sonnet-5  thinking:{type:'disabled'}  -> OK
   *   claude-opus-5    thinking:{type:'disabled'}  -> OK
   *   claude-fable-5-1 thinking:{type:'disabled'}  -> 400 "not supported for
   *     this model. Use thinking.type.adaptive and output_config.effort"
   *
   * So where thinking can be switched off it is, which buys no thinking
   * tokens at all; where it cannot, the cheapest effort is sent instead; and
   * an administrator's explicit choice always wins over both.
   */
  private resolveThinking(model: string): Record<string, unknown> {
    const capabilities = capabilitiesFor('Anthropic', model);
    const { reasoning } = capabilities;

    // `extended` and `none` want no parameter, as before.
    if (reasoning.kind !== 'adaptive') return {};

    const requested = this.config.thinkingLevel ?? null;
    const resolved = resolveReasoning(capabilities, requested);
    for (const warning of resolved.warnings) {
      console.log(`[Anthropic Service] ${model}: ${warning}`);
    }

    if (!requested && reasoning.canDisable) {
      return { thinking: { type: 'disabled' } };
    }

    return resolved.value ? { output_config: { effort: resolved.value } } : {};
  }

  private checkAndOverrideParameters(
    model: string,
    requestedTemperature?: number,
    requestedTopP?: number
  ): {
    temperature?: number;
    topP?: number;
    warnings: string[];
  } {
    const warnings: string[] = [];
    const { sampling } = capabilitiesFor('Anthropic', model);

    if (sampling === 'unsupported') {
      // Claude 4.6 and later reject temperature/top_p/top_k outright.
      return { temperature: undefined, topP: undefined, warnings };
    }

    let temperature: number | undefined = requestedTemperature ?? 0.7;
    let topP: number | undefined = requestedTopP ?? 1.0;

    // Claude 4.5 accepts one of temperature/top_p, never both. This was
    // `model.includes('-4-5-')`, which asked the id a question only the
    // catalogue can answer.
    if (sampling === 'temperature-or-top-p' && temperature !== undefined && topP !== undefined) {
      const excludedTopP = topP;
      console.log(
        `[Anthropic Service] ${model} accepts one sampling parameter, excluding top_p (temperature=${temperature}, top_p=${excludedTopP})`
      );
      topP = undefined;
      warnings.push(
        `This model does not accept both temperature and top_p. Excluding top_p=${excludedTopP} and keeping temperature=${temperature}.`
      );
    }

    return { temperature, topP, warnings };
  }

  /**
   * Claude 4.6 and later reject an assistant message used to force a JSON
   * opening brace: `400 This model does not support assistant message
   * prefill. The conversation must end with a user message.` Measured
   * 2026-09-11 against `claude-sonnet-5`.
   *
   * Structured outputs (`output_config.format`) are the documented
   * replacement and were measured too: they work, but the schema is charged
   * as input — 220 prompt tokens against 49 for the same translation asked
   * for in the system prompt. The prompts here already ask for JSON, so the
   * cheaper path is to stop prefilling and parse what comes back.
   */
  private acceptsAssistantPrefill(model: string): boolean {
    return capabilitiesFor('Anthropic', model).prefill === 'allowed';
  }

  /**
   * Parse a JSON reply whether or not the opening brace was prefilled.
   *
   * With prefill, the model's text begins after the `{` FEED supplied. With
   * no prefill it returns the whole object, sometimes wrapped in a fenced
   * code block. Both shapes land here.
   */
  private parseJsonReply(text: string, prefilled: boolean): any {
    const candidate = prefilled ? `{${text}` : text.trim();
    try {
      return JSON.parse(candidate);
    } catch {
      const fenced = candidate.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const firstBrace = fenced.indexOf('{');
      const lastBrace = fenced.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        return JSON.parse(fenced.slice(firstBrace, lastBrace + 1));
      }
      return JSON.parse(fenced);
    }
  }

  protected normalizeLanguage(language: string): string {
    return normalizeCatalogueLanguage(language);
  }

  /**
   * Confirm the key and the configured model without paying for it.
   *
   * This used to send a real `messages.create` with `max_tokens: 1` before
   * every translation job, and flatten any failure to `false` (ISSUES.md
   * #84). `models.retrieve` is free and separates the two cases that matter:
   * a rejected key fails authentication, while a retired model — Anthropic
   * retires them on a published schedule — fails by name, which is what the
   * message to staff needs to say.
   */
  async checkAccess(): Promise<ProviderAccessResult> {
    try {
      const anthropic = await this.getAnthropicClient();
      await anthropic.models.retrieve(this.getModel());
      return { ok: true };
    } catch (error) {
      console.error('Anthropic access check failed:', error);
      return { ok: false, error };
    }
  }

  async verifyEntitlement(): Promise<ProviderAccessResult> {
    try {
      const anthropic = await this.getAnthropicClient();
      const model = this.getModel();
      await anthropic.messages.create({
        model,
        max_tokens: 16,
        ...this.resolveThinking(model),
        messages: [{ role: 'user', content: 'Reply with OK.' }],
      });
      return { ok: true };
    } catch (error) {
      console.error('Anthropic entitlement check failed:', error);
      return { ok: false, error };
    }
  }

  async validateApiKey(): Promise<boolean> {
    return (await this.checkAccess()).ok;
  }

  getServiceCapabilities(): ServiceCapabilities {
    return {
      supportsLanguages: this.getSupportedLanguages(),
      maxTokensPerRequest: this.config.maxTokens || 4096,
      supportsBatchOperations: true,
      supportsClassification: true
    };
  }

  getServiceLimits(): ServiceLimits {
    return {
      tokensPerMinute: this.config.tokensPerMinute ?? 0,
      requestsPerMinute: this.config.requestsPerMinute ?? 0,
      requestsPerDay: this.config.requestsPerDay ?? 0,
      inputCost: this.config.inputCost ?? 0,
      outputCost: this.config.outputCost ?? 0
    };
  }

  /**
   * What a call actually cost, from the token counts the provider returned.
   *
   * Two separate defects met here, both ending up in `UsageRecord.totalCost`
   * — the field the daily and monthly cost limits are enforced against.
   *
   * The translation path recorded `inputMetrics.cost + outputMetrics.cost`,
   * which is FEED's own tiktoken estimate, while `response.usage.input_tokens`
   * and `.output_tokens` sat twenty lines below it. Every estimate is made
   * with an OpenAI encoding (see `ENCODING_MODEL`), and Anthropic is the one
   * provider documented as counting roughly 30% more tokens for the same
   * text — so this was the worst possible place to prefer a guess over the
   * answer already in hand.
   *
   * The batch and classification paths did use the real counts, but priced
   * them with a hardcoded `/ 1000000` that ignores `unitPrice`, so a `per_1k`
   * configuration recorded a thousandth of what it spent.
   *
   * `convertToPerTokenRate` is the same helper OpenAI and Google already use,
   * which is why neither of them had either bug.
   */
  private recordedCost(inputTokens: number, outputTokens: number): number {
    const inputRate = convertToPerTokenRate(this.config.inputCost || 0, this.config.unitPrice);
    const outputRate = convertToPerTokenRate(this.config.outputCost || 0, this.config.unitPrice);
    return (inputTokens * inputRate) + (outputTokens * outputRate);
  }

  getSupportedLanguages(): string[] {
    return supportedLanguagesFor('Anthropic', this.getModel());
  }

  isLanguageSupported(language: string): boolean {
    const coverage = languageCoverageFor('Anthropic', this.getModel(), language);
    return coverage !== undefined && coverage !== 'unsupported';
  }

  async translateText(request: TranslationRequest): Promise<TranslationResult> {
    // Early return for skip conditions
    if (this.shouldSkipTranslation(request.text, request.targetLanguage)) {
      return this.createSkippedTranslationResult(request.text);
    }

    const targetLanguage = this.normalizeLanguage(request.targetLanguage);
    
    // Validate the language is supported
    if (!this.isLanguageSupported(targetLanguage)) {
      throw new Error(`Unsupported language: ${request.targetLanguage}. Please use full language name.`);
    }

    const model = this.getModel();

    // The estimate must measure the prompt that will actually be sent. This
    // resolution used to sit inside the retry loop below, so the limit check
    // ran on a hardcoded stand-in that understated input by 2.8x-3.5x against
    // this deployment's own SystemPrompt rows (ISSUES.md #84).
    // `getPromptConfiguration` wraps its own body and falls back to the
    // default template, so hoisting it moves no error path.
    const promptConfig = await PromptBuilder.getPromptConfiguration(
      this.config,
      'translation',
      request.context
    );
    const systemPrompt = TemplateEngine.substituteVariables(
      promptConfig.systemPrompt,
      { targetLanguage, instructions: request.instructions }
    );

    const inputMetrics = estimateInputTokensAndCost(
      request.text,
      request.targetLanguage,
      this.config,
      systemPrompt
    );

    const usageCheck = await limitEnforcement.checkTokenUsage(inputMetrics.tokenCount, this.config);

    if (!usageCheck.canProceed) {
      throw new Error(`Translation limit exceeded: ${usageCheck.reason}`);
    }

    const startTime = Date.now();
    
    try {
      console.log('Translation request:', {
        model,
        targetLanguage,
        text: request.text
      });

      // Add retry logic with backoff
      let retries = 0;
      const maxRetries = 2;
      let lastError: any = null;

      while (retries <= maxRetries) {
        try {
          // Add exponential backoff between retries
          if (retries > 0) {
            const backoffMs = Math.pow(2, retries) * 500;
            console.log(`Translation retry attempt ${retries}/${maxRetries}, backing off for ${backoffMs}ms`);
            await delay(backoffMs);
          }
          
          const anthropic = await this.getAnthropicClient();
          
          // Resolved above, before the limit check, and reused across retries.
          
          console.log('[Anthropic Service] Sending translation request with system prompt:', {
            model,
            promptLength: systemPrompt.length,
            promptPreview: systemPrompt.substring(0, 150) + '...',
            fullPrompt: systemPrompt
          });

          const paramCheck = this.checkAndOverrideParameters(
            model,
            promptConfig.temperature,
            promptConfig.topP
          );
          const maxTokens = this.resolveMaxTokens(model, promptConfig.maxTokens, 2048, 'translation');
          const prefill = this.acceptsAssistantPrefill(model);
          const response = await anthropic.messages.create({
            model,
            max_tokens: maxTokens,
            ...(paramCheck.temperature !== undefined && { temperature: paramCheck.temperature }),
            ...(paramCheck.topP !== undefined && { top_p: paramCheck.topP }),
            ...this.resolveThinking(model),
            system: systemPrompt,
            messages: [
              {
                role: "user",
                content: request.text
              },
              ...(prefill
                ? [{ role: "assistant" as const, content: "{" }]
                : [])
            ]
          });

          console.log('Anthropic response:', response);

          if (response.stop_reason === 'max_tokens') {
            throw new Error('Translation response was truncated due to length');
          }

          if (!response.content || response.content.length === 0) {
            throw new Error('No content in translation response');
          }

          const textContent = response.content.find(block => block.type === 'text');
          if (!textContent) {
            throw new Error('No text content in translation response');
          }

          const duration = Date.now() - startTime;
          const outputText = prefill ? "{" + textContent.text : textContent.text;

          console.log('Attempting to parse:', outputText);

          let responseJson: any;
          try {
            responseJson = this.parseJsonReply(textContent.text, prefill);
          } catch (parseError) {
            console.error('=== ANTHROPIC PARSE FAILURE ===');
            console.error('Model:', model);
            console.error('Target language:', targetLanguage);
            console.error('Original text:', request.text);
            console.error('Content block count:', response.content.length);
            console.error('Text block raw:', textContent.text);
            console.error('Output text (with prefix):', outputText);
            console.error('Parse error:', parseError);
            console.error('==============================');
            // Billed by the provider, unusable to FEED. Anthropic reports its
            // own counts on the response, so this is recorded spend rather
            // than an estimate. See OpenAITranslationService for the full
            // reasoning; it stays `success: false` (ISSUES.md #84).
            await this.trackFailedUsage(
              'translation',
              {
                promptTokens: response.usage.input_tokens,
                completionTokens: response.usage.output_tokens,
                totalCost: this.recordedCost(
                  response.usage.input_tokens,
                  response.usage.output_tokens
                ),
                duration
              },
              model,
              { language: targetLanguage }
            );
            throw parseError;
          }
          
          console.log('Parsed response:', responseJson);

          if (!responseJson.translatedText) {
            // Parsed, but not a translation. Billed all the same.
            await this.trackFailedUsage(
              'translation',
              {
                promptTokens: response.usage.input_tokens,
                completionTokens: response.usage.output_tokens,
                totalCost: this.recordedCost(
                  response.usage.input_tokens,
                  response.usage.output_tokens
                ),
                duration
              },
              model,
              { language: targetLanguage }
            );
            throw new Error('Response missing translatedText field');
          }

          const totalCost = this.recordedCost(
            response.usage.input_tokens,
            response.usage.output_tokens
          );

          // Log API usage for metrics tracking
          try {
            await ApiUsageTracker.logApiUsage(
              response.usage.input_tokens,
              response.usage.output_tokens,
              model,
              'translation'
            );
          } catch (loggingError) {
            console.warn('Failed to log API usage:', loggingError);
          }

          const result = {
            translatedText: responseJson.translatedText,
            metrics: {
              duration,
              promptTokens: response.usage.input_tokens,
              completionTokens: response.usage.output_tokens,
              totalCost
            }
          };

          // Track usage for multi-service analytics
          await this.trackSuccessfulUsage(
            'translation',
            {
              promptTokens: response.usage.input_tokens,
              completionTokens: response.usage.output_tokens,
              totalCost,
              duration
            },
            model,
            { language: targetLanguage }
          );

          return result;
          
        } catch (error) {
          lastError = error;
          retries++;
          
          // Only retry on rate limits and server errors, not on validation/parsing errors
          if (this.isRetryableError(error as any)) {
            console.warn(`Translation API error, will retry: ${(error as any).message}`);
            continue;
          }
          
          throw error;
        }
      }
      
      throw lastError || new Error('Translation failed after multiple retries');
    } catch (error) {
      console.error('Translation error details:', {
        error,
        request: {
          text: request.text,
          targetLanguage: request.targetLanguage
        }
      });
      
      // On rate limits or server errors, check for stuck translations
      if (this.isRetryableError(error as any)) {
        console.warn('API error detected, checking for stuck translations...');
        try {
          await translationRecovery.recoverStuckTranslations();
        } catch (recoveryError) {
          console.error('Error during translation recovery:', recoveryError);
        }
      }
      
      this.handleServiceError(error, 'translation');
    }
  }

  async translateTextBatch(request: BatchTranslationRequest): Promise<BatchTranslationResult> {
    const model = this.getModel();
    const startTime = Date.now();
    let targetLanguage = this.normalizeLanguage(request.targetLanguage);
    
    // Validate language
    if (!this.isLanguageSupported(targetLanguage)) {
      throw new Error(`Unsupported language: ${request.targetLanguage}. Please use full language name.`);
    }

    // Deduplication: Group texts by content
    const uniqueTexts = new Map<string, { ids: string[]; instructions?: string }>();
    
    for (const item of request.texts) {
      const text = item.text.trim();
      
      if (!uniqueTexts.has(text)) {
        uniqueTexts.set(text, { ids: [item.id], instructions: item.instructions });
      } else {
        uniqueTexts.get(text)!.ids.push(item.id);
      }
    }
    
    console.log(`Batch translation: ${request.texts.length} segments -> ${uniqueTexts.size} unique texts`);
    
    // Create batch prompt
    const uniqueTextsList = Array.from(uniqueTexts.entries());
    const textsForTranslation = uniqueTextsList.map(([text, data], index) => 
      `${index + 1}. "${text}"`
    ).join('\n');
    
    // Check if any texts have special instructions
    const hasSpecialInstructions = uniqueTextsList.some(([_, data]) => data.instructions);
      const specialInstructionsText = hasSpecialInstructions ?
      uniqueTextsList.map(([text, data], index) =>
        data.instructions ? `Text ${index + 1}: ${data.instructions}` : ''
      ).filter(Boolean).join(' ') : '';
    
    try {
      const anthropic = await this.getAnthropicClient();
      
      const promptConfig = await PromptBuilder.getPromptConfiguration(
        this.config,
        'batch_translation',
        request.context || 'document'
      );
      const systemPrompt = TemplateEngine.substituteVariables(
        promptConfig.systemPrompt,
        { targetLanguage, specialInstructions: specialInstructionsText }
      );
      
      console.log('[Anthropic Service] Sending batch translation request with system prompt:', {
        model,
        promptLength: systemPrompt.length,
        promptPreview: systemPrompt.substring(0, 150) + '...',
        fullPrompt: systemPrompt
      });
      
      const paramCheck = this.checkAndOverrideParameters(
        model,
        promptConfig.temperature,
        promptConfig.topP
      );
      const maxTokens = this.resolveMaxTokens(model, promptConfig.maxTokens, 1024, 'batch_translation');
      const prefill = this.acceptsAssistantPrefill(model);
      const response = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        ...(paramCheck.temperature !== undefined && { temperature: paramCheck.temperature }),
        ...(paramCheck.topP !== undefined && { top_p: paramCheck.topP }),
        ...this.resolveThinking(model),
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: `Translate these texts to ${targetLanguage}:\n${textsForTranslation}`
          },
          ...(prefill
            ? [{ role: "assistant" as const, content: "{" }]
            : [])
        ]
      });
      
      if (response.stop_reason === 'max_tokens') {
        throw new Error('Translation response was truncated due to length');
      }

      if (!response.content || response.content.length === 0) {
        throw new Error('No content in translation response');
      }

      const textContent = response.content.find(block => block.type === 'text');
      if (!textContent) {
        throw new Error('No text content in translation response');
      }

      const responseJson = this.parseJsonReply(textContent.text, prefill);

      if (!responseJson.translations || !Array.isArray(responseJson.translations)) {
        throw new Error('Response missing translations array');
      }
      
      // Map translations back to all IDs
      const allTranslations: Array<{ id: string; originalText: string; translatedText: string }> = [];
      
      uniqueTextsList.forEach(([originalText, data], index) => {
        const translation = responseJson.translations[index];
        if (translation && translation.translatedText) {
          data.ids.forEach(id => {
            allTranslations.push({
              id,
              originalText,
              translatedText: translation.translatedText
            });
          });
        }
      });
      
      const duration = Date.now() - startTime;
      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;
      const totalCost = this.recordedCost(inputTokens, outputTokens);
      
      // Log API usage
      try {
        await ApiUsageTracker.logApiUsage(inputTokens, outputTokens, model, 'translation');
      } catch (loggingError) {
        console.warn('Failed to log API usage:', loggingError);
      }
      
      console.log(`Batch translation completed: ${uniqueTexts.size} unique -> ${allTranslations.length} total`);
      
      const result = {
        translations: allTranslations,
        metrics: {
          duration,
          promptTokens: inputTokens,
          completionTokens: outputTokens,
          totalCost
        }
      };

      // Track usage for multi-service analytics
      await this.trackSuccessfulUsage(
        'batch',
        {
          promptTokens: inputTokens,
          completionTokens: outputTokens,
          totalCost,
          duration
        },
        model,
        { language: targetLanguage }
      );
      
      return result;
      
    } catch (error) {
      this.handleServiceError(error, 'batch translation');
    }
  }

  async classifySegments(request: ClassificationRequest): Promise<ClassificationResult> {
    const model = this.getModel();
    const startTime = Date.now();
    
    try {
      console.log('Classification request:', {
        model,
        segmentCount: request.segments.length
      });

      const anthropic = await this.getAnthropicClient();
      
      // Create the classification prompt
      const segmentsText = request.segments.map((seg, index) => 
        `${index + 1}. "${seg.text}"`
      ).join('\n');

      const promptConfig = await PromptBuilder.getPromptConfiguration(
        this.config,
        'classification'
      );
      const systemPrompt = promptConfig.systemPrompt;
      
      console.log('[Anthropic Service] Sending classification request with system prompt:', {
        model,
        promptLength: systemPrompt.length,
        promptPreview: systemPrompt.substring(0, 150) + '...',
        fullPrompt: systemPrompt
      });

      // Define classification tool for guaranteed structured output
      const classificationTool: Anthropic.Tool = {
        name: "classify_segments",
        description: "Classify text segments using binary confidence scores",
        input_schema: {
          type: "object",
          properties: {
            classifications: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  a: { type: "number", minimum: 0, maximum: 1 },
                  b: { type: "number", minimum: 0, maximum: 1 }
                },
                required: ["id", "a", "b"]
              }
            }
          },
          required: ["classifications"]
        }
      };

      const paramCheck = this.checkAndOverrideParameters(
        model,
        promptConfig.temperature,
        promptConfig.topP
      );
      const maxTokens = this.resolveMaxTokens(model, promptConfig.maxTokens, 2048, 'classification');
      const response = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        ...(paramCheck.temperature !== undefined && { temperature: paramCheck.temperature }),
        ...(paramCheck.topP !== undefined && { top_p: paramCheck.topP }),
        // Effort shapes tool calls too, not just prose, so classification
        // gets the same treatment as translation.
        ...this.resolveThinking(model),
        system: systemPrompt,
        tools: [classificationTool],
        tool_choice: this.classificationToolChoice(model, classificationTool.name),
        messages: [
          {
            role: "user",
            content: `Use ${classificationTool.name} to return one classification per numbered segment, in order.\nClassify these text segments:\n${segmentsText}`
          }
        ]
      });

      console.log('Anthropic classification response:', response);

      const classifications = await this.readClassifications(
        response, classificationTool.name, request.segments.length, startTime
      );

      const duration = Date.now() - startTime;

      console.log('Parsed classification response:', { classifications });

      // Map segment IDs back to the original IDs
      const classificationsWithIds = classifications.map((classification: any, index: number) => ({
        id: request.segments[index]?.id || classification.id,
        a: classification.a || 0,
        b: classification.b || 0
      }));

      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;
      const totalCost = this.recordedCost(inputTokens, outputTokens);

      // Log API usage
      try {
        await ApiUsageTracker.logApiUsage(inputTokens, outputTokens, model, 'classification');
      } catch (loggingError) {
        console.warn('Failed to log API usage:', loggingError);
      }

      const result = {
        classifications: classificationsWithIds,
        metrics: {
          duration,
          promptTokens: inputTokens,
          completionTokens: outputTokens,
          totalCost
        }
      };

      // Track usage for multi-service analytics
      await this.trackSuccessfulUsage(
        'classification',
        {
          promptTokens: inputTokens,
          completionTokens: outputTokens,
          totalCost,
          duration
        },
        model,
        { language: undefined }
      );

      return result;
      
    } catch (error) {
      this.handleServiceError(error, 'classification');
    }
  }

  async classifySegmentsBatch(request: ClassificationRequest): Promise<ClassificationResult> {
    const model = this.getModel();
    const startTime = Date.now();
    
    try {
      console.log('Batch classification request:', {
        model,
        segmentCount: request.segments.length
      });

      // Deduplication: Group segments by text content
      const uniqueTexts = new Map<string, string[]>(); // text -> array of IDs
      
      for (const segment of request.segments) {
        const text = segment.text.trim();
        if (!uniqueTexts.has(text)) {
          uniqueTexts.set(text, []);
        }
        uniqueTexts.get(text)!.push(segment.id);
      }
      
      console.log(`Deduplicated ${request.segments.length} segments to ${uniqueTexts.size} unique texts`);
      
      // Create array of unique texts for processing
      const uniqueTextsArray = Array.from(uniqueTexts.keys());
      
      // Split into optimal batch sizes for Anthropic tool calling
      const batches: string[][] = [];
      for (let i = 0; i < uniqueTextsArray.length; i += ANTHROPIC_OPTIMAL_BATCH_SIZE) {
        batches.push(uniqueTextsArray.slice(i, i + ANTHROPIC_OPTIMAL_BATCH_SIZE));
      }
      
      console.log(`Processing ${uniqueTextsArray.length} unique texts in ${batches.length} parallel batches (${ANTHROPIC_OPTIMAL_BATCH_SIZE} segments each)`);
      
      // Get prompt configuration once
      const promptConfig = await PromptBuilder.getPromptConfiguration(
        this.config,
        'batch_classification'
      );
      
      const maxTokens = this.resolveMaxTokens(model, promptConfig.maxTokens, 2048, 'batch_classification');
      console.log('[Classification] Batch configuration:', {
        batchSize: ANTHROPIC_OPTIMAL_BATCH_SIZE,
        totalBatches: batches.length,
        maxTokensPerBatch: maxTokens,
        estimatedOutputPerBatch: batches[0]?.length ? batches[0].length * 80 : 0
      });

      // Process batches in parallel
      const batchPromises = batches.map(async (batch, batchIndex) => {
        return this.processSingleBatch(batch, batchIndex, promptConfig);
      });
      
      // Finish recording every in-flight reply before reporting a failure. A
      // successful sibling still costs money when another batch is unusable.
      const settled = await Promise.allSettled(batchPromises);
      const batchResults = settled.map(result => {
        if (result.status === 'rejected') throw result.reason;
        return result.value;
      });
      
      // Combine all results
      let allClassifications: Array<{ id: string; a: number; b: number; }> = [];
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalCost = 0;
      
      batchResults.forEach((batchResult, batchIndex) => {
        const batchTexts = batches[batchIndex];
        
        batchResult.classifications.forEach((classification: any, index: number) => {
          const originalText = batchTexts[index];
          const segmentIds = uniqueTexts.get(originalText) || [];
          
          segmentIds.forEach(id => {
            allClassifications.push({
              id,
              a: classification.a || 0,
              b: classification.b || 0
            });
          });
        });
        
        totalInputTokens += batchResult.metrics.promptTokens;
        totalOutputTokens += batchResult.metrics.completionTokens;
        totalCost += batchResult.metrics.totalCost;
      });
      
      const duration = Date.now() - startTime;
      
      // Log combined API usage
      try {
        await ApiUsageTracker.logApiUsage(totalInputTokens, totalOutputTokens, model, 'classification');
      } catch (loggingError) {
        console.warn('Failed to log API usage:', loggingError);
      }

      console.log(`Parallel batch classification completed: ${uniqueTexts.size} unique texts -> ${allClassifications.length} total results in ${duration}ms`);

      const result = {
        classifications: allClassifications,
        metrics: {
          duration,
          promptTokens: totalInputTokens,
          completionTokens: totalOutputTokens,
          totalCost
        }
      };

      return result;
      
    } catch (error) {
      this.handleServiceError(error, 'batch classification');
    }
  }
  
  private async processSingleBatch(batch: string[], batchIndex: number, promptConfig: any): Promise<{ classifications: any[], metrics: any }> {
    const startTime = Date.now();
    const model = this.getModel();
    const anthropic = await this.getAnthropicClient();
    
    const segmentsText = batch.map((text, index) => 
      `${index + 1}. "${text}"`
    ).join('\n');
    
    const systemPrompt = promptConfig.systemPrompt;
    
    // Define classification tool for guaranteed structured output
      const classificationTool: Anthropic.Tool = {
        name: "classify_segments_batch",
        description: "Classify text segments using binary confidence scores",
        input_schema: {
          type: "object",
          properties: {
            classifications: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  a: { type: "number", minimum: 0, maximum: 1 },
                  b: { type: "number", minimum: 0, maximum: 1 }
                },
                required: ["id", "a", "b"]
              }
            }
          },
          required: ["classifications"]
        }
      };

      const paramCheck = this.checkAndOverrideParameters(
        model,
        promptConfig.temperature,
        promptConfig.topP
      );

      const response = await anthropic.messages.create({
        model,
        max_tokens: this.resolveMaxTokens(model, promptConfig.maxTokens, 2048, 'batch_classification'),
        ...(paramCheck.temperature !== undefined && { temperature: paramCheck.temperature }),
        ...(paramCheck.topP !== undefined && { top_p: paramCheck.topP }),
        ...this.resolveThinking(model),
        system: systemPrompt,
        tools: [classificationTool],
        tool_choice: this.classificationToolChoice(model, classificationTool.name),
        messages: [
          {
            role: "user",
            content: `Use ${classificationTool.name} to return one classification per numbered segment, in order.\nClassify these text segments:\n${segmentsText}`
          }
        ]
      });

    const classifications = await this.readClassifications(
      response, classificationTool.name, batch.length, startTime
    );
    
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const totalCost = this.recordedCost(inputTokens, outputTokens);
    await this.trackSuccessfulUsage('classification', {
      promptTokens: inputTokens, completionTokens: outputTokens,
      totalCost, duration: Date.now() - startTime,
    }, model);
    
    return {
      classifications,
      metrics: {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalCost
      }
    };
  }

  private classificationToolChoice(model: string, name: string): Anthropic.ToolChoice {
    return capabilitiesFor('Anthropic', model).forcedToolUse === true
      ? { type: 'tool', name }
      : { type: 'auto' };
  }

  private async readClassifications(
    response: Anthropic.Message, toolName: string, expectedCount: number, startTime: number
  ): Promise<Array<{ id: string; a: number; b: number }>> {
    try {
      if (response.stop_reason === 'max_tokens') {
        throw new Error('Classification response was truncated due to length');
      }
      const tool = response.content.find(block => block.type === 'tool_use' && block.name === toolName);
      if (!tool || tool.type !== 'tool_use') {
        throw new Error('The model did not return the requested classification. Try again or choose another AI model.');
      }
      const rows = (tool.input as { classifications?: unknown } | null)?.classifications;
      if (!Array.isArray(rows) || rows.length !== expectedCount || rows.some(row =>
        !row || typeof row.id !== 'string' ||
        !Number.isFinite(row.a) || row.a < 0 || row.a > 1 ||
        !Number.isFinite(row.b) || row.b < 0 || row.b > 1
      )) {
        throw new Error('The model returned incomplete or invalid classifications. Try again or choose another AI model.');
      }
      return rows;
    } catch (error) {
      await this.trackFailedUsage('classification', {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalCost: this.recordedCost(response.usage.input_tokens, response.usage.output_tokens),
        duration: Date.now() - startTime,
      }, this.getModel());
      throw error;
    }
  }

  private resolveMaxTokens(
    model: string,
    promptConfigMaxTokens: number | undefined,
    fallback: number,
    operationType?: 'classification' | 'batch_classification' | 'translation' | 'batch_translation'
  ): number {
    const entry = findCatalogueEntry(model);
    const { nonStreamingOutputCeiling } = capabilitiesFor('Anthropic', model);
    // Two different ceilings are at work here and both are needed. The table
    // below belongs to the *operation* — a classification wants less room than
    // a translation — while `nonStreamingOutputCeiling` belongs to the
    // *model*. Either alone gives a wrong answer, so the smaller wins.
    //
    // Both exist to keep a non-streaming request under the SDK's ten-minute
    // guard. The gate was `model.includes('-4-5-')`, which silently excluded
    // every Claude 4.6+ id — precisely the ones with 128K output limits, where
    // an unclamped `max_tokens` is most dangerous.
    //
    // It stays gated on `operationType`. A call naming no operation is asking
    // for the model's own limit, and clamping there would turn
    // `resolveMaxTokens(model, undefined, 2048)` from 64000 into 20480.
    const OPERATION_CEILINGS: Record<string, number | undefined> = {
      classification: 16384,
      batch_classification: 16384,
      translation: 20480,
      batch_translation: 20480
    };
    const operationCeiling =
      nonStreamingOutputCeiling !== undefined && operationType
        ? Math.min(OPERATION_CEILINGS[operationType] ?? Infinity, nonStreamingOutputCeiling)
        : undefined;
    const candidates = [
      operationCeiling,
      promptConfigMaxTokens,
      this.config.outputTokenLimit ?? undefined,
      this.config.maxTokens ?? undefined,
      entry?.maxOutputTokens
    ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);

    const resolved = candidates.length > 0 ? Math.min(...candidates) : fallback;
    return Math.max(1, Math.floor(resolved));
  }

  private isRetryableError(error: any): boolean {
    // Anthropic specific retryable errors
    if (error.status === 429 || // Rate limit
        error.status === 500 || // Internal server error
        error.status === 502 || // Bad gateway
        error.status === 503 || // Service unavailable
        error.status === 504) { // Gateway timeout
      return true;
    }
    return false;
  }

}
