import type { Contact, ToneType, StructuredSummary, CustomTone } from '@/types/contact';
import type { Message } from '@/types/message';
import type { Platform } from '@/types/platform';
import type { LLMMessage } from './types';
import { getTonePrompt } from './tones';
import { platformMeta } from '@/lib/platforms/meta';

interface UserProfile {
  description: string;
  textingStyle: string;
}

const TOKEN_BUDGET = {
  total: 18000,
  systemPrompt: 3000,
  generation: 1024,
  history: 14500,
};

const CHARS_PER_TOKEN = 4;

/**
 * Build the 6-layer system prompt for reply generation.
 */
export function buildSystemPrompt(
  contact: Contact,
  tone: ToneType,
  userProfile?: UserProfile,
  freshStart = false,
  customTones?: CustomTone[],
): string {
  const layers: string[] = [];

  const platform = platformMeta(contact.platform);

  // Layer 1: You are texting on <platform>. SHORT.
  layers.push(
    `You text on ${platform.label} ${platform.conversationNoun}s as this person. First person. Their style. Their words.

LENGTH: MAX 1-2 short sentences. This is a ${platform.conversationNoun}, not an email. Think phone keyboard.

Good examples:
- "haha wait what 😂"
- "yoo that's sick, where was this?"
- "nah i'm good, maybe tmrw?"
- "lol you're crazy"
- "omg send me that reel"

Bad examples (NEVER do this):
- "Hey! That sounds absolutely amazing. I really appreciate you sharing that with me. We should definitely plan something soon!"
- "I completely understand what you mean. It's so important to..."
- Any message longer than 2 lines

NO AI phrases: "absolutely", "I appreciate", "That sounds wonderful", "definitely", "I'd love to"`,
  );

  // Layer 2: Who you are
  if (userProfile?.description || userProfile?.textingStyle) {
    const parts = ['YOU:'];
    if (userProfile.description) parts.push(userProfile.description);
    if (userProfile.textingStyle) parts.push(`Texting style: ${userProfile.textingStyle}`);
    layers.push(parts.join('\n'));
  }

  // Layer 3: Who you're talking to
  layers.push(buildPersonaLayer(contact, freshStart));

  // Layer 4: Tone
  layers.push(`Tone: ${getTonePrompt(tone, customTones)}`);

  // Layer 5: Style matching
  if (!freshStart && contact.structuredSummary?.communicationStyle) {
    layers.push(buildStyleMatchingLayer(contact.structuredSummary));
  }

  // Layer 6: Conversation direction
  layers.push(
    `CONVERSATION FORMAT: In the message history below, "[You]:" = your messages, "[${contact.displayName}]:" = their messages.
If the last message in the history is "[You]:", generate a FOLLOW-UP to what you said — not a response. Do NOT repeat yourself; move the conversation forward naturally.
If the last message is "[${contact.displayName}]:", generate a REPLY to what they said.

TOPIC FATIGUE: Look at the recent history. If the current topic has already been asked about, joked about, or clearly wrapped up (short/flat replies, "yeah idk", topic trailing off, or it's just been going for several messages), do NOT keep digging into it or ask a rephrased version of the same question. Instead pivot — genuinely curious, exploratory energy, like a natural "so what else is going on with you" — toward something new about them: a different topic, something from their notes/interests you haven't touched yet, or a fresh question. Only stay on a topic if there's real unexplored thread left in it.`,
  );

  // Layer 7: Output format
  layers.push(
    `Output ONLY the message. No quotes, no prefix, no explanation. Plain text, no HTML/tags. Complete the sentence. If they shared a reel/link, react briefly.`,
  );

  return layers.join('\n\n');
}

/**
 * Build the contact persona layer — always includes all available info.
 */
