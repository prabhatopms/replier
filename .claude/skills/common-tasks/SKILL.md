---
name: "Replier Common Development Tasks"
description: "Direct instructions and code examples for 25+ common tasks. Use when making specific changes to LLM behavior, UI, database, or configuration."
keywords: ["tasks", "how-to", "examples", "code snippets", "quick reference"]
category: "Development Guide"
---

# Replier Common Development Tasks

## Quick File Locator

| Need to Change... | Go To... |
|---|---|
| LLM behavior, temperature | `lib/llm/{claude,gemini}.ts` |
| System prompt layers | `lib/llm/prompt-builder.ts` |
| Tone definitions | `lib/llm/tones.ts` + `types/contact.ts` |
| Database schema | `lib/db/index.ts` + `lib/db/{contacts,messages,replies}.ts` |
| Generation logic | `lib/pipeline/generator.ts` |
| Summarization | `lib/pipeline/summarizer.ts` |
| Contact detection | `content.ts::detectAndSetContact()` |
| Message extraction | `lib/platforms/instagram/adapter.ts` |
| DOM selectors | `lib/platforms/instagram/selectors.ts` |
| Popover UI | `components/StatusPopover.tsx` |
| Message routing | `background.ts::handleMessage()` |
| Message types | `lib/messaging/types.ts` |

---

## Task: Change LLM Provider Default

**Files:** `lib/llm/types.ts`

```typescript
// BEFORE
export const DEFAULT_LLM_CONFIG: LLMConfig = {
  provider: 'claude',
  model: 'claude-sonnet-4-20250514',
  maxTokens: 512,
};

// AFTER (switch to Gemini)
export const DEFAULT_LLM_CONFIG: LLMConfig = {
  provider: 'gemini',
  model: 'gemini-2.0-flash',
  maxTokens: 512,
};
```

---

## Task: Adjust Temperature & Token Limits

**Files:** `lib/llm/claude.ts`, `lib/llm/gemini.ts`, `lib/llm/types.ts`

**Why?** Temperature controls creativity (0.0=robotic, 1.0=random). Higher tokens = longer replies.

```typescript
// lib/llm/claude.ts
body: JSON.stringify({
  model: config.model,
  max_tokens: config.maxTokens,
  temperature: 1.0,  // CHANGE HERE: was 0.9
  system: systemPrompt,
  messages,
}),

// lib/llm/gemini.ts
generationConfig: {
  maxOutputTokens: config.maxTokens,
  temperature: 1.0,  // CHANGE HERE: was 0.9
},

// lib/llm/types.ts
export const DEFAULT_LLM_CONFIG: LLMConfig = {
  provider: 'claude',
  model: 'claude-sonnet-4-20250514',
  maxTokens: 600,  // CHANGE HERE: was 512
};
```

---

## Task: Modify System Prompt Layers

**File:** `lib/llm/prompt-builder.ts::buildSystemPrompt()`

The 6 layers are added in order:
1. Basic rules (SHORT, no AI phrases)
2. User profile
3. Contact persona
4. Tone
5. Style matching  
6. Output format

**Example:** Make replies more friendly

```typescript
// BEFORE - layer 1
layers.push(
  `You text on Instagram DMs as this person. First person. Their style.
LENGTH: MAX 1-2 short sentences...`
);

// AFTER
layers.push(
  `You text on Instagram DMs as this person - like talking to a close friend.
Be warm, genuine, and natural. Keep it SHORT (1-2 sentences max).
Always use first person and match their vibe...`
);
```

---

## Task: Add a New Tone Type

**Files:** `types/contact.ts`, `lib/llm/tones.ts`, `components/ToneSelector.tsx`

```typescript
// 1. types/contact.ts
export type ToneType =
  | 'default' | 'casual' | 'flirty' | 'funny' | 'chad' | 'smooth'
  | 'professional';  // ADD NEW

// 2. lib/llm/tones.ts
export function getTonePrompt(tone: ToneType): string {
  switch (tone) {
    // ... existing cases
    case 'professional':
      return `Keep it business casual but warm. Use complete sentences.
Be clear, helpful, and organized. No slang.`;
  }
}

// 3. components/ToneSelector.tsx (in TONES array)
{ id: 'professional', label: 'Professional', icon: '💼' }
```

---

## Task: Add New Message Handler

**Files:** `lib/messaging/types.ts`, `entrypoints/background.ts`

```typescript
// 1. lib/messaging/types.ts
export type ExtensionMessage =
  | ... existing types ...
  | { type: 'CHECK_CONNECTION'; timestamp: number }
  | { type: 'CONNECTION_OK'; timestamp: number };

// 2. entrypoints/background.ts - in handleMessage()
case 'CHECK_CONNECTION': {
  return { ok: true, timestamp: Date.now() };
}
```

---

## Task: Change Message Deduplication Logic

**File:** `lib/db/messages.ts::storeMessagesDeduped()`

