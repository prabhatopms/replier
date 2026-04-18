---
name: "Replier Codebase Structure Guide"
description: "Complete architecture reference for the Replier browser extension codebase. Use when navigating file structure, understanding system components, or locating related modules."
keywords: ["codebase structure", "architecture", "file organization", "project layout", "replier extension"]
category: "Codebase Navigation"
---

# Replier Codebase Structure & Architecture

## Project Overview
**Replier** is a browser extension for Instagram that auto-generates intelligent DM replies using AI (Claude/Gemini). It auto-detects conversations, maintains conversation memory, scrapes history, and provides a real-time status UI.

**Key Tech Stack:**
- **Framework**: WXT (Web Extension Toolkit)
- **UI**: React + Tailwind CSS
- **Database**: Dexie (IndexedDB)
- **LLM**: Claude API (primary), Gemini API (fallback)
- **Target Platform**: Instagram DMs

---

## Folder Structure & Responsibilities

```
replier/
├── entrypoints/              # Extension entry points
├── components/               # Reusable React components
├── lib/                      # Core business logic
├── types/                    # TypeScript type definitions
├── public/                   # Static assets
└── assets/                   # Stylesheets
```

### `/entrypoints/` - Extension Entry Points

| File | Purpose | Key Exports |
|------|---------|------------|
| **background.ts** | Service worker. Handles all messages, generation pipeline, queue processing | `generationQueue`, message handlers for GENERATE_REPLY, ACCEPT_REPLY, etc. |
| **content.ts** | Content script. Runs on Instagram, detects messages, shows popover UI | Contact detection, message observers, UI rendering |
| **instagram-interceptor.ts** | Main-world script. Intercepts Instagram API/XHR responses | `extractLightspeedMessages()` for parsing Lightspeed protocol |
| **sidepanel/App.tsx** | Main side panel UI frame | Page navigation (Dashboard, ContactEditor, ConversationView, Settings) |
| **sidepanel/pages/Dashboard.tsx** | Contact list & management | Contact CRUD, activation, deletion |
| **sidepanel/pages/ContactEditor.tsx** | Single contact editor | Edit relationship, goal, tone, notes |
| **sidepanel/pages/ConversationView.tsx** | View/manage single conversation | Message history, Clear & Rescrape button |
| **sidepanel/pages/Settings.tsx** | Extension settings | API keys, LLM model, custom system prompt |

### `/components/` - React UI Components

| Component | Purpose | Props |
|-----------|---------|-------|
| **StatusPopover.tsx** | Main in-page popover UI. Shows reply generation status, logs, contact context | `status`, `contactName`, `replyText`, callbacks |
| **ContactToast.tsx** | Toast notification when new contact detected | `username`, `displayName`, callbacks |
| **ScrapeOverlay.tsx** | Progress overlay during history scraping | `messageCount`, `isComplete`, callbacks |
| **ToneSelector.tsx** | Tone selector dropdown/buttons | `currentTone`, `onToneChange`, `disabled` |

### `/lib/db/` - Database Layer (Dexie)

| File | Purpose | Key Functions |
|------|---------|---|
| **index.ts** | Dexie DB initialization, schema v1 & v2 | `db` export with collections |
| **contacts.ts** | Contact CRUD | `getContact()`, `saveContact()`, `createContact()`, `updateScrubStatus()` |
| **messages.ts** | Message storage | `storeMessage()`, `getRecentMessages()`, `storeMessagesDeduped()`, `reconcileMessages()` |
| **replies.ts** | Pending reply management | `createPendingReply()`, `updateReplyText()`, `acceptReply()` |

**Schema (v2):**
- `contacts`: id, platform, platformUserId, threadId, historyScrubbed, historyScrubCount
- `messages`: id, contactId, timestamp, sender, content, verified, scraped
- `pendingReplies`: id, contactId, status, replyText, tone

### `/lib/llm/` - LLM Integration

| File | Purpose | Key Functions |
|------|---------|---|
| **types.ts** | LLM config types | `LLMConfig`, `LLMProvider`, `LLMProviderType` |
| **provider.ts** | Provider factory | `getActiveProvider()` |
| **claude.ts** | Claude API client | `generateReply()`, `summarizeConversation()` |
| **gemini.ts** | Gemini API client | Alternative provider |
| **prompt-builder.ts** | System prompt assembly | `buildSystemPrompt()`, `buildMessageHistory()` |
| **tones.ts** | Tone templates | `getTonePrompt()` for each tone |

