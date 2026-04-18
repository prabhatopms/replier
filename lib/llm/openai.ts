import type { LLMProvider, LLMMessage } from './types';

async function getApiKey(): Promise<string> {
  const result = await browser.storage.local.get(['openaiApiKey', 'llmConfig']);
  const key = result.openaiApiKey as string;
  if (!key) throw new Error('OpenAI API key not set. Add it in Settings.');
  return key;
}

async function getModel(): Promise<string> {
  const result = await browser.storage.local.get('llmConfig');
  const config = result.llmConfig as { model?: string } | undefined;
  return config?.model || 'gpt-4o';
}

export const openaiProvider: LLMProvider = {
  async generateReply(systemPrompt: string, messages: LLMMessage[]): Promise<string> {
    const [apiKey, model] = await Promise.all([getApiKey(), getModel()]);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 512,
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
    const { buildSummarizationPrompt } = await import('@/lib/llm/prompt-builder');
    const [apiKey, model] = await Promise.all([getApiKey(), getModel()]);

    const prompt = buildSummarizationPrompt(existingSummary, newMessages);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(err.error?.message || `OpenAI API error ${response.status}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0]?.message?.content || '';
  },
};