Current: Dedupe by `sender:content.slice(0,60)`

**Example:** Add timestamp-based dedup

```typescript
// Around line ~100
const existingContentSet = new Set(
  existingMessages.map((m) => {
    // OLD: just content + sender
    // NEW: content + sender + timestamp bucket (5 min window)
    const timeBucket = Math.floor(m.timestamp / 300000);
    return `${m.sender}:${m.content.slice(0, 60)}:${timeBucket}`;
  }),
);
```

---

## Task: Change Auto-Generation Trigger

**File:** `entrypoints/content.ts::resolveContactStatus()`

Current: Auto-gen when lastSender=contact AND isActive=true

**Example:** Only auto-gen for specific relationship types

```typescript
// Around line ~280
if (
  response.lastMessageSender === 'contact' &&
  response.isActive &&
  response.hasMessages
) {
  // NEW: check relationship
  const relationshipMatch = ['romantic', 'close_friend'].includes(
    response.preferredTone // Actually should query relationship, this is just example
  );
  
  if (!relationshipMatch) {
    addLog('Skipping auto-gen: Contact is not close', 'warn');
    setStatus('idle');
    return;
  }
  
  addLog('Last message from contact — auto-generating reply', 'info');
  setStatus('generating');
  // Then call GENERATE_REPLY
}
```

---

## Task: Adjust Message Load Limit

**File:** `lib/pipeline/generator.ts::generateReply()`

Current: Loads 80 recent messages

```typescript
// BEFORE ~line 34
const messages = await getRecentMessages(contactId, 80);

// AFTER (more context = slower but better replies)
const messages = await getRecentMessages(contactId, 120);
```

---

## Task: Change Summarization Threshold

**Files:** `lib/pipeline/summarizer.ts`, `lib/pipeline/generator.ts`

Current: Auto-summarize when messages >= 5

```typescript
// lib/pipeline/summarizer.ts
const SUMMARY_THRESHOLD = 20;  // WAS: 15, NOW: 20 (summarize less often)

// lib/pipeline/generator.ts - Line ~43
if (messages.length >= 5) {  // CHANGE TO: >= 20
  summarizeIfNeeded(contactId).catch(...);
}
```

---

## Task: Modify Contact Auto-Creation Defaults

**File:** `lib/db/contacts.ts::newDefaultContact()`

Current defaults: isActive=true, tone='default'

```typescript
// BEFORE
export function newDefaultContact(
  platform: Platform,
  platformUserId: string,
  displayName: string,
  threadId?: string,
): Contact {
  return createContact({
    platform,
    platformUserId,
    displayName,
    relationship: '',
    goal: ConversationGoal.GENERAL,
    goalDescription: '',
    personalNotes: '',
    preferredTone: 'default' as ToneType,
    isActive: true,  // Default: active
    threadId,
  });
}

// AFTER (default to inactive)
isActive: false,  // Users must manually activate
```

---

## Task: Add Database Migration

**File:** `lib/db/index.ts`

```typescript
// BEFORE (v2)
db.version(2).stores({
  contacts: 'id, platform, ...',
  messages: 'id, contactId, ...',
  pendingReplies: 'id, contactId, ...',
}).upgrade((tx) => { ... });

// AFTER (add v3)
db.version(3).stores({
  contacts: 'id, platform, platformUserId, threadId, lastMessageAt',
  messages: 'id, contactId, timestamp',
  pendingReplies: 'id, contactId, status',
}).upgrade((tx) => {
  return tx.table('contacts').toCollection().modify((contact) => {
    contact.newField = contact.newField ?? 'default_value';
  });
});
```

---

## Task: Update Instagram Selectors

**File:** `lib/platforms/instagram/selectors.ts`

Selectors are ordered by resilience (first match wins)

```typescript
// BEFORE
messageBubble: [
  'div[role="row"]',
  'div[role="listitem"]',
],

// AFTER (Instagram changed layout)
messageBubble: [
  '[data-pagelet="IGDMessagesList"] div[role="presentation"]',  // Most stable
  'div[aria-label^="Conversation with"] div[role="presentation"]',
],
```

**Debug:** In Instagram's console:
```javascript
document.querySelectorAll('[data-pagelet="IGDMessagesList"]')  // Should find container
```

---

## Task: Change Fresh-Start Behavior

**File:** `lib/pipeline/context-builder.ts::buildContext()`, `lib/llm/prompt-builder.ts::buildSystemPrompt()`

```typescript
// context-builder.ts
const llmMessages = buildMessageHistory(messages, contact, freshStart);

// Now in prompt-builder.ts buildSystemPrompt():
if (freshStart) {
  // This special mode sends zero history
  layers.push(`START A BRAND NEW CONVERSATION...`);
}

// Example: customize what "fresh start" means
if (freshStart) {
  // Could send some metadata instead:
  layers.push(`
    Starting fresh conversation.
    Contact: ${contact.displayName}
    Relationship: ${contact.relationship}
    Goal: ${contact.goal}
    (Ignore all message history)
  `);
}
```

