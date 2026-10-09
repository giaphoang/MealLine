// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import OpenAI from 'openai';
import { AITranslationService, TranslationRequest, TranslationResult, ClassificationRequest, ClassificationResult, BatchTranslationRequest, BatchTranslationResult, ServiceCapabilities, ServiceLimits, ProviderAccessResult } from '../base/AITranslationService';
import { limitEnforcement } from '../../limits';
import { estimateInputTokensAndCost, estimateOutputTokensAndCost } from '../../token';
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
  type ReasoningValue,
} from '../catalogue';

// Add delay function for rate limiting and backoff
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Cached JSON schema for classification to improve performance
let cachedClassificationSchema: any = null;

// Optimal batch size for parallel processing
const OPTIMAL_BATCH_SIZE = 15;

// Function to get cached classification schema
function getClassificationSchema() {
  if (!cachedClassificationSchema) {
    cachedClassificationSchema = {
      name: "classification_response",
      schema: {
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
              required: ["id", "a", "b"],
              additionalProperties: false
            }
          }
        },
        required: ["classifications"],
        additionalProperties: false
      },
      strict: true
    };
  }
  return cachedClassificationSchema;
}

export class OpenAITranslationService extends AITranslationService {
  private openaiClient: OpenAI | null = null;
  private cachedApiKey: string | null = null;

  /**
   * Resolve sampling and reasoning parameters from the model's capabilities.
   *
   * Keyed to `modelSpec.apiParameters.modelFamily === 'gpt-5'` before, so a
   * reasoning value configured on anything outside that family was dropped in
   * silence. The catalogue answers per model, which matters more here than
   * anywhere else: `minimal` is valid on the 2025-08-07 snapshots and refused
   * outright by gpt-5.6-luna, so no one family-wide rule can be correct.
   */
  private checkAndOverrideParameters(
    model: string,
    requestedTemperature?: number,
    requestedTopP?: number,
    requestedThinkingLevel?: string | null
  ): {
    temperature: number;
    topP?: number;
    // Seven values, not four: GPT-5.6 refuses `minimal` and adds `none`,
    // `xhigh` and `max`. The SDK's own `ReasoningEffort` spans the same set.
    reasoningEffort?: ReasoningValue;
    warnings: string[];
  } {
    const capabilities = capabilitiesFor('OpenAI', model);
    const warnings: string[] = [];
    let temperature = requestedTemperature ?? 1.0;
    let topP: number | undefined = requestedTopP;

    // `sampling: 'unsupported'` means the API refuses these parameters as
    // FEED would otherwise send them. For the GPT-5 line that is temperature
    // at anything but its default, and top_p at all. Sending 1.0 rather than
    // omitting it is what production does today and is left alone here: this
    // commit changes where the answer comes from, not what gets sent.
    if (capabilities.sampling === 'unsupported') {
      if (requestedTemperature !== undefined && requestedTemperature !== 1.0) {
        console.log(`[OpenAI Service] ${model} takes temperature=1.0 only, overriding from ${requestedTemperature}`);
        warnings.push(`This model only supports temperature=1.0. Your configured temperature of ${requestedTemperature} has been overridden to 1.0.`);
      }
      temperature = 1.0;

      if (requestedTopP !== undefined && requestedTopP !== null) {
        console.log(`[OpenAI Service] ${model} does not accept top_p, excluding it (was ${requestedTopP})`);
        topP = undefined;
        warnings.push(`This model does not accept the top_p parameter. It has been excluded from the API call.`);
      }
    }

    const reasoning = resolveReasoning(capabilities, requestedThinkingLevel);
    warnings.push(...reasoning.warnings);
    if (reasoning.value) {
      console.log('[OpenAI Service] reasoning effort resolved:', {
        model,
        requestedThinkingLevel,
        resolved: reasoning.value,
        source: requestedThinkingLevel ? 'AIConfiguration' : 'catalogue least-cost'
      });
    }

    return {
      temperature,
      topP,
      reasoningEffort: reasoning.value as ReasoningValue | undefined,
      warnings
    };
  }

