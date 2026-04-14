import type { ToneType } from '@/types/contact';
import { getContact, incrementMessageCount } from '@/lib/db/contacts';
import { getRecentMessages } from '@/lib/db/messages';
import { createPendingReply, updateReplyText } from '@/lib/db/replies';
import { claudeProvider } from '@/lib/llm/claude';
import { buildContext } from './context-builder';
import { summarizeIfNeeded } from './summarizer';

const SUMMARY_THRESHOLD = 50;

/**
 * Generate a reply for a contact.
 * This is the main orchestration function called by the queue processor.
 */
export async function generateReply(
  contactId: string,
  triggerMessageId: string,
  tone: ToneType,
): Promise<{ replyId: string; text: string } | null> {
  const contact = await getContact(contactId);
  if (!contact || !contact.isActive) return null;

  // Create a pending reply record
  const pendingReply = await createPendingReply(
    contactId,
    triggerMessageId,
    tone,
  );

  // Notify content script that generation started
  notifyContentScript(contactId, 'generating');

  try {
    // Load recent messages
    const messages = await getRecentMessages(contactId, 40);

    // Build context (system prompt + message history)
    const context = await buildContext(contact, messages, tone);

    // Call the LLM
    const replyText = await claudeProvider.generateReply(
      context.systemPrompt,
      context.messages,
    );

    // Store the generated reply
    await updateReplyText(pendingReply.id, replyText);

    // Increment message count and check if summarization is needed
    const newCount = await incrementMessageCount(contactId);
    if (newCount >= SUMMARY_THRESHOLD) {
      // Summarize in background — don't block reply delivery
      summarizeIfNeeded(contactId).catch((err) =>
        console.error('[Replier] Summarization error:', err),
      );
    }

    // Notify content script that reply is ready
    notifyContentScript(contactId, 'ready', pendingReply.id, replyText, tone);

    return { replyId: pendingReply.id, text: replyText };
  } catch (error) {
    console.error('[Replier] Generation error:', error);
    notifyContentScript(
      contactId,
      'error',
      undefined,
      undefined,
      undefined,
      error instanceof Error ? error.message : 'Unknown error',
    );
    return null;
  }
}

async function notifyContentScript(
  contactId: string,
  status: 'generating' | 'ready' | 'error',
  replyId?: string,
  text?: string,
  tone?: ToneType,
  error?: string,
): Promise<void> {
  const tabs = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  const tabId = tabs[0]?.id;
  if (!tabId) return;

  if (status === 'generating') {
    browser.tabs.sendMessage(tabId, {
      type: 'REPLY_GENERATING',
      contactId,
    });
  } else if (status === 'ready' && replyId && text) {
    browser.tabs.sendMessage(tabId, {
      type: 'REPLY_READY',
      contactId,
      replyId,
      text,
      tone,
    });
  } else if (status === 'error' && error) {
    browser.tabs.sendMessage(tabId, {
      type: 'GENERATION_ERROR',
      contactId,
      error,
    });
  }
}
