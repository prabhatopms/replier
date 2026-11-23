/**
 * fetch() with a hard timeout so a stuck LLM call surfaces as an error
 * instead of leaving the UI on "generating…" forever.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 60_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(
        `The AI took longer than ${Math.round(timeoutMs / 1000)}s to reply. ` +
          'Try again, or pick a faster model (a "flash" model) in Settings.',
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
