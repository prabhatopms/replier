---
name: "Replier Browser Extension - Development Guide"
description: "Complete development reference for the Replier Instagram DM auto-reply extension. Includes architecture, file structure, common tasks, and decision trees."
instructions: |
  # Quick Start for Development

  ## Use These Skills Based on Your Task:

  1. **[Codebase Structure Guide](./.claude/skills/codebase-structure/SKILL.md)** 
     - Use when you need to find files
     - Folder layout and responsibilities
     - Where each component lives
     - Critical files by task type

  2. **[Architecture & Data Flows](./.claude/skills/architecture-flows/SKILL.md)**
     - Use to understand how things work
     - System diagrams
     - Data flow walkthroughs
     - Component interactions
     - State machines

  3. **[Common Tasks](./.claude/skills/common-tasks/SKILL.md)**
     - Use for how-to guides with code examples
     - 25+ common development tasks
     - Quick file locator table
     - Copy-paste code snippets
     - Debug commands

  ## Workflow

  1. **First time on the codebase?** → Read Codebase Structure
  2. **Need to make a change?** → Check Common Tasks (quick examples)
  3. **Not sure how it works?** → Check Architecture (data flows)
  4. **Stuck on a file?** → Use the Quick File Locator tables

  ## Key Principles

  - **Auto-pilot**: AI generates replies automatically when contacts message
  - **Smart context**: Uses intelligent conversation analysis and memory
  - **Deduplication**: Multi-layered strategy prevents ghost messages
  - **Modular LLM**: Swappable providers (Claude, Gemini)
  - **Token-aware**: All prompts respect token budgets
  - **Extension-safe**: Proper message routing and state management

---

# Replier Browser Extension - Development Reference

## What is Replier?

Replier is a Chrome extension for Instagram that:
- **Auto-generates** intelligent DM replies using AI (Claude/Gemini)
- **Auto-detects** when you receive messages
- **Builds memory** of conversations (topics, inside jokes, style)
- **Scrapes history** to give AI full context
- **Shows real-time UI** with generation status and controls

**Target User**: Anyone who wants AI help writing natural Instagram DMs

---

## Quick Facts

| Property | Value |
|----------|-------|
| **Architecture** | Extension + Database + LLM pipeline |
| **UI Framework** | React + Tailwind CSS |
| **Database** | Dexie (IndexedDB wrapper) |
| **LLM Providers** | Claude (primary), Gemini (fallback) |
| **Core Language** | TypeScript |
| **Message Protocol** | Chrome runtime messaging API |
| **Target Platform** | instagram.com (Facebook owned) |

---

## File Structure At-a-Glance

```
replier/
├── entrypoints/          ← Extension scripts & UI
│   ├── background.ts     ← Service worker (message routing, generation)
│   ├── content.ts        ← Content script (DOM access, UI rendering)
│   ├── instagram-interceptor.ts  ← Network interceptor (API parsing)
│   └── sidepanel/        ← Side panel UI (React)
│
├── components/           ← React components
│   ├── StatusPopover.tsx ← Main in-page UI (generation status, logs, memory)
│   ├── ContactToast.tsx  ← New contact notification
│   ├── ScrapeOverlay.tsx ← Progress during history scraping
│   └── ToneSelector.tsx  ← Tone picker
│
├── lib/                  ← Business logic
│   ├── db/               ← Database layer (Dexie collections)
│   ├── llm/              ← LLM integration (prompt builders, providers)
│   ├── pipeline/         ← Generation pipeline (queue, generator, summarizer)
│   ├── platforms/        ← Platform adapters (Instagram DOM logic)
│   └── messaging/        ← Message type definitions
│
├── types/                ← TypeScript interfaces
│   ├── contact.ts        ← Contact, ToneType, StructuredSummary
│   ├── message.ts        ← Message, ExtractedMessage
│   ├── platform.ts       ← PlatformAdapter interface
│   └── reply.ts          ← PendingReply
│
└── .claude/              ← Claude development skills
    ├── claude.md         ← This file (main reference)
    └── skills/
        ├── codebase-structure/SKILL.md  ← Where files are
        ├── architecture-flows/SKILL.md  ← How it works
        └── common-tasks/SKILL.md        ← How to make changes
```

