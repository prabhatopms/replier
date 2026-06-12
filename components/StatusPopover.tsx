import { useState, useRef, useEffect, useCallback } from 'react';
import type { ToneType, CustomTone } from '@/types/contact';
import { ToneSelector } from './ToneSelector';

export type PopoverStatus = 'idle' | 'detecting' | 'generating' | 'ready' | 'error';

export interface LogEntry {
  time: number;
  message: string;
  type: 'info' | 'success' | 'warn' | 'error';
}

export interface ContactContext {
  displayName: string;
  username: string;
  relationship: string;
  goal: string;
  goalDescription: string;
  personalNotes: string;
  preferredTone: string;
  isActive: boolean;
  conversationSummary: string;
  structuredSummary: {
    overview?: string;
    keyTopics?: string[];
    insideJokes?: string[];
    emotionalDynamics?: string;
    recentContext?: string;
  } | null;
  totalMessages: number;
  historyScrubbed: boolean;
  historyScrubCount: number;
  recentMessages?: string[];
}

interface StatusPopoverProps {
  status: PopoverStatus;
  contactName: string;
  replyText: string;
  replyId: string;
  tone: ToneType;
  customTones?: CustomTone[];
  errorMessage: string;
  logs: LogEntry[];
  contactContext: ContactContext | null;
  onSend: (text: string, replyId: string) => void;
  onRedo: () => void;
  onToneChange: (tone: string) => void;
  onRefreshContext?: () => void;
  onFlushAndRebuild?: () => void;
  onDismiss: () => void;
  onRetry: () => void;
  isApiConfigured: boolean;
  onGenerateNow: () => void;
  onStartFresh: () => void;
  onContinue?: () => void;
  isNewConversation?: boolean;
  onRefine: (feedback: string) => void;
  isScraping?: boolean;
  scrapeCount?: number;
  scrapeComplete?: boolean;
  onCancelScrape?: () => void;
  isNewContact?: boolean;
  onDismissNewContact?: () => void;
}

const F = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';

const T = {
  labelMuted: '#a0a0ad' as const,
  fieldLabel: '#a8a8b4' as const,
  muted: '#8a8a99' as const,
  body: '#18181f' as const,
  bodyMid: '#3a3a45' as const,
  bodyLight: '#5a5a66' as const,
  white: '#ffffff' as const,
  surfaceAlt: '#fafafc' as const,
  divider: '#f1f1f4' as const,
  footerBg: '#fbfbfd' as const,
  indigo: '#4f46e5' as const,
  indigoLight: '#6366f1' as const,
  indigoBg: '#eef0ff' as const,
  incomingBg: '#f3f3f7' as const,
  incomingText: '#2a2a33' as const,
  outgoingBg: '#eef0ff' as const,
  outgoingText: '#3730a3' as const,
  msgBadgeBg: '#f3f3f6' as const,
  msgBadgeText: '#9a9aa8' as const,
  greenDot: '#16a34a' as const,
};

const P = 10; // base horizontal padding

const sectionLabel: React.CSSProperties = {
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: '.07em',
  textTransform: 'uppercase',
  color: T.labelMuted,
};
const fieldLabel: React.CSSProperties = {
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: '.06em',
  textTransform: 'uppercase',
  color: T.fieldLabel,
};
const fieldValue: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 600,
  color: T.body,
  marginTop: 2,
};
const keycap: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 16,
  height: 16,
  padding: '0 3px',
  border: '1px solid #e3e3ea',
  borderBottomWidth: 2,
  borderRadius: 4,
  background: T.surfaceAlt,
  color: '#8a8a99',
  fontSize: 10,
};
const ghostBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '6px 10px',
  border: '1px solid #e7e7ee',
  borderRadius: 8,
  background: T.white,
  color: T.bodyMid,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  fontFamily: F,
  flexShrink: 0,
};
const iconBtn: React.CSSProperties = {
  width: 24,
  height: 24,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 6,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontFamily: F,
};

type ErrorCategory = 'auth' | 'rate_limit' | 'overloaded' | 'blocked' | 'empty' | 'network' | 'unknown';

