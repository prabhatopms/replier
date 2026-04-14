import type { Contact, ToneType } from '@/types/contact';
import type { Message } from '@/types/message';
import type { LLMMessage } from './types';
import { getTonePrompt } from './tones';

interface UserProfile {
  description: string;
  textingStyle: string;
}

const TOKEN_BUDGET = {
  total: 8192,
  systemPrompt: 1500,
  generation: 500,
  history: 6192,
};

const CHARS_PER_TOKEN = 4;

/**
 * Build the 6-layer system prompt for reply generation.
 */
export function buildSystemPrompt(
  contact: Contact,
  tone: ToneType,
  userProfile?: UserProfile,
): string {
  const layers: string[] = [];

  // Layer 1: Base System
  layers.push(
    `You are generating a message reply in a conversation. You write as if you ARE the user — first person, their texting style, their vocabulary. Match message length to the conversation's natural rhythm. Never sound like an AI. Never use formal language unless the user's texting style is formal.`,
  );

  // Layer 2: User Profile
  if (userProfile?.description) {
    layers.push(
      `About you: ${userProfile.description}${userProfile.textingStyle ? `\nYour texting style: ${userProfile.textingStyle}` : ''}`,
    );
  }

  // Layer 3: Contact Persona
  const personaParts = [
    `You are talking to ${contact.displayName}.`,
  ];
  if (contact.relationship) {
    personaParts.push(`Relationship: ${contact.relationship}.`);
  }
  if (contact.personalNotes) {
    personaParts.push(`About them: ${contact.personalNotes}`);
  }
  personaParts.push(
    `Your goal with this person: ${contact.goal}${contact.goalDescription ? ` — ${contact.goalDescription}` : ''}`,
  );
  if (contact.conversationSummary) {
    personaParts.push(
      `Conversation history summary: ${contact.conversationSummary}`,
    );
  }
  layers.push(personaParts.join('\n'));

  // Layer 4: Tone Modifier
  layers.push(`Tone for this reply: ${getTonePrompt(tone)}`);

  // Layer 6: Generation Instructions (Layer 5 is the message history, handled separately)
  layers.push(
    `Generate exactly ONE reply message. Rules:
- Match the conversation's energy, length, and emoji patterns
- Reference specific details from the conversation when natural
- Don't repeat what was just said
- Don't be generic — be specific to this person and context
- Output ONLY the message text, nothing else — no quotes, no prefix, no explanation`,
  );

  return layers.join('\n\n');
}

/**
 * Convert stored messages into LLM conversation format.
 * Fills from newest to oldest within token budget.
 */
export function buildMessageHistory(
  messages: Message[],
  contact: Contact,
): LLMMessage[] {
  const maxChars = TOKEN_BUDGET.history * CHARS_PER_TOKEN;
  const result: LLMMessage[] = [];
  let totalChars = 0;

  // Messages should already be in chronological order (oldest first)
  // We iterate from the end to find how many we can fit
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const text =
      msg.contentType === 'text'
        ? msg.content
        : `[${msg.contentType}: ${msg.content || 'media'}]`;
    const chars = text.length + 20; // overhead for role/formatting

    if (totalChars + chars > maxChars) break;

    result.unshift({
      role: msg.sender === 'user' ? 'assistant' : 'user',
      content: text,
    });
    totalChars += chars;
  }

  return result;
}

/**
 * Build the summarization prompt.
 */
export function buildSummarizationPrompt(
  existingSummary: string,
  newMessages: string,
): string {
  return `You are maintaining a conversation summary for an AI messaging assistant.

${existingSummary ? `Existing summary:\n${existingSummary}\n` : 'No existing summary yet.'}

New messages since last summary:
${newMessages}

Update the summary to incorporate the new messages. Capture:
- Key topics discussed
- Plans made or mentioned
- Inside jokes or recurring themes
- Emotional dynamics and rapport level
- Promises or commitments made
- Important personal details shared
- Any context the user should remember for future messages

Keep the summary concise (under 500 words) but comprehensive. Write in third person.`;
}
