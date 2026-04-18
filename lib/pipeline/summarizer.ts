import { getContact, updateContactSummary, saveContact } from '@/lib/db/contacts';
import { getRecentMessages } from '@/lib/db/messages';
import { getActiveProvider } from '@/lib/llm/provider';
import { analyzeConversation, classifyLength, classifyEmojiUsage } from './analyzer';
import type { Message } from '@/types/message';
import type { StructuredSummary } from '@/types/contact';

/**
 * Check if a contact needs summarization and run it if so.
 */
export async function summarizeIfNeeded(contactId: string): Promise<void> {
  const contact = await getContact(contactId);
  if (!contact) return;

  const messages = await getRecentMessages(contactId, 100);
  if (messages.length === 0) return;

  const formattedMessages = formatMessagesForSummary(
    messages,
    contact.displayName,
  );

  const provider = await getActiveProvider();
  const newSummary = await provider.summarizeConversation(
    contact.conversationSummary,
    formattedMessages,
  );

  await updateContactSummary(contactId, newSummary);
}

/**
 * Force a re-summarization for a contact.
 * Produces both a raw text summary and a structured analysis.
 */
export async function forceSummarize(contactId: string): Promise<string> {
  const contact = await getContact(contactId);
  if (!contact) throw new Error('Contact not found');

  const messages = await getRecentMessages(contactId, 200);
  if (messages.length === 0) return contact.conversationSummary;

  // Local statistical analysis (no LLM needed)
  const stats = analyzeConversation(messages);

  const formattedMessages = formatMessagesForSummary(
    messages,
    contact.displayName,
  );

  // Include stats in the summarization prompt for grounded output
  const statsContext = buildStatsContext(stats, contact.displayName);

  const provider = await getActiveProvider();
  const rawSummary = await provider.summarizeConversation(
    statsContext,
    formattedMessages,
  );

  // Build structured summary
  const structuredSummary = buildStructuredSummary(rawSummary, stats);

  // Save both raw and structured
  await updateContactSummary(contactId, rawSummary);

  // Update structured summary on contact
  contact.conversationSummary = rawSummary;
  contact.structuredSummary = structuredSummary;
  contact.updatedAt = Date.now();
  await saveContact(contact);

  return rawSummary;
}

function formatMessagesForSummary(
  messages: Message[],
  contactName: string,
): string {
  return messages
    .map((m) => {
      const sender = m.sender === 'user' ? 'You' : contactName;
      const content =
        m.contentType === 'text'
          ? m.content
          : `[${m.contentType}: ${m.content || 'media'}]`;
      return `${sender}: ${content}`;
    })
    .join('\n');
}

/**
 * Build a context block from conversation stats to guide the LLM summarization.
 */
function buildStatsContext(
  stats: ReturnType<typeof analyzeConversation>,
  contactName: string,
): string {
  const lines = [
    `CONVERSATION ANALYTICS (${stats.totalMessages} messages over ${stats.conversationSpanDays} days):`,
    `- You sent ${stats.userMessages} messages (avg ${stats.avgUserLength} chars, ${stats.userEmojiRate} emojis/msg)`,
    `- ${contactName} sent ${stats.contactMessages} messages (avg ${stats.avgContactLength} chars, ${stats.contactEmojiRate} emojis/msg)`,
    `- Conversation initiator: ${stats.initiator}`,
    `- Avg response time: ${stats.avgResponseGapMinutes} minutes`,
    `- Recurring topics: ${stats.topWords.join(', ') || 'none identified'}`,
    '',
    'Use these analytics to inform your summary. Pay attention to:',
    '- Key topics, shared interests, inside jokes',
    '- Relationship dynamics and emotional tone',
    '- Any plans, commitments, or unresolved threads',
    '- Communication style (who texts more, message length patterns)',
  ];
  return lines.join('\n');
}

/**
 * Build a structured summary from the raw LLM output + local stats.
 */
function buildStructuredSummary(
  rawSummary: string,
  stats: ReturnType<typeof analyzeConversation>,
): StructuredSummary {
  // Extract sections from the raw summary (best-effort parsing)
  const topicMatch = rawSummary.match(/topics?:?\s*([^\n]+)/i);
  const interestMatch = rawSummary.match(/interests?:?\s*([^\n]+)/i);
  const jokeMatch = rawSummary.match(/(?:inside )?jokes?:?\s*([^\n]+)/i);
  const dynamicsMatch = rawSummary.match(/dynamics?:?\s*([^\n]+)/i);
  const recentMatch = rawSummary.match(/recent(?:ly)?:?\s*([^\n]+)/i);

  // Extract first 2-3 sentences as overview
  const sentences = rawSummary.split(/[.!?]+/).filter((s) => s.trim().length > 10);
  const overview = sentences.slice(0, 3).join('. ').trim() + '.';

  return {
    overview,
    keyTopics: extractList(topicMatch?.[1]) || stats.topWords.slice(0, 8),
    sharedInterests: extractList(interestMatch?.[1]) || [],
    insideJokes: extractList(jokeMatch?.[1]) || [],
    emotionalDynamics: dynamicsMatch?.[1]?.trim() || '',
    communicationStyle: {
      avgLength: classifyLength(stats.avgUserLength),
      emojiUsage: classifyEmojiUsage(stats.userEmojiRate),
      responseTime:
        stats.avgResponseGapMinutes < 5
          ? 'responds very quickly'
          : stats.avgResponseGapMinutes < 30
            ? 'responds within half an hour'
            : stats.avgResponseGapMinutes < 120
              ? 'responds within a couple hours'
              : 'responds slowly',
      initiator: stats.initiator,
    },
    recentContext: recentMatch?.[1]?.trim() || '',
    rawSummary,
  };
}

/**
 * Extract a comma/semicolon-separated list from text.
 */
function extractList(text?: string): string[] {
  if (!text) return [];
  return text
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length < 60);
}