---

## Task: Add Rate Limiting

**File:** `entrypoints/background.ts`

```typescript
// Add near top of file
const RATE_LIMIT = {
  maxPerMinute: 3,
  lastGenerations: [] as number[],
};

function canGenerate(): boolean {
  const now = Date.now();
  const oneMinuteAgo = now - 60000;
  
  // Cleanup old timestamps
  RATE_LIMIT.lastGenerations = 
    RATE_LIMIT.lastGenerations.filter(ts => ts > oneMinuteAgo);
  
  if (RATE_LIMIT.lastGenerations.length >= RATE_LIMIT.maxPerMinute) {
    return false;
  }
  
  RATE_LIMIT.lastGenerations.push(now);
  return true;
}

// In handleMessage GENERATE_REPLY:
case 'GENERATE_REPLY': {
  if (!canGenerate()) {
    notifyContentScript(contactId, 'error', undefined, undefined, undefined, 
      'Rate limited. Try again in a moment');
    return { ok: false, error: 'Rate limited' };
  }
  // ... proceed with generation
}
```

---

## Task: Change Contact Detection Retry Logic

**File:** `entrypoints/content.ts::detectAndSetContact()`

Current: Retries 10x with 300ms delays

```typescript
// BEFORE
let contactInfo = adapter!.getCurrentContactInfo();
if (!contactInfo) {
  addLog('DOM not ready, retrying...', 'warn');
  for (let attempt = 0; attempt < 10; attempt++) {  // 10 retries
    await new Promise((r) => setTimeout(r, 300));      // 300ms each
    contactInfo = adapter!.getCurrentContactInfo();
    if (contactInfo) break;
  }
}

// AFTER (more aggressive: 15 retries, 200ms)
for (let attempt = 0; attempt < 15; attempt++) {  // MORE retries
  await new Promise((r) => setTimeout(r, 200));     // FASTER polling
  contactInfo = adapter!.getCurrentContactInfo();
  if (contactInfo) break;
}
```

---

## Task: Add Contact Cleanup on Inactivity

**File:** `entrypoints/sidepanel/pages/Dashboard.tsx`

```typescript
// Add cleanup function
const clearInactiveContacts = async (daysSince: number = 30) => {
  const contacts = await db.contacts.toArray();
  const cutoff = Date.now() - (daysSince * 24 * 60 * 60 * 1000);
  
  for (const contact of contacts) {
    if (contact.lastMessageAt < cutoff) {
      await db.contacts.delete(contact.id);
      console.log(`Deleted inactive contact: ${contact.displayName}`);
    }
  }
};

// Call on dashboard load
useEffect(() => {
  clearInactiveContacts(30); // Remove contacts inactive > 30 days
}, []);
```

---

## Task: Enable Custom System Prompt Override

**File:** `entrypoints/sidepanel/pages/Settings.tsx`

Already implemented! Users can:
1. Scroll to "System Prompt" section
2. Paste custom prompt
3. Click "Reset to default prompt" to undo

To check: Search for `customSystemPrompt` in code.

---

## Debug/Test Commands

```javascript
// Browser console (side panel)

// Check LLM config
const cfg = await chrome.storage.local.get('llmConfig');
console.log('LLM Config:', cfg.llmConfig);

// Check recent messages for contact
const db = (await import('@/lib/db')).default;
const msgs = await db.messages
  .where('contactId').equals('CONTACT_ID')
  .reverse().limit(20).toArray();
console.log('Messages:', msgs);

// Check contact details
const contact = await db.contacts.get('CONTACT_ID');
console.log('Contact:', contact);

// Trigger manual summarization
const { forceSummarize } = await import('@/lib/pipeline/summarizer');
await forceSummarize('CONTACT_ID');
console.log('Summarized!');

// Clear all contacts (DESTRUCTIVE!)
await db.contacts.clear();
await db.messages.clear();
```

---

## Common Patterns

### Browser Messaging
```typescript
// Content → Background
await browser.runtime.sendMessage({
  type: 'MESSAGE_TYPE',
  data: value
} satisfies ExtensionMessage);

// Background → Content
browser.tabs.sendMessage(tabId, {
  type: 'REPLY_READY',
  text: 'Reply text here',
});

// Listen for messages
browser.runtime.onMessage.addListener((message: ExtensionMessage) => {
  switch(message.type) {
    case 'MESSAGE_TYPE':
      // Handle
      break;
  }
});
```

### Database Queries
```typescript
// Get single
const c = await db.contacts.get(id);

// Query by index
const c = await db.contacts
  .where('[platform+platformUserId]')
  .equals([platform, userId])
  .first();

// Get many
const msgs = await db.messages
  .where('contactId').equals(contactId)
  .reverse().limit(100).toArray();

// Update
await db.contacts.update(id, { field: newValue });

// Delete
await db.messages.where('contactId').equals(contactId).delete();
```
