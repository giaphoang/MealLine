// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { AITranslationService, TranslationRequest, TranslationResult, ClassificationRequest, ClassificationResult, BatchTranslationRequest, BatchTranslationResult, ServiceCapabilities, ServiceLimits, ProviderAccessResult } from '../base/AITranslationService';
import { limitEnforcement } from '../../limits';
import { estimateInputTokensAndCost, estimateOutputTokensAndCost } from '../../token';
import { convertToPerTokenRate } from '../../token/calculation';
import ApiUsageTracker from '../../token/usage-tracker';
import { decryptApiKey } from '../../encryption';
import { PromptBuilder } from '../prompts/PromptBuilder';
import { TemplateEngine } from '../prompts/TemplateEngine';
import {
  capabilitiesFor,
  languageCoverageFor,
  normalizeCatalogueLanguage,
  resolveReasoning,
  supportedLanguagesFor,
  type ReasoningValue,
} from '../catalogue';

import { GoogleGenAI } from '@google/genai';

// Add delay function for rate limiting and backoff
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class GoogleTranslationService extends AITranslationService {
  private googleClient: any = null;
  private cachedApiKey: string | null = null;

  constructor(config: any) {
    super(config);
  }

  protected async getApiKey(): Promise<string> {
    if (!this.config?.encryptedApiKey || !this.config?.salt) {
      throw new Error('Google AI API configuration required. Please configure API settings in Tools → AI Configuration.');
    }
    return decryptApiKey(this.config.encryptedApiKey, this.config.salt);
  }

  private async getGoogleClient(): Promise<any> {
    if (!this.googleClient || !this.cachedApiKey) {
      const apiKey = await this.getApiKey();
      if (this.cachedApiKey !== apiKey) {
        // Initialize Google Gen AI client
        this.googleClient = new GoogleGenAI({ apiKey });
        this.cachedApiKey = apiKey;
      }
    }
    return this.googleClient;
  }

  /**
   * Resolve sampling and thinking parameters from the model's capabilities.
   *
   * This was keyed to `modelSpec.apiParameters.modelFamily === 'gemini-3'`, so
   * a thinking level configured on any other model was discarded without a
   * word, and a level a model rejects reached the API as a 400 rather than
   * being substituted with a warning. Both answers come from the catalogue
   * now, which knows per model rather than per family — Gemini 3 Flash takes
   * four thinking levels and Gemini 3 Pro takes two.
   */
  private checkAndOverrideParameters(
    model: string,
    requestedTemperature?: number,
    requestedTopP?: number,
    requestedThinkingLevel?: string | null
  ): {
    temperature: number;
    topP?: number;
    thinkingLevel?: ReasoningValue;
    warnings: string[];
  } {
    const capabilities = capabilitiesFor('Google', model);
    const warnings: string[] = [];
    let temperature = requestedTemperature ?? 0.7;
    const topP: number | undefined = requestedTopP;

    const { fixedTemperature } = capabilities;
    if (fixedTemperature !== undefined && requestedTemperature !== fixedTemperature) {
      if (requestedTemperature !== undefined) {
        warnings.push(
          `Gemini 3 and later models take temperature=${fixedTemperature}. Your configured temperature of ${requestedTemperature} has been overridden to ${fixedTemperature} per Google's recommendation.`
        );
      }
      temperature = fixedTemperature;
    }

    const reasoning = resolveReasoning(capabilities, requestedThinkingLevel);
    warnings.push(...reasoning.warnings);

    return {
      temperature,
      topP,
      thinkingLevel: reasoning.value as ReasoningValue | undefined,
      warnings
    };
  }

  protected normalizeLanguage(language: string): string {
    return normalizeCatalogueLanguage(language);
  }

  /**
   * Confirm the key and the configured model without paying for it.
   *
   * This used to send a real `generateContent` with `maxOutputTokens: 1`
   * before every translation job: a billed request whose one-token cap is
   * shared with thinking tokens on Gemini 3.x, and whose failure was then
   * flattened to `false` (ISSUES.md #84). `models.get` answers both questions
   * for free — a rejected key fails authentication, and a model this project
   * cannot call fails by name. Google refuses `gemini-2.5-*` to new projects
   * with `404 ... no longer available to new users`, which is a fact about
   * the model and must not be reported as a bad key.
   */
  async checkAccess(): Promise<ProviderAccessResult> {
    try {
      const client = await this.getGoogleClient();
      await client.models.get({ model: this.getModel() });
      return { ok: true };
    } catch (error) {
      console.error('Google AI access check failed:', error);
      return { ok: false, error };
    }
  }

  async verifyEntitlement(): Promise<ProviderAccessResult> {
    try {
      const client = await this.getGoogleClient();
      const model = this.getModel();
      const parameters = this.checkAndOverrideParameters(
        model,
        undefined,
        undefined,
        this.config.thinkingLevel
      );
      await client.models.generateContent({
        model,
        contents: 'Reply with OK.',
        config: {
          maxOutputTokens: 64,
          ...(parameters.thinkingLevel && {
            thinkingConfig: { thinkingLevel: parameters.thinkingLevel },
          }),
        },
      });
      return { ok: true };
    } catch (error) {
      console.error('Google AI entitlement check failed:', error);
      return { ok: false, error };
    }
  }

  async validateApiKey(): Promise<boolean> {
    return (await this.checkAccess()).ok;
  }

  getServiceCapabilities(): ServiceCapabilities {
    return {
      supportsLanguages: this.getSupportedLanguages(),
      maxTokensPerRequest: this.config.maxTokens || 8192,
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
    return supportedLanguagesFor('Google', this.getModel());
  }

  isLanguageSupported(language: string): boolean {
    const coverage = languageCoverageFor('Google', this.getModel(), language);
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
    const systemInstruction = TemplateEngine.substituteVariables(
      promptConfig.systemPrompt,
      { targetLanguage, instructions: request.instructions }
    );

    const inputMetrics = estimateInputTokensAndCost(
      request.text,
      request.targetLanguage,
      this.config,
      systemInstruction
    );

    const usageCheck = await limitEnforcement.checkTokenUsage(inputMetrics.tokenCount, this.config);

    if (!usageCheck.canProceed) {
      throw new Error(`Translation limit exceeded: ${usageCheck.reason}`);
    }

    const startTime = Date.now();
    const warnings: string[] = [];
    
    try {
      console.log('Google translation request:', {
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
          
          const client = await this.getGoogleClient();
          
          // Resolved above, before the limit check, and reused across retries.
          
          console.log('[Google Service] Sending translation request with system prompt:', {
            promptLength: systemInstruction.length,
            targetLanguage,
            hasInstructions: !!request.instructions
          });

          const paramCheck = this.checkAndOverrideParameters(
            model,
            promptConfig.temperature,
            promptConfig.topP,
            this.config.thinkingLevel
          );
          if (paramCheck.warnings.length > 0) {
            warnings.push(...paramCheck.warnings);
          }

          const response = await client.models.generateContent({
            model,
            contents: request.text,
            config: {
              systemInstruction,
              responseMimeType: 'application/json',
              responseSchema: {
                type: 'object',
                properties: {
                  translatedText: {
                    type: 'string',
                    description: 'The translated text in the target language'
                  }
                },
                required: ['translatedText']
              },
              temperature: paramCheck.temperature,
              ...(paramCheck.topP !== undefined && { topP: paramCheck.topP }),
              ...(paramCheck.thinkingLevel && {
                thinkingConfig: { thinkingLevel: paramCheck.thinkingLevel }
              }),
              maxOutputTokens: promptConfig.maxTokens
            }
          });

          console.log('Google AI response:', response);

          const duration = Date.now() - startTime;
          const outputText = response.text ?? '';

          console.log('Attempting to parse:', outputText);
          
          let responseJson: any;
          try {
            // A reply cut off at the token cap is not malformed JSON, it is an
            // answer that ran out of room — and until this check existed staff
            // read `Unterminated string in JSON at position 22`, which names
            // neither the cause nor anything they can do (ISSUES.md #84).
            //
            // Anthropic has tested `stop_reason === 'max_tokens'` at three
            // sites all along; Google tested `finishReason` nowhere. Found by
            // the live smoke sweep on 2026-09-13, when two Gemini models spent
            // their whole budget thinking — 490 and 492 of 512 tokens — and
            // returned 5 and 8 tokens of answer.
            //
            // Deliberately inside this `try`: the reply was billed, and the
            // `catch` below is what records that. Throwing before it would
            // make the error clearer and the spend invisible.
            if (this.wasTruncated(response)) {
              throw new Error('Translation response was truncated due to length');
            }

            // This check used to sit above the `try`, and it ran first — so a
            // reply that spent its whole budget thinking and returned no text
            // was reported as "No content", naming the wrong cause, and never
            // recorded despite being billed. Not hypothetical: the sweep saw
            // `gemini-3.8-flash` return 5 answer tokens against 492 of
            // thinking, and zero is that case one notch further on.
            //
            // Below the truncation guard so the more specific cause wins, and
            // inside the `try` so an empty reply is recorded like any other
            // the provider charged for.
            if (!outputText) {
              throw new Error('No content in translation response');
            }

            responseJson = JSON.parse(outputText);
            console.log('Parsed response:', responseJson);

            if (!responseJson.translatedText) {
              throw new Error('Response missing translatedText field');
            }
          } catch (unusable) {
            // Billed by the provider, unusable to FEED. See the equivalent
            // block in OpenAITranslationService for why this is recorded and
            // why it stays `success: false` (ISSUES.md #84).
            const failedOutput = estimateOutputTokensAndCost(outputText, this.config);
            const failed = this.extractUsageMetrics(
              response,
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
            response,
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
          
          // Only retry on rate limits and server errors
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
      
      this.handleServiceError(error, 'translation');
    }
  }

  async translateTextBatch(request: BatchTranslationRequest): Promise<BatchTranslationResult> {
    const model = this.getModel();
    const startTime = Date.now();
    let targetLanguage = this.normalizeLanguage(request.targetLanguage);
    const warnings: string[] = [];
    
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
        data.instructions ? `Text ${index + 1}: ${data.instructions}` : null
      ).filter(Boolean).join(' ') : '';
    
    try {
      const client = await this.getGoogleClient();
      
      const promptConfig = await PromptBuilder.getPromptConfiguration(
        this.config,
        'batch_translation',
        request.context || 'document'
      );
      const systemInstruction = TemplateEngine.substituteVariables(
        promptConfig.systemPrompt,
        { targetLanguage, specialInstructions: specialInstructionsText }
      );
      
      console.log('[Google Service] Sending batch translation request with system prompt:', {
        promptLength: systemInstruction.length,
        targetLanguage,
        uniqueTexts: uniqueTexts.size
      });
      
      const paramCheck = this.checkAndOverrideParameters(
        model,
        promptConfig.temperature,
        promptConfig.topP,
        this.config.thinkingLevel
      );
      if (paramCheck.warnings.length > 0) {
        warnings.push(...paramCheck.warnings);
      }

      const response = await client.models.generateContent({
        model,
        contents: `Translate these texts to ${targetLanguage}:\n${textsForTranslation}`,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              translations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    translatedText: {
                      type: 'string',
                      description: 'The translated text in the target language'
                    }
                  },
                  required: ['translatedText']
                }
              }
            },
            required: ['translations']
          },
          temperature: paramCheck.temperature,
          ...(paramCheck.topP !== undefined && { topP: paramCheck.topP }),
          ...(paramCheck.thinkingLevel && {
            thinkingConfig: { thinkingLevel: paramCheck.thinkingLevel }
          }),
          maxOutputTokens: promptConfig.maxTokens
        }
      });

      const result = await this.readBilledResponse(response, model, 'batch', startTime,
        Math.ceil(textsForTranslation.length / 4) + 100, targetLanguage, async () => {
        // Truncation is tested before emptiness: a reply that ran out of room
        // may carry no text at all, and "No content" would name the wrong cause.
        //
        if (this.wasTruncated(response)) {
          throw new Error('Translation response was truncated due to length');
        }

        if (!response.text) {
          throw new Error('No content in translation response');
        }

        const responseJson = JSON.parse(response.text);
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
        // Estimate token usage
        const estimatedInputTokens = Math.ceil(textsForTranslation.length / 4) + 100;
        const estimatedOutputTokens = Math.ceil(response.text.length / 4);
        const usageMetrics = this.extractUsageMetrics(response, estimatedInputTokens, estimatedOutputTokens);

        // Calculate cost using configuration-based rates
        const inputCostPerToken = convertToPerTokenRate(this.config.inputCost || 0, this.config.unitPrice);
        const outputCostPerToken = convertToPerTokenRate(this.config.outputCost || 0, this.config.unitPrice);
        const totalCost = (usageMetrics.promptTokens * inputCostPerToken) +
          (usageMetrics.completionTokens * outputCostPerToken);

        // Log API usage
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

        console.log(`Batch translation completed: ${uniqueTexts.size} unique -> ${allTranslations.length} total`);

        const result: BatchTranslationResult = {
          translations: allTranslations,
          metrics: {
            duration,
            promptTokens: usageMetrics.promptTokens,
            completionTokens: usageMetrics.completionTokens,
            totalCost
          }
        };

        if (warnings.length > 0) {
          result.warnings = warnings;
        }

        return result;
      });

      // Track usage for multi-service analytics
      await this.trackSuccessfulUsage(
        'batch',
        {
          promptTokens: result.metrics.promptTokens,
          completionTokens: result.metrics.completionTokens,
          totalCost: result.metrics.totalCost,
          duration: result.metrics.duration
        },
        model,
        { language: targetLanguage }
      );
      
      return result;
      
    } catch (error) {
      console.error('Batch translation error:', error);
      this.handleServiceError(error, 'batch translation');
    }
  }

  async classifySegments(request: ClassificationRequest): Promise<ClassificationResult> {
    const model = this.getModel();
    const startTime = Date.now();
    const warnings: string[] = [];
    
    try {
      console.log('Classification request:', {
        model,
        segmentCount: request.segments.length
      });

      const client = await this.getGoogleClient();
      
      // Create the classification prompt
      const segmentsText = request.segments.map((seg, index) => 
        `${index + 1}. "${seg.text}"`
      ).join('\n');

      const promptConfig = await PromptBuilder.getPromptConfiguration(
        this.config,
        'classification'
      );
      const systemInstruction = promptConfig.systemPrompt;
      
      console.log('[Google Service] Sending classification request with system prompt:', {
        promptLength: systemInstruction.length,
        segmentCount: request.segments.length
      });

      const paramCheck = this.checkAndOverrideParameters(
        model,
        promptConfig.temperature,
        promptConfig.topP,
        this.config.thinkingLevel
      );
      if (paramCheck.warnings.length > 0) {
        warnings.push(...paramCheck.warnings);
      }

      const response = await client.models.generateContent({
        model,
        contents: `Classify these text segments:\n${segmentsText}`,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              classifications: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    a: { type: 'number', minimum: 0, maximum: 1 },
                    b: { type: 'number', minimum: 0, maximum: 1 }
                  },
                  required: ['id', 'a', 'b']
                }
              }
            },
            required: ['classifications']
          },
          temperature: paramCheck.temperature,
          ...(paramCheck.topP !== undefined && { topP: paramCheck.topP }),
          ...(paramCheck.thinkingLevel && {
            thinkingConfig: { thinkingLevel: paramCheck.thinkingLevel }
          }),
          maxOutputTokens: promptConfig.maxTokens
        }
      });

      console.log('Google AI classification response:', response);

      const result = await this.readBilledResponse(response, model, 'classification', startTime,
        Math.ceil(segmentsText.length / 4) + 100, undefined, async () => {
        // Truncation before emptiness, as in `translateText`: a reply cut off at
        // the cap may carry no text at all. Anthropic words the classification
        // case separately, and so does this.
        if (this.wasTruncated(response)) {
          throw new Error('Classification response was truncated due to length');
        }

        if (!response.text) {
          throw new Error('No content in classification response');
        }

        const duration = Date.now() - startTime;
        const outputText = response.text;

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

        // Estimate token usage
        const estimatedInputTokens = Math.ceil(segmentsText.length / 4) + 100;
        const estimatedOutputTokens = Math.ceil(outputText.length / 4);
        const usageMetrics = this.extractUsageMetrics(response, estimatedInputTokens, estimatedOutputTokens);

        // Calculate cost using configuration-based rates
        const inputCostPerToken = convertToPerTokenRate(this.config.inputCost || 0, this.config.unitPrice);
        const outputCostPerToken = convertToPerTokenRate(this.config.outputCost || 0, this.config.unitPrice);
        const totalCost = (usageMetrics.promptTokens * inputCostPerToken) +
          (usageMetrics.completionTokens * outputCostPerToken);

        // Log API usage
        try {
          await ApiUsageTracker.logApiUsage(
            usageMetrics.promptTokens,
            usageMetrics.completionTokens,
            model,
            'classification'
          );
        } catch (loggingError) {
          console.warn('Failed to log API usage:', loggingError);
        }

        const result: ClassificationResult = {
          classifications: classificationsWithIds,
          metrics: {
            duration,
            promptTokens: usageMetrics.promptTokens,
            completionTokens: usageMetrics.completionTokens,
            totalCost
          }
        };

        if (warnings.length > 0) {
          result.warnings = warnings;
        }

        return result;
      });

      // Track usage for multi-service analytics
      await this.trackSuccessfulUsage(
        'classification',
        {
          promptTokens: result.metrics.promptTokens,
          completionTokens: result.metrics.completionTokens,
          totalCost: result.metrics.totalCost,
          duration: result.metrics.duration
        },
        model,
        { language: undefined } // Classification doesn't target a specific language
      );

      return result;
      
    } catch (error) {
      console.error('Classification error details:', {
        error,
        request: {
          segmentCount: request.segments.length
        }
      });
      
      this.handleServiceError(error, 'classification');
    }
  }

  async classifySegmentsBatch(request: ClassificationRequest): Promise<ClassificationResult> {
    const model = this.getModel();
    const startTime = Date.now();
    const warnings: string[] = [];
    
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
      
      // Create numbered prompt with unique texts (consistent with single classification)
      const uniqueTextsArray = Array.from(uniqueTexts.keys());
      const segmentsText = uniqueTextsArray.map((text, index) => 
        `${index + 1}. "${text}"`
      ).join('\n');

      const client = await this.getGoogleClient();
      
      const promptConfig = await PromptBuilder.getPromptConfiguration(
        this.config,
        'batch_classification'
      );
      const systemInstruction = promptConfig.systemPrompt;
      
      console.log('[Google Service] Sending batch classification request with system prompt:', {
        promptLength: systemInstruction.length,
        segmentCount: request.segments.length,
        uniqueTexts: uniqueTexts.size
      });

      const paramCheck = this.checkAndOverrideParameters(
        model,
        promptConfig.temperature,
        promptConfig.topP,
        this.config.thinkingLevel
      );
      if (paramCheck.warnings.length > 0) {
        warnings.push(...paramCheck.warnings);
      }

      const response = await client.models.generateContent({
        model,
        contents: `Classify these text segments:\n${segmentsText}`,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              classifications: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    a: { type: 'number', minimum: 0, maximum: 1 },
                    b: { type: 'number', minimum: 0, maximum: 1 }
                  },
                  required: ['id', 'a', 'b']
                }
              }
            },
            required: ['classifications']
          },
          temperature: paramCheck.temperature,
          ...(paramCheck.topP !== undefined && { topP: paramCheck.topP }),
          ...(paramCheck.thinkingLevel && {
            thinkingConfig: { thinkingLevel: paramCheck.thinkingLevel }
          }),
          maxOutputTokens: promptConfig.maxTokens
        }
      });

      console.log('Google AI batch classification response:', response);

      const result = await this.readBilledResponse(response, model, 'classification', startTime,
        Math.ceil(segmentsText.length / 4) + 100, undefined, async () => {
        // Truncation before emptiness, as in `translateText`.
        if (this.wasTruncated(response)) {
          throw new Error('Classification response was truncated due to length');
        }

        if (!response.text) {
          throw new Error('No content in classification response');
        }

        const duration = Date.now() - startTime;
        const outputText = response.text;

        const responseJson = JSON.parse(outputText);

        if (!responseJson.classifications || !Array.isArray(responseJson.classifications)) {
          throw new Error('Response missing classifications array');
        }

        // Map results back to all segment instances using response IDs and text
        const allClassifications: Array<{
          id: string;
          a: number;
          b: number;
        }> = [];
        
        // Create mapping from response classifications back to original segments
        responseJson.classifications.forEach((classification: any, index: number) => {
          const originalText = uniqueTextsArray[index];
          const segmentIds = uniqueTexts.get(originalText) || [];

          segmentIds.forEach(id => {
            allClassifications.push({
              id,
              a: classification.a,
              b: classification.b
            });
          });
        });

        // Estimate token usage
        const estimatedInputTokens = Math.ceil(segmentsText.length / 4) + 100;
        const estimatedOutputTokens = Math.ceil(outputText.length / 4);
        const usageMetrics = this.extractUsageMetrics(response, estimatedInputTokens, estimatedOutputTokens);

        // Calculate cost using configuration-based rates
        const inputCostPerToken = convertToPerTokenRate(this.config.inputCost || 0, this.config.unitPrice);
        const outputCostPerToken = convertToPerTokenRate(this.config.outputCost || 0, this.config.unitPrice);
        const totalCost = (usageMetrics.promptTokens * inputCostPerToken) +
          (usageMetrics.completionTokens * outputCostPerToken);

        // Log API usage
        try {
          await ApiUsageTracker.logApiUsage(
            usageMetrics.promptTokens,
            usageMetrics.completionTokens,
            model,
            'classification'
          );
        } catch (loggingError) {
          console.warn('Failed to log API usage:', loggingError);
        }

        console.log(`Batch classification completed: ${uniqueTexts.size} unique texts -> ${allClassifications.length} total results`);

        const result: ClassificationResult = {
          classifications: allClassifications,
          metrics: {
            duration,
            promptTokens: usageMetrics.promptTokens,
            completionTokens: usageMetrics.completionTokens,
            totalCost
          }
        };

        if (warnings.length > 0) {
          result.warnings = warnings;
        }

        return result;
      });

      // Track usage for multi-service analytics
      await this.trackSuccessfulUsage(
        'classification',
        {
          promptTokens: result.metrics.promptTokens,
          completionTokens: result.metrics.completionTokens,
          totalCost: result.metrics.totalCost,
          duration: result.metrics.duration
        },
        model,
        { language: undefined } // Classification doesn't target a specific language
      );

      return result;
      
    } catch (error) {
      console.error('Batch classification error details:', {
        error,
        request: {
          segmentCount: request.segments.length
        }
      });
      
      this.handleServiceError(error, 'batch classification');
    }
  }

  /**
   * Whether the model stopped because it ran out of room, rather than because
   * it had finished.
   *
   * `MAX_TOKENS` is the only one of Google's finish reasons that means this.
   * `STOP` is a completed answer; `SAFETY` and `RECITATION` are refusals with
   * their own causes, and reporting either as truncation would send staff to
   * raise a token limit that was never the problem.
   *
   * Read from `candidates[0]` because FEED asks for one candidate: the
   * request sets no `candidateCount`, so the API returns a single one. If that
   * ever changes, this needs to change with it.
   *
   * Note what this deliberately does not do: it does not inspect the body. A
   * reply can be cut off having still produced valid JSON, and that is a
   * different fault — the answer is short, not unparseable — which the
   * existing `translatedText` and array checks already catch further down.
   */
  private wasTruncated(response: any): boolean {
    return response?.candidates?.[0]?.finishReason === 'MAX_TOKENS';
  }

  /** Preserve the provider's charge when a received reply cannot be used. */
  private async readBilledResponse<T>(
    response: any, model: string, operation: 'batch' | 'classification', startTime: number,
    fallbackInput: number, language: string | undefined, read: () => Promise<T>
  ): Promise<T> {
    try {
      return await read();
    } catch (error) {
      const usage = this.extractUsageMetrics(response, fallbackInput, Math.ceil((response.text ?? '').length / 4));
      await this.trackFailedUsage(operation, {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalCost: usage.promptTokens * convertToPerTokenRate(this.config.inputCost || 0, this.config.unitPrice)
          + usage.completionTokens * convertToPerTokenRate(this.config.outputCost || 0, this.config.unitPrice),
        duration: Date.now() - startTime,
      }, model, { language });
      throw error;
    }
  }

  private extractUsageMetrics(
    response: any,
    fallbackPromptTokens: number,
    fallbackCompletionTokens: number
  ): { promptTokens: number; completionTokens: number } {
    const usageMetadata = response?.usageMetadata;
    const promptTokenCount = usageMetadata?.promptTokenCount;
    const candidatesTokenCount = usageMetadata?.candidatesTokenCount;
    const thoughtsTokenCount = usageMetadata?.thoughtsTokenCount;
    const hasCompletionCounts = (candidatesTokenCount !== undefined && candidatesTokenCount !== null) ||
      (thoughtsTokenCount !== undefined && thoughtsTokenCount !== null);
    const completionTokens = hasCompletionCounts
      ? (candidatesTokenCount || 0) + (thoughtsTokenCount || 0)
      : fallbackCompletionTokens;

    return {
      promptTokens: promptTokenCount ?? fallbackPromptTokens,
      completionTokens
    };
  }

  private isRetryableError(error: any): boolean {
    // Google AI specific retryable errors
    if (error.status === 429 || // Rate limit
        error.status === 503 || // Service unavailable  
        error.status === 500 || // Internal server error
        error.status === 502 || // Bad gateway
        error.status === 504) { // Gateway timeout
      return true;
    }
    return false;
  }
}
