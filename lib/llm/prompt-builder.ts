import type { Contact, ToneType, CustomTone } from '@/types/contact';
import type { Message } from '@/types/message';
import type { Platform } from '@/types/platform';
import type { LLMMessage } from './types';
import { getTonePrompt } from './tones';
import { platformMeta } from '@/lib/platforms/meta';
import { buildVoiceProfile } from '@/lib/pipeline/analyzer';

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
 * Build the system prompt for reply generation.
 *
 * `voiceTexts` should be the real, verbatim text messages this person has
 * sent — from this conversation when there's history, or from elsewhere
 * (see generator.ts's fallback for brand-new contacts) when there isn't.
 * They anchor the reply to this person's ACTUAL texting fingerprint instead
 * of generic "sound natural" instructions, which tend to produce a
 * recognizable, repeated voice that belongs to the prompt, not the person —
 * the most common way a reply ends up reading as obviously AI-written.
 */
export function buildSystemPrompt(
  contact: Contact,
  tone: ToneType,
  userProfile?: UserProfile,
  freshStart = false,
  customTones?: CustomTone[],
  voiceTexts?: string[],
  refinementNote?: string,
): string {
  const layers: string[] = [];

  const platform = platformMeta(contact.platform);

  // Layer 1: Core identity and format. Deliberately no example phrases here —
  // hardcoded "good examples" get imitated literally across every contact,
  // which is its own way of sounding templated. Real voice comes from Layer 2.
  layers.push(
    `You are texting on ${platform.label} ${platform.conversationNoun}s AS this person — not describing them, not assisting them. Write the next message they would actually send.

This is a ${platform.conversationNoun}, not an email. Real texts are often imperfect: fragments, no capital letters, trailing off, one word if that's all there is to say. Don't pad a short thought into a fuller sentence just to sound complete.

Never sound like a helpful assistant. Watch for these tells: "absolutely", "I appreciate", "that sounds wonderful/amazing", "definitely", "I'd love to", explaining your own reasoning, neatly wrapping up a thought, asking more than one question, being uniformly upbeat and agreeable.

Also watch for the generic reflection reflex — opening with "sounds like...", "that sounds...", "oh that's rough/awesome/fun" and then stopping. That's a therapist restating what you said, not a person in the conversation. Restating their point back at them isn't a reply, it's a placeholder for one.`,
  );

  // Layer 2: Real voice, measured from this person's own messages.
  const voiceProfile = voiceTexts ? buildVoiceProfile(voiceTexts) : null;
  if (voiceProfile) {
    layers.push(
      `YOUR ACTUAL VOICE — measured from real messages this person sent. This is not a generic style, it's theirs specifically. Match it, don't default to a generic "casual texting" voice:
${voiceProfile.description}

Real examples of how they actually write (match this energy and form, don't reuse the lines themselves):
${voiceProfile.samples.map((s) => `- "${s}"`).join('\n')}`,
    );
  } else {
    layers.push(
      `No message history to sample a voice from yet. Default to something short and low-key rather than a polished, upbeat "assistant" tone.`,
    );
  }

  // Layer 3: Who you are
  if (userProfile?.description || userProfile?.textingStyle) {
    const parts = ['YOU:'];
    if (userProfile.description) parts.push(userProfile.description);
    if (userProfile.textingStyle) parts.push(`Texting style: ${userProfile.textingStyle}`);
    layers.push(parts.join('\n'));
  }

  // Layer 4: Who you're talking to
  layers.push(buildPersonaLayer(contact, freshStart, !!voiceProfile));

  // Layer 5: Tone — a deliberate creative direction layered on top of the
  // real voice above, not a replacement for it. State that explicitly, since
  // otherwise the tone description reads as a standalone persona and quietly
  // overrides Layer 2's actual fingerprint (length, punctuation, energy) —
  // most noticeable switching off "default", whose tone text is the only one
  // that happens to restate the voice-matching instruction itself.
  layers.push(
    `Tone: ${getTonePrompt(tone, customTones)}

This tone is a flavor on top of YOUR ACTUAL VOICE above, not a replacement for it. Keep the same real fingerprint — message length, punctuation, energy — that voice profile established. Don't drift into a generic "confident guy" / "flirty texter" / etc. voice that could belong to anyone.`,
  );

  // Layer 6: Conversation direction. Reply-vs-follow-up is already handled
  // structurally (buildMessageHistory appends a synthetic prompt turn when
  // the last message was yours), so this only needs to cover judgment calls
  // the structure can't make on its own.
  layers.push(
    `TOPIC FATIGUE: Look at the recent history. If the current topic has already been asked about, joked about, or clearly wrapped up (short/flat replies, "yeah idk", topic trailing off, or it's just been going for several messages), do NOT keep digging into it or ask a rephrased version of the same question. Instead pivot — genuinely curious, exploratory energy, like a natural "so what else is going on with you" — toward something new about them: a different topic, something from their notes/interests you haven't touched yet, or a fresh question. Only stay on a topic if there's real unexplored thread left in it.

REACT, THEN MOVE IT FORWARD: A reply that only reflects back what they said and stops ("that's rough", "haha nice", "oh wow") is passive listening, not a person having a conversation — it kills momentum and leaves them carrying the whole thing. React in a line if there's something worth reacting to, then add something that's actually yours: an opinion, a tease, a related story, a specific and genuinely curious question grown out of what they just said (not a generic "how about you?" tacked on as a formality). Not every message needs a question — don't manufacture one where the topic is genuinely closed — but the default should be pushing the conversation somewhere, not politely closing the loop on theirs.`,
  );

  // Layer 7: Output format
  layers.push(
    `Output ONLY the message. No quotes, no prefix, no explanation. Plain text, no HTML/tags. Complete the sentence. If they shared a reel/link, react briefly.`,
  );

  // Layer 8: Explicit user feedback from a "Refine" request, if any — this is
  // a direct instruction from the person using the extension, not part of
  // the conversation, so it goes last and outranks the general guidance
  // above where they conflict.
  if (refinementNote) {
    layers.push(
      `SPECIFIC INSTRUCTION FOR THIS REPLY — follow this precisely, it overrides general guidance above where they conflict: ${refinementNote}`,
    );
  }

  return layers.join('\n\n');
}

/**
 * Build the contact persona layer — always includes all available info.
 */
function buildPersonaLayer(contact: Contact, freshStart: boolean, hasVoiceProfile: boolean): string {
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
    parts.push(`START A BRAND NEW CONVERSATION with ${contact.displayName}. Do NOT reference any past messages.

Write ONE opener that only makes sense sent BY YOU TO THIS SPECIFIC PERSON — not a line that could be copy-pasted to anyone. Ground it in something real: their name, what the notes above say about them, the nature of your relationship, or something plausible from context. Skip generic greetings ("hey", "hi", "what's up", "how are you") — open with actual content, not a check-in.

${hasVoiceProfile
        ? 'The voice profile above still applies here — the opener should sound like that same person\'s texting habits (length, punctuation, energy), not a punchy "hook" line engineered to be clickable.'
        : 'Without a voice sample to go on, err toward short and understated rather than a crafted, attention-grabbing opener — a real first text is rarely trying that hard.'}

ONE LINE ONLY.`);
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
 * Convert stored messages into LLM conversation format.
 * Fills from newest to oldest within token budget.
 * Enriches reel/link messages with context hints.
 *
 * Content carries no "[You]:" / "[Name]:" speaker label — the API's own
 * `role` field (assistant = you, user = them) already tells the model who's
 * speaking. Doubling that up as text turns the history into a labeled
 * transcript, which nudges completions toward a narrated, reporting tone
 * instead of just being a person mid-conversation — a subtle but real
 * contributor to replies reading as obviously AI-written.
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
    // Refine-instruction messages are pulled out and surfaced as a system
    // prompt directive by context-builder.ts before this runs — this is a
    // defensive backstop, not the primary handling.
    if (msg.content.startsWith('[Replier instruction:')) continue;

    const text = formatMessageContent(msg, contact.platform);
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
