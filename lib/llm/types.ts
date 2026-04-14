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

export interface LLMConfig {
  provider: 'claude';
  apiKey: string;
  model: string;
  maxTokens: number;
}

export const DEFAULT_LLM_CONFIG: Omit<LLMConfig, 'apiKey'> = {
  provider: 'claude',
  model: 'claude-sonnet-4-20250514',
  maxTokens: 500,
};
