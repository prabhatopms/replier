/**
 * Main-world script that patches window.fetch and XHR to intercept
 * Instagram's API responses (including Lightspeed protocol messages).
 * Runs in the page's JS context (not the isolated content script world).
 * Data is passed to the content script via CustomEvent.
 */
export default defineUnlistedScript(() => {
  const INTERCEPT_PATTERNS = [
    '/api/v1/direct_v2/',
    '/api/graphql',
    '/graphql',
  ];

  const originalFetch = window.fetch;

  window.fetch = async function (
    ...args: Parameters<typeof fetch>
  ): Promise<Response> {
    const response = await originalFetch.apply(this, args);

    const url =
      typeof args[0] === 'string'
        ? args[0]
        : args[0] instanceof Request
          ? args[0].url
          : '';

    const shouldIntercept = INTERCEPT_PATTERNS.some((pattern) =>
      url.includes(pattern),
    );

    if (shouldIntercept) {
      try {
        const cloned = response.clone();
        const body = await cloned.json();

        // Dispatch general API response event
        window.dispatchEvent(
          new CustomEvent('replier:api-response', {
            detail: { url, body, timestamp: Date.now() },
          }),
        );

        // If this contains Lightspeed message data, dispatch a dedicated event
        const lsMessages = extractLightspeedMessages(body);
        if (lsMessages.length > 0) {
          window.dispatchEvent(
            new CustomEvent('replier:ls-messages', {
              detail: { messages: lsMessages, url, timestamp: Date.now() },
            }),
          );
        }
      } catch {
        // Non-JSON response or parse error — silently ignore
      }
    }

    return response;
  };

  // Also patch XMLHttpRequest for legacy endpoints
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ) {
    (this as XMLHttpRequest & { _replierUrl?: string })._replierUrl =
      typeof url === 'string' ? url : url.toString();
    return originalXHROpen.apply(this, [method, url, ...rest] as Parameters<typeof originalXHROpen>);
  };

  XMLHttpRequest.prototype.send = function (
    ...args: Parameters<typeof XMLHttpRequest.prototype.send>
  ) {
    const xhr = this as XMLHttpRequest & { _replierUrl?: string };
    const url = xhr._replierUrl || '';
    const shouldIntercept = INTERCEPT_PATTERNS.some((p) => url.includes(p));

    if (shouldIntercept) {
      this.addEventListener('load', function () {
        try {
          const body = JSON.parse(this.responseText);

          window.dispatchEvent(
            new CustomEvent('replier:api-response', {
              detail: { url, body, timestamp: Date.now() },
            }),
          );

          const lsMessages = extractLightspeedMessages(body);
          if (lsMessages.length > 0) {
            window.dispatchEvent(
              new CustomEvent('replier:ls-messages', {
                detail: { messages: lsMessages, url, timestamp: Date.now() },
              }),
            );
          }
        } catch {
          // Ignore parse errors
        }
      });
    }

    return originalXHRSend.apply(this, args);
  };

  /**
   * Extract message data from Lightspeed (LS) protocol payloads.
   * These are embedded in Instagram's API responses as serialized step arrays.
   * The format is undocumented — this parser is fault-tolerant and silently
   * skips anything it can't parse.
   */
  function extractLightspeedMessages(
    body: unknown,
  ): Array<{
    text: string;
    threadId: string;
    timestamp: number;
    senderId: string;
    messageId: string;
  }> {
    const messages: Array<{
      text: string;
      threadId: string;
      timestamp: number;
      senderId: string;
      messageId: string;
    }> = [];

    try {
      const str = typeof body === 'string' ? body : JSON.stringify(body);
      if (!str || !str.includes('upsertMessage')) return messages;

      // Walk the serialized data looking for upsertMessage steps.
      // Each step is an array like:
      // [5, "upsertMessage", "TEXT", [9], [19, "80"], [19, "THREAD_ID"],
      //  [19, "0"], [19, "TIMESTAMP"], [19, "TIMESTAMP"], [9],
      //  "MID", "ITEM_ID", [19, "SENDER_ID"], ...]
      const blocks = str.split('upsertMessage');

      for (let i = 1; i < blocks.length; i++) {
        try {
          const block = blocks[i];
          // Extract text (first quoted string after upsertMessage)
          const textMatch = block.match(/^["\s,\\]+["']?(.*?)["']?\s*,\s*\[/);
          const text = textMatch ? decodeUnicodeEscapes(textMatch[1]) : '';

          // Extract numeric IDs: [19, "ID"]
          const ids = [...block.matchAll(/\[19,\s*["\\]*"?(\d+)["\\]*"?\]/g)].map(
            (m) => m[1],
          );

          // ids[0] = "80" (constant), ids[1] = threadId, ids[2] = "0", ids[3] = timestamp
          if (ids.length < 4) continue;

          const threadId = ids[1];
          const timestamp = parseInt(ids[3], 10);

          // Find message ID (mid.$...)
          const midMatch = block.match(/mid\.\$[a-zA-Z0-9_-]+/);
          const messageId = midMatch ? midMatch[0] : '';

          // Find sender ID - it follows the message ID pattern
          // "MID", "ITEM_ID", [19, "SENDER_ID"]
          let senderId = '';
          if (midMatch) {
            const afterMid = block.slice(
              (midMatch.index || 0) + midMatch[0].length,
            );
            const senderIds = [
              ...afterMid.matchAll(/\[19,\s*["\\]*"?(\d+)["\\]*"?\]/g),
            ];
            if (senderIds.length > 0) {
              senderId = senderIds[0][1];
            }
          }

          if (threadId && timestamp) {
            messages.push({
              text: text || '[media]',
              threadId,
              timestamp,
              senderId,
              messageId,
            });
          }
        } catch {
          // Skip unparseable steps
          continue;
        }
      }
    } catch {
      // Silent failure
    }

    return messages;
  }

  function decodeUnicodeEscapes(str: string): string {
    return str
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16)),
      )
      .replace(/\\\//g, '/');
  }
});
