import type { BuiltInTone, ToneType, CustomTone } from '@/types/contact';
import { TONE_LABELS, BUILT_IN_TONES } from '@/types/contact';

interface ToneSelectorProps {
  currentTone: ToneType;
  onToneChange: (tone: ToneType) => void;
  customTones?: CustomTone[];
  disabled?: boolean;
}

const TONE_EMOJIS: Record<BuiltInTone, string> = {
  default: '👤',
  chad: '👑',
  simp: '🥺',
  funny: '😂',
  flirty: '😏',
  devilish: '😈',
  smooth: '😎',
  casual: '☕',
  mature: '🎓',
  teen: '🤙',
  gen_z: '💅',
  professional: '💼',
};

const F = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';

const DISPLAY_TONES: BuiltInTone[] = BUILT_IN_TONES.filter((t) => t !== 'default');

function getToneEmoji(tone: ToneType): string {
  return TONE_EMOJIS[tone as BuiltInTone] ?? '🎨';
}

function getToneLabel(tone: ToneType, customTones?: CustomTone[]): string {
  if (tone in TONE_LABELS) return TONE_LABELS[tone as BuiltInTone];
  const custom = customTones?.find((t) => t.id === tone);
  return custom?.name ?? tone;
}

export function ToneSelector({
  currentTone,
  onToneChange,
  customTones,
  disabled,
}: ToneSelectorProps) {
  const otherTones = [...(customTones?.map((t) => t.id) ?? []), ...DISPLAY_TONES].filter(
    (t) => t !== currentTone
  );
  const allTones: ToneType[] = [currentTone, ...otherTones];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', overflow: 'hidden' }}>
      {/* Label */}
      <span style={{
        fontSize: 9.5, fontWeight: 700,
        letterSpacing: '.07em', textTransform: 'uppercase' as const,
        color: '#a0a0ad',
        flexShrink: 0,
      }}>
        Tone
      </span>

      {/* Chip row — horizontal scroll, no scrollbar */}
      <div
        className="no-scrollbar"
        style={{
          display: 'flex', gap: 5,
          overflowX: 'auto',
          flex: 1,
          alignItems: 'center',
          padding: '1px 0',
        } as React.CSSProperties}
      >
        {allTones.map((t) => {
          const isSelected = currentTone === t;
          return (
            <button
              key={t}
              onClick={() => onToneChange(t)}
              disabled={disabled}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                padding: '3px 8px', borderRadius: 999,
                fontSize: 11, fontWeight: 600,
                whiteSpace: 'nowrap' as const,
                flex: '0 0 auto', border: '1px solid',
                fontFamily: F,
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1,
                transition: 'all .15s',
                ...(isSelected
                  ? {
                    background: '#4f46e5',
                    borderColor: '#4f46e5',
                    color: '#ffffff',
                    boxShadow: '0 2px 5px rgba(79,70,229,.28)',
                  }
                  : {
                    background: '#f6f6f9',
                    borderColor: '#e7e7ee',
                    color: '#3a3a45',
                  }),
              }}
            >
              <span style={{ fontSize: 12, lineHeight: 1 }}>{getToneEmoji(t)}</span>
              <span>{getToneLabel(t, customTones)}</span>
            </button>
          );
        })}
      </div>

    </div>
  );
}
