import { useState } from 'react';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface GuideProps {
  onBack: () => void;
}

interface Section {
  id: string;
  emoji: string;
  title: string;
  content: React.ReactNode;
}

export function Guide({ onBack }: GuideProps) {
  const sections: Section[] = [
    {
      id: 'setup',
      emoji: '⚡',
      title: 'Quick Setup',
      content: (
        <ol className="space-y-3 list-none">
          <Step n={1}>
            Open <b>Settings</b> (gear icon in the top-right) and choose your AI provider —
            <b> Claude</b>, <b>Gemini</b>, or <b>OpenAI</b>.
          </Step>
          <Step n={2}>
            Paste your API key for that provider. Keys are stored locally on your device and
            never leave your browser.
          </Step>
          <Step n={3}>
            Go to <b>instagram.com/direct</b> and open any conversation. Replier detects the
            contact automatically and the floating popover appears.
          </Step>
          <Step n={4}>
            You're ready. When they message you, a reply is generated automatically.
          </Step>
        </ol>
      ),
    },
    {
      id: 'popover',
      emoji: '💬',
      title: 'The Reply Popover',
      content: (
        <div className="space-y-3">
          <p>
            A small floating panel appears over Instagram whenever a contact is active.
            You can drag it anywhere on screen.
          </p>
          <FeatureList items={[
            ['Status dot', 'Green = idle, pulsing blue = generating, solid blue = reply ready, red = error.'],
            ['ctx button', 'Shows memory — relationship, goal, AI summary, inside jokes, recent messages.'],
            ['Log icon', 'Activity log showing each step of what Replier just did.'],
            ['Collapse arrow', 'Minimise the popover while keeping it accessible.'],
          ]} />
          <Tip>The popover stays on top of Instagram's UI. Drag it out of the way if it covers content you need to read.</Tip>
        </div>
      ),
    },
    {
      id: 'generating',
      emoji: '🤖',
      title: 'Generating Replies',
      content: (
        <div className="space-y-3">
          <p>Replier generates replies in three ways:</p>
          <FeatureList items={[
            ['Auto-generate', 'When a contact sends a message and Auto-pilot is on, a reply is generated immediately without you doing anything.'],
            ['Generate Now', 'Tap this button in the idle state to manually trigger generation for the current conversation.'],
            ['Start Fresh', 'Ignores all conversation history and generates a conversation-opener instead — useful when restarting a cold thread.'],
          ]} />
          <Tip>The reply is shown in an editable text box. Modify it freely before sending — it's just a starting point.</Tip>
        </div>
      ),
    },
    {
      id: 'editing',
      emoji: '✏️',
      title: 'Editing & Sending',
      content: (
        <div className="space-y-3">
          <p>
            When a reply is ready the text box is immediately focused and editable. No extra clicks needed.
          </p>
          <FeatureList items={[
            ['Edit inline', 'Click anywhere in the text box and type. The AI text is just a draft.'],
            ['⌘ ↵ / Ctrl ↵', 'Keyboard shortcut to send without touching the mouse.'],
            ['Send button', "Inserts the reply into Instagram's input box and sends it."],
            ['↺ Regenerate', 'Discard the current reply and generate a fresh one with the same tone.'],
            ['✏ Refine', 'Give the AI a text instruction — "make it shorter", "mention the cafe", "add a joke". It rewrites based on your note.'],
            ['✕ Dismiss', 'Close the reply without sending. The popover returns to idle.'],
          ]} />
        </div>
      ),
    },
    {
      id: 'tones',
      emoji: '🎭',
      title: 'Talking Styles',
      content: (
        <div className="space-y-3">
          <p>
            Styles control the personality and tone of every reply. Pick one before sending,
            or change it to regenerate in that style instantly.
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {[
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
            ].map(([name, desc]) => (
              <div key={name} className="bg-gray-50 rounded-lg px-2.5 py-2 border border-gray-100">
                <div className="text-xs font-semibold text-gray-700">{name}</div>
                <div className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: 'default-tone',
      emoji: '⭐',
      title: 'Per-Contact Default Style',
      content: (
        <div className="space-y-3">
          <p>Each contact can have their own default style so you don't have to re-pick it every time.</p>
          <FeatureList items={[
            ['★ marker', 'The current default style for this contact shows a small star badge.'],
            ['Set as default', "Select any style and tap \"★ Set [style] as default for this person\" below the style list. It's saved to that contact immediately."],
            ['On-the-fly change', "Picking a different style just regenerates for that message. It doesn't change the contact's default unless you explicitly save it."],
            ['Edit contact', 'You can also set the default from the contact editor in the side panel.'],
          ]} />
        </div>
      ),
    },
    {
      id: 'custom-styles',
      emoji: '🎨',
      title: 'Custom Styles',
      content: (
        <div className="space-y-3">
          <p>Not happy with the built-in styles? Create your own with any instructions you want.</p>
          <FeatureList items={[
            ['Create', 'Settings → Talking Styles → "+ Add Custom Style". Give it a name and write instructions in plain English.'],
            ['Edit', 'Tap "Edit" next to any custom style to update its name or prompt.'],
            ['Delete', 'Tap "Delete" to remove it. Contacts using that style will fall back to Default.'],
            ['Use it', 'Custom styles appear at the end of the style list in the popover, same as built-in ones.'],
          ]} />
          <Tip>Example custom style prompt: <i>"Be extremely blunt. Skip all pleasantries. One sentence max. If something is dumb, say so."</i></Tip>
        </div>
      ),
    },
    {
      id: 'memory',
      emoji: '🧠',
      title: 'Memory & Context',
      content: (
        <div className="space-y-3">
          <p>Replier builds a memory of each conversation so replies feel personal, not generic.</p>
          <FeatureList items={[
            ['Auto-summary', 'After 5+ messages, the AI writes a rolling summary covering topics, inside jokes, shared interests, emotional dynamics, and recent context.'],
            ['ctx panel', "Click \"ctx\" in the popover header to see exactly what Replier knows about this contact and what it's using to generate replies."],
            ['Structured memory', 'After enough history, the summary breaks down into key topics, inside jokes, communication style (emoji usage, message length), and recent context.'],
            ['History scraping', 'On first contact detection, Replier scrolls back through the conversation to load your full history. A progress overlay shows the count.'],
          ]} />
          <Tip>Add a <b>Personal Note</b> in the contact editor ("she doesn't like small talk", "we met at the startup event"). It goes directly into every prompt for that person.</Tip>
        </div>
      ),
    },
    {
      id: 'context-refresh',
      emoji: '🔄',
      title: 'Updating Context',
      content: (
        <div className="space-y-3">
          <p>
            Sometimes Instagram adds a <i>"New Messages"</i> divider or loads messages after
            Replier has already generated a reply. The amber strip at the top of the ready state
            shows you what the AI last saw.
          </p>
          <FeatureList items={[
            ['Last seen message', 'The amber bar shows the most recent message Replier had in its context when it generated the reply.'],
            ['Update button', "If new messages have appeared on screen since the reply was generated, tap \"↺ Update\" in the amber bar. Replier scrapes the visible messages and regenerates immediately."],
            ['Smart cache', "If no new messages have arrived since the last generation, Replier reuses the cached reply instead of spending tokens on a new one."],
          ]} />
        </div>
      ),
    },
    {
      id: 'contacts',
      emoji: '👤',
      title: 'Managing Contacts',
      content: (
        <div className="space-y-3">
          <p>Each person you DM becomes a contact. Customize them to get better replies.</p>
          <FeatureList items={[
            ['Relationship', 'Label the relationship — "best friend", "girl I met at the bar", "colleague". Shapes how Replier writes.'],
            ['Goal', "Set what you're trying to achieve: get a date, casual chat, flirt, networking, friendship, reconnect, or custom."],
            ['Personal notes', 'Free-text context the AI always gets — hobbies, things they mentioned, what you want to avoid.'],
            ['Default style', 'The style used when auto-generating for this person.'],
            ['Auto-pilot toggle', 'Turn off to stop auto-generation for a specific contact without disabling the extension.'],
            ['Clear history', 'Wipes stored messages and resets AI memory for that contact.'],
          ]} />
        </div>
      ),
    },
    {
      id: 'providers',
      emoji: '🔑',
      title: 'AI Providers',
      content: (
        <div className="space-y-3">
          <p>
            Choose which AI powers your replies in Settings. You can store keys for all three —
            only the selected provider is used.
          </p>
          <div className="space-y-2">
            {[
              ['Anthropic Claude', 'Best for persona adherence and nuanced tone matching. Recommended for most users. Models: Sonnet 4 (fast), Opus 4 (best quality), Haiku 4.5 (fastest).'],
              ['Google Gemini', 'Large context window, fast. Note: safety filters may block flirty/devilish styles. Models: 2.5 Flash, 2.5 Pro, 2.0 Flash.'],
              ['OpenAI', 'GPT-4o family. Good all-round quality. Models: GPT-4o, GPT-4o Mini, o4-mini (reasoning).'],
            ].map(([name, desc]) => (
              <div key={name} className="bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100">
                <div className="text-xs font-semibold text-gray-700 mb-0.5">{name}</div>
                <div className="text-[11px] text-gray-500 leading-relaxed">{desc}</div>
              </div>
            ))}
          </div>
          <Tip>All API keys are stored in your browser's local storage and never sent anywhere except the provider's own API.</Tip>
        </div>
      ),
    },
    {
      id: 'system-prompt',
      emoji: '⚙️',
      title: 'Custom System Prompt',
      content: (
        <div className="space-y-3">
          <p>
            Power-user feature. In Settings → System Prompt you can write your own instructions
            that completely replace Replier's built-in prompt.
          </p>
          <FeatureList items={[
            ['When to use', "When the built-in prompt doesn't match your style at all, or you have very specific instructions you always want followed."],
            ['What it replaces', 'Everything — the persona layers, tone instructions, style matching, and output format rules. You control it entirely.'],
            ['Reset', 'Clear the field to go back to the built-in prompt.'],
          ]} />
          <Tip>Leave it empty unless you have a clear reason. The built-in prompt is tuned carefully and most users get better results from it.</Tip>
        </div>
      ),
    },
    {
      id: 'tips',
      emoji: '💡',
      title: 'Tips & Tricks',
      content: (
        <ul className="space-y-2.5">
          {[
            'Scrape conversation history first. Go to a conversation, let Replier finish scrolling, then generate. More history = better replies.',
            'Fill in "About You" in Settings. Self-description and texting style carry into every prompt and make replies sound like you.',
            'Use the Refine button instead of regenerating. "Make it shorter" or "less formal" tweaks are cheaper than a full regeneration.',
            'Set the goal per contact. "Get a date" produces very different openers than "Networking".',
            "Start Fresh for cold contacts. If you haven't messaged someone in weeks, Start Fresh gives the AI permission to open a new thread.",
            '⌘ ↵ sends. Keep your hands on the keyboard — approve the reply and send without reaching for the mouse.',
            'The ctx panel is your debug tool. If a reply feels off, open ctx to see exactly what context the AI had.',
          ].map((tip, i) => (
            <li key={i} className="flex gap-2 text-xs text-gray-600 leading-relaxed">
              <span className="text-indigo-400 font-bold shrink-0">{i + 1}.</span>
              {tip}
            </li>
          ))}
        </ul>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center gap-2 mb-5">
        <Button variant="ghost" size="icon" onClick={onBack} className="text-gray-500 -ml-1">
          <ArrowLeft size={16} />
        </Button>
        <h2 className="text-sm font-semibold text-gray-900">How to Use Replier</h2>
      </div>

      <div className="space-y-2">
        {sections.map((section) => (
          <CollapsibleSection key={section.id} emoji={section.emoji} title={section.title}>
            {section.content}
          </CollapsibleSection>
        ))}
      </div>

      <p className="text-center text-[11px] text-gray-300 mt-6 pb-2">
        Replier — AI replies for Instagram DMs
      </p>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function CollapsibleSection({
  emoji,
  title,
  children,
}: {
  emoji: string;
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`rounded-xl border transition-colors ${open ? 'border-indigo-100 bg-white' : 'border-gray-100 bg-white hover:border-gray-200'}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
      >
        <span className="text-base shrink-0">{emoji}</span>
        <span className="flex-1 text-sm font-medium text-gray-800">{title}</span>
        <ChevronDown
          size={14}
          className={`text-gray-400 transition-transform duration-200 shrink-0 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="px-4 pb-5 text-sm text-gray-600 leading-relaxed border-t border-gray-100">
          <div className="pt-4">{children}</div>
        </div>
      )}
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 text-sm text-gray-600 leading-relaxed">
      <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}

function FeatureList({ items }: { items: [string, string][] }) {
  return (
    <div className="space-y-2">
      {items.map(([label, desc]) => (
        <div key={label} className="flex gap-2">
          <span className="text-xs font-semibold text-gray-700 shrink-0 min-w-22.5">{label}</span>
          <span className="text-xs text-gray-500 leading-relaxed">{desc}</span>
        </div>
      ))}
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2.5">
      <span className="text-indigo-400 text-xs font-bold shrink-0 mt-0.5">Tip</span>
      <p className="text-xs text-indigo-700 leading-relaxed">{children}</p>
    </div>
  );
}
