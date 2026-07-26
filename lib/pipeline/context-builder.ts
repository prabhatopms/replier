import type { Contact, ToneType, CustomTone } from '@/types/contact';
import type { Message } from '@/types/message';
import type { LLMMessage } from '@/lib/llm/types';
import {
  buildSystemPrompt,
  buildMessageHistory,
} from '@/lib/llm/prompt-builder';
import { getRecentUserMessages } from '@/lib/db/messages';

interface UserProfile {
  description: string;
  textingStyle: string;
}

const REFINE_PREFIX = '[Replier instruction: ';

/**
 * Pull "Refine" feedback messages out of the conversation and return the most
 * recent one as plain instruction text. These are meta-instructions from the
 * person using the extension ("make it shorter"), not something either party
 * actually said — left in the conversation they'd read as a bizarre message
 * sent to the contact, so they're extracted and surfaced as a system prompt
 * directive instead.
 */
function extractRefinementNote(messages: Message[]): { conversation: Message[]; note?: string } {
  let note: string | undefined;
  const conversation = messages.filter((m) => {
    if (!m.content.startsWith(REFINE_PREFIX)) return true;
    note = m.content.slice(REFINE_PREFIX.length).replace(/\]$/, '').trim();
    return false;
  });
  return { conversation, note };
}

/**
 * Real, verbatim text this person has sent — the strongest available signal
 * for what their actual texting voice sounds like. Falls back to the
 * account owner's own recent messages to any contact when this conversation
 * has none yet, so even a first message to someone brand new has a real
 * voice to draw on instead of only generic prompt instructions.
 */
async function resolveVoiceTexts(contactMessages: Message[]): Promise<string[]> {
  const own = contactMessages
    .filter((m) => m.sender === 'user' && m.contentType === 'text')
    .map((m) => m.content);
  if (own.length >= 3) return own;

  const fallback = await getRecentUserMessages(40);
  return fallback.length > own.length ? fallback.map((m) => m.content) : own;
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

  const { conversation, note: refinementNote } = extractRefinementNote(messages);
  const voiceTexts = await resolveVoiceTexts(conversation);

  // Use custom prompt if set, otherwise auto-generate
  const systemPrompt = customPrompt.trim()
    ? customPrompt.trim()
    : buildSystemPrompt(contact, tone, userProfile, freshStart, customTones, voiceTexts, refinementNote);

  const llmMessages = buildMessageHistory(conversation, contact, freshStart);

  return { systemPrompt, messages: llmMessages };
}
