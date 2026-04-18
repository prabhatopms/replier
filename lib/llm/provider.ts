import type { LLMProvider, LLMConfig } from './types';
import { DEFAULT_LLM_CONFIG } from './types';
import { claudeProvider } from './claude';
import { geminiProvider } from './gemini';
import { openaiProvider } from './openai';

/**
 * Resolve the active LLM provider based on stored configuration.
 */
export function getProviderFromConfig(config: LLMConfig): LLMProvider {
  switch (config.provider) {
    case 'gemini':
      return geminiProvider;
    case 'openai':
      return openaiProvider;
    case 'claude':
    default:
      return claudeProvider;
  }
}

/**
 * Load config from storage and return the active provider.
 */
export async function getActiveProvider(): Promise<LLMProvider> {
  const result = await browser.storage.local.get('llmConfig');
  const config = {
    ...DEFAULT_LLM_CONFIG,
    ...((result.llmConfig as Partial<LLMConfig>) || {}),
  };
  return getProviderFromConfig(config);
}