---

## Information Architecture

### For Navigation
→ **Codebase Structure Guide**
- Find where code lives
- Understand folder organization
- Know what each file does
- Jump to critical files by task

### For Understanding
→ **Architecture & Data Flows**
- See how components connect
- Trace message routing
- Understand state machines
- Visual system diagrams

### For Making Changes
→ **Common Tasks**
- Copy-paste code examples
- Find which files to edit
- See before/after diffs
- Learn patterns

---

## Key Concepts

### 1. Message Generation Pipeline
```
Instagram message arrives
  ↓
Content script detects
  ↓
Background enqueues generation
  ↓
Generator loads context + calls LLM
  ↓
Popover shows reply to user
  ↓
User sends or dismisses
```

### 2. Conversation Memory (StructuredSummary)
```
Raw Summary (text)
  ↓ + Analytics
  ↓
Structured:
├─ keyTopics
├─ insideJokes
├─ emotionalDynamics
└─ communicationStyle

Used for: Style matching & context
```

### 3. Message Deduplication
- **Content-based**: Same sender + content = duplicate
- **ID-based**: Deterministic hashing across scrapes
- **Verification**: Ghost messages marked as unverified

### 4. Token Budget
```
Total: 18,000 tokens
├─ System prompt: 3,000
├─ Generation: 1,024
└─ Message history: 14,500
```

### 5. Auto-Pilot Logic
```
IF lastSender == 'contact'
   AND isActive == true
   AND contact.hasMessages
THEN:
  Generate reply automatically
ELSE:
  Wait for manual trigger
```

---

## What to Read First

### I want to...

**...understand the overall architecture**
→ Read: Architecture & Data Flows skill → System Diagram section

**...find where to make a change**
→ Read: Codebase Structure skill → Critical Files by Task table

**...add a new feature**
→ Read: Common Tasks skill → find relevant example

**...debug an issue**
→ Read: Architecture & Data Flows → Data Flows section

**...add a new tone type**
→ Read: Common Tasks → "Add a New Tone Type" section

**...modify the LLM system prompt**
→ Read: Common Tasks → "Modify System Prompt Layers" section

**...understand message routing**
→ Read: Architecture & Data Flows → Component Dependency Tree

---

## CLI Commands for Development

```bash
# Build extension
npm run build

# Watch for changes
npm run dev

# Type check
npm run type-check

# Database queries (in console)
const db = (await import('@/lib/db')).default;
const contacts = await db.contacts.toArray();
```

---

## Critical Files Map

### LLM & Prompts
```
lib/llm/
├── prompt-builder.ts     ← 6-layer system prompt construction
├── tones.ts              ← Per-tone instructions (casual, flirty, etc.)
├── claude.ts             ← Claude API integration
├── gemini.ts             ← Gemini API integration
└── types.ts              ← Config types, DEFAULT_LLM_CONFIG
```

### Generation & Memory
```
lib/pipeline/
├── generator.ts          ← Main generation entry point
├── queue.ts              ← Generation queue manager
├── context-builder.ts    ← Assembles prompts
├── summarizer.ts         ← Conversation summaries
└── analyzer.ts           ← Conversation statistics (no LLM)
```

### Database
```
lib/db/
├── index.ts              ← Dexie schema (v1, v2)
├── contacts.ts           ← Contact CRUD
├── messages.ts           ← Message storage & dedup
└── replies.ts            ← Pending reply management
```

### Instagram Integration
```
lib/platforms/instagram/
├── adapter.ts            ← DOM access, message extraction
└── selectors.ts          ← CSS selectors (ordered by resilience)
```

---

## Extension Architecture Tiers

### Tier 1: Instagram.com (Facebook)
- DOM elements (message bubbles, input box)
- Network traffic (API responses)

