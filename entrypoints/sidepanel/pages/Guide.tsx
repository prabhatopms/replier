import { useState } from 'react';

interface GuideProps {
  onBack: () => void;
}

const F = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
const T = {
  body: '#18181f',
  bodyMid: '#3a3a45',
  bodyLight: '#5a5a66',
  muted: '#8a8a99',
  labelMuted: '#a0a0ad',
  white: '#ffffff',
  surfaceAlt: '#fafafc',
  divider: '#f1f1f4',
  border: '#e7e7ee',
  indigo: '#4f46e5',
  indigoLight: '#6366f1',
  indigoBg: '#eef0ff',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function CollapsibleSection({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      background: T.white, border: `1px solid ${open ? '#c7d2fe' : T.border}`,
      borderRadius: 11, overflow: 'hidden', transition: 'border-color .15s',
    }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '11px 13px', background: 'transparent', border: 'none',
          cursor: 'pointer', textAlign: 'left', fontFamily: F,
        }}
      >
        <span style={{ fontSize: 16, flexShrink: 0 }}>{emoji}</span>
        <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: T.body }}>{title}</span>
        <span style={{
          fontSize: 11, color: T.muted, flexShrink: 0,
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform .2s', display: 'inline-block',
        }}>⌄</span>
      </button>
      {open && (
        <div style={{
          padding: '4px 13px 14px', borderTop: `1px solid ${T.divider}`,
          fontSize: 12, color: T.bodyLight, lineHeight: 1.6,
        }}>
          <div style={{ paddingTop: 10 }}>{children}</div>
        </div>
      )}
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
      <span style={{
        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
        background: T.indigoBg, color: T.indigo,
        fontSize: 10, fontWeight: 700,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: 1,
      }}>
        {n}
      </span>
      <span style={{ fontSize: 12, color: T.bodyLight, lineHeight: 1.6 }}>{children}</span>
    </div>
  );
}

function FeatureList({ items }: { items: [string, string][] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map(([label, desc]) => (
        <div key={label} style={{ display: 'flex', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.bodyMid, flexShrink: 0, minWidth: 80 }}>{label}</span>
          <span style={{ fontSize: 11.5, color: T.bodyLight, lineHeight: 1.55 }}>{desc}</span>
        </div>
      ))}
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', gap: 8, marginTop: 10,
      background: T.indigoBg, border: '1px solid #c7d2fe',
      borderRadius: 8, padding: '8px 10px',
    }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: T.indigo, flexShrink: 0, marginTop: 2 }}>TIP</span>
      <p style={{ fontSize: 11.5, color: '#3730a3', lineHeight: 1.55, margin: 0 }}>{children}</p>
    </div>
  );
}

