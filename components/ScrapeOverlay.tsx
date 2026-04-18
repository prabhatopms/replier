import { useState, useEffect } from 'react';

interface ScrapeOverlayProps {
  messageCount: number;
  isComplete: boolean;
  onCancel: () => void;
}

export function ScrapeOverlay({
  messageCount,
  isComplete,
  onCancel,
}: ScrapeOverlayProps) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isComplete) {
      const timer = setTimeout(() => setDismissed(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [isComplete]);

  if (dismissed) return null;

  return (
    <div
      className={`
        fixed bottom-20 left-1/2 -translate-x-1/2 z-[9999]
        flex items-center gap-3 px-4 py-2.5
        bg-gray-900 text-white rounded-full shadow-xl
        transition-all duration-300
        ${isComplete ? 'bg-green-800' : ''}
      `}
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
    >
      {/* Pulsing indicator or checkmark */}
      {isComplete ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-green-300">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      ) : (
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500" />
        </span>
      )}

      {/* Status text */}
      <span className="text-sm font-medium">
        {isComplete
          ? `Done! ${messageCount} messages captured`
          : `Scraping history... ${messageCount} messages`}
      </span>

      {/* Cancel button (only during scraping) */}
      {!isComplete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
          className="
            px-2.5 py-1 text-xs font-medium
            text-gray-300 hover:text-white
            bg-gray-700 hover:bg-gray-600
            rounded-full transition-colors
          "
        >
          Stop
        </button>
      )}
    </div>
  );
}