function categorizeError(msg: string): ErrorCategory {
  const m = msg.toLowerCase();
  if (m.includes('api key') || m.includes('401') || m.includes('authentication') || m.includes('invalid_api_key') || m.includes('not configured') || m.includes('not set')) return 'auth';
  if (m.includes('429') || m.includes('rate limit') || m.includes('quota') || m.includes('rate_limit')) return 'rate_limit';
  if (m.includes('529') || m.includes('overload') || m.includes('503') || m.includes('overloaded')) return 'overloaded';
  if (m.includes('safety') || m.includes('blocked') || m.includes('recitation')) return 'blocked';
  if (m.includes('empty response') || m.includes('empty')) return 'empty';
  if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('net::')) return 'network';
  return 'unknown';
}

function getErrorTitle(msg: string): string {
  switch (categorizeError(msg)) {
    case 'auth': return 'API key error';
    case 'rate_limit': return 'Rate limit exceeded';
    case 'overloaded': return 'AI service overloaded';
    case 'blocked': return 'Content blocked by safety filter';
    case 'empty': return 'AI returned empty response';
    case 'network': return 'Network error';
    default: return 'Generation failed';
  }
}

function getErrorHint(msg: string): string {
  switch (categorizeError(msg)) {
    case 'auth': return 'Open the Replier side panel → Settings and update your API key.';
    case 'rate_limit': return 'Wait 30–60 seconds then retry. Or check your API quota in the provider dashboard.';
    case 'overloaded': return 'The AI service is busy. Retry in a moment, or switch to a faster model in Settings.';
    case 'blocked': return 'Try a milder style like Casual or Funny. Also simplify Personal Notes if they contain sensitive content.';
    case 'empty': return 'This is usually transient. Retry or try a different style.';
    case 'network': return 'Check your internet connection and retry.';
    default: return 'Try a different style, or check Settings if this keeps happening.';
  }
}

function groupMessages(msgs: string[]) {
  const groups: { sender: string; isYou: boolean; lines: string[] }[] = [];
  for (const m of msgs) {
    const isYou = m.startsWith('You: ');
    const colonIdx = m.indexOf(':');
    const sender = isYou ? 'You' : m.slice(0, colonIdx);
    const text = m.slice(colonIdx + 1).trim();
    const last = groups[groups.length - 1];
    if (last && last.sender === sender) {
      last.lines.push(text);
    } else {
      groups.push({ sender, isYou, lines: [text] });
    }
  }
  return groups;
}

export function StatusPopover({
  status,
  contactName,
  replyText,
  replyId,
  tone,
  customTones,
  errorMessage,
  logs,
  contactContext,
  onSend,
  onRedo,
  onToneChange,
  onRefreshContext,
  onFlushAndRebuild,
  isApiConfigured,
  onDismiss,
  onRetry,
  onGenerateNow,
  onStartFresh,
  onContinue,
  isNewConversation,
  onRefine,
  isScraping,
  scrapeCount = 0,
  scrapeComplete,
  onCancelScrape,
  isNewContact,
  onDismissNewContact,
}: StatusPopoverProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [contextGridOpen, setContextGridOpen] = useState(false);
  const [recentChatOpen, setRecentChatOpen] = useState(false);
  const [lastMsgHovered, setLastMsgHovered] = useState(false);
  const [editText, setEditText] = useState('');
  const [refineText, setRefineText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (replyText) {
      setEditText(replyText);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(textareaRef.current.value.length, textareaRef.current.value.length);
        }
      }, 50);
    }
  }, [replyText]);

  useEffect(() => {
    if (showLogs) logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, showLogs]);

