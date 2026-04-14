/**
 * Main-world script that patches window.fetch to intercept Instagram's API responses.
 * This runs in the page's JS context (not the isolated content script world).
 * Data is passed to the content script via CustomEvent.
 */
export default defineUnlistedScript(() => {
  const INTERCEPT_PATTERNS = ['/api/v1/direct_v2/', '/graphql'];

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
        window.dispatchEvent(
          new CustomEvent('replier:api-response', {
            detail: { url, body, timestamp: Date.now() },
          }),
        );
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
        } catch {
          // Ignore parse errors
        }
      });
    }

    return originalXHRSend.apply(this, args);
  };
});
