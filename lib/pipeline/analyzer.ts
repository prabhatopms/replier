import type { Message } from '@/types/message';

/**
 * Local conversation analysis — no LLM required.
 * Computes statistics from message history to enrich the LLM context.
 */

export interface ConversationStats {
  totalMessages: number;
  userMessages: number;
  contactMessages: number;
  avgUserLength: number;
  avgContactLength: number;
  userEmojiRate: number;
  contactEmojiRate: number;
  initiator: 'user' | 'contact' | 'balanced';
  avgResponseGapMinutes: number;
  topWords: string[];
  conversationSpanDays: number;
}

const EMOJI_REGEX = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'like',
  'through', 'after', 'over', 'between', 'out', 'up', 'down', 'and',
  'but', 'or', 'not', 'no', 'so', 'if', 'then', 'than', 'too', 'very',
  'just', 'that', 'this', 'it', 'its', 'my', 'your', 'his', 'her',
  'our', 'their', 'what', 'which', 'who', 'when', 'where', 'how', 'all',
  'each', 'every', 'both', 'few', 'more', 'most', 'some', 'any', 'i',
  'me', 'you', 'he', 'she', 'we', 'they', 'them', 'him', 'us',
  'ok', 'okay', 'yeah', 'yes', 'no', 'lol', 'haha', 'hmm', 'oh',
]);

export function analyzeConversation(messages: Message[]): ConversationStats {
  if (messages.length === 0) {
    return {
      totalMessages: 0,
      userMessages: 0,
      contactMessages: 0,
      avgUserLength: 0,
      avgContactLength: 0,
      userEmojiRate: 0,
      contactEmojiRate: 0,
      initiator: 'balanced',
      avgResponseGapMinutes: 0,
      topWords: [],
      conversationSpanDays: 0,
    };
  }

  const userMsgs = messages.filter((m) => m.sender === 'user');
  const contactMsgs = messages.filter((m) => m.sender === 'contact');

  // Average message lengths
  const avgUserLength =
    userMsgs.length > 0
      ? userMsgs.reduce((sum, m) => sum + m.content.length, 0) / userMsgs.length
      : 0;
  const avgContactLength =
    contactMsgs.length > 0
      ? contactMsgs.reduce((sum, m) => sum + m.content.length, 0) / contactMsgs.length
      : 0;

  // Emoji rates
  const countEmojis = (text: string) => (text.match(EMOJI_REGEX) || []).length;
  const userEmojiRate =
    userMsgs.length > 0
      ? userMsgs.reduce((sum, m) => sum + countEmojis(m.content), 0) / userMsgs.length
      : 0;
  const contactEmojiRate =
    contactMsgs.length > 0
      ? contactMsgs.reduce((sum, m) => sum + countEmojis(m.content), 0) / contactMsgs.length
      : 0;

  // Who initiates conversations (who breaks silence after a gap > 4 hours)
  const GAP_THRESHOLD = 4 * 60 * 60 * 1000; // 4 hours
  let userInitiates = 0;
  let contactInitiates = 0;
  const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp);

  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].timestamp - sorted[i - 1].timestamp;
    if (gap > GAP_THRESHOLD) {
      if (sorted[i].sender === 'user') userInitiates++;
      else contactInitiates++;
    }
  }
  // First message also counts as initiation
  if (sorted.length > 0) {
    if (sorted[0].sender === 'user') userInitiates++;
    else contactInitiates++;
  }

  const total = userInitiates + contactInitiates;
  const initiator: 'user' | 'contact' | 'balanced' =
    total === 0
      ? 'balanced'
      : userInitiates / total > 0.6
        ? 'user'
        : contactInitiates / total > 0.6
          ? 'contact'
          : 'balanced';

  // Average response gap (in minutes)
  let responseGaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].sender !== sorted[i - 1].sender) {
      const gapMs = sorted[i].timestamp - sorted[i - 1].timestamp;
      if (gapMs > 0 && gapMs < 24 * 60 * 60 * 1000) {
        // Exclude gaps > 24h (probably different conversation sessions)
        responseGaps.push(gapMs / (60 * 1000));
      }
    }
  }
  const avgResponseGapMinutes =
    responseGaps.length > 0
      ? responseGaps.reduce((a, b) => a + b, 0) / responseGaps.length
      : 0;

  // Top words (simple keyword extraction)
  const wordCounts = new Map<string, number>();
  for (const msg of messages) {
    const words = msg.content
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
    for (const word of words) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }
  }
  const topWords = [...wordCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([word]) => word);

  // Conversation span
  const minTs = sorted[0]?.timestamp || Date.now();
  const maxTs = sorted[sorted.length - 1]?.timestamp || Date.now();
  const conversationSpanDays = (maxTs - minTs) / (24 * 60 * 60 * 1000);

  return {
    totalMessages: messages.length,
    userMessages: userMsgs.length,
    contactMessages: contactMsgs.length,
    avgUserLength: Math.round(avgUserLength),
    avgContactLength: Math.round(avgContactLength),
    userEmojiRate: Math.round(userEmojiRate * 100) / 100,
    contactEmojiRate: Math.round(contactEmojiRate * 100) / 100,
    initiator,
    avgResponseGapMinutes: Math.round(avgResponseGapMinutes),
    topWords,
    conversationSpanDays: Math.round(conversationSpanDays * 10) / 10,
  };
}

/**
 * Classify message length style.
 */
