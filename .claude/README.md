# `.claude` Development Reference

This folder contains Claude AI assistant development guides for the Replier codebase.

## Files

### `claude.md`
**Main entry point** — Start here for an overview of:
- Project architecture
- Folder structure
- Key concepts
- Which skill to read based on your task
- Decision trees for navigation

### `skills/`
Organized, focused guides for specific development needs.

#### `codebase-structure/SKILL.md`
**Use when:** Finding files, understanding folder layout, locating related modules

Contains:
- Complete folder structure with responsibilities
- File-by-file breakdown (purpose, exports, key functions)
- Database schema overview
- Which files to edit for common tasks
- Component dependency tree

#### `architecture-flows/SKILL.md`
**Use when:** Understanding how the system works, tracing data flow, debugging

Contains:
- System architecture diagram (ASCII art)
- Data flow walkthroughs:
  - Message reception → generation
  - User sending reply
  - History scraping
  - Summarization
- Component interactions
- Message deduplication strategy
- State machines

#### `common-tasks/SKILL.md`
**Use when:** Making specific changes, need copy-paste examples

Contains:
- 25+ common tasks with code examples
- Quick file locator table
- Before/after code diffs
- Debug commands
- Common patterns (messaging, DB queries)

---

## Quick Start

1. **First time?** Read `claude.md`
2. **Making a change?** Check `common-tasks/SKILL.md` for your task
3. **Need to understand something?** Read `architecture-flows/SKILL.md`
4. **Looking for a file?** Use `codebase-structure/SKILL.md`

---

## Integration with Claude

These skills are automatically discovered by Claude when working on this codebase. They:
- Prevent token waste on codebase exploration
- Provide direct code examples for common tasks
- Explain architecture and design decisions
- Serve as a living documentation system

---

## Updating This Documentation

When making architectural changes to the codebase:

1. Update relevant sections in the skills
2. Add new Common Tasks if you're doing something undocumented
3. Update architecture diagrams if component interactions change
4. Keep file locations synchronized with actual codebase

---

## YAML Frontmatter Format

Each SKILL.md file includes metadata:

```yaml
---
name: "Descriptive Name"
description: "What this skill covers and when to use it"
keywords: ["tag1", "tag2", "tag3"]
category: "Category Name"
---
```

This helps Claude's internal tools categorize and surface the right guidance.

---

## Structure Principles

- **One skill per concern**: Structure, Architecture, Tasks
- **Self-contained**: Each skill works independently
- **Searchable**: Keywords and clear headings
- **Actionable**: Code examples, not just theory
- **Maintained**: Updated with codebase changes

---

Last Updated: April 2026