### Tier 2: Main Context (Interceptor)
- `instagram-interceptor.ts`: Patches fetch/XHR
- Forwards API data to content script via events

### Tier 3: Isolated World (Content Script)
- `content.ts`: DOM access, message detection
- Renders React UI (StatusPopover)
- Routes messages to background

### Tier 4: Service Worker (Background)
- `background.ts`: Message router
- Calls generation pipeline
- Database access
- LLM communication

### Tier 5: Side Panel (React UI)
- Settings, contacts, conversations
- Data management interface

---

## Decision Tree: When to Read Which Skill

```
I need to make a change
  │
  ├─ "Where do I find...?" → Codebase Structure
  │
  ├─ "How does...work?" → Architecture & Data Flows
  │
  ├─ "Show me how to..." → Common Tasks
  │
  ├─ "I'm debugging..." → Architecture & Data Flows (Data Flows section)
  │
  └─ "I have a specific question"
     │
     ├─ About file locations → Codebase Structure
     ├─ About system design → Architecture & Data Flows
     └─ About implementation → Common Tasks
```

---

## Key Numbers

| Item | Value | Location |
|------|-------|----------|
| Message load limit | 80 | `generator.ts` |
| Summarization threshold | 5+ messages | `summarizer.ts` |
| Scrape scroll loops | 30 max | `content.ts` |
| Token budget total | 18,000 | `prompt-builder.ts` |
| Activity log max entries | 50 | `content.ts` |
| Scrape retry attempts | 3 | `content.ts` |
| Contact detection retries | 10 | `content.ts` |
| Contact detection delay | 300ms per retry | `content.ts` |
| Auto-scrape delay | 2000ms | `content.ts` |

---

## Important Files to Know

### Top 10 Most-Edited Files
1. `lib/llm/prompt-builder.ts` — System prompts
2. `lib/pipeline/generator.ts` — Generation logic
3. `components/StatusPopover.tsx` — UI
4. `entrypoints/background.ts` — Message routing
5. `entrypoints/content.ts` — Contact detection
6. `lib/platforms/instagram/selectors.ts` — DOM selectors
7. `lib/db/messages.ts` — Message ops
8. `entrypoints/sidepanel/pages/Settings.tsx` — Settings UI
9. `lib/pipeline/summarizer.ts` — Memory
10. `lib/llm/tones.ts` — Tone definitions

---

## Troubleshooting Map

| Problem | Check |
|---------|-------|
| Replies not generating | `background.ts::generateReply()`, LLM config |
| Selectors broken | `lib/platforms/instagram/selectors.ts` |
| Messages duplicating | `lib/db/messages.ts::storeMessagesDeduped()` |
| Popover not showing | `content.ts::showPopover()` or CSS z-index |
| Database empty | Check `lib/db/index.ts` schema version |
| API key errors | `entrypoints/sidepanel/pages/Settings.tsx` |
| Scraping stuck | `content.ts::startAutoScrape()` abort logic |

---

## Development Workflow

1. **Make change** in relevant file
2. **Build**: `npm run build`
3. **Reload extension** in chrome://extensions
4. **Test on instagram.com**
5. **Check browser console** for errors
6. **Check popover logs** (click "log" icon in StatusPopover)
7. **Query database** via console if needed

---

## Next Steps

- **New to the codebase?** → Start with Codebase Structure skill
- **Need to make a specific change?** → Go to Common Tasks skill
- **Understanding a system?** → Read Architecture & Data Flows skill
- **Have questions?** → Skills have detailed examples and references

---

## Skills Directory

All development reference materials are organized as Claude skills:

```
.claude/skills/
├── codebase-structure/SKILL.md   ← Folder structure & file purposes
├── architecture-flows/SKILL.md   ← System design & data flows
└── common-tasks/SKILL.md         ← How-to guides with examples
```

Each skill is self-contained and can be read independently, but together they provide complete coverage of the Replier codebase.

---

**Last Updated:** April 2026  
**Codebase**: WXT Extension + React + Dexie + TypeScript  
**Status**: Production-ready with auto-pilot features
