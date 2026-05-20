import { useState, useEffect } from 'react';

interface ContactToastProps {
  username: string;
  displayName: string;
  onConfigure: () => void;
  onDismiss: () => void;
  autoDismissMs?: number;
}

export function ContactToast({
  username,
  displayName,
  onConfigure,
  onDismiss,
  autoDismissMs = 5000,
}: ContactToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300); // Wait for fade-out animation
    }, autoDismissMs);
    return () => clearTimeout(timer);
  }, [autoDismissMs, onDismiss]);

  return (
    <div
      className={`
        fixed top-5 right-5 z-[9999]
        flex items-center gap-4 px-5 py-3.5
        bg-white rounded-xl shadow-lg border border-gray-200
        transition-all duration-300
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}
      `}
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
    >
      {/* Icon */}
      <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
        <span className="text-indigo-600 text-sm font-semibold">
          {(displayName || username).charAt(0).toUpperCase()}
        </span>
      </div>

      {/* Text */}
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium text-gray-900 truncate">
          New contact: @{username}
        </span>
        <span className="text-xs text-gray-500">
          Auto-created by InstaReplier
        </span>
      </div>

      {/* Configure button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onConfigure();
        }}
        className="
          px-3 py-1.5 text-xs font-medium
          text-indigo-600 bg-indigo-50 rounded-md
          hover:bg-indigo-100 transition-colors
          flex-shrink-0
        "
      >
        Configure
      </button>

      {/* Close */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setVisible(false);
          setTimeout(onDismiss, 300);
        }}
        className="text-gray-400 hover:text-gray-600 flex-shrink-0 ml-1"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
