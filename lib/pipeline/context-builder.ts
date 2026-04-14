import type { Contact, ToneType } from '@/types/contact';
import type { Message } from '@/types/message';
import type { LLMMessage } from '@/lib/llm/types';
import {
  buildSystemPrompt,
  buildMessageHistory,
} from '@/lib/llm/prompt-builder';

interface UserProfile {
  description: string;
  textingStyle: string;
}

/**
 * Assemble the complete context for generating a reply.
 * Combines the 6-layer system prompt with conversation history.
 */
export async function buildContext(
  contact: Contact,
  messages: Message[],
  tone: ToneType,
): Promise<{ systemPrompt: string; messages: LLMMessage[] }> {
  // Load user profile from storage
  const result = await browser.storage.local.get('userProfile');
  const userProfile = result.userProfile as UserProfile | undefined;

  const systemPrompt = buildSystemPrompt(contact, tone, userProfile);
  const llmMessages = buildMessageHistory(messages, contact);

  return { systemPrompt, messages: llmMessages };
}
