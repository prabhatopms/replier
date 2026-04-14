import type { ToneType } from '@/types/contact';
import { TONE_LABELS } from '@/types/contact';

interface ToneSelectorProps {
  currentTone: ToneType;
  onToneChange: (tone: ToneType) => void;
  disabled?: boolean;
}

const TONE_COLORS: Record<ToneType, string> = {
  default: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
  chad: 'bg-red-100 text-red-700 hover:bg-red-200',
  simp: 'bg-pink-100 text-pink-700 hover:bg-pink-200',
  funny: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200',
  flirty: 'bg-purple-100 text-purple-700 hover:bg-purple-200',
  devilish: 'bg-gray-800 text-gray-100 hover:bg-gray-700',
  smooth: 'bg-blue-100 text-blue-700 hover:bg-blue-200',
  casual: 'bg-green-100 text-green-700 hover:bg-green-200',
};

const TONES: ToneType[] = [
  'chad',
  'simp',
  'funny',
  'flirty',
  'devilish',
  'smooth',
  'casual',
];

export function ToneSelector({
  currentTone,
  onToneChange,
  disabled,
}: ToneSelectorProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TONES.map((tone) => (
        <button
          key={tone}
          onClick={() => onToneChange(tone)}
          disabled={disabled}
          className={`
            px-2.5 py-1 rounded-full text-xs font-medium transition-all
            ${TONE_COLORS[tone]}
            ${currentTone === tone ? 'ring-2 ring-offset-1 ring-indigo-500 scale-105' : ''}
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          {TONE_LABELS[tone]}
        </button>
      ))}
    </div>
  );
}
