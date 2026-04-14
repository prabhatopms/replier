import { getContact, updateContactSummary } from '@/lib/db/contacts';
import { getRecentMessages } from '@/lib/db/messages';
import { getActiveProvider } from '@/lib/llm/provider';
import type { Message } from '@/types/message';

/**
 * Check if a contact needs summarization and run it if so.
 */
export async function summarizeIfNeeded(contactId: string): Promise<void> {
  const contact = await getContact(contactId);
  if (!contact) return;

  // Get recent messages for summarization
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
 */
export async function forceSummarize(contactId: string): Promise<string> {
  const contact = await getContact(contactId);
  if (!contact) throw new Error('Contact not found');

  const messages = await getRecentMessages(contactId, 200);
  if (messages.length === 0) return contact.conversationSummary;

  const formattedMessages = formatMessagesForSummary(
    messages,
    contact.displayName,
  );

  const provider = await getActiveProvider();
  const newSummary = await provider.summarizeConversation(
    '', // Start fresh
    formattedMessages,
  );

  await updateContactSummary(contactId, newSummary);
  return newSummary;
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
