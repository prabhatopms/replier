import type { LLMProvider, LLMMessage, LLMConfig } from './types';
import { DEFAULT_LLM_CONFIG } from './types';
import { buildSummarizationPrompt } from './prompt-builder';

async function getApiKey(): Promise<string> {
  const result = await browser.storage.local.get('openaiApiKey');
  const key = result.openaiApiKey as string;
  if (!key) throw new Error('OpenAI API key not set. Add it in Settings.');
  return key;
}

async function getConfig(): Promise<LLMConfig> {
  const result = await browser.storage.local.get('llmConfig');
  const stored = (result.llmConfig as Partial<LLMConfig>) || {};
  return { ...DEFAULT_LLM_CONFIG, ...stored };
}

export const openaiProvider: LLMProvider = {
  async generateReply(systemPrompt: string, messages: LLMMessage[]): Promise<string> {
    const [apiKey, config] = await Promise.all([getApiKey(), getConfig()]);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.maxTokens,
        temperature: 0.9,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(err.error?.message || `OpenAI API error ${response.status}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string }; finish_reason: string }>;
    };

    const choice = data.choices[0];
    if (!choice?.message?.content) {
      throw new Error('OpenAI returned an empty response.');
    }
    return choice.message.content;
  },

  async summarizeConversation(existingSummary: string, newMessages: string): Promise<string> {
    const prompt = buildSummarizationPrompt(existingSummary, newMessages);
    return this.generateReply(prompt, [
      { role: 'user', content: 'Please update the conversation summary.' },
    ]);
  },
};
