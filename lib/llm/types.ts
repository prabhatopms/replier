export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LLMProvider {
  generateReply(
    systemPrompt: string,
    messages: LLMMessage[],
  ): Promise<string>;

  summarizeConversation(
    existingSummary: string,
    newMessages: string,
  ): Promise<string>;
}

export type LLMProviderType = 'claude' | 'gemini';

export interface LLMConfig {
  provider: LLMProviderType;
  model: string;
  maxTokens: number;
}

export const PROVIDER_MODELS: Record<LLMProviderType, Array<{ value: string; label: string }>> = {
  claude: [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (Fast)' },
    { value: 'claude-opus-4-20250514', label: 'Claude Opus 4 (Best Quality)' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (Fastest)' },
  ],
  gemini: [
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Fast)' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Best Quality)' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (Budget)' },
  ],
};

export const PROVIDER_LABELS: Record<LLMProviderType, string> = {
  claude: 'Anthropic Claude',
  gemini: 'Google Gemini',
};

export const DEFAULT_LLM_CONFIG: LLMConfig = {
  provider: 'claude',
  model: 'claude-sonnet-4-20250514',
  maxTokens: 512,
};

export const DEFAULT_MODELS: Record<LLMProviderType, string> = {
  claude: 'claude-sonnet-4-20250514',
  gemini: 'gemini-2.5-flash',
};