function buildPersonaLayer(contact: Contact, freshStart: boolean): string {
  const parts = [`CONTACT: ${contact.displayName} (@${contact.platformUserId})`];

  if (contact.relationship) {
    parts.push(`Relationship: ${contact.relationship}`);
  }
  if (contact.personalNotes) {
    parts.push(`Personal notes about them: ${contact.personalNotes}`);
  }
  if (contact.goal) {
    parts.push(
      `Your goal with this person: ${contact.goal}${contact.goalDescription ? ` — ${contact.goalDescription}` : ''}`,
    );
  }

  if (freshStart) {
    parts.push(`START A BRAND NEW CONVERSATION. Do NOT reference any past messages or history.

Your job: write an opener so good they HAVE to reply.

BANNED — never send these:
- "hey", "hi", "hello", "yo", "wassup", "what's up", "how are you", "how's it going", "what's good"
- Any generic greeting. Any small talk opener. Anything that could be copy-pasted to 100 people.

WHAT WORKS — pick one approach based on tone:
- Bold claim or hot take: "unpopular opinion: [something polarizing but fun]"
- Hypothetical that demands an answer: "ok genuine question — [would you rather / what would you do if]"
- Playful challenge or dare: something that puts the ball in their court
- Specific callback to something personal (use their name, relationship, or notes if available)
- Teasing observation: something cheeky that makes them want to defend themselves
- Pop culture hook: reference something current, then tie it back to them
- Blunt, confident statement that assumes plans: "clear your schedule [day]", "I have a proposition"
- Smooth re-opener: "you've been on my mind", "owe you a story", "something reminded me of you today"
- Mystery hook: "ok so I just found out something wild" — leaves them no choice but to ask

Tone guidance:
- flirty/chad/smooth/devilish: bold, assumes confidence, creates intrigue or tension
- funny/casual/teen/gen-z: absurd hypothetical, chaotic energy, self-aware humor
- default/mature/pro: thoughtful hook, genuine curiosity, something specific to them

ONE LINE ONLY. No punctuation at the end if it kills the vibe. Make it feel like a real person, not a chatbot.`);
    return parts.join('\n');
  }

  const ss = contact.structuredSummary;
  if (ss) {
    if (ss.overview) {
      parts.push(`Relationship overview: ${ss.overview}`);
    }
    if (ss.keyTopics.length > 0) {
      parts.push(`Key topics you discuss: ${ss.keyTopics.join(', ')}`);
    }
    if (ss.sharedInterests.length > 0) {
      parts.push(`Shared interests: ${ss.sharedInterests.join(', ')}`);
    }
    if (ss.insideJokes.length > 0) {
      parts.push(
        `Inside jokes/references you can use naturally: ${ss.insideJokes.join('; ')}`,
      );
    }
    if (ss.emotionalDynamics) {
      parts.push(`Emotional dynamics: ${ss.emotionalDynamics}`);
    }
    if (ss.recentContext) {
      parts.push(`Recent context: ${ss.recentContext}`);
    }
  } else if (contact.conversationSummary) {
    parts.push(`Conversation history summary: ${contact.conversationSummary}`);
  }

  return parts.join('\n');
}

/**
 * Build instructions for matching the user's natural communication style.
 */
function buildStyleMatchingLayer(ss: StructuredSummary): string {
  const style = ss.communicationStyle;
  const parts = ['STYLE MATCHING — match these patterns:'];

  if (style.avgLength === 'short') {
    parts.push('- Keep messages SHORT (1-2 lines, punchy, no essays)');
  } else if (style.avgLength === 'long') {
    parts.push('- Longer messages are fine — the user writes detailed messages');
  } else {
    parts.push('- Medium-length messages (2-4 lines)');
  }

  if (style.emojiUsage === 'heavy') {
    parts.push('- Use emojis freely — the user uses them a lot');
  } else if (style.emojiUsage === 'none') {
    parts.push('- Do NOT use emojis — the user rarely uses them');
  } else {
    parts.push('- Use emojis sparingly (1-2 per message max)');
  }

  if (style.initiator === 'user') {
    parts.push('- The user usually initiates — be engaging but let them lead');
  } else if (style.initiator === 'contact') {
    parts.push('- The contact usually initiates — respond with matching energy');
  }

  return parts.join('\n');
}

/**
 * Convert stored messages into LLM conversation format.
 * Fills from newest to oldest within token budget.
 * Enriches reel/link messages with context hints.
 */
