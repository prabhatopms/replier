import type { BuiltInTone, ToneType, CustomTone } from '@/types/contact';
import { TONE_LABELS, BUILT_IN_TONES } from '@/types/contact';

interface ToneSelectorProps {
  currentTone: ToneType;
  defaultTone?: ToneType;
  onToneChange: (tone: ToneType) => void;
  onSaveDefault?: (tone: ToneType) => void;
  customTones?: CustomTone[];
  disabled?: boolean;
}

const TONE_COLORS: Record<BuiltInTone, string> = {
  default: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
  chad: 'bg-red-100 text-red-700 hover:bg-red-200',
  simp: 'bg-pink-100 text-pink-700 hover:bg-pink-200',
  funny: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200',
  flirty: 'bg-purple-100 text-purple-700 hover:bg-purple-200',
  devilish: 'bg-gray-800 text-gray-100 hover:bg-gray-700',
  smooth: 'bg-blue-100 text-blue-700 hover:bg-blue-200',
  casual: 'bg-green-100 text-green-700 hover:bg-green-200',
  mature: 'bg-stone-100 text-stone-700 hover:bg-stone-200',
  teen: 'bg-orange-100 text-orange-700 hover:bg-orange-200',
  gen_z: 'bg-teal-100 text-teal-700 hover:bg-teal-200',
  professional: 'bg-sky-100 text-sky-700 hover:bg-sky-200',
};

const DISPLAY_TONES: BuiltInTone[] = BUILT_IN_TONES.filter((t) => t !== 'default');

function getToneColor(tone: ToneType): string {
  return TONE_COLORS[tone as BuiltInTone] ?? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200';
}

function getToneLabel(tone: ToneType, customTones?: CustomTone[]): string {
  if (tone in TONE_LABELS) return TONE_LABELS[tone as BuiltInTone];
  const custom = customTones?.find((t) => t.id === tone);
  return custom?.name ?? tone;
}

export function ToneSelector({
  currentTone,
  defaultTone,
  onToneChange,
  onSaveDefault,
  customTones,
  disabled,
}: ToneSelectorProps) {
  const allTones: ToneType[] = [...DISPLAY_TONES, ...(customTones?.map((t) => t.id) ?? [])];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {allTones.map((tone) => {
          const isSelected = currentTone === tone;
          const isDefault = defaultTone === tone;
          return (
            <button
              key={tone}
              onClick={() => onToneChange(tone)}
              disabled={disabled}
              title={isDefault ? 'Default tone for this contact' : undefined}
              className={`
                relative px-3 py-1.5 rounded-full text-xs font-medium transition-all
                ${getToneColor(tone)}
                ${isSelected ? 'ring-2 ring-offset-1 ring-indigo-500 scale-105' : ''}
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              {isDefault && (
                <span className="absolute -top-1 -right-1 text-[9px] leading-none">★</span>
              )}
              {getToneLabel(tone, customTones)}
            </button>
          );
        })}
      </div>

      {onSaveDefault && currentTone !== defaultTone && (
        <button
          onClick={() => onSaveDefault(currentTone)}
          className="text-[11px] text-indigo-500 hover:text-indigo-700 transition-colors"
        >
          ★ Set "{getToneLabel(currentTone, customTones)}" as default for this person
        </button>
      )}
    </div>
  );
}
