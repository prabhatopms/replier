import { useState, useRef, useEffect } from 'react';
import type { ToneType } from '@/types/contact';
import { ToneSelector } from './ToneSelector';
import { ReplyActions } from './ReplyActions';

interface PopoverState {
  text: string;
  replyId: string;
  tone: string;
}

interface ReplyPopoverProps {
  state: PopoverState | null;
  onSend: (text: string, replyId: string) => void;
  onRedo: () => void;
  onToneChange: (tone: string) => void;
  onDismiss: () => void;
  onEdit: (text: string) => void;
}

export function ReplyPopover({
  state,
  onSend,
  onRedo,
  onToneChange,
  onDismiss,
  onEdit,
}: ReplyPopoverProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isLoading = state !== null && !state.text;
  const displayText = isEditing ? editText : state?.text || '';

  useEffect(() => {
    if (state?.text) {
      setEditText(state.text);
      setIsEditing(false);
    }
  }, [state?.text]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length,
      );
    }
  }, [isEditing]);

  if (!state) return null;

  const handleSend = () => {
    const text = isEditing ? editText : state.text;
    onSend(text, state.replyId);
  };

  const handleEdit = () => {
    setEditText(state.text);
    setIsEditing(true);
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditText(e.target.value);
    onEdit(e.target.value);
  };

  return (
    <div
      className="
        w-[380px] max-w-[95vw] bg-white rounded-xl shadow-2xl
        border border-gray-200 overflow-hidden
        animate-in slide-in-from-bottom-2 fade-in duration-200
      "
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
    >
      {/* Reply Text */}
      <div className="p-4 pb-3">
        {isLoading ? (
          <div className="flex items-center gap-2 py-3">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-sm text-gray-500">Generating reply...</span>
          </div>
        ) : isEditing ? (
          <textarea
            ref={textareaRef}
            value={editText}
            onChange={handleEditChange}
            className="
              w-full min-h-[80px] p-2 rounded-lg border border-gray-300
              text-sm text-gray-800 resize-none
              focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
            "
            placeholder="Edit your reply..."
          />
        ) : (
          <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
            {displayText}
          </p>
        )}
      </div>

      {/* Tone Selector */}
      <div className="px-4 pb-3">
        <ToneSelector
          currentTone={(state.tone || 'default') as ToneType}
          onToneChange={(tone) => onToneChange(tone)}
          disabled={isLoading}
        />
      </div>

      {/* Actions */}
      <div className="px-4 pb-3">
        <ReplyActions
          onSend={handleSend}
          onRedo={onRedo}
          onEdit={handleEdit}
          onDismiss={onDismiss}
          isEditing={isEditing}
          isLoading={isLoading}
        />
      </div>

      {/* Branding */}
      <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
        <span className="text-[10px] text-gray-400 font-medium tracking-wide uppercase">
          Oxytocin
        </span>
      </div>
    </div>
  );
}
