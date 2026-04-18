import { useState, useRef, useEffect, useCallback } from 'react';
import type { ToneType } from '@/types/contact';
import { ToneSelector } from './ToneSelector';

export type PopoverStatus = 'idle' | 'generating' | 'ready' | 'error';

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
  errorMessage: string;
  logs: LogEntry[];
  contactContext: ContactContext | null;
  onSend: (text: string, replyId: string) => void;
  onRedo: () => void;
  onToneChange: (tone: string) => void;
  onEdit: () => void;
  onDismiss: () => void;
  onRetry: () => void;
  onGenerateNow: () => void;
  onStartFresh: () => void;
  onRefine: (feedback: string) => void;
}

const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

const LOG_COLORS = {
  info: 'text-gray-400',
  success: 'text-green-500',
  warn: 'text-amber-500',
  error: 'text-red-500',
};

export function StatusPopover({
  status,
  contactName,
  replyText,
  replyId,
  tone,
  errorMessage,
  logs,
  onSend,
  onRedo,
  onToneChange,
  onEdit,
  onDismiss,
  onRetry,
  contactContext,
  onGenerateNow,
  onStartFresh,
  onRefine,
}: StatusPopoverProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [refineText, setRefineText] = useState('');
  const [showRefine, setShowRefine] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Drag state
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (replyText) { setEditText(replyText); setIsEditing(false); setShowRefine(false); }
  }, [replyText]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(textareaRef.current.value.length, textareaRef.current.value.length);
    }
  }, [isEditing]);

  useEffect(() => {
    if (status === 'ready' || status === 'generating' || status === 'error') setCollapsed(false);
  }, [status]);

  // Auto-scroll logs
  useEffect(() => {
    if (showLogs) logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, showLogs]);

  // Drag
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
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, []);

  const positionStyle: React.CSSProperties = pos
    ? { position: 'fixed', left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }
    : { position: 'fixed', top: 75, left: '50%', transform: 'translateX(-50%)' };

  const statusDot = () => {
    switch (status) {
      case 'idle': return <span className="w-2.5 h-2.5 rounded-full bg-green-400 flex-shrink-0" />;
      case 'generating': return (
        <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500" />
        </span>
      );
      case 'ready': return <span className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0" />;
      case 'error': return <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />;
    }
  };

  const statusLabel = () => {
    switch (status) {
      case 'idle': return contactName ? `@${contactName}` : 'No contact';
      case 'generating': return 'Generating...';
      case 'ready': return 'Reply ready';
      case 'error': return 'Error';
    }
  };

  const handleSend = () => {
    onSend(isEditing ? editText : replyText, replyId);
    setIsEditing(false);
  };

  const handleRefineSubmit = () => {
    if (refineText.trim()) {
      onRefine(refineText.trim());
      setRefineText('');
      setShowRefine(false);
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div
      ref={popoverRef}
      className="z-[9999] select-none"
      style={{ ...positionStyle, fontFamily: FONT_FAMILY, width: 420, maxWidth: '95vw' }}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">

        {/* ====== HEADER ====== */}
        <div
          onMouseDown={handleMouseDown}
          className="flex items-center gap-2.5 px-5 py-3 bg-gray-50 border-b border-gray-100 cursor-grab active:cursor-grabbing"
        >
          <div className="flex flex-col gap-[3px] opacity-30 flex-shrink-0">
            <div className="flex gap-[3px]"><span className="w-1 h-1 bg-gray-500 rounded-full" /><span className="w-1 h-1 bg-gray-500 rounded-full" /></div>
            <div className="flex gap-[3px]"><span className="w-1 h-1 bg-gray-500 rounded-full" /><span className="w-1 h-1 bg-gray-500 rounded-full" /></div>
            <div className="flex gap-[3px]"><span className="w-1 h-1 bg-gray-500 rounded-full" /><span className="w-1 h-1 bg-gray-500 rounded-full" /></div>
          </div>
          {statusDot()}
          <span className="text-sm font-medium text-gray-700 flex-1 truncate">{statusLabel()}</span>

          {/* Context/memory toggle */}
          <button
            onClick={() => { setShowContext(!showContext); if (!showContext) setShowLogs(false); }}
            className={`px-1.5 py-0.5 text-[11px] font-medium transition-colors flex-shrink-0 rounded ${showContext ? 'text-purple-600 bg-purple-50' : 'text-gray-400 hover:text-gray-600'}`}
            title="View context & memory"
          >
            ctx
          </button>

          {/* Log toggle */}
          <button
            onClick={() => { setShowLogs(!showLogs); if (!showLogs) setShowContext(false); }}
            className={`p-1 text-xs transition-colors flex-shrink-0 rounded ${showLogs ? 'text-indigo-600 bg-indigo-50' : 'text-gray-400 hover:text-gray-600'}`}
            title="Activity log"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </button>

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {collapsed ? <path d="M6 9l6 6 6-6" /> : <path d="M18 15l-6-6-6 6" />}
            </svg>
          </button>

          <span className="text-[9px] text-gray-300 font-bold uppercase tracking-widest flex-shrink-0">Replier</span>
        </div>

        {/* ====== BODY ====== */}
        {!collapsed && (
          <div>
            {/* --- ACTIVITY LOG --- */}
            {showLogs && (
              <div className="border-b border-gray-100 bg-gray-900 max-h-[150px] overflow-y-auto">
                <div className="px-4 py-2 space-y-0.5 font-mono text-[11px]">
                  {logs.length === 0 ? (
                    <p className="text-gray-600 py-2">No activity yet...</p>
                  ) : (
                    logs.map((log, i) => (
                      <div key={i} className="flex gap-2">
                        <span className="text-gray-600 flex-shrink-0">{formatTime(log.time)}</span>
                        <span className={LOG_COLORS[log.type]}>{log.message}</span>
                      </div>
                    ))
                  )}
                  <div ref={logEndRef} />
                </div>
              </div>
            )}

            {/* --- CONTEXT/MEMORY PANEL --- */}
            {showContext && contactContext && (
              <div className="border-b border-gray-100 bg-gray-50 max-h-[300px] overflow-y-auto">
                <div className="px-5 py-4 space-y-3 text-xs">
                  <div className="font-semibold text-gray-700 text-sm">Context & Memory for @{contactContext.username}</div>

                  <div className="grid grid-cols-2 gap-2">
                    <div><span className="text-gray-400">Relationship:</span> <span className="text-gray-700">{contactContext.relationship}</span></div>
                    <div><span className="text-gray-400">Goal:</span> <span className="text-gray-700">{contactContext.goal}</span></div>
                    <div><span className="text-gray-400">Tone:</span> <span className="text-gray-700">{contactContext.preferredTone}</span></div>
                    <div><span className="text-gray-400">Active:</span> <span className={contactContext.isActive ? 'text-green-600' : 'text-red-500'}>{contactContext.isActive ? 'Yes' : 'No'}</span></div>
                    <div><span className="text-gray-400">Messages:</span> <span className="text-gray-700">{contactContext.totalMessages}</span></div>
                    <div><span className="text-gray-400">Scraped:</span> <span className="text-gray-700">{contactContext.historyScrubbed ? `${contactContext.historyScrubCount} msgs` : 'No'}</span></div>
                  </div>

                  {contactContext.personalNotes !== 'None' && (
                    <div>
                      <div className="text-gray-400 mb-1">Personal Notes:</div>
                      <div className="text-gray-700 bg-white p-2 rounded-lg border border-gray-200">{contactContext.personalNotes}</div>
                    </div>
                  )}

                  {contactContext.structuredSummary ? (
                    <div className="space-y-2">
                      <div className="font-semibold text-gray-600">AI Memory</div>
                      {contactContext.structuredSummary.overview && (
                        <div><span className="text-gray-400">Overview:</span> <span className="text-gray-700">{contactContext.structuredSummary.overview}</span></div>
                      )}
                      {contactContext.structuredSummary.keyTopics && contactContext.structuredSummary.keyTopics.length > 0 && (
                        <div><span className="text-gray-400">Topics:</span> <span className="text-gray-700">{contactContext.structuredSummary.keyTopics.join(', ')}</span></div>
                      )}
                      {contactContext.structuredSummary.insideJokes && contactContext.structuredSummary.insideJokes.length > 0 && (
                        <div><span className="text-gray-400">Inside jokes:</span> <span className="text-gray-700">{contactContext.structuredSummary.insideJokes.join(', ')}</span></div>
                      )}
                      {contactContext.structuredSummary.emotionalDynamics && (
                        <div><span className="text-gray-400">Dynamics:</span> <span className="text-gray-700">{contactContext.structuredSummary.emotionalDynamics}</span></div>
                      )}
                      {contactContext.structuredSummary.recentContext && (
                        <div><span className="text-gray-400">Recent:</span> <span className="text-gray-700">{contactContext.structuredSummary.recentContext}</span></div>
                      )}
                    </div>
                  ) : contactContext.conversationSummary !== 'No summary yet' ? (
                    <div>
                      <div className="text-gray-400 mb-1">Conversation Summary:</div>
                      <div className="text-gray-700 bg-white p-2 rounded-lg border border-gray-200 whitespace-pre-wrap">{contactContext.conversationSummary}</div>
                    </div>
                  ) : (
                    <div className="text-gray-400 italic">No AI memory yet. It builds automatically as you chat.</div>
                  )}

                  {contactContext.recentMessages && contactContext.recentMessages.length > 0 && (
                    <div>
                      <div className="text-gray-400 mb-1">Last messages:</div>
                      <div className="bg-white p-2 rounded-lg border border-gray-200 space-y-0.5">
                        {contactContext.recentMessages.map((m, i) => (
                          <div key={i} className="text-gray-600 truncate">{m}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {showContext && !contactContext && (
              <div className="border-b border-gray-100 bg-gray-50 px-5 py-4">
                <div className="text-xs text-gray-400 italic">Loading context...</div>
              </div>
            )}

            {/* --- IDLE STATE --- */}
            {status === 'idle' && (
              <div className="px-6 py-5">
                <p className="text-sm text-gray-500 leading-relaxed mb-4">
                  {contactName
                    ? <>Listening for messages from <span className="font-medium text-gray-700">@{contactName}</span>. Reply auto-generates when they message.</>
                    : 'Open a conversation to get started.'
                  }
                </p>
                {contactName && (
                  <div className="flex gap-2">
                    <button
                      onClick={onGenerateNow}
                      className="flex-1 py-2.5 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors"
                    >
                      Generate Reply
                    </button>
                    <button
                      onClick={onStartFresh}
                      className="py-2.5 px-4 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                      title="Ignore past context, start a new conversation"
                    >
                      Start Fresh
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* --- GENERATING STATE --- */}
            {status === 'generating' && (
              <div className="px-6 py-6">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    <span className="w-2.5 h-2.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2.5 h-2.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2.5 h-2.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-sm text-gray-500">Generating reply for @{contactName}...</span>
                </div>
                <p className="text-xs text-gray-400 mt-3">Calling LLM with conversation context. This takes a few seconds.</p>
              </div>
            )}

            {/* --- READY STATE --- */}
            {status === 'ready' && (
              <>
                <div className="px-6 pt-5 pb-4">
                  {isEditing ? (
                    <textarea
                      ref={textareaRef}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="w-full min-h-[100px] p-4 rounded-xl border border-gray-200 text-sm text-gray-800 leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-gray-50"
                      placeholder="Edit your reply..."
                    />
                  ) : (
                    <div className="p-4 bg-gray-50 rounded-xl">
                      <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{replyText}</p>
                    </div>
                  )}
                </div>

                {/* Tone selector */}
                <div className="px-6 pb-3">
                  <ToneSelector currentTone={tone} onToneChange={(t) => onToneChange(t)} disabled={false} />
                </div>

                {/* Refine section */}
                {showRefine ? (
                  <div className="px-6 pb-4">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={refineText}
                        onChange={(e) => setRefineText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleRefineSubmit()}
                        placeholder="e.g. make it shorter, more flirty, mention the cafe..."
                        className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50"
                        autoFocus
                      />
                      <button
                        onClick={handleRefineSubmit}
                        className="px-3 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
                      >
                        Refine
                      </button>
                    </div>
                  </div>
                ) : null}

                {/* Actions */}
                <div className="px-6 pb-5 flex items-center gap-2">
                  <button onClick={handleSend} className="flex-1 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors">
                    Send
                  </button>
                  <button onClick={() => setIsEditing(!isEditing)} className="py-2.5 px-4 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">
                    {isEditing ? 'Preview' : 'Edit'}
                  </button>
                  <button
                    onClick={() => setShowRefine(!showRefine)}
                    className={`py-2.5 px-3 text-sm font-medium rounded-xl transition-colors ${showRefine ? 'text-indigo-600 bg-indigo-50' : 'text-gray-600 bg-gray-100 hover:bg-gray-200'}`}
                    title="Refine with feedback"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                  </button>
                  <button onClick={() => { setIsEditing(false); setShowRefine(false); onRedo(); }} className="py-2.5 px-3 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors" title="Regenerate">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 4v6h6M23 20v-6h-6" /><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
                    </svg>
                  </button>
                  <button onClick={() => { setIsEditing(false); setShowRefine(false); onDismiss(); }} className="py-2.5 px-3 text-sm text-gray-400 hover:text-gray-600 rounded-xl transition-colors" title="Dismiss">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Start Fresh — always available in ready state */}
                <div className="px-6 pb-4">
                  <button
                    onClick={() => { setIsEditing(false); setShowRefine(false); onStartFresh(); }}
                    className="w-full py-2 text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    Start fresh conversation
                  </button>
                </div>
              </>
            )}

            {/* --- ERROR STATE --- */}
            {status === 'error' && (
              <div className="px-6 py-5">
                <div className="p-4 bg-red-50 rounded-xl border border-red-100">
                  <p className="text-sm text-red-700 font-medium mb-1">Generation failed</p>
                  <p className="text-xs text-red-500 leading-relaxed">{errorMessage || 'Check your API key in the side panel settings.'}</p>
                </div>
                <button onClick={onRetry} className="mt-4 w-full py-2.5 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors">
                  Retry
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
