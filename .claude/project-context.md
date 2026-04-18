# Replier Project Context

## What Replier Is
Replier is a Chrome browser extension for Instagram that automatically generates AI-powered DM replies. It observes Instagram direct message activity, scrapes conversation history where available, and uses a generation pipeline to create contextual responses. The extension is designed to help users reply more naturally and quickly while preserving the conversation tone.

## Core Objectives
- Automate Instagram DM reply suggestions
- Preserve conversational context from message history
- Maintain consistent tone and memory across replies
- Keep the experience lightweight and safe for browser extension behavior

## Key Features

### 1. AI Reply Generation
- Uses Claude as the primary LLM provider
- Supports Gemini as a fallback provider
- Builds layered prompts with conversation context, user tone, and safety rules
- Generates responses automatically when a contact sends a message

### 2. Conversation Memory
- Stores contact history in IndexedDB via Dexie
- Maintains structured conversation summaries, including topics and style
- Uses memory for better tone matching and follow-up relevance

### 3. Instagram Integration
- Injects a content script into instagram.com
- Detects messages using DOM selectors and network interception
- Shows an in-page popover UI for reply status, tone selection, and controls
- Scrapes chat history when needed to provide more context

### 4. User Interface
- React-based UI components for in-page controls and side panel settings
- Status popover for generated replies, logs, and quick actions
- Tone selector for choosing conversational style
- Contact toast notifications for new messages or new contacts

### 5. Background Processing
- Service worker background script handles message routing and LLM calls
- Manages a generation queue and retry logic
- Coordinates between content script, storage layer, and LLM provider

### 6. Deduplication and Safety
- Deduplicates messages before storage to avoid ghost messages
- Uses token budgets to avoid overloading prompts
- Applies extension-safe messaging and data handling patterns

## Architecture Overview

### Primary Code Areas
- `entrypoints/` — Extension entrypoints and UI bootstrapping
  - `background.ts` — service worker and message router
  - `content.ts` — content script for DOM observation and UI injection
  - `instagram-interceptor.ts` — network request interception for Instagram APIs
  - `sidepanel/` — React side panel for settings and conversation management

- `components/` — React UI elements
  - `StatusPopover.tsx`, `ToneSelector.tsx`, `ScrapeOverlay.tsx`, `ContactToast.tsx`

- `lib/` — business logic and core systems
  - `db/` — Dexie database schema and data operations
  - `llm/` — prompt builders and provider integrations
  - `pipeline/` — generation pipeline, context builder, summarizer, analyzer
  - `platforms/` — Instagram DOM adapter and selectors
  - `messaging/` — runtime message type definitions

- `types/` — TypeScript data models
  - `contact.ts`, `message.ts`, `reply.ts`, `platform.ts`

## What Claude Design Should Know
- The product is an Instagram DM auto-reply assistant, not a full social media client.
- It must work within a browser extension environment and respect Instagram's page structure.
- It emphasizes quality of reply context over flashy UI.
- Key success factors are reliable message detection, prompt context quality, tone consistency, and safe extension behavior.

## Developer Experience Notes
- The `.claude/` folder contains internal guidance for Claude-assisted development.
- The project uses TypeScript and React for frontend components.
- LLM prompt logic lives in `lib/llm/` and can be updated to change generation behavior.
- Database state is managed with Dexie in `lib/db/`.

## Useful Files for Deeper Understanding
- `.claude/claude.md` — main development guide and overview
- `.claude/skills/codebase-structure/SKILL.md` — file and component map
- `.claude/skills/architecture-flows/SKILL.md` — architecture and data flows
- `.claude/skills/common-tasks/SKILL.md` — common implementation tasks
- `lib/llm/prompt-builder.ts` — prompt assembly logic
- `entrypoints/content.ts` — Instagram detection and UI rendering
- `entrypoints/background.ts` — generation workflow and message routing

## Summary
Replier is a lightweight Instagram auto-reply extension powered by Claude and Gemini. It combines browser extension messaging, DOM detection, a local IndexedDB store, and layered AI prompts to automate replies while keeping conversation tone and context intact.