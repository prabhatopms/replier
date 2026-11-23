import type { LLMProviderType } from './types';

export interface ModelOption {
  value: string;
  label: string;
}

/**
 * Fetch the models the given API key can actually use, straight from the
 * provider. Lists are newest-first so the top entry is a sensible default.
 * Throws on network/auth errors so the caller can fall back to the
 * hard-coded PROVIDER_MODELS list.
 */
export async function fetchModels(
  provider: LLMProviderType,
  apiKey: string,
): Promise<ModelOption[]> {
  if (!apiKey.trim()) throw new Error('No API key');
  switch (provider) {
    case 'gemini':
      return fetchGeminiModels(apiKey.trim());
    case 'openai':
      return fetchOpenAIModels(apiKey.trim());
    case 'claude':
    default:
      return fetchClaudeModels(apiKey.trim());
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

// ── Claude ────────────────────────────────────────────────────────────────
async function fetchClaudeModels(apiKey: string): Promise<ModelOption[]> {
  const res = await fetch('https://api.anthropic.com/v1/models?limit=100', {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as {
    data: Array<{ id: string; display_name?: string; created_at?: string }>;
  };
  return data.data
    .slice()
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    .map((m) => ({ value: m.id, label: m.display_name || m.id }));
}

// ── Gemini ────────────────────────────────────────────────────────────────
// Skip models that can't do plain chat (embeddings, image/audio generation…)
const GEMINI_EXCLUDE = /embedding|aqa|imagen|veo|tts|image|audio|live|learnlm|robotics|computer-use|customtools/i;

async function fetchGeminiModels(apiKey: string): Promise<ModelOption[]> {
  const res = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
    { headers: { 'x-goog-api-key': apiKey } },
  );
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as {
    models?: Array<{
      name: string;
      displayName?: string;
      supportedGenerationMethods?: string[];
    }>;
  };
  return (data.models || [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName }))
    .filter((m) => m.id.startsWith('gemini') && !GEMINI_EXCLUDE.test(m.id))
    .sort((a, b) => geminiRank(a.id) - geminiRank(b.id)
      || b.id.localeCompare(a.id, undefined, { numeric: true }))
    .map((m) => ({ value: m.id, label: m.label ? `${m.label} (${m.id})` : m.id }));
}

/**
 * Lower rank = higher in the list. Stable, versioned models first; moving
 * aliases like "gemini-flash-latest" (which jump to the newest, often
 * overloaded model) and preview/experimental builds go to the bottom.
 */
function geminiRank(id: string): number {
  if (/latest/i.test(id)) return 2;
  if (/preview|exp/i.test(id)) return 1;
  return 0;
}

// ── OpenAI ────────────────────────────────────────────────────────────────
const OPENAI_INCLUDE = /^(gpt-|o\d|chatgpt-)/i;
const OPENAI_EXCLUDE = /audio|realtime|transcribe|tts|image|search|embedding|instruct|codex/i;

async function fetchOpenAIModels(apiKey: string): Promise<ModelOption[]> {
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { data: Array<{ id: string; created?: number }> };
  return data.data
    .filter((m) => OPENAI_INCLUDE.test(m.id) && !OPENAI_EXCLUDE.test(m.id))
    .sort((a, b) => (b.created || 0) - (a.created || 0))
    .map((m) => ({ value: m.id, label: m.id }));
}
