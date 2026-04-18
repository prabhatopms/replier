import type { Platform } from './platform';

export enum ConversationGoal {
  GET_DATE = 'get_date',
  CASUAL_CHAT = 'casual_chat',
  FLIRT = 'flirt',
  NETWORKING = 'networking',
  FRIENDSHIP = 'friendship',
  RECONNECT = 'reconnect',
  CUSTOM = 'custom',
}

export const GOAL_LABELS: Record<ConversationGoal, string> = {
  [ConversationGoal.GET_DATE]: 'Get a Date',
  [ConversationGoal.CASUAL_CHAT]: 'Casual Chat',
  [ConversationGoal.FLIRT]: 'Flirt',
  [ConversationGoal.NETWORKING]: 'Networking',
  [ConversationGoal.FRIENDSHIP]: 'Friendship',
  [ConversationGoal.RECONNECT]: 'Reconnect',
  [ConversationGoal.CUSTOM]: 'Custom',
};

export interface StructuredSummary {
  overview: string;
  keyTopics: string[];
  sharedInterests: string[];
  insideJokes: string[];
  emotionalDynamics: string;
  communicationStyle: {
    avgLength: 'short' | 'medium' | 'long';
    emojiUsage: 'none' | 'light' | 'heavy';
    responseTime: string;
    initiator: 'user' | 'contact' | 'balanced';
  };
  recentContext: string;
  rawSummary: string;
}

export interface Contact {
  id: string;
  platform: Platform;
  platformUserId: string;
  displayName: string;
  relationship: string;
  goal: ConversationGoal;
  goalDescription: string;
  personalNotes: string;
  conversationSummary: string;
  structuredSummary?: StructuredSummary;
  preferredTone: ToneType;
  isActive: boolean;
  lastMessageAt: number;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
  // Auto-pilot fields
  threadId?: string;
  numericUserId?: string;
  historyScrubbed: boolean;
  historyScrubCount: number;
  lastScrubAt?: number;
}

export type BuiltInTone =
  | 'default'
  | 'chad'
  | 'simp'
  | 'funny'
  | 'flirty'
  | 'devilish'
  | 'smooth'
  | 'casual'
  | 'mature'
  | 'teen'
  | 'gen_z'
  | 'professional';

// Allows built-in tones + arbitrary custom tone IDs (e.g. "custom_abc123")
export type ToneType = BuiltInTone | (string & {});

export interface CustomTone {
  id: string;
  name: string;
  prompt: string;
}

export const BUILT_IN_TONES: BuiltInTone[] = [
  'default', 'chad', 'simp', 'funny', 'flirty', 'devilish', 'smooth', 'casual',
  'mature', 'teen', 'gen_z', 'professional',
];

export const TONE_LABELS: Record<BuiltInTone, string> = {
  default: 'Default',
  chad: 'Chad',
  simp: 'Simp',
  funny: 'Funny',
  flirty: 'Flirty',
  devilish: 'Devilish',
  smooth: 'Smooth',
  casual: 'Casual',
  mature: 'Mature',
  teen: 'Teen',
  gen_z: 'Gen Z',
  professional: 'Pro',
};

export function getToneDisplayName(tone: ToneType, customTones?: CustomTone[]): string {
  if (tone in TONE_LABELS) return TONE_LABELS[tone as BuiltInTone];
  const custom = customTones?.find((t) => t.id === tone);
  return custom?.name ?? tone;
}