**Key Concepts:**
- 6-layer prompts: rules → user profile → contact persona → tone → style → output format
- Token budget: 18k total (3k system + 1k generation + 14.5k history)
- Custom system prompts override auto-generated

### `/lib/pipeline/` - Generation & Memory Pipeline

| File | Purpose | Key Functions |
|------|---------|---|
| **generator.ts** | Reply generation engine | `generateReply(contactId, triggerMessageId, tone, freshStart)` |
| **queue.ts** | Generation queue | `QueueItem` interface, processor |
| **context-builder.ts** | Prompt assembly | `buildContext(contact, messages, tone, freshStart)` |
| **summarizer.ts** | Conversation memory | `summarizeIfNeeded()`, `forceSummarize()` |
| **analyzer.ts** | Conversation statistics | `analyzeConversation()` - no LLM needed |

### `/lib/platforms/` - Platform Adapters

| File | Purpose |
|------|---------|
| **registry.ts** | Platform adapter factory |
| **instagram/adapter.ts** | Instagram DOM access & message extraction |
| **instagram/selectors.ts** | DOM selectors (ordered by resilience) |

---

## Critical Files by Task

| Task | Files |
|------|-------|
| Change LLM behavior | `lib/llm/{claude,gemini,prompt-builder}.ts` |
| Modify system prompt | `lib/llm/prompt-builder.ts` | 
| Add/change tone | `types/contact.ts`, `lib/llm/tones.ts`, `components/ToneSelector.tsx` |
| Add database field | `types/{contact,message,reply}.ts`, `lib/db/index.ts`, `lib/db/{contacts,messages,replies}.ts` |
| Change generation logic | `lib/pipeline/generator.ts` |
| Update summarization | `lib/pipeline/summarizer.ts` |
| Fix contact detection | `entrypoints/content.ts::detectAndSetContact()`, `lib/platforms/instagram/adapter.ts` |
| Update DOM selectors | `lib/platforms/instagram/selectors.ts` |
| Modify popover UI | `components/StatusPopover.tsx` |
| Add message handler | `lib/messaging/types.ts`, `entrypoints/background.ts::handleMessage()`, `entrypoints/content.ts` |

---

## Data Relationships

```
Contact (id, platform, platformUserId, threadId, historyScrubbed, ...)
    ↓
    └─→ [1:many] Messages (contactId, sender, content, verified, timestamp)
    └─→ [1:many] PendingReplies (contactId, status, replyText, tone)
```

---

## Key Systems

### Contact Detection & Auto-Creation
- **Entry**: `content.ts::detectAndSetContact()`
- **Process**: Extract contact info → send DETECT_CONTACT → background creates if new
- **Result**: Auto-created contacts with defaults (isActive=true, tone=default)

### Reply Generation Pipeline
- **Threshold**: Auto when lastSender=contact AND isActive=true
- **Process**: Load messages → buildContext() → callLLM() → store → notify UI
- **Token budget**: 18k total : 3k system + 1k generation + 14.5k history

### Message Deduplication
- **Methods**: Content+sender fingerprinting, deterministic ID hashing
- **Verification**: Message.verified field (true=in DOM, false=ghost)
- **Location**: `messages.ts::storeMessagesDeduped()`, `reconcileMessages()`

### Conversation Memory (StructuredSummary)
- **Trigger**: Auto-summarize when messages ≥ 5
- **Output**: keyTopics, insideJokes, emotionalDynamics, communicationStyle
- **Use**: Popover context panel, LLM style matching

---

## Constants

| Location | Constant | Value | Purpose |
|----------|----------|-------|---------|
| `lib/pipeline/summarizer.ts` | `SUMMARY_THRESHOLD` | 15 | Min messages before summarization |
| `lib/llm/prompt-builder.ts` | `TOKEN_BUDGET` | 18k | Total LLM context allocation |
| `lib/platforms/instagram/adapter.ts` | `SENT_BUBBLE_CLASS` | 'x12lizq0' | Instagram CSS for sent messages |
