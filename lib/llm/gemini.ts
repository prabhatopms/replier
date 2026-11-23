import { fetchWithTimeout } from './http';
import { fetchModels } from './models';
import type { LLMProvider, LLMMessage, LLMConfig } from './types';
import { DEFAULT_LLM_CONFIG } from './types';
import { buildSummarizationPrompt } from './prompt-builder';
import { fetchImageAsBase64 } from './vision';

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

type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
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
 * Handles role mapping, image inline_data for vision, and consecutive-role merging.
 */
async function toGeminiContents(messages: LLMMessage[]): Promise<GeminiContent[]> {
  if (messages.length === 0) {
    return [{ role: 'user', parts: [{ text: 'Please generate a reply.' }] }];
  }

  const contents: GeminiContent[] = [];

  for (const msg of messages) {
    const role: 'user' | 'model' = msg.role === 'assistant' ? 'model' : 'user';
    const parts: GeminiPart[] = [];

    if (msg.mediaUrl) {
      const img = await fetchImageAsBase64(msg.mediaUrl);
      if (img) {
        parts.push({ inline_data: { mime_type: img.mimeType, data: img.data } });
      }
    }
    parts.push({ text: msg.content || 'They sent this image' });

    const last = contents[contents.length - 1];
    // Only merge text-only messages; keep image messages separate
    if (last && last.role === role && !msg.mediaUrl && last.parts.length === 1 && 'text' in last.parts[0]) {
      (last.parts[0] as { text: string }).text += '\n' + msg.content;
    } else {
      contents.push({ role, parts });
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

// -- Fallback models --

let cachedFallbacks: string[] | null = null;

function version(id: string): number {
  return parseFloat(id.match(/^gemini-(\d+(?:\.\d+)?)/)?.[1] ?? '0');
}

// Used if the live model list can't be loaded
const STATIC_FALLBACKS = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite'];

/** Stable (non-preview, non-alias) flash models, best first, excluding `current`. */
async function fallbackModels(apiKey: string, current: string): Promise<string[]> {
  if (!cachedFallbacks) {
    try {
      const all = await fetchModels('gemini', apiKey);
      // Only plain versioned flash models (gemini-3.5-flash, gemini-3.1-flash-lite…),
      // newest version first, full flash before lite at the same version.
      const live = all
        .map((m) => m.value)
        .filter((id) => /^gemini-\d+(\.\d+)?-flash(-lite)?$/i.test(id))
        .sort((x, y) => version(y) - version(x) || Number(/lite/.test(x)) - Number(/lite/.test(y)));
      if (live.length) cachedFallbacks = live;
    } catch (err) {
      console.warn('[Oxytocin] Could not load Gemini model list for fallback:', err);
    }
  }
  const list = cachedFallbacks ?? STATIC_FALLBACKS;
  return list.filter((id) => id !== current);
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
        'API not configured. Set an API key in Oxytocin settings.',
      );
    }

    const config = await getConfig();
    const model = config.model;
    const contents = await toGeminiContents(messages);

    const body: GeminiRequest = {
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents,
      generationConfig: {
        // Newer Gemini models "think" first and those tokens count against
        // this limit; 512 can be used up before any reply text is written.
        maxOutputTokens: Math.max(config.maxTokens, 4096),
        temperature: 0.9,
      },
      safetySettings: SAFETY_SETTINGS,
    };

    // Gemini uses API key as query param
    // Try the chosen model first. If Google says it's overloaded (503/429)
    // or no longer available (404), fall back to other stable flash models.
    const candidates = [model, ...(await fallbackModels(apiKey, model))];
    let response: Response | null = null;
    let lastError = '';
    const tried: string[] = [];
    for (const candidate of candidates.slice(0, 6)) {
      tried.push(candidate);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${candidate}:generateContent`;
      let res: Response;
      try {
        res = await fetchWithTimeout(url, {
          method: 'POST',
          // Key in a header, not the URL, so it doesn't end up in logs
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify(body),
        }, 25_000); // per model: a busy model can hang instead of returning 503
      } catch (err) {
        lastError = `${candidate}: ${err instanceof Error ? err.message : String(err)}`;
        continue; // timed out or network error: try the next model
      }
      if (res.ok) {
        response = res;
        if (candidate !== model) {
          // Remember the model that worked so the next reply goes straight to it
          console.warn(`[Oxytocin] ${model} unavailable, switched to ${candidate}`);
          await browser.storage.local.set({ llmConfig: { ...config, model: candidate } });
        }
        break;
      }
      lastError = `Gemini API error (${res.status}) on ${candidate}: ${await res.text()}`;
      if (![404, 429, 503].includes(res.status)) break; // auth/bad request: don't retry
    }

    if (!response) {
      throw new Error(
        tried.length > 1 ? `Tried ${tried.join(', ')}. Last: ${lastError}` : lastError,
      );
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

    // Skip "thought" parts from thinking models; join the actual reply text
    const text = (candidate.content?.parts ?? [])
      .filter((p) => !(p as { thought?: boolean }).thought && p.text)
      .map((p) => p.text)
      .join('')
      .trim();
    if (!text) {
      if (candidate.finishReason === 'STOP') {
        throw new Error(
          'Gemini returned an empty response (finishReason: STOP). ' +
            'This usually happens if the conversation ends with your own message (no incoming turn to reply to), ' +
            'or if the AI provider refused the prompt instructions due to safety guidelines.'
        );
      }
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