function ToneGrid() {
  const tones = [
    ['Default', 'Mirrors your natural style from conversation history.'],
    ['Chad', 'Confident, direct, never desperate.'],
    ['Simp', 'Enthusiastic, validating, hype energy.'],
    ['Funny', 'Witty, playful sarcasm, inside jokes.'],
    ['Flirty', 'Teasing, charming, push-pull tension.'],
    ['Devilish', 'Provocative, mysterious, dark humor.'],
    ['Smooth', 'Suave, articulate, effortlessly cool.'],
    ['Casual', 'Relaxed, low-effort, short messages.'],
    ['Mature', 'Measured, thoughtful, emotionally intelligent.'],
    ['Teen', 'High-energy, slang, big reactions (ngl, lowkey, fr).'],
    ['Gen Z', 'Dry irony, lowercase, internet culture vibes.'],
    ['Pro', 'Polished, warm, professional but not stiff.'],
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
      {tones.map(([name, desc]) => (
        <div key={name} style={{
          background: T.surfaceAlt, borderRadius: 8,
          border: `1px solid ${T.border}`, padding: '7px 9px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.bodyMid, marginBottom: 2 }}>{name}</div>
          <div style={{ fontSize: 10.5, color: T.muted, lineHeight: 1.45 }}>{desc}</div>
        </div>
      ))}
    </div>
  );
}

function ProviderList() {
  const providers = [
    ['Anthropic Claude', 'Best for persona adherence and nuanced tone matching. Recommended for most users. Models: Sonnet 4 (fast), Opus 4 (best quality), Haiku 4.5 (fastest).'],
    ['Google Gemini', 'Large context window, fast. Note: safety filters may block flirty/devilish styles. Models: 2.5 Flash, 2.5 Pro, 2.0 Flash.'],
    ['OpenAI', 'GPT-4o family. Good all-round quality. Models: GPT-4o, GPT-4o Mini, o4-mini (reasoning).'],
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 8 }}>
      {providers.map(([name, desc]) => (
        <div key={name} style={{
          background: T.surfaceAlt, borderRadius: 8,
          border: `1px solid ${T.border}`, padding: '8px 10px',
        }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: T.bodyMid, marginBottom: 3 }}>{name}</div>
          <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.5 }}>{desc}</div>
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function Guide({ onBack }: GuideProps) {
  const sections = [
    {
      id: 'setup', emoji: '⚡', title: 'Quick Setup',
      content: (
        <div>
          <Step n={1}>Open <strong>Settings</strong> (gear icon, top-right) and choose your AI provider — <strong>Claude</strong>, <strong>Gemini</strong>, or <strong>OpenAI</strong>.</Step>
          <Step n={2}>Paste your API key for that provider. Keys are stored locally on your device and never leave your browser.</Step>
          <Step n={3}>Go to <strong>instagram.com/direct</strong> or <strong>web.whatsapp.com</strong> and open any conversation. Oxytocin detects which platform you're on and the contact automatically, and the floating popover appears.</Step>
          <Step n={4}>You're ready. When they message you, a reply is generated automatically.</Step>
        </div>
      ),
    },
    {
      id: 'popover', emoji: '💬', title: 'The Reply Popover',
      content: (
        <div>
          <p style={{ fontSize: 12, color: T.bodyLight, lineHeight: 1.6, marginBottom: 10 }}>
            A small floating panel appears over Instagram or WhatsApp whenever a contact is active. You can drag it anywhere on screen.
          </p>
          <FeatureList items={[
            ['Context tab', 'Shows memory — relationship, goal, AI summary, inside jokes, recent messages.'],
            ['Log icon', 'Activity log showing each step of what Oxytocin just did.'],
            ['Drag', 'Drag the header to reposition the popover anywhere on screen.'],
          ]} />
          <Tip>The popover stays on top of the chat UI. Drag it out of the way if it covers content you need to read.</Tip>
        </div>
      ),
    },
    {
      id: 'generating', emoji: '🤖', title: 'Generating Replies',
      content: (
        <div>
          <p style={{ fontSize: 12, color: T.bodyLight, lineHeight: 1.6, marginBottom: 10 }}>Oxytocin generates replies in three ways:</p>
          <FeatureList items={[
            ['Auto-generate', 'When a contact sends a message and Auto-pilot is on, a reply is generated immediately without you doing anything.'],
            ['Generate Now', 'Tap this in the idle state to manually trigger generation for the current conversation.'],
            ['Start Fresh', 'Ignores all history and generates a conversation-opener — useful when restarting a cold thread.'],
          ]} />
          <Tip>The reply is shown in an editable text box. Modify it freely before sending — it's just a starting point.</Tip>
        </div>
      ),
    },
    {
      id: 'editing', emoji: '✏️', title: 'Editing & Sending',
      content: (
        <div>
          <p style={{ fontSize: 12, color: T.bodyLight, lineHeight: 1.6, marginBottom: 10 }}>
            When a reply is ready the text box is immediately focused and editable.
          </p>
          <FeatureList items={[
            ['Edit inline', 'Click anywhere in the text box and type. The AI text is just a draft.'],
            ['⌘ ↵ / Ctrl ↵', 'Keyboard shortcut to send without touching the mouse.'],
            ['Send button', "Inserts the reply into the chat's input box and sends it."],
            ['↺ Regenerate', 'Discard and generate a fresh reply with the same tone.'],
            ['✏ Refine', 'Give the AI a text instruction — "make it shorter", "mention the cafe". It rewrites based on your note.'],
            ['✕ Dismiss', 'Close the reply without sending. Popover returns to idle.'],
          ]} />
        </div>
      ),
    },
    {
      id: 'tones', emoji: '🎭', title: 'Talking Styles',
      content: (
        <div>
          <p style={{ fontSize: 12, color: T.bodyLight, lineHeight: 1.6 }}>
            Styles control the personality of every reply. Pick one before sending, or change it to regenerate instantly.
          </p>
          <ToneGrid />
        </div>
      ),
    },
    {
      id: 'custom-styles', emoji: '🎨', title: 'Custom Styles',
      content: (
        <div>
          <p style={{ fontSize: 12, color: T.bodyLight, lineHeight: 1.6, marginBottom: 10 }}>Create your own styles with any instructions you want.</p>
          <FeatureList items={[
            ['Create', 'Settings → Talking Styles → "+ Add Custom Style". Give it a name and write instructions in plain English.'],
            ['Edit / Delete', 'Tap the edit or delete icon next to any custom style.'],
            ['Use it', 'Custom styles appear at the end of the style list in the popover, same as built-in ones.'],
          ]} />
          <Tip>Example: <em>"Be extremely blunt. Skip all pleasantries. One sentence max. If something is dumb, say so."</em></Tip>
        </div>
      ),
    },
    {
      id: 'memory', emoji: '🧠', title: 'Memory & Context',
      content: (
        <div>
          <p style={{ fontSize: 12, color: T.bodyLight, lineHeight: 1.6, marginBottom: 10 }}>Oxytocin builds a memory of each conversation so replies feel personal, not generic.</p>
          <FeatureList items={[
            ['Auto-summary', 'After 5+ messages, the AI writes a rolling summary covering topics, inside jokes, shared interests, and recent context.'],
            ['ctx panel', 'Click "Context" in the popover header to see exactly what Oxytocin knows and is using to generate replies.'],
            ['History scraping', 'On first contact detection, Oxytocin scrolls back through the conversation to load your full history.'],
          ]} />
          <Tip>Add a <strong>Personal Note</strong> in the contact editor ("she doesn't like small talk", "we met at the startup event"). It goes directly into every prompt for that person.</Tip>
        </div>
      ),
    },
    {
      id: 'contacts', emoji: '👤', title: 'Managing Contacts',
      content: (
        <div>
          <p style={{ fontSize: 12, color: T.bodyLight, lineHeight: 1.6, marginBottom: 10 }}>Each person you DM becomes a contact. Customize them to get better replies.</p>
          <FeatureList items={[
            ['Relationship', 'Label the relationship — "best friend", "girl I met at the bar", "colleague".'],
            ['Goal', "Set what you're trying to achieve: get a date, casual chat, flirt, networking, friendship, reconnect."],
            ['Personal notes', 'Free-text context the AI always gets — hobbies, things they mentioned, what to avoid.'],
            ['Auto-pilot toggle', 'Turn off to stop auto-generation for a specific contact without disabling the extension.'],
            ['Clear history', 'Wipes stored messages and resets AI memory for that contact.'],
          ]} />
        </div>
      ),
    },
    {
      id: 'providers', emoji: '🔑', title: 'AI Providers',
      content: (
        <div>
          <p style={{ fontSize: 12, color: T.bodyLight, lineHeight: 1.6 }}>
            Choose which AI powers your replies in Settings. You can store keys for all three — only the selected provider is used.
          </p>
          <ProviderList />
          <Tip>All API keys are stored in your browser's local storage and never sent anywhere except the provider's own API.</Tip>
        </div>
      ),
    },
    {
      id: 'system-prompt', emoji: '⚙️', title: 'Custom System Prompt',
      content: (
        <div>
          <p style={{ fontSize: 12, color: T.bodyLight, lineHeight: 1.6, marginBottom: 10 }}>
            Power-user feature. In Settings → System Prompt you can write your own instructions that completely replace Oxytocin's built-in prompt.
          </p>
          <FeatureList items={[
            ['When to use', "When the built-in prompt doesn't match your style at all, or you have very specific instructions you always want followed."],
            ['What it replaces', 'Everything — persona layers, tone instructions, style matching, and output format rules.'],
            ['Reset', 'Clear the field to go back to the built-in prompt.'],
          ]} />
          <Tip>Leave it empty unless you have a clear reason. Most users get better results from the built-in prompt.</Tip>
        </div>
      ),
    },
    {
      id: 'tips', emoji: '💡', title: 'Tips & Tricks',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            'Scrape conversation history first. Go to a conversation, let Oxytocin finish scrolling, then generate. More history = better replies.',
            'Fill in "About You" in Settings. Self-description and texting style carry into every prompt and make replies sound like you.',
            'Use Refine instead of regenerating. "Make it shorter" or "less formal" tweaks are cheaper than a full regeneration.',
            'Set the goal per contact. "Get a date" produces very different openers than "Networking".',
            "Start Fresh for cold contacts. If you haven't messaged someone in weeks, Start Fresh gives the AI permission to open a new thread.",
            '⌘ ↵ sends. Approve the reply and send without reaching for the mouse.',
            'The Context panel is your debug tool. If a reply feels off, open it to see exactly what the AI had.',
          ].map((tip, i) => (
            <div key={i} style={{ display: 'flex', gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: T.indigo, flexShrink: 0, minWidth: 16, paddingTop: 2 }}>{i + 1}.</span>
              <span style={{ fontSize: 11.5, color: T.bodyLight, lineHeight: 1.55 }}>{tip}</span>
            </div>
          ))}
        </div>
      ),
    },
  ];

  return (
    <div style={{ fontFamily: F, color: T.body }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button
          onClick={onBack}
          style={{
            width: 28, height: 28, display: 'inline-flex', alignItems: 'center',
            justifyContent: 'center', borderRadius: 8, border: `1px solid ${T.border}`,
            background: T.white, cursor: 'pointer', color: T.bodyLight, fontSize: 14,
          }}
        >
          ←
        </button>
        <span style={{ fontSize: 14, fontWeight: 700, color: T.body, letterSpacing: '-.01em' }}>How to Use Oxytocin</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sections.map((s) => (
          <CollapsibleSection key={s.id} emoji={s.emoji} title={s.title}>
            {s.content}
          </CollapsibleSection>
        ))}
      </div>

      <p style={{ textAlign: 'center', fontSize: 10.5, color: '#d1d5db', marginTop: 20, paddingBottom: 4 }}>
        Oxytocin — Your brain's bonding chemical. Engineered as software.
      </p>
    </div>
  );
}
