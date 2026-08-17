import type { StoryTrayEntry } from '@/lib/platforms/instagram/stories';

export type StoryReplyStatus = 'unknown' | 'available' | 'unavailable';

interface StoriesPanelProps {
  entries: StoryTrayEntry[];
  activeUsername: string | null;
  replyStatus: StoryReplyStatus;
  onOpen: (entry: StoryTrayEntry) => void;
  onNext: () => void;
  onClose: () => void;
}

const F = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';

const REPLY_STATUS_COLOR: Record<StoryReplyStatus, string> = {
  available: '#16a34a',
  unavailable: '#dc2626',
  unknown: '#a0a0ad',
};

const REPLY_STATUS_LABEL: Record<StoryReplyStatus, string> = {
  available: 'Reply open',
  unavailable: 'No reply option',
  unknown: 'Checking…',
};

/**
 * Quick-nav list of stories not yet reacted to. Purely a navigation aid —
 * clicking an entry opens Instagram's own story viewer, the user
 * reacts/replies themselves through Instagram's native UI. This never
 * sends anything; "reacted" is tracked locally from observing the user's
 * own outgoing reaction, not from anything the extension initiates.
 */
export function StoriesPanel({
  entries,
  activeUsername,
  replyStatus,
  onOpen,
  onNext,
  onClose,
}: StoriesPanelProps) {
  const pending = entries.filter((e) => !e.reacted);
  if (pending.length === 0 && !activeUsername) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: 16,
        bottom: 16,
        zIndex: 999999,
        width: 240,
        fontFamily: F,
        background: '#ffffff',
        borderRadius: 12,
        boxShadow: '0 4px 24px rgba(0,0,0,.15)',
        border: '1px solid #f1f1f4',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 10px',
          borderBottom: '1px solid #f1f1f4',
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '.05em',
            textTransform: 'uppercase',
            color: '#8a8a99',
          }}
        >
          Stories · {pending.length} to react to
        </span>
        <button
          onClick={onClose}
          style={{
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: '#a0a0ad',
            fontSize: 14,
            lineHeight: 1,
            padding: 2,
          }}
          aria-label="Dismiss stories panel"
        >
          ×
        </button>
      </div>

      {activeUsername && (
        <div
          style={{
            padding: '8px 10px',
            borderBottom: '1px solid #f1f1f4',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: '#18181f',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            @{activeUsername}
          </div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: REPLY_STATUS_COLOR[replyStatus],
              flexShrink: 0,
            }}
          >
            {REPLY_STATUS_LABEL[replyStatus]}
          </div>
        </div>
      )}

      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
        {pending.map((entry) => (
          <button
            key={entry.key}
            onClick={() => onOpen(entry)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '6px 10px',
              border: 'none',
              background: entry.username === activeUsername ? '#eef0ff' : 'transparent',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            {entry.avatarUrl ? (
              <img
                src={entry.avatarUrl}
                alt=""
                style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
              />
            ) : (
              <div
                style={{ width: 24, height: 24, borderRadius: '50%', background: '#f3f3f6', flexShrink: 0 }}
              />
            )}
            <span
              style={{
                fontSize: 12,
                color: '#18181f',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              @{entry.username}
            </span>
          </button>
        ))}
      </div>

      {activeUsername && (
        <div style={{ padding: '8px 10px', borderTop: '1px solid #f1f1f4' }}>
          <button
            onClick={onNext}
            style={{
              width: '100%',
              padding: '6px 0',
              borderRadius: 8,
              border: 'none',
              background: '#4f46e5',
              color: '#ffffff',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