const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!popoverRef.current) return;
    const rect = popoverRef.current.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    dragging.current = true;
    e.preventDefault();
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
    };
    const onUp = () => { dragging.current = false; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

  const positionStyle: React.CSSProperties = pos
    ? { position: 'fixed', left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }
    : { position: 'fixed', top: 56, left: '50%', transform: 'translateX(-50%)' };

  if (isMinimized) {
    return (
      <div
        ref={popoverRef}
        onClick={() => setIsMinimized(false)}
        style={{
          ...positionStyle,
          fontFamily: F,
          zIndex: 9999,
          cursor: 'pointer',
          userSelect: 'none',
          animation: 'fadeIn 0.2s ease-out',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, #6366f1, #a855f7)',
            borderRadius: 20,
            padding: '8px 14px',
            boxShadow: '0 8px 30px rgba(99,102,241,.3)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: T.white,
            fontWeight: 700,
            fontSize: 13,
            transition: 'transform 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          {/* Logo orb */}
          <div style={{
            width: 14, height: 14, borderRadius: '50%', background: T.white,
            boxShadow: '0 0 0 2px rgba(255,255,255,.2)',
          }} />
          <span>InstaReplier</span>
          <span style={{ fontSize: 10, opacity: 0.8 }}>⚡</span>
        </div>
      </div>
    );
  }

  const handleSend = () => onSend(editText || replyText, replyId);
  const handleRefineSubmit = () => {
    if (refineText.trim()) {
      onRefine(refineText.trim());
      setRefineText('');
    }
  };
  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const msgGroups = groupMessages(contactContext?.recentMessages ?? []);

  const UpdateBtn = onRefreshContext ? (
    <button
      onClick={onRefreshContext}
      title="Scrape visible messages and regenerate"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '3px 8px', border: '1px solid #e0e0ec', borderRadius: 6,
        background: T.white, color: T.indigo, fontSize: 11, fontWeight: 600,
        cursor: 'pointer', fontFamily: F,
      }}
    >
      <span>↻</span> Update
    </button>
  ) : null;

  return (
    <div
      ref={popoverRef}
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
      onKeyPress={(e) => e.stopPropagation()}
      style={{
        ...positionStyle,
        fontFamily: F,
        width: 374,
        maxWidth: '95vw',
        zIndex: 9999,
        userSelect: 'none',
      }}
    >
      <div style={{
        background: T.white,
        borderRadius: 14,
        overflow: 'hidden',
        border: '1px solid #e7e7ee',
        boxShadow: '0 12px 40px rgba(30,27,75,.14)',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 'calc(100vh - 72px)',
        overflowY: 'auto',
        animation: 'fadeIn 0.2s ease-out',
      }}>

        {/* ── HEADER ── */}
        <div
          onMouseDown={handleMouseDown}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: `8px ${P}px`, borderBottom: `1px solid ${T.divider}`,
            cursor: 'grab', userSelect: 'none',
          }}
        >
          <div style={{
            width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, #6366f1, #a855f7)',
            boxShadow: '0 0 0 2px rgba(99,102,241,.14)',
          }} />
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-.01em', color: T.body }}>
            InstaReplier
          </span>
          <span style={{ flex: 1 }} />
          <button
            onClick={() => { setShowContext(!showContext); if (!showContext) setShowLogs(false); }}
            style={{
              fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
              border: 'none', cursor: 'pointer', fontFamily: F,
              color: showContext ? T.indigo : T.labelMuted,
              background: showContext ? T.indigoBg : 'transparent',
            }}
          >
            Context
          </button>
          <button
            onClick={() => { setShowLogs(!showLogs); if (!showLogs) setShowContext(false); }}
            style={{ ...iconBtn, color: showLogs ? T.indigo : '#a8a8b4' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          </button>
          <button
            onClick={() => setIsMinimized(true)}
            title="Minimize widget"
            style={{ ...iconBtn, color: '#a8a8b4' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button
            onClick={onDismiss}
            style={{ ...iconBtn, fontSize: 18, lineHeight: 1, color: '#a8a8b4' }}
          >
            ×
          </button>
        </div>

        {/* ── ACTIVITY LOG ── */}
        {showLogs && (
          <div style={{
            borderBottom: `1px solid ${T.divider}`, background: '#0a0a12',
            maxHeight: 120, overflowY: 'auto',
          }}>
            <div style={{
              padding: `7px ${P}px`,
              fontFamily: 'ui-monospace, Menlo, monospace',
              fontSize: 10, lineHeight: 1.65,
            }}>
              {logs.length === 0
                ? <span style={{ color: '#555' }}>No activity logged…</span>
                : logs.map((log, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 1 }}>
                    <span style={{ color: '#444', flexShrink: 0 }}>{formatTime(log.time)}</span>
                    <span style={{ color: { info: '#94a3b8', success: '#4ade80', warn: '#fbbf24', error: '#f87171' }[log.type] }}>
                      {log.message}
                    </span>
                  </div>
                ))
              }
              <div ref={logEndRef} />
            </div>
          </div>
        )}

        {/* ── CONTEXT PANEL ── */}
        {showContext && contactContext && (
          <div style={{ borderBottom: `1px solid ${T.divider}` }}>
            <div style={{ padding: `8px ${P}px 2px` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                  <span style={{ fontSize: 11.5, color: T.muted }}>Context for</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.indigo, letterSpacing: '-.01em' }}>
                    @{contactContext.username}
                  </span>
                </div>
                {onFlushAndRebuild && (
                  <button
                    onClick={onFlushAndRebuild}
                    title="Clear database context, scrape visible messages, and regenerate"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      padding: '3px 7px', border: '1px solid #fee2e2', borderRadius: 6,
                      background: '#fff5f5', color: '#ef4444', fontSize: 10.5, fontWeight: 600,
                      cursor: 'pointer', fontFamily: F,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#fee2e2'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#fff5f5'; }}
                  >
                    🗑️ Flush & Rebuild
                  </button>
                )}
              </div>
              {status === 'ready' && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                  <input
                    type="text"
                    value={refineText}
                    onChange={(e) => setRefineText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRefineSubmit()}
                    placeholder="Refine context…"
                    style={{
                      flex: 1, minWidth: 0, padding: '6px 10px',
                      border: '1px solid #e3e3ea', borderRadius: 8,
                      background: T.surfaceAlt, fontSize: 12, color: T.body,
                      outline: 'none', fontFamily: F,
                    }}
                  />
                  <button
                    onClick={handleRefineSubmit}
                    style={{
                      padding: '0 12px', border: 'none', borderRadius: 8,
                      background: T.indigo, color: T.white,
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      whiteSpace: 'nowrap', fontFamily: F,
                    }}
                  >
                    Refine
                  </button>
                </div>
              )}
            </div>

            <div style={{ padding: `0 ${P}px` }}>
              <div
                onClick={() => setContextGridOpen(!contextGridOpen)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 0 6px', marginTop: 4,
                  borderTop: `1px solid ${T.divider}`,
                  cursor: 'pointer', userSelect: 'none',
                }}
              >
                <span style={sectionLabel}>Overview</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 10, color: '#b4b4c0' }}>6 fields</span>
                <span style={{ fontSize: 10, color: T.labelMuted, width: 10, textAlign: 'center' }}>
                  {contextGridOpen ? '⌄' : '›'}
                </span>
              </div>
              {contextGridOpen && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', paddingBottom: 10 }}>
                  <div>
                    <div style={fieldLabel}>Relationship</div>
                    <div style={{ ...fieldValue, color: T.bodyLight }}>{contactContext.relationship || 'Not set'}</div>
                  </div>
                  <div>
                    <div style={fieldLabel}>Goal</div>
                    <span style={{
                      display: 'inline-block', marginTop: 2,
                      fontFamily: 'ui-monospace, Menlo, monospace',
                      fontSize: 11, fontWeight: 600,
                      color: T.indigo, background: T.indigoBg,
                      padding: '1px 6px', borderRadius: 5,
                    }}>
                      {contactContext.goal || 'not_set'}
                    </span>
                  </div>
                  <div>
                    <div style={fieldLabel}>Tone</div>
                    <div style={fieldValue}>{contactContext.preferredTone}</div>
                  </div>
                  <div>
                    <div style={fieldLabel}>Active</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                        background: contactContext.isActive ? T.greenDot : '#9ca3af',
                        boxShadow: contactContext.isActive ? '0 0 0 2px rgba(22,163,74,.16)' : 'none',
                      }} />
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: contactContext.isActive ? T.greenDot : '#6b7280' }}>
                        {contactContext.isActive ? 'Yes' : 'No'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div style={fieldLabel}>Messages</div>
                    <div style={fieldValue}>{contactContext.totalMessages}</div>
                  </div>
                  <div>
                    <div style={fieldLabel}>Scraped</div>
                    <div style={fieldValue}>
                      {contactContext.historyScrubbed ? `${contactContext.historyScrubCount} msgs` : '0 msgs'}
                    </div>
                  </div>
                </div>
              )}

              {/* Recent chat inside context panel */}
              {msgGroups.length > 0 && (
                <div style={{ borderTop: `1px solid ${T.divider}` }}>
                  <div
                    onClick={() => setRecentChatOpen(!recentChatOpen)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '7px 0 6px',
                      cursor: 'pointer', userSelect: 'none',
                    }}
                  >
                    <span style={sectionLabel}>Recent chat</span>
                    <span style={{ flex: 1 }} />
                    <span style={{
                      fontSize: 9.5, fontWeight: 600,
                      color: T.msgBadgeText, background: T.msgBadgeBg,
                      padding: '1px 6px', borderRadius: 99,
                    }}>
                      {contactContext.totalMessages} msgs
                    </span>
                    {UpdateBtn && (
                      <span onClick={(e) => e.stopPropagation()}>
                        {UpdateBtn}
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: T.labelMuted, width: 10, textAlign: 'center' }}>
                      {recentChatOpen ? '⌄' : '›'}
                    </span>
                  </div>
                  {recentChatOpen && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto', paddingRight: 2, paddingBottom: 10 }}>
                      {msgGroups.map((group, gi) => (
                        <div
                          key={gi}
                          style={{
                            alignSelf: group.isYou ? 'flex-end' : 'flex-start',
                            maxWidth: '86%',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: group.isYou ? 'flex-end' : 'flex-start',
                            gap: 3,
                          }}
                        >
                          <span style={{
                            fontSize: 9.5, fontWeight: 600, color: T.msgBadgeText,
                            paddingLeft: group.isYou ? 0 : 2,
                            paddingRight: group.isYou ? 2 : 0,
                          }}>
                            {group.sender}
                          </span>
                          {group.lines.map((line, li) => (
                            <div
                              key={li}
                              style={{
                                background: group.isYou ? T.outgoingBg : T.incomingBg,
                                color: group.isYou ? T.outgoingText : T.incomingText,
                                padding: '6px 10px',
                                borderRadius: 11,
                                borderTopLeftRadius: !group.isYou && li === 0 ? 4 : 11,
                                borderTopRightRadius: group.isYou && li === 0 ? 4 : 11,
                                fontSize: 12.5,
                                lineHeight: 1.4,
                              }}
                            >
                              {line}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {showContext && !contactContext && (
          <div style={{
            borderBottom: `1px solid ${T.divider}`,
            padding: `12px ${P}px`,
            textAlign: 'center', fontSize: 11.5, color: T.muted, fontStyle: 'italic',
          }}>
            Loading context…
          </div>
        )}

        {/* ── NEW CONTACT BANNER ── */}
        {isNewContact && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: `7px ${P}px`,
            background: '#f0fdf4', borderBottom: `1px solid #bbf7d0`,
          }}>
            <div style={{
              width: 18, height: 18, borderRadius: '50%',
              background: '#dcfce7', border: '1px solid #86efac',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <span style={{ fontSize: 11.5, fontWeight: 500, color: '#15803d', flex: 1 }}>
              New contact <strong>@{contactName}</strong> added
            </span>
            {onDismissNewContact && (
              <button
                onClick={onDismissNewContact}
                style={{ ...iconBtn, color: '#6b7280', fontSize: 16, lineHeight: 1 }}
              >
                ×
              </button>
            )}
          </div>
        )}

        {/* ── SCRAPING BANNER ── */}
        {(isScraping || scrapeComplete) && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 9,
            padding: `8px ${P}px`,
            background: scrapeComplete ? '#f0fdf4' : '#f5f4ff',
            borderBottom: `1px solid ${scrapeComplete ? '#bbf7d0' : '#e0deff'}`,
          }}>
            {scrapeComplete ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                <path d="M20 6L9 17l-5-5" />
              </svg>
            ) : (
              <span style={{ position: 'relative', display: 'flex', width: 10, height: 10, flexShrink: 0 }}>
                <span style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  background: '#6366f1', opacity: 0.5,
                  animation: 'ping 1s cubic-bezier(0,0,.2,1) infinite',
                }} />
                <span style={{
                  position: 'relative', display: 'block', width: 10, height: 10,
                  borderRadius: '50%', background: '#6366f1',
                }} />
              </span>
            )}
            <span style={{
              fontSize: 11.5, fontWeight: 600, flex: 1,
              color: scrapeComplete ? '#15803d' : '#4338ca',
            }}>
              {scrapeComplete
                ? `History captured — ${scrapeCount} messages`
                : `Scraping history… ${scrapeCount} messages`}
            </span>
            {!scrapeComplete && onCancelScrape && (
              <button
                onClick={onCancelScrape}
                style={{
                  padding: '2px 8px', border: '1px solid #ddd6fe', borderRadius: 6,
                  background: T.white, color: '#5b50c9', fontSize: 11, fontWeight: 600,
                  cursor: 'pointer', fontFamily: F, flexShrink: 0,
                }}
              >
                Stop
              </button>
            )}
          </div>
        )}

        {/* ── DETECTING ── */}
        {status === 'detecting' && (
          <div style={{ padding: `18px ${P}px`, textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 9 }}>
              {[
                { bg: '#6366f1', delay: '0ms' },
                { bg: '#a855f7', delay: '150ms' },
                { bg: '#ec4899', delay: '300ms' },
              ].map(({ bg, delay }) => (
                <span key={delay} style={{
                  width: 7, height: 7, borderRadius: '50%', background: bg,
                  display: 'inline-block',
                  animation: `bounce 1s ${delay} ease-in-out infinite`,
                  boxShadow: `0 0 6px ${bg}99`,
                }} />
              ))}
            </div>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 3px' }}>
              Detecting contact…
            </p>
            <p style={{ fontSize: 10.5, color: '#9ca3af', lineHeight: 1.5, maxWidth: 220, margin: '0 auto' }}>
              Scanning the page for conversation info.
            </p>
          </div>
        )}

        {/* ── IDLE ── */}
        {status === 'idle' && (
          <div style={{ padding: `18px ${P}px`, textAlign: 'center' }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: '#f0fdf4', border: '1px solid #bbf7d0',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 9px',
              animation: 'pulse 2s ease-in-out infinite',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <p style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5, margin: '0 auto 12px', maxWidth: 250 }}>
              {contactName
                ? <><span style={{ fontWeight: 600, color: '#374151' }}>@{contactName}</span> — listening for new messages.</>
                : 'Open an Instagram DM to get started.'
              }
            </p>
            {contactName && (
              <div style={{ display: 'flex', gap: 7, justifyContent: 'center', flexDirection: 'column', alignItems: 'center' }}>
                {!isApiConfigured && (
                  <p style={{ fontSize: 11.5, color: '#ef4444', margin: '0 0 6px', fontWeight: 500 }}>
                    API not configured — open Settings to add a key.
                  </p>
                )}
                <div style={{ display: 'flex', gap: 7 }}>
                  {isApiConfigured && (
                    <button
                      onClick={onGenerateNow}
                      style={{
                        padding: '7px 15px', background: T.indigo, color: T.white,
                        border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600,
                        cursor: 'pointer', boxShadow: '0 3px 10px rgba(79,70,229,.3)', fontFamily: F,
                      }}
                    >
                      Generate Reply
                    </button>
                  )}
                  <button
                    onClick={onStartFresh}
                    style={{
                      padding: '7px 12px', background: '#f3f4f6', color: '#374151',
                      border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12,
                      fontWeight: 600, cursor: 'pointer', fontFamily: F,
                    }}
                  >
                    New Conversation
                  </button>
                </div>
              </div>
            )}
            {contactName && (
              <div style={{ borderTop: `1px solid ${T.divider}`, padding: `10px ${P}px 0`, marginTop: 12 }}>
                <ToneSelector
                  currentTone={tone}
                  customTones={customTones}
                  onToneChange={onToneChange}
                  disabled={false}
                />
              </div>
            )}
          </div>
        )}

        {/* ── GENERATING ── */}
        {status === 'generating' && (
          <div style={{ padding: `18px ${P}px`, textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 9 }}>
              {[
                { bg: '#6366f1', delay: '0ms' },
                { bg: '#a855f7', delay: '150ms' },
                { bg: '#ec4899', delay: '300ms' },
              ].map(({ bg, delay }) => (
                <span key={delay} style={{
                  width: 7, height: 7, borderRadius: '50%', background: bg,
                  display: 'inline-block',
                  animation: `bounce 1s ${delay} ease-in-out infinite`,
                  boxShadow: `0 0 6px ${bg}99`,
                }} />
              ))}
            </div>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 3px' }}>
              Generating reply for @{contactName}…
            </p>
            <p style={{ fontSize: 10.5, color: '#9ca3af', lineHeight: 1.5, maxWidth: 220, margin: '0 auto' }}>
              Analyzing context, tone, and chat memory.
            </p>
          </div>
        )}

        {/* ── READY ── */}
        {status === 'ready' && (
          <>
            {/* Last message to AI — hidden when context panel is open */}
            {!showContext && contactContext?.recentMessages && contactContext.recentMessages.length > 0 && (
              <div style={{ padding: `0 ${P}px 8px`, borderTop: `1px solid ${T.divider}`, paddingTop: 8 }}>
                <div
                  style={{
                    position: 'relative',
                    background: T.surfaceAlt, border: '1px solid #ececf1',
                    borderRadius: 8, padding: '6px 10px',
                  }}
                  onMouseEnter={() => setLastMsgHovered(true)}
                  onMouseLeave={() => setLastMsgHovered(false)}
                >
                  <div style={{ ...sectionLabel, marginBottom: 3 }}>Last message to AI</div>
                  <div style={{ fontSize: 12.5, color: T.bodyMid }}>
                    {contactContext.recentMessages[contactContext.recentMessages.length - 1]}
                  </div>
                  {lastMsgHovered && onRefreshContext && (
                    <button
                      onClick={onRefreshContext}
                      title="Scrape visible messages and regenerate"
                      style={{
                        position: 'absolute', top: 6, right: 8,
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '2px 7px', border: '1px solid #e0e0ec', borderRadius: 6,
                        background: T.white, color: T.indigo, fontSize: 11, fontWeight: 600,
                        cursor: 'pointer', fontFamily: F,
                        boxShadow: '0 1px 4px rgba(0,0,0,.08)',
                      }}
                    >
                      <span>↻</span> Update
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Draft reply */}
            <div style={{ padding: `0 ${P}px 9px` }}>
              <div style={{ marginBottom: 6 }}>
                <span style={sectionLabel}>Your reply</span>
              </div>
              <div style={{
                position: 'relative',
                border: `1.5px solid ${T.indigoLight}`,
                borderRadius: 11,
                background: T.white,
                boxShadow: '0 0 0 3px rgba(99,102,241,.09)',
              }}>
                <textarea
                  ref={textareaRef}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend(); }}
                  style={{
                    display: 'block', width: '100%', border: 'none', outline: 'none',
                    resize: 'none', fontSize: 13.5, lineHeight: 1.45, color: T.body,
                    background: 'transparent', fontFamily: F,
                    padding: '10px 12px 28px', minHeight: 62,
                    boxSizing: 'border-box',
                  }}
                  placeholder="Edit your reply…"
                />
                <div style={{
                  position: 'absolute', right: 10, bottom: 8,
                  display: 'flex', alignItems: 'center', gap: 4,
                  pointerEvents: 'none',
                }}>
                  <span style={keycap}>⌘</span>
                  <span style={keycap}>↵</span>
                  <span style={{ fontSize: 10, color: '#a8a8b4' }}>to send</span>
                </div>
              </div>
            </div>

            {/* Tone chips */}
            <div style={{ padding: `0 ${P}px 10px` }}>
              <ToneSelector
                currentTone={tone}
                customTones={customTones}
                onToneChange={onToneChange}
                disabled={false}
              />
            </div>

            {/* Footer */}
            <div style={{
              display: 'flex', gap: 6, alignItems: 'center',
              padding: `8px ${P}px`,
              borderTop: `1px solid ${T.divider}`,
              background: T.footerBg,
            }}>
              {isNewConversation ? (
                <button onClick={() => onContinue?.()} style={ghostBtn} title="Continue previous conversation">
                  <span style={{ fontSize: 11, color: '#6b6b78' }}>↩</span> Continue
                </button>
              ) : (
                <button onClick={() => onStartFresh()} style={ghostBtn} title="Start a new conversation">
                  <span style={{ fontSize: 13, lineHeight: 1, color: '#6b6b78' }}>+</span> New Conversation
                </button>
              )}
              <button onClick={() => onRedo()} style={ghostBtn} title="Regenerate reply">
                <span style={{ fontSize: 12, color: '#6b6b78' }}>↻</span> Regen
              </button>
              <button
                onClick={handleSend}
                style={{
                  flex: 1, display: 'inline-flex', alignItems: 'center',
                  justifyContent: 'center', gap: 6,
                  padding: '7px 12px', border: 'none', borderRadius: 8,
                  background: T.indigo, color: T.white,
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  boxShadow: '0 3px 12px rgba(79,70,229,.38)', fontFamily: F,
                }}
              >
                Send
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 21l18-9L3 3v7l12 2-12 2z" />
                </svg>
              </button>
            </div>
          </>
        )}

        {/* ── ERROR ── */}
        {status === 'error' && (
          <div style={{ padding: P }}>
            <div style={{
              padding: '10px 12px', background: '#fff5f5',
              border: '1px solid #fecdd3', borderRadius: 11, marginBottom: 9,
              animation: 'shake 0.4s ease-in-out',
            }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
                <span style={{ color: '#ef4444', flexShrink: 0, marginTop: 1 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 10.5, fontWeight: 700, color: '#991b1b',
                    textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4,
                  }}>
                    {getErrorTitle(errorMessage)}
                  </div>
                  <div style={{
                    fontSize: 11, color: '#b91c1c',
                    fontFamily: 'ui-monospace, Menlo, monospace', lineHeight: 1.5,
                    background: 'rgba(255,255,255,.6)', padding: '5px 7px',
                    borderRadius: 6, maxHeight: 72, overflowY: 'auto',
                    wordBreak: 'break-all',
                  }}>
                    {errorMessage || 'Unknown error'}
                  </div>
                </div>
              </div>
              <div style={{
                fontSize: 10.5, color: '#92400e', lineHeight: 1.5,
                borderTop: '1px solid #fecdd3', paddingTop: 6,
                display: 'flex', gap: 5,
              }}>
                <span>💡</span>
                <span>{getErrorHint(errorMessage)}</span>
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${T.divider}`, paddingTop: 9, marginBottom: 8 }}>
              <ToneSelector
                currentTone={tone}
                customTones={customTones}
                onToneChange={onToneChange}
                disabled={false}
              />
            </div>
            <button
              onClick={onRetry}
              style={{
                width: '100%', padding: '8px', fontSize: 12, fontWeight: 600,
                color: T.indigo, background: T.indigoBg,
                border: '1px solid #c7d2fe', borderRadius: 8,
                cursor: 'pointer', fontFamily: F,
              }}
            >
              Retry with same style
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
