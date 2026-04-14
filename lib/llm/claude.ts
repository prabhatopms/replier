import type { LLMProvider, LLMMessage, LLMConfig } from './types';
import { DEFAULT_LLM_CONFIG } from './types';
import { buildSummarizationPrompt } from './prompt-builder';

async function getConfig(): Promise<LLMConfig> {
  const result = await browser.storage.local.get('llmConfig');
  const stored = (result.llmConfig as Partial<LLMConfig>) || {};
  return {
    ...DEFAULT_LLM_CONFIG,
    apiKey: '', // Will be overridden by getApiKey()
    ...stored,
  };
}

export async function getApiKey(): Promise<string> {
  const result = await browser.storage.local.get('apiKey');
  return (result.apiKey as string) || '';
}

export async function setApiKey(key: string): Promise<void> {
  await browser.storage.local.set({ apiKey: key });
}

export const claudeProvider: LLMProvider = {
  async generateReply(
    systemPrompt: string,
    messages: LLMMessage[],
  ): Promise<string> {
    const apiKey = await getApiKey();
    if (!apiKey) {
      throw new Error(
        'Claude API key not configured. Set it in Replier settings.',
      );
    }

    const config = await getConfig();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.maxTokens,
        system: systemPrompt,
        messages,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error (${response.status}): ${error}`);
    }

    const data = (await response.json()) as {
      content: Array<{ text: string }>;
    };
    return data.content[0].text;
  },

  async summarizeConversation(
    existingSummary: string,
    newMessages: string,
  ): Promise<string> {
    const prompt = buildSummarizationPrompt(existingSummary, newMessages);
    return this.generateReply(prompt, [
      { role: 'user', content: 'Please update the conversation summary.' },
    ]);
  },
};
