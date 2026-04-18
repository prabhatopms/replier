import type { LLMProvider, LLMMessage, LLMConfig } from './types';
import { DEFAULT_LLM_CONFIG } from './types';
import { buildSummarizationPrompt } from './prompt-builder';

/**
 * Gemini API nuances handled here:
 *
 * 1. MESSAGE FORMAT: Gemini uses `contents` with `parts` array, and role `model`
 *    instead of `assistant`. Messages must alternate user/model — consecutive
 *    same-role messages must be merged.
 *
 * 2. SYSTEM PROMPT: Goes in `systemInstruction` (not a top-level `system` param).
 *
 * 3. AUTH: API key passed as query param `?key=`, not in headers.
 *
 * 4. RESPONSE: Nested at `candidates[0].content.parts[0].text`.
 *
 * 5. SAFETY FILTERS: Gemini aggressively blocks flirty/dating/suggestive content.
 *    We set safety thresholds to BLOCK_NONE for the relevant categories so that
 *    tones like "flirty", "devilish", and "simp" don't get blocked.
 *
 * 6. BLOCKED RESPONSES: `finishReason` can be `SAFETY` — we detect this and
 *    throw a descriptive error instead of crashing on missing text.
 *
 * 7. MAX TOKENS: Nested inside `generationConfig.maxOutputTokens`.
 *
 * 8. FIRST MESSAGE: Gemini requires the first message in `contents` to have
 *    role `user`. If conversation history starts with an assistant message,
 *    we must prepend a synthetic user turn.
 */

// -- Gemini API types --

interface GeminiContent {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

interface GeminiSafetySetting {
  category: string;
  threshold: string;
}

interface GeminiRequest {
  systemInstruction: { parts: Array<{ text: string }> };
  contents: GeminiContent[];
  generationConfig: {
    maxOutputTokens: number;
    temperature?: number;
  };
  safetySettings: GeminiSafetySetting[];
}

interface GeminiCandidate {
  content: { parts: Array<{ text: string }> };
  finishReason: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  error?: { message: string; code: number };
  promptFeedback?: {
    blockReason?: string;
  };
}

// -- Safety settings --
// Gemini's content filters are aggressive for dating/flirt contexts.
// We set all harm categories to BLOCK_NONE so tones like flirty/devilish work.
const SAFETY_SETTINGS: GeminiSafetySetting[] = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' },
];

// -- Config helpers --

async function getConfig(): Promise<LLMConfig> {
  const result = await browser.storage.local.get('llmConfig');
  const stored = (result.llmConfig as Partial<LLMConfig>) || {};
  return {
    ...DEFAULT_LLM_CONFIG,
    ...stored,
  };
}

export async function getGeminiApiKey(): Promise<string> {
  const result = await browser.storage.local.get('geminiApiKey');
  return (result.geminiApiKey as string) || '';
}

export async function setGeminiApiKey(key: string): Promise<void> {
  await browser.storage.local.set({ geminiApiKey: key });
}

// -- Message transformation --

/**
 * Convert our internal LLMMessage[] to Gemini's contents format.
 *
 * Handles:
 * - Role mapping: 'assistant' -> 'model'
 * - Merging consecutive same-role messages (Gemini rejects these)
 * - Ensuring first message is role 'user' (Gemini requirement)
 */
function toGeminiContents(messages: LLMMessage[]): GeminiContent[] {
  if (messages.length === 0) {
    return [{ role: 'user', parts: [{ text: 'Please generate a reply.' }] }];
  }

  const contents: GeminiContent[] = [];

  for (const msg of messages) {
    const role: 'user' | 'model' = msg.role === 'assistant' ? 'model' : 'user';
    const last = contents[contents.length - 1];

    // Merge consecutive same-role messages
    if (last && last.role === role) {
      last.parts.push({ text: msg.content });
    } else {
      contents.push({ role, parts: [{ text: msg.content }] });
    }
  }

  // Gemini requires first message to be role 'user'
  if (contents.length > 0 && contents[0].role !== 'user') {
    contents.unshift({
      role: 'user',
      parts: [{ text: '[Conversation context follows]' }],
    });
  }

  return contents;
}

// -- Provider --

export const geminiProvider: LLMProvider = {
  async generateReply(
    systemPrompt: string,
    messages: LLMMessage[],
  ): Promise<string> {
    const apiKey = await getGeminiApiKey();
    if (!apiKey) {
      throw new Error(
        'Gemini API key not configured. Set it in Replier settings.',
      );
    }

    const config = await getConfig();
    const model = config.model;
    const contents = toGeminiContents(messages);

    const body: GeminiRequest = {
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents,
      generationConfig: {
        maxOutputTokens: config.maxTokens,
        temperature: 0.9,
      },
      safetySettings: SAFETY_SETTINGS,
    };

    // Gemini uses API key as query param
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${error}`);
    }

    const data = (await response.json()) as GeminiResponse;

    // Handle API-level errors
    if (data.error) {
      throw new Error(
        `Gemini API error (${data.error.code}): ${data.error.message}`,
      );
    }

    // Handle prompt blocked by safety filters
    if (data.promptFeedback?.blockReason) {
      throw new Error(
        `Gemini blocked the prompt: ${data.promptFeedback.blockReason}. ` +
          'Try a different tone or adjust the persona.',
      );
    }

    // Handle missing or blocked candidates
    if (!data.candidates || data.candidates.length === 0) {
      throw new Error(
        'Gemini returned no response. The content may have been filtered.',
      );
    }

    const candidate = data.candidates[0];

    // Handle response blocked by safety filters
    if (candidate.finishReason === 'SAFETY') {
      throw new Error(
        'Gemini blocked the response due to safety filters. ' +
          'Try a milder tone (casual, funny) or rephrase the persona notes.',
      );
    }

    if (candidate.finishReason === 'RECITATION') {
      throw new Error(
        'Gemini blocked the response due to recitation policy. ' +
          'Try rephrasing to make it more original.',
      );
    }

    const text = candidate.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error(
        `Gemini returned an empty response (finishReason: ${candidate.finishReason}).`,
      );
    }

    return text;
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