  /**
   * The max-tokens field this model wants, and the value to put in it.
   *
   * Replaces `buildOpenAIParameters`, which looked the field up in a spec
   * list. The catalogue records it per model because GPT-5.6 refuses
   * `max_tokens` outright — `400 Unsupported parameter: 'max_tokens' is not
   * supported with this model` — so guessing wrong fails the request rather
   * than degrading. The fallback chain is unchanged: an explicit limit wins,
   * then the model's own output limit, then 2048.
   */
  private buildMaxTokensParameter(model: string, maxTokens?: number): Record<string, number> {
    const resolved =
      typeof maxTokens === 'number' ? maxTokens : findCatalogueEntry(model)?.maxOutputTokens ?? 2048;
    return { [capabilitiesFor('OpenAI', model).maxTokensField]: resolved };
  }

  protected async getApiKey(): Promise<string> {
    if (!this.config?.encryptedApiKey || !this.config?.salt) {
      throw new Error('OpenAI API configuration required. Please configure API settings in Tools → AI Configuration.');
    }
    return decryptApiKey(this.config.encryptedApiKey, this.config.salt);
  }

  private async getOpenAIClient(): Promise<OpenAI> {
    if (!this.openaiClient || !this.cachedApiKey) {
      const apiKey = await this.getApiKey();
      if (this.cachedApiKey !== apiKey) {
        // Reset client if API key changed
        this.openaiClient = new OpenAI({ apiKey });
        this.cachedApiKey = apiKey;
      }
    }
    if (!this.openaiClient) {
      throw new Error('OpenAI client not initialized');
    }
    return this.openaiClient;
  }

  protected normalizeLanguage(language: string): string {
    return normalizeCatalogueLanguage(language);
  }

  /**
   * Confirm the key and the configured model, both unbilled.
   *
   * `models.list` only ever proved the key was accepted, so the condition
   * production actually hit — `403 Project '…' does not have access to model
   * 'gpt-5-mini-…'` (ISSUES.md #80) — passed this check and failed later, or
   * was reported as a bad key (#84). `models.retrieve` asks about the model
   * FEED is configured to use, which is the question worth asking.
   */
  async checkAccess(): Promise<ProviderAccessResult> {
    try {
      const openai = await this.getOpenAIClient();
      await openai.models.retrieve(this.getModel());
      return { ok: true };
    } catch (error) {
      console.error('OpenAI access check failed:', error);
      return { ok: false, error };
    }
  }

