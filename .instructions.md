---
name: Replier Development
instructions: |
  You are working on the Replier browser extension codebase.

  ## Quick Reference

  When working on this codebase, consult the Claude development skills:

  1. **Finding files** → `.claude/skills/codebase-structure/SKILL.md`
  2. **Understanding architecture** → `.claude/skills/architecture-flows/SKILL.md`
  3. **Making changes** → `.claude/skills/common-tasks/SKILL.md`

  Or read the main guide: `.claude/claude.md`

  ## Key Context

  - **Project**: Replier - Instagram DM auto-reply extension using AI
  - **Tech Stack**: WXT + React + Dexie + TypeScript
  - **LLM Providers**: Claude (primary), Gemini (fallback)
  - **Core Concepts**:
    - Auto-pilot generation (replies when contacts message)
    - Smart conversation memory (StructuredSummary)
    - Message deduplication (3-layer strategy)
    - Token-aware prompting (6-layer system prompts)

  ## File Location Quick Finder

  | Task | Files |
  |------|-------|
  | Modify LLM behavior | `lib/llm/{claude,gemini,prompt-builder}.ts` |
  | Change system prompt | `lib/llm/prompt-builder.ts` layers |
  | Add tone type | `types/contact.ts` + `lib/llm/tones.ts` |
  | Add message handler | `lib/messaging/types.ts` + `background.ts` |
  | Update selectors | `lib/platforms/instagram/selectors.ts` |
  | Fix contact detection | `content.ts::detectAndSetContact()` |
  | Add database field | `types/**` + `lib/db/index.ts` + `lib/db/**` |
  | Modify popover UI | `components/StatusPopover.tsx` |
  | Generation logic | `lib/pipeline/generator.ts` |

  ## Development Commands

  ```bash
  npm run build          # Build extension
  npm run dev            # Watch mode
  npm run type-check     # TypeScript check
  ```

  ## Common Patterns

  **Browser Messaging:**
  ```ts
  // Content → Background
  await browser.runtime.sendMessage({
    type: 'MESSAGE_TYPE', data: value
  } satisfies ExtensionMessage);

  // Background → Content
  browser.tabs.sendMessage(tabId, { type: '...', ... });
  ```

  **Database Queries:**
  ```ts
  const db = (await import('@/lib/db')).default;
  const contact = await db.contacts.get(id);
  const messages = await db.messages.where('contactId')
    .equals(contactId).reverse().limit(100).toArray();
  ```

---
