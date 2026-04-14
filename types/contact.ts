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
  preferredTone: ToneType;
  isActive: boolean;
  lastMessageAt: number;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

export type ToneType =
  | 'default'
  | 'chad'
  | 'simp'
  | 'funny'
  | 'flirty'
  | 'devilish'
  | 'smooth'
  | 'casual';

export const TONE_LABELS: Record<ToneType, string> = {
  default: 'Default',
  chad: 'Chad',
  simp: 'Simp',
  funny: 'Funny',
  flirty: 'Flirty',
  devilish: 'Devilish',
  smooth: 'Smooth',
  casual: 'Casual',
};
