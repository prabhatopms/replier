import type { LLMProvider, LLMMessage, LLMConfig } from './types';
import { DEFAULT_LLM_CONFIG } from './types';
import { buildSummarizationPrompt } from './prompt-builder';
import { fetchImageAsBase64 } from './vision';

async function getConfig(): Promise<LLMConfig> {
  const result = await browser.storage.local.get('llmConfig');
  const stored = (result.llmConfig as Partial<LLMConfig>) || {};
  return {
    ...DEFAULT_LLM_CONFIG,
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
        'API not configured. Set an API key in Oxytocin settings.',
      );
    }

    const config = await getConfig();

    // Build Claude messages — resolve any image URLs to base64 for vision
    const claudeMessages = await Promise.all(
      messages.map(async (msg) => {
        if (!msg.mediaUrl) {
          return { role: msg.role, content: msg.content };
        }
        const img = await fetchImageAsBase64(msg.mediaUrl);
        if (!img) {
          return { role: msg.role, content: `${msg.content} [image could not be loaded]` };
        }
        return {
          role: msg.role,
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: img.mimeType, data: img.data },
            },
            { type: 'text', text: msg.content || 'They sent this image' },
          ],
        };
      }),
    );

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
        temperature: 0.9,
        system: systemPrompt,
        messages: claudeMessages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let message = `API error (${response.status})`;
      try {
        const parsed = JSON.parse(errorText) as { error?: { message?: string; type?: string } };
        if (parsed.error?.message) message = parsed.error.message;
        else if (parsed.error?.type) message = parsed.error.type.replace(/_/g, ' ');
      } catch {
        if (errorText.length < 300) message = errorText;
      }
      throw new Error(message);
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
