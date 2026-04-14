interface ReplyActionsProps {
  onSend: () => void;
  onRedo: () => void;
  onEdit: () => void;
  onDismiss: () => void;
  isEditing: boolean;
  isLoading: boolean;
}

export function ReplyActions({
  onSend,
  onRedo,
  onEdit,
  onDismiss,
  isEditing,
  isLoading,
}: ReplyActionsProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onSend}
        disabled={isLoading}
        className="
          flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium
          bg-indigo-600 text-white hover:bg-indigo-700
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-colors
        "
      >
        <span>&#10003;</span> Send
      </button>

      <button
        onClick={onRedo}
        disabled={isLoading}
        className="
          flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium
          bg-gray-100 text-gray-700 hover:bg-gray-200
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-colors
        "
      >
        <span>&#8635;</span> Redo
      </button>

      {!isEditing && (
        <button
          onClick={onEdit}
          disabled={isLoading}
          className="
            flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium
            bg-gray-100 text-gray-700 hover:bg-gray-200
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors
          "
        >
          <span>&#9998;</span> Edit
        </button>
      )}

      <button
        onClick={onDismiss}
        className="
          ml-auto px-2 py-1.5 rounded-md text-sm text-gray-400
          hover:text-gray-600 hover:bg-gray-100 transition-colors
        "
        title="Dismiss"
      >
        &#10005;
      </button>
    </div>
  );
}