export function buildMessageHistory(
  messages: Message[],
  contact: Contact,
  freshStart = false,
): LLMMessage[] {
  // For fresh start, use ZERO past messages — truly new conversation
  // Filter out ghost messages (verified === false) so LLM only sees real conversation
  const cleanMessages = messages.filter((m) => m.verified !== false);
  const sourceMessages = freshStart ? [] : cleanMessages;

  const maxChars = TOKEN_BUDGET.history * CHARS_PER_TOKEN;
  const result: LLMMessage[] = [];
  let totalChars = 0;

  for (let i = sourceMessages.length - 1; i >= 0; i--) {
    const msg = sourceMessages[i];
    // Skip internal instruction messages
    if (msg.content.startsWith('[Replier instruction:')) continue;

    const rawText = formatMessageContent(msg, contact.platform);
    const senderLabel = msg.sender === 'user' ? '[You]' : `[${contact.displayName}]`;
    const text = `${senderLabel}: ${rawText}`;
    const chars = text.length + 20;

    if (totalChars + chars > maxChars) break;

    result.unshift({
      role: msg.sender === 'user' ? 'assistant' : 'user',
      content: text,
      mediaUrl: msg.mediaUrl,
    });
    totalChars += chars;
  }

  // Claude requires the first message to be role: 'user'.
  if (result.length === 0) {
    result.push({
      role: 'user',
      content: freshStart
        ? `Start a new conversation with ${contact.displayName}. Just a casual opener.`
        : `Send a message to ${contact.displayName}. Be natural and match the conversation context.`,
    });
  } else if (result[0].role === 'assistant') {
    result.unshift({
      role: 'user',
      content: `[Earlier messages from ${contact.displayName} not shown]`,
    });
  }

  // Both Claude and Gemini require the last message in the array to be from the user.
  // If the last message is from the assistant (meaning YOU sent the last message),
  // append a synthetic user prompt turn asking for a follow-up — not a response.
  if (result.length > 0 && result[result.length - 1].role === 'assistant') {
    result.push({
      role: 'user',
      content: `[It's your turn. You sent the last message above. Generate a natural follow-up — do NOT repeat what you said, move the conversation forward.]`,
    });
  }

  // Claude requires alternating roles. Merge consecutive same-role messages,
  // but never merge image messages — they need their mediaUrl preserved intact.
  const merged: LLMMessage[] = [];
  for (const msg of result) {
    const last = merged[merged.length - 1];
    if (last && last.role === msg.role && !msg.mediaUrl && !last.mediaUrl) {
      last.content += '\n' + msg.content;
    } else {
      merged.push({ ...msg });
    }
  }

  return merged;
}

/**
 * Format a message's content for the LLM, enriching non-text content.
 */
function formatMessageContent(msg: Message, platform?: Platform): string {
  if (msg.contentType === 'text') {
    // Check if it's a URL (reel, post, link)
    const content = msg.content.trim();
    if (isInstagramReelOrPost(content)) {
      return `[Shared an Instagram reel/post: ${content} — react to it naturally, guess what it might be about from the URL or conversation context]`;
    }
    if (isUrl(content)) {
      return `[Shared a link: ${content}]`;
    }
    return content;
  }

  if (msg.contentType === 'story_reply') {
    const meta = platformMeta(platform);
    return `[Replied to their ${meta.label} ${meta.storyNoun}: ${msg.content || 'reacted'}]`;
  }

  if (msg.contentType === 'link') {
    const content = msg.content.trim();
    if (isInstagramReelOrPost(content)) {
      return `[Shared an Instagram reel/post: ${content} — react to it naturally]`;
    }
    return `[Shared a link: ${content}]`;
  }

  return `[${msg.contentType}: ${msg.content || 'media'}]`;
}

function isInstagramReelOrPost(text: string): boolean {
  return /instagram\.com\/(reel|p|reels)\//.test(text) ||
         /instagram\.com\/.*\/reel\//.test(text);
}

function isUrl(text: string): boolean {
  return /^https?:\/\//.test(text.trim());
}

/**
 * Strip any HTML/XML tags from generated text.
 * Safety net in case the LLM outputs markup despite instructions.
 */
export function cleanLLMResponse(text: string): string {
  return text
    .replace(/<[^>]*>/g, '') // Remove HTML/XML tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
    .replace(/^\[?(You|Me|User|Assistant)\]?\s*:\s*/i, ''); // Strip LLM role prefixes like "You:", "[You]:"
}

/**
 * Build the summarization prompt.
 */
export function buildSummarizationPrompt(
  existingSummary: string,
  newMessages: string,
): string {
  return `You are maintaining a conversation summary for an AI messaging assistant.

${existingSummary ? `Context/analytics:\n${existingSummary}\n` : 'No existing summary yet.'}

Messages:
${newMessages}

Create a comprehensive summary. Capture:
- Key topics discussed and recurring themes
- Plans made or mentioned (with dates if any)
- Inside jokes, pet names, or recurring humor
- Shared interests and activities
- Emotional dynamics and rapport level (flirty, friendly, professional, tense)
- Promises or commitments made by either person
- Important personal details shared (job, hobbies, family, etc.)
- Recent context — what's the latest thread of conversation about?
- Any unresolved questions or open threads

Keep the summary concise (under 600 words) but comprehensive. Write in third person.
Format topics, interests, and inside jokes as comma-separated lists for easy parsing.`;
}
