import type { Contact, ToneType, CustomTone } from '@/types/contact';
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
 * If a custom system prompt is set, it replaces the auto-generated one entirely.
 */
export async function buildContext(
  contact: Contact,
  messages: Message[],
  tone: ToneType,
  freshStart = false,
): Promise<{ systemPrompt: string; messages: LLMMessage[] }> {
  const result = await browser.storage.local.get([
    'userProfile',
    'customSystemPrompt',
    'customTones',
  ]);
  const userProfile = result.userProfile as UserProfile | undefined;
  const customPrompt = (result.customSystemPrompt as string) || '';
  const customTones = (result.customTones as CustomTone[]) || [];

  // Use custom prompt if set, otherwise auto-generate
  const systemPrompt = customPrompt.trim()
    ? customPrompt.trim()
    : buildSystemPrompt(contact, tone, userProfile, freshStart, customTones);

  const llmMessages = buildMessageHistory(messages, contact, freshStart);

  return { systemPrompt, messages: llmMessages };
}