  async verifyEntitlement(): Promise<ProviderAccessResult> {
    try {
      const openai = await this.getOpenAIClient();
      const model = this.getModel();
      const reasoning = resolveReasoning(capabilitiesFor('OpenAI', model), null).value;
      await openai.chat.completions.create({
        model,
        messages: [{ role: 'user', content: 'Reply with OK.' }],
        ...(reasoning && { reasoning_effort: reasoning as ReasoningValue }),
        ...this.buildMaxTokensParameter(model, 16),
      });
      return { ok: true };
    } catch (error) {
      console.error('OpenAI entitlement check failed:', error);
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

  getSupportedLanguages(): string[] {
    return supportedLanguagesFor('OpenAI', this.getModel());
  }

  isLanguageSupported(language: string): boolean {
    const coverage = languageCoverageFor('OpenAI', this.getModel(), language);
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
    const warnings: string[] = [];  // Collect any warnings
    
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
          
          const openai = await this.getOpenAIClient();
          // Resolved above, before the limit check, and reused across retries.
          
          console.log('[OpenAI Service] Sending translation request with system prompt:', {
            model,
            promptLength: systemPrompt.length,
            promptPreview: systemPrompt.substring(0, 150) + '...',
            fullPrompt: systemPrompt
          });
          
          const apiParameters = this.buildMaxTokensParameter(model, promptConfig.maxTokens);
          
          // Check and override parameters for GPT-5 models
          const paramCheck = this.checkAndOverrideParameters(
            model,
            promptConfig.temperature,
            promptConfig.topP,
            this.config.thinkingLevel
          );
          // No cast needed since openai 7: `ReasoningEffort` covers
          // none/minimal/low/medium/high/xhigh/max.
          const requestReasoningEffort = paramCheck.reasoningEffort;
          const maxTokensValue = apiParameters.max_completion_tokens ?? apiParameters.max_tokens;
          console.log('[OpenAI Service] API call parameters:', {
            model,
            temperature: paramCheck.temperature,
            topP: paramCheck.topP,
            reasoningEffort: paramCheck.reasoningEffort,
            maxTokens: maxTokensValue
          });
          if (paramCheck.warnings.length > 0) {
            warnings.push(...paramCheck.warnings);
          }
          
          const completion = await openai.chat.completions.create({
            model,
            temperature: paramCheck.temperature,
            ...(paramCheck.topP !== undefined && { top_p: paramCheck.topP }),
            ...(requestReasoningEffort && { reasoning_effort: requestReasoningEffort }),
            ...apiParameters,
            messages: [
              {
                role: "system",
                content: systemPrompt
              },
              {
                role: "user",
                content: request.text
              }
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "translation_response",
                schema: {
                  type: "object",
                  properties: {
                    translatedText: {
                      type: "string",
                      description: "The translated text in the target language"
                    }
                  },
                  required: ["translatedText"],
                  additionalProperties: false
                },
                strict: true
              }
            }
          });

          console.log('OpenAI response:', completion);

          // Handle potential response issues
          if (completion.choices[0].finish_reason === 'length') {
            throw new Error('Translation response was truncated due to length');
          }

          if (completion.choices[0].finish_reason === 'content_filter') {
            throw new Error('Translation was halted by content filter');
          }

          const message = completion.choices[0].message;
          
          console.log('Message content:', message);

          if (!message.content) {
            throw new Error('No content in translation response');
          }

          const duration = Date.now() - startTime;
          const outputText = message.content;

          console.log('Attempting to parse:', outputText);
          
          let responseJson: any;
          try {
            responseJson = JSON.parse(outputText);
            console.log('Parsed response:', responseJson);

            if (!responseJson.translatedText) {
              throw new Error('Response missing translatedText field');
            }
          } catch (unusable) {
            // The provider answered, and billed for answering; FEED then could
            // not use the reply. That spend is real and was recorded nowhere:
            // `trackFailedUsage` existed with no callers, so every UsageRecord
            // row was a success and a malformed reply cost money invisibly.
            //
            // Recorded from the provider's own counts, not an estimate. Parse
            // and validation errors are not retryable (`isRetryableError`), so
            // this writes one row per failed request, not one per attempt.
            // `success: false`, so `LimitEnforcementService` -- which filters
            // on `success: true` -- still excludes it from the cost limit.
            // Whether billed-but-failed spend should count against that limit
            // is a separate decision (ISSUES.md #84).
            const failedOutput = estimateOutputTokensAndCost(outputText, this.config);
            const failed = this.extractUsageMetrics(
              completion,
              inputMetrics.tokenCount,
              failedOutput.tokenCount
            );
            const inRate = convertToPerTokenRate(this.config.inputCost || 0, this.config.unitPrice);
            const outRate = convertToPerTokenRate(this.config.outputCost || 0, this.config.unitPrice);
            await this.trackFailedUsage(
              'translation',
              {
                promptTokens: failed.promptTokens,
                completionTokens: failed.completionTokens,
                totalCost: (failed.promptTokens * inRate) + (failed.completionTokens * outRate),
                duration
              },
              model,
              { language: targetLanguage }
            );
            throw unusable;
          }

          const outputMetrics = estimateOutputTokensAndCost(outputText, this.config);
          const usageMetrics = this.extractUsageMetrics(
            completion,
            inputMetrics.tokenCount,
            outputMetrics.tokenCount
          );
          const inputCostPerToken = convertToPerTokenRate(this.config.inputCost || 0, this.config.unitPrice);
          const outputCostPerToken = convertToPerTokenRate(this.config.outputCost || 0, this.config.unitPrice);
          const totalCost = (usageMetrics.promptTokens * inputCostPerToken) +
            (usageMetrics.completionTokens * outputCostPerToken);

          // Log API usage for metrics tracking
          try {
            await ApiUsageTracker.logApiUsage(
              usageMetrics.promptTokens,
              usageMetrics.completionTokens,
              model,
              'translation'
            );
          } catch (loggingError) {
            console.warn('Failed to log API usage:', loggingError);
          }

          const result: TranslationResult = {
            translatedText: responseJson.translatedText,
            metrics: {
              duration,
              promptTokens: usageMetrics.promptTokens,
              completionTokens: usageMetrics.completionTokens,
              totalCost
            }
          };
          
          // Add warnings if any
          if (warnings.length > 0) {
            result.warnings = warnings;
          }

          // Track usage for multi-service analytics
          await this.trackSuccessfulUsage(
            'translation',
            {
              promptTokens: usageMetrics.promptTokens,
              completionTokens: usageMetrics.completionTokens,
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
          if (error instanceof OpenAI.APIError) {
            if (error.status === 429 || (error.status >= 500 && error.status < 600)) {
              console.warn(`Translation API error (${error.status}), will retry: ${error.message}`);
              continue;
            }
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
      if (error instanceof OpenAI.APIError && (error.status === 429 || error.status >= 500)) {
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
    const warnings: string[] = [];  // Collect any warnings
    
    // Validate language
    if (!this.isLanguageSupported(targetLanguage)) {
      throw new Error(`Unsupported language: ${request.targetLanguage}. Please use full language name.`);
    }

    // Deduplication: Group texts by content
    const uniqueTexts = new Map<string, { ids: string[]; instructions?: string }>();
    const idToText = new Map<string, string>();
    
    for (const item of request.texts) {
      const text = item.text.trim();
      idToText.set(item.id, text);
      
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
      const openai = await this.getOpenAIClient();
      const promptConfig = await PromptBuilder.getPromptConfiguration(
        this.config,
        'batch_translation',
        request.context || 'document'
      );
      const systemPrompt = TemplateEngine.substituteVariables(
        promptConfig.systemPrompt,
        { targetLanguage, specialInstructions: specialInstructionsText }
      );
      
      console.log('[OpenAI Service] Sending batch translation request with system prompt:', {
        model,
        promptLength: systemPrompt.length,
        promptPreview: systemPrompt.substring(0, 150) + '...',
        fullPrompt: systemPrompt
      });
      
      const apiParameters = this.buildMaxTokensParameter(model, promptConfig.maxTokens);
      
      // Check and override parameters for GPT-5 models
      const paramCheck = this.checkAndOverrideParameters(
        model,
        promptConfig.temperature,
        promptConfig.topP,
        this.config.thinkingLevel
      );
      const requestReasoningEffort = paramCheck.reasoningEffort as any;
      const maxTokensValue = apiParameters.max_completion_tokens ?? apiParameters.max_tokens;
      console.log('[OpenAI Service] API call parameters:', {
        model,
        temperature: paramCheck.temperature,
        topP: paramCheck.topP,
        reasoningEffort: paramCheck.reasoningEffort,
        maxTokens: maxTokensValue
      });
      if (paramCheck.warnings.length > 0) {
        warnings.push(...paramCheck.warnings);
      }
      
      const completion = await openai.chat.completions.create({
        model,
        temperature: paramCheck.temperature,
        ...(paramCheck.topP !== undefined && { top_p: paramCheck.topP }),
        ...(requestReasoningEffort && { reasoning_effort: requestReasoningEffort }),
        ...apiParameters,
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: `Translate these texts to ${targetLanguage}:\n${textsForTranslation}`
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "batch_translation_response",
            schema: {
              type: "object",
              properties: {
                translations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      translatedText: {
                        type: "string",
                        description: "The translated text in the target language"
                      }
                    },
                    required: ["translatedText"],
                    additionalProperties: false
                  }
                }
              },
              required: ["translations"],
              additionalProperties: false
            },
            strict: true
          }
        }
      });
      
      if (completion.choices[0].finish_reason === 'length') {
        throw new Error('Translation response was truncated due to length');
      }

      const message = completion.choices[0].message;
      if (!message.content) {
        throw new Error('No content in translation response');
      }

      const responseJson = JSON.parse(message.content);
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
      const inputTokens = completion.usage?.prompt_tokens || 0;
      const outputTokens = completion.usage?.completion_tokens || 0;
      
      // Calculate cost using configuration-based rates
      const inputCostPerToken = convertToPerTokenRate(this.config.inputCost || 0, this.config.unitPrice);
      const outputCostPerToken = convertToPerTokenRate(this.config.outputCost || 0, this.config.unitPrice);
      const totalCost = (inputTokens * inputCostPerToken) + (outputTokens * outputCostPerToken);
      
      // Log API usage
      try {
        await ApiUsageTracker.logApiUsage(inputTokens, outputTokens, model, 'translation');
      } catch (loggingError) {
        console.warn('Failed to log API usage:', loggingError);
      }
      
      console.log(`Batch translation completed: ${uniqueTexts.size} unique -> ${allTranslations.length} total`);
      
      const result: BatchTranslationResult = {
        translations: allTranslations,
        metrics: {
          duration,
          promptTokens: inputTokens,
          completionTokens: outputTokens,
          totalCost
        }
      };
      
      // Add warnings if any
      if (warnings.length > 0) {
        result.warnings = warnings;
      }

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
    const warnings: string[] = [];  // Collect any warnings
    
    try {
      console.log('Classification request:', {
        model,
        segmentCount: request.segments.length
      });

      const openai = await this.getOpenAIClient();
      
      // Create the classification prompt
      const segmentsText = request.segments.map((seg, index) => 
        `${index + 1}. "${seg.text}"`
      ).join('\n');

      const promptConfig = await PromptBuilder.getPromptConfiguration(
        this.config,
        'classification'
      );
      const systemPrompt = promptConfig.systemPrompt;

      console.log('[OpenAI Service] Sending classification request with system prompt:', {
        model,
        promptLength: systemPrompt.length,
        promptPreview: systemPrompt.substring(0, 150) + '...',
        fullPrompt: systemPrompt
      });

      const apiParameters = this.buildMaxTokensParameter(model, promptConfig.maxTokens);
      
      // Check and override parameters for GPT-5 models
      const paramCheck = this.checkAndOverrideParameters(
        model,
        promptConfig.temperature,
        promptConfig.topP,
        this.config.thinkingLevel
      );
      const requestReasoningEffort = paramCheck.reasoningEffort as any;
      const maxTokensValue = apiParameters.max_completion_tokens ?? apiParameters.max_tokens;
      console.log('[OpenAI Service] API call parameters:', {
        model,
        temperature: paramCheck.temperature,
        topP: paramCheck.topP,
        reasoningEffort: paramCheck.reasoningEffort,
        maxTokens: maxTokensValue
      });
      if (paramCheck.warnings.length > 0) {
        warnings.push(...paramCheck.warnings);
      }

      const completion = await openai.chat.completions.create({
        model,
        temperature: paramCheck.temperature,
        ...(paramCheck.topP !== undefined && { top_p: paramCheck.topP }),
        ...(requestReasoningEffort && { reasoning_effort: requestReasoningEffort }),
        ...apiParameters,
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: `Classify these text segments:\n${segmentsText}`
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "classification_response",
            schema: {
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
                    required: ["id", "a", "b"],
                    additionalProperties: false
                  }
                }
              },
              required: ["classifications"],
              additionalProperties: false
            },
            strict: true
          }
        }
      });

      console.log('OpenAI classification response:', completion);

      if (completion.choices[0].finish_reason === 'length') {
        throw new Error('Classification response was truncated due to length');
      }

      if (completion.choices[0].finish_reason === 'content_filter') {
        throw new Error('Classification was halted by content filter');
      }

      const message = completion.choices[0].message;
      
      if (!message.content) {
        throw new Error('No content in classification response');
      }

      const duration = Date.now() - startTime;
      const outputText = message.content;

      const responseJson = JSON.parse(outputText);

      if (!responseJson.classifications || !Array.isArray(responseJson.classifications)) {
        throw new Error('Response missing classifications array');
      }

      // Validate response count matches input count
      if (responseJson.classifications.length !== request.segments.length) {
        console.warn(`Classification count mismatch: expected ${request.segments.length}, got ${responseJson.classifications.length}`);
        // Continue processing but log the discrepancy
      }

      // Map segment IDs back to the original IDs
      const classificationsWithIds = responseJson.classifications.map((classification: any, index: number) => ({
        ...classification,
        id: request.segments[index]?.id || classification.id
      }));

      const inputTokens = completion.usage?.prompt_tokens || 0;
      const outputTokens = completion.usage?.completion_tokens || 0;
      
      // Calculate cost using configuration-based rates
      const inputCostPerToken = convertToPerTokenRate(this.config.inputCost || 0, this.config.unitPrice);
      const outputCostPerToken = convertToPerTokenRate(this.config.outputCost || 0, this.config.unitPrice);
      const totalCost = (inputTokens * inputCostPerToken) + (outputTokens * outputCostPerToken);

      // Log API usage
      try {
        await ApiUsageTracker.logApiUsage(inputTokens, outputTokens, model, 'classification');
      } catch (loggingError) {
        console.warn('Failed to log API usage:', loggingError);
      }

      const result: ClassificationResult = {
        classifications: classificationsWithIds,
        metrics: {
          duration,
          promptTokens: inputTokens,
          completionTokens: outputTokens,
          totalCost
        }
      };
      
      // Add warnings if any
      if (warnings.length > 0) {
        result.warnings = warnings;
      }

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
        { language: undefined } // Classification doesn't target a specific language
      );

      return result;
      
    } catch (error) {
      this.handleServiceError(error, 'classification');
    }
  }

  async classifySegmentsBatch(request: ClassificationRequest): Promise<ClassificationResult> {
    const model = this.getModel();
    const startTime = Date.now();
    const warnings: string[] = [];  // Collect any warnings
    
    try {
      console.log('Parallel batch classification request:', {
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
      
      const uniqueTextsArray = Array.from(uniqueTexts.keys());
      
      // Split unique texts into optimal batches for parallel processing
      const batches: string[][] = [];
      for (let i = 0; i < uniqueTextsArray.length; i += OPTIMAL_BATCH_SIZE) {
        batches.push(uniqueTextsArray.slice(i, i + OPTIMAL_BATCH_SIZE));
      }
      
      console.log(`Split ${uniqueTextsArray.length} unique texts into ${batches.length} parallel batches of ~${OPTIMAL_BATCH_SIZE} segments each`);
      
      // Get configuration once for all batches
      const promptConfig = await PromptBuilder.getPromptConfiguration(
        this.config,
        'batch_classification'
      );
      const systemPrompt = promptConfig.systemPrompt;
      const cachedSchema = getClassificationSchema();
      const apiParameters = this.buildMaxTokensParameter(model, promptConfig.maxTokens);
      
      // Check and override parameters for GPT-5 models (do once for all batches)
      const paramCheck = this.checkAndOverrideParameters(
        model,
        promptConfig.temperature,
        promptConfig.topP,
        this.config.thinkingLevel
      );
      const requestReasoningEffort = paramCheck.reasoningEffort as any;
      const maxTokensValue = apiParameters.max_completion_tokens ?? apiParameters.max_tokens;
      console.log('[OpenAI Service] API call parameters:', {
        model,
        temperature: paramCheck.temperature,
        topP: paramCheck.topP,
        reasoningEffort: paramCheck.reasoningEffort,
        maxTokens: maxTokensValue
      });
      if (paramCheck.warnings.length > 0) {
        warnings.push(...paramCheck.warnings);
      }
      
      // Process all batches concurrently
      const batchPromises = batches.map(async (batchTexts, batchIndex) => {
        const openai = await this.getOpenAIClient();
        
        // Create numbered prompt for this batch
        const segmentsText = batchTexts.map((text, index) => 
          `${index + 1}. "${text}"`
        ).join('\n');
        
        console.log(`[OpenAI Service] Processing parallel batch ${batchIndex + 1}/${batches.length} with ${batchTexts.length} segments`);
        
        const completion = await openai.chat.completions.create({
          model,
          temperature: paramCheck.temperature,
          ...(paramCheck.topP !== undefined && { top_p: paramCheck.topP }),
          ...(requestReasoningEffort && { reasoning_effort: requestReasoningEffort }),
          ...apiParameters,
          messages: [
            {
              role: "system",
              content: systemPrompt
            },
            {
              role: "user",
              content: `Classify these text segments:\n${segmentsText}`
            }
          ],
          response_format: {
            type: "json_schema",
            json_schema: cachedSchema
          }
        });
        
        if (completion.choices[0].finish_reason === 'length') {
          throw new Error(`Batch ${batchIndex + 1} response was truncated due to length`);
        }
        
        if (completion.choices[0].finish_reason === 'content_filter') {
          throw new Error(`Batch ${batchIndex + 1} was halted by content filter`);
        }
        
        const message = completion.choices[0].message;
        if (!message.content) {
          throw new Error(`No content in batch ${batchIndex + 1} response`);
        }
        
        const responseJson = JSON.parse(message.content);
        if (!responseJson.classifications || !Array.isArray(responseJson.classifications)) {
          throw new Error(`Batch ${batchIndex + 1} missing classifications array`);
        }
        
        // Map batch results to segment classifications
        const batchClassifications: Array<{ id: string; a: number; b: number; }> = [];
        
        responseJson.classifications.forEach((classification: any, index: number) => {
          const originalText = batchTexts[index];
          const segmentIds = uniqueTexts.get(originalText) || [];
          
          segmentIds.forEach(id => {
            batchClassifications.push({
              id,
              a: classification.a,
              b: classification.b
            });
          });
        });
        
        return {
          classifications: batchClassifications,
          metrics: {
            promptTokens: completion.usage?.prompt_tokens || 0,
            completionTokens: completion.usage?.completion_tokens || 0,
            batchIndex
          }
        };
      });
      
      // Wait for all batches to complete
      console.log(`Processing ${batchPromises.length} parallel batches concurrently...`);
      const batchResults = await Promise.all(batchPromises);
      
      // Combine all results
      const allClassifications: Array<{ id: string; a: number; b: number; }> = [];
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      
      batchResults.forEach(result => {
        allClassifications.push(...result.classifications);
        totalInputTokens += result.metrics.promptTokens;
        totalOutputTokens += result.metrics.completionTokens;
      });
      
      // Calculate cost using configuration-based rates
      const inputCostPerToken = convertToPerTokenRate(this.config.inputCost || 0, this.config.unitPrice);
      const outputCostPerToken = convertToPerTokenRate(this.config.outputCost || 0, this.config.unitPrice);
      const totalCost = (totalInputTokens * inputCostPerToken) + (totalOutputTokens * outputCostPerToken);
      const duration = Date.now() - startTime;
      
      // Log API usage
      try {
        await ApiUsageTracker.logApiUsage(totalInputTokens, totalOutputTokens, model, 'classification');
      } catch (loggingError) {
        console.warn('Failed to log API usage:', loggingError);
      }
      
      console.log(`Parallel batch classification completed: ${uniqueTexts.size} unique texts -> ${allClassifications.length} total results in ${batches.length} concurrent batches (${duration}ms)`);
      
      const result: ClassificationResult = {
        classifications: allClassifications,
        metrics: {
          duration,
          promptTokens: totalInputTokens,
          completionTokens: totalOutputTokens,
          totalCost
        }
      };
      
      // Add warnings if any
      if (warnings.length > 0) {
        result.warnings = warnings;
      }

      // Track usage for multi-service analytics
      await this.trackSuccessfulUsage(
        'classification',
        {
          promptTokens: totalInputTokens,
          completionTokens: totalOutputTokens,
          totalCost,
          duration
        },
        model,
        { language: undefined } // Classification doesn't target a specific language
      );
      
      return result;
      
    } catch (error) {
      this.handleServiceError(error, 'batch classification');
    }
  }

  private extractUsageMetrics(
    completion: OpenAI.Chat.Completions.ChatCompletion,
    fallbackPromptTokens: number,
    fallbackCompletionTokens: number
  ): { promptTokens: number; completionTokens: number } {
    const usage = completion?.usage;

    return {
      promptTokens: usage?.prompt_tokens ?? fallbackPromptTokens,
      completionTokens: usage?.completion_tokens ?? fallbackCompletionTokens
    };
  }

}
