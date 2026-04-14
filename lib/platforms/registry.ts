import type { PlatformAdapter, Platform } from '@/types/platform';
import { instagramAdapter } from './instagram/adapter';

const adapters: PlatformAdapter[] = [
  instagramAdapter,
  // Future adapters:
  // whatsappAdapter,
  // messengerAdapter,
  // twitterAdapter,
  // linkedinAdapter,
];

/**
 * Resolve the appropriate platform adapter based on the current URL.
 */
export function resolveAdapter(url: string): PlatformAdapter | null {
  for (const adapter of adapters) {
    if (adapter.matchUrl(url)) {
      return adapter;
    }
  }
  return null;
}

/**
 * Get the platform name from a URL.
 */
export function detectPlatform(url: string): Platform | null {
  const adapter = resolveAdapter(url);
  return adapter?.name ?? null;
}
