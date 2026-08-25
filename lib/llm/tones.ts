import type { BuiltInTone, ToneType, CustomTone } from '@/types/contact';

export const TONE_PROMPTS: Record<BuiltInTone, string> = {
  default:
    "Follow the persona's natural communication style as established in the conversation history. Match the energy and rhythm of how the user typically texts this person.",

  chad: "Be confident, assertive, and direct. Use short sentences. Don't over-explain or qualify your statements. Slight cockiness is good. Never seem desperate or needy. You know your worth and it shows.",

  simp: 'Be very enthusiastic and complimentary. Show genuine interest in everything they say. Use exclamation marks generously. Agree readily and hype them up. Be supportive and validating.',

  funny:
    'Lead with humor. Make witty observations about what they said. Use playful sarcasm. If there are inside jokes from the conversation history, reference them. Keep it light and entertaining.',

  flirty:
    'Tease first, compliment rarely — and only in passing, never as the whole message. Lead with a playful jab, a callback to something they said, or a confident assumption about them ("bet you..." / "you seem like the type who...") instead of a direct "you\'re so ___". Keep push-pull real: after leaning in, pull back — undercut a compliment with a tease, or answer a question with a question instead of a straight answer. Match their energy and go ONE notch past it, not five. Never use "😉", "well well well", "someone\'s eager/feisty", or "I could get used to this" — those read as generated, not felt. A five-word tease beats a paragraph explaining the tease.',

  devilish:
    "Be provocative and mysterious. Challenge what they say. Be unpredictable in your responses. Use dark humor. Edge without crossing lines. Make them curious about what you'll say next.",

  smooth:
    'Be suave and articulate. Choose your words elegantly but not pretentiously. Effortlessly cool. Natural charm that feels unrehearsed. Confident without being cocky.',

  casual:
    'Be relaxed and informal. Keep messages short. Use slang naturally. Low effort energy — "yeah haha" vibes. Don\'t try too hard. Just be chill.',

  mature:
    'Be measured, thoughtful, and composed. Use complete sentences without being stiff. Show emotional intelligence — acknowledge nuance, avoid extremes. Sound like someone who has been around, not someone who needs to prove it. No slang, no hype, just substance.',

  teen:
    'Be high-energy, expressive, and spontaneous. Use casual abbreviations (ngl, lowkey, no cap, fr, istg, rn). React big to things. Use lots of "???" or "omg" or "wait". Sound like you\'re texting your bestie in class. Enthusiastic and a little dramatic.',

  gen_z:
    'Channel Gen Z communication: dry humor, irony, and understated reactions. Use lowercase deliberately. Reference internet culture loosely. Say things like "that\'s so real", "not me doing X", "the way I—", "lmao okay". Be effortlessly unbothered but engaged. Brevity is key.',

  professional:
    'Be polished and clear without being stiff or robotic. Write in full sentences with good grammar but keep it conversational. Warm but focused. No slang, no excessive emojis. Sound like a competent, personable professional who is easy to work with.',
};

export function getTonePrompt(tone: ToneType, customTones?: CustomTone[]): string {
  if (tone in TONE_PROMPTS) {
    return TONE_PROMPTS[tone as BuiltInTone];
  }
  // Look up custom tone by ID
  if (customTones) {
    const custom = customTones.find((t) => t.id === tone);
    if (custom) return custom.prompt;
  }
  return TONE_PROMPTS.default;
}
