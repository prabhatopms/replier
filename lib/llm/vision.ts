/**
 * Fetch an image from a CDN URL and return it as base64 for LLM vision APIs.
 * Instagram CDN URLs (scontent-*.cdninstagram.com) are pre-authenticated via
 * signed URL parameters and are accessible from the extension background worker.
 * Returns null if the fetch fails (expired URL, network error, CORS, etc.).
 */
export async function fetchImageAsBase64(
  url: string,
): Promise<{ data: string; mimeType: string } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const mimeType =
      response.headers.get('content-type')?.split(';')[0].trim() || 'image/jpeg';
    return { data: btoa(binary), mimeType };
  } catch {
    return null;
  }
}