export function classifyLength(avgLength: number): 'short' | 'medium' | 'long' {
  if (avgLength < 30) return 'short';
  if (avgLength < 100) return 'medium';
  return 'long';
}

/**
 * Classify emoji usage level.
 */
export function classifyEmojiUsage(rate: number): 'none' | 'light' | 'heavy' {
  if (rate < 0.1) return 'none';
  if (rate < 0.5) return 'light';
  return 'heavy';
}

export interface VoiceProfile {
  /** Bullet-point description of measured texting habits, ready to drop into a prompt. */
  description: string;
  /** Real, verbatim messages — the strongest possible signal for "sound like this person." */
  samples: string[];
}

const FILLER_WORDS = [
  'lol', 'lmao', 'lmaoo', 'haha', 'hahaha', 'omg', 'ngl', 'tbh', 'fr',
  'literally', 'bro', 'bruh', 'ikr', 'nah', 'yeah', 'yea', 'ya', 'ofc',
  'idk', 'ig', 'tho', 'ah', 'ehh', 'hmm',
];

/**
 * Build a texting-voice profile from a person's own real messages —
 * measured directly from their text, not inferred by an LLM.
 *
 * This exists because generic "sound natural" instructions and hardcoded
 * example phrases in a prompt tend to leak into every reply regardless of
 * who's being imitated, producing a recognizable, repeated "voice" that
 * belongs to the prompt rather than the actual person. Concrete, measured
 * habits (capitalization, punctuation, real sample messages) anchor the
 * model to this specific person's texting fingerprint instead.
 *
 * Returns null when there isn't enough signal (fewer than 3 real texts) to
 * say anything meaningful — callers should fall back to a lighter default
 * rather than presenting a profile built from near-nothing as fact.
 */
export function buildVoiceProfile(rawTexts: string[]): VoiceProfile | null {
  // Bracket-wrapped entries are our own enrichment (e.g. "[Sent an image]",
  // "[Replying to: ...]"), not the person's actual words — exclude them.
  const texts = rawTexts.map((t) => t.trim()).filter((t) => t.length > 0 && !t.startsWith('['));
  if (texts.length < 3) return null;

  const sample = texts.slice(-60);

  let lower = 0;
  let upper = 0;
  for (const t of sample) {
    const c = t[0];
    if (c && /[a-z]/.test(c)) lower++;
    else if (c && /[A-Z]/.test(c)) upper++;
  }
  const capTotal = lower + upper;

  let noPunct = 0, ellipsis = 0, question = 0, exclaim = 0, period = 0;
  for (const t of sample) {
    if (/\.\.\.$/.test(t)) ellipsis++;
    else if (/\?$/.test(t)) question++;
    else if (/!+$/.test(t)) exclaim++;
    else if (/\.$/.test(t)) period++;
    else noPunct++;
  }
  const puncTotal = noPunct + ellipsis + question + exclaim + period;

  const avgChars = sample.reduce((s, t) => s + t.length, 0) / sample.length;

  const emojiCounts = new Map<string, number>();
  let withEmoji = 0;
  for (const t of sample) {
    const found = t.match(EMOJI_REGEX);
    if (found?.length) {
      withEmoji++;
      for (const e of found) emojiCounts.set(e, (emojiCounts.get(e) || 0) + 1);
    }
  }
  const topEmojis = [...emojiCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([e]) => e);

  const joined = ` ${sample.join(' ').toLowerCase()} `;
  const usedFillers = FILLER_WORDS.filter((f) => joined.includes(` ${f} `) || joined.includes(` ${f}.`) || joined.includes(` ${f}!`));

  const lines: string[] = [
    avgChars < 20
      ? 'Very short — often just a few words'
      : avgChars < 50
        ? 'Short and punchy'
        : avgChars < 110
          ? 'Medium-length, a full thought per message'
          : 'Comfortable writing longer, detailed messages',
  ];

  if (capTotal >= 4) {
    if (lower / capTotal > 0.75) lines.push('Rarely capitalizes the first letter — all-lowercase texting');
    else if (upper / capTotal > 0.85) lines.push('Capitalizes normally, like standard writing');
  }

  if (puncTotal >= 4) {
    if (noPunct / puncTotal > 0.55) lines.push('Usually skips ending punctuation entirely');
    if (ellipsis / puncTotal > 0.15) lines.push('Uses "..." to trail off sometimes');
    if (exclaim / puncTotal > 0.25) lines.push('Punctuates with "!" often — reads as high energy');
  }

  if (sample.length >= 5) {
    if (withEmoji / sample.length > 0.4) {
      lines.push(`Uses emoji often${topEmojis.length ? `, especially ${topEmojis.join(' ')}` : ''}`);
    } else if (withEmoji / sample.length < 0.05) {
      lines.push('Almost never uses emoji');
    }
  }

  if (usedFillers.length > 0) {
    lines.push(`Natural filler words in their vocabulary: ${usedFillers.slice(0, 6).join(', ')}`);
  }

  return {
    description: lines.map((l) => `- ${l}`).join('\n'),
    samples: pickDiverseSamples(texts, 5),
  };
}

/**
 * Pick recency-weighted, deduplicated real messages to use as verbatim
 * few-shot examples — the strongest possible "sound like this" signal.
 */
function pickDiverseSamples(texts: string[], n: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = texts.length - 1; i >= 0 && out.length < n; i--) {
    const key = texts[i].toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(texts[i]);
  }
  return out.reverse();
}
