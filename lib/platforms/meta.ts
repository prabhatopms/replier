import type { Platform, PlatformMeta } from '@/types/platform';

/**
 * Per-platform vocabulary, kept free of any DOM access.
 *
 * Adapters reference these entries rather than declaring their own, so the
 * service worker and side panel — which must never import adapter code, since
 * adapters touch `document` — can still render platform-correct copy and
 * build platform-correct prompts.
 */
export const PLATFORM_META: Record<Platform, PlatformMeta> = {
  instagram: {
    label: 'Instagram',
    conversationNoun: 'DM',
    storyNoun: 'story',
    handleStyle: 'username',
    openConversationHint: 'Open a conversation at instagram.com/direct',
  },
  whatsapp: {
    label: 'WhatsApp',
    conversationNoun: 'chat',
    storyNoun: 'status',
    handleStyle: 'phone',
    openConversationHint: 'Open a chat at web.whatsapp.com',
  },
  messenger: {
    label: 'Messenger',
    conversationNoun: 'chat',
    storyNoun: 'story',
    handleStyle: 'username',
    openConversationHint: 'Open a conversation in Messenger',
  },
  twitter: {
    label: 'X',
    conversationNoun: 'DM',
    storyNoun: 'post',
    handleStyle: 'username',
    openConversationHint: 'Open a conversation at x.com/messages',
  },
  linkedin: {
    label: 'LinkedIn',
    conversationNoun: 'message',
    storyNoun: 'post',
    handleStyle: 'username',
    openConversationHint: 'Open a conversation in LinkedIn messaging',
  },
};

/** Safe lookup for values that may have come from stored data. */
export function platformMeta(platform: Platform | undefined): PlatformMeta {
  return PLATFORM_META[platform as Platform] ?? PLATFORM_META.instagram;
}

/**
 * Render a contact's identifier the way its platform does. Instagram handles
 * read as @name; a WhatsApp phone number with an "@" glued to it would be
 * nonsense.
 */
export function formatHandle(
  platform: Platform | undefined,
  platformUserId: string,
): string {
  if (!platformUserId) return '';
  return platformMeta(platform).handleStyle === 'username'
    ? `@${platformUserId}`
    : platformUserId;
}
