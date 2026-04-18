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
