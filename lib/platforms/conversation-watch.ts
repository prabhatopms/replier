/**
 * Shared conversation-switch detection.
 *
 * Neither supported platform reliably announces that the user moved to a
 * different chat. Instagram updates the URL for some navigations but not when
 * switching threads via the sidebar, and WhatsApp Web never changes its URL —
 * the entire app lives at `/`. MutationObservers are a poor fit too: both apps
 * churn the message subtree constantly for incoming messages, typing
 * indicators, and read receipts, so observers fire far more often than the
 * conversation actually changes.
 *
 * Polling a cheap identity key sidesteps both problems. `getKey` is a URL
 * regex plus at most one querySelector, so a sub-second interval costs
 * effectively nothing and is immune to whatever the app does to its DOM.
 */

/** How long a new key must hold steady before we treat the switch as real. */
const SETTLE_MS = 250;

export function watchConversationKey(
  getKey: () => string | null,
  onChange: () => void,
  intervalMs = 400,
): () => void {
  // Seed with the current conversation so we report changes, not the first
  // observation. A null seed is fine — the first real key counts as a change.
  let current = getKey();
  let candidate: string | null = null;
  let candidateSince = 0;

  const timer = setInterval(() => {
    const key = getKey();

    // A null key means the conversation pane is mid-render or the user
    // navigated to a non-chat view. Neither is a switch to a new contact, so
    // hold the last known key and wait.
    if (key === null) {
      candidate = null;
      return;
    }

    if (key === current) {
      candidate = null;
      return;
    }

    // Debounce: both apps briefly render the *outgoing* chat's header next to
    // the incoming chat's message list while switching, which can surface a
    // transient key that belongs to neither conversation.
    const now = Date.now();
    if (key !== candidate) {
      candidate = key;
      candidateSince = now;
      return;
    }

    if (now - candidateSince >= SETTLE_MS) {
      current = key;
      candidate = null;
      onChange();
    }
  }, intervalMs);

  return () => clearInterval(timer);
}
