---
name: "Replier Architecture & Data Flows"
description: "Visual system architecture diagrams and data flow walkthroughs. Use when understanding how components communicate, tracing execution paths, or debugging message routing."
keywords: ["architecture diagram", "data flow", "system design", "component interaction", "message routing"]
category: "System Architecture"
---

# Replier Architecture & Data Flows

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Instagram.com (Facebook)                 │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  DOM: Message bubbles, Input box, Contact header       │ │
│  │  Network: /api/v1/direct_v2/, /graphql                │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│              BROWSER EXTENSION (Replier)                     │
│                                                              │
│  MAIN-WORLD SCRIPT                                          │
│  ├─ instagram-interceptor.ts                               │
│  │  ├─ Patches window.fetch & XHR                          │
│  │  ├─ Emits replier:api-response events                   │
│  │  └─ Emits replier:ls-messages events                    │
│                                                              │
│  ISOLATED-WORLD SCRIPTS                                    │
│  ├─────────────────────────────────────────────────────┐   │
│  │ CONTENT SCRIPT (content.ts)                        │   │
│  │ ├─ Detects current contact                        │   │
│  │ ├─ Observes new DOM messages                      │   │
│  │ ├─ Triggers scraping (visible + history)          │   │
│  │ ├─ Renders StatusPopover (React)                  │   │
│  │ ├─ Listens for background messages                │   │
│  │ └─ Handles user interactions                      │   │
│  └─────────────────────────────────────────────────────┘   │
│         ↕ (messages via browser.runtime.sendMessage)       │
│  ├─────────────────────────────────────────────────────┐   │
│  │ BACKGROUND SERVICE WORKER (background.ts)         │   │
│  │ ├─ Message Router (handleMessage)                 │   │
│  │ ├─ Generation Queue Processor                     │   │
│  │ └─ Reply management & storage                     │   │
│  └─────────────────────────────────────────────────────┘   │
│         ↕                                                   │
│  ├─────────────────────────────────────────────────────┐   │
│  │ SIDE PANEL UI (sidepanel/App.tsx)                  │   │
│  │ ├─ Dashboard                                       │   │
│  │ ├─ ContactEditor                                  │   │
│  │ ├─ ConversationView                               │   │
│  │ └─ Settings                                        │   │
│  └─────────────────────────────────────────────────────┘   │
│         ↕                                                   │
│    Chrome Storage & IndexedDB (Dexie)                      │
│                                                              │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│            CORE BUSINESS LOGIC (lib/)                        │
├──────────────────────────────────────────────────────────────┤
│ DATABASE: contacts, messages, pendingReplies                │
│ PIPELINE: generation queue → LLM calls → reply storage      │
│ LLM: Claude/Gemini providers with prompt builders           │
│ PLATFORMS: Instagram adapter with DOM selectors              │
└──────────────────────────────────────────────────────────────┘
```

---

## Message Reception → Generation Flow

```
1. User on Instagram receives: "hey!"
                ↓
2. [instagram-interceptor.ts] Intercepts API response
                ↓
3. [content.ts::observeNewMessages] Detects new DOM bubble
                ↓
4. [content.ts::processNewMessage] Extracts message data
                ↓
5. browser.runtime.sendMessage({
     type: 'NEW_MESSAGE',
     contactId, message
   })
                ↓
6. [background.ts::handleMessage] Routes to NEW_MESSAGE handler
                ↓
7. storeMessage(contactId, message)  // Save to DB
                ↓
8. Check: lastSender == 'contact' && isActive == true?
                ↓ YES
9. generationQueue.enqueue({
     contactId, triggerMessageId, tone, freshStart
   })
                ↓
10. Queue processor calls generateReply()
                ↓
11. [generator.ts::generateReply]
    ├─ Load recent messages (max 80)
    ├─ buildContext() → system prompt + history
    ├─ Call LLM provider (Claude/Gemini)
    ├─ Clean HTML artifacts
    └─ Store in pendingReply DB
                ↓
12. browser.tabs.sendMessage({
      type: 'REPLY_READY',
      contactId, text, replyId, tone
    })
                ↓
13. [content.ts::browser.runtime.onMessage]
    Receives REPLY_READY event
                ↓
14. setStatus('ready', { text, id, tone })
                ↓
15. [StatusPopover] Re-renders with reply text
                ↓
16. User sees reply and clicks "Send"
```

---

## User Sends Reply Flow

```
1. User clicks "Send" button in StatusPopover
                ↓
2. onSend(replyText, replyId)
                ↓
3. [adapter.ts] insertTextIntoInput(replyText)
   └─ Uses execCommand('insertText') on Lexical editor
                ↓
4. [adapter.ts] triggerSend()
   └─ Simulates Enter key press
                ↓
5. Instagram's send handler fires
                ↓
6. (Small delay ~ 100ms)
                ↓
7. browser.runtime.sendMessage({
     type: 'ACCEPT_REPLY',
     replyId, editedText
   })
                ↓
8. [background.ts::handleMessage ACCEPT_REPLY]
   ├─ acceptReply(replyId, editedText)
   ├─ **CRITICAL**: storeMessage(contactId, editedText)
   │  └─ Save user's sent message for next generation!
   ├─ updateReplyText()
   └─ Discard pending reply
                ↓
9. [content.ts] receives discard notification
                ↓
10. setStatus('idle')
                ↓
11. StatusPopover returns to "idle" state
```

**⚠️ CRITICAL NOTE**: Step 8.3 is essential — the sent message MUST be stored in the messages DB so the LLM has it as context for the next reply generation!

---

## History Scraping Flow

```
1. Contact detected via detectAndSetContact()
                ↓
2. Get contact from DB:
   - Check historyScrubbed field
   - If false → needs scraping
                ↓
3. ctx.setTimeout(startAutoScrape, 2000)
                ↓
4. [content.ts::startAutoScrape]
   ├─ Create AbortController
   ├─ Mount ScrapeOverlay UI
   └─ Begin scraping loop
                ↓
5. Load visible messages:
   [adapter.ts] extractMessages(container)
   └─ DOM parsing → ExtractedMessage[]
                ↓
6. storeMessagesDeduped(contactId, messages)
   ├─ Check existingMessages
   ├─ Dedupe by: `sender:content.slice(0,60)`
   ├─ Dedupe by: deterministic ID matching
   └─ Return newCount
                ↓
7. reconcileMessages(contactId, scrapedMessages)
   ├─ Compare DB messages vs DOM
   ├─ Mark ghost messages: verified = false
   │  (sent but deleted, or generated but unsent)
   └─ Return verified/unverified counts
                ↓
8. ScrapeOverlay.update(scrapedMessageCount)
                ↓
9. Loop: scroll up → extract → store → repeat
   └─ Stop when no new messages for 3 scrolls
                ↓
10. Final DOM extraction (message container)
                ↓
11. browser.runtime.sendMessage({
      type: 'SCRAPE_COMPLETE',
      contactId, totalMessages: scrapedMessageCount
    })
                ↓
12. [background.ts::handleMessage SCRAPE_COMPLETE]
    ├─ updateScrubStatus(contactId, totalMessages)
    │  ├─ historyScrubbed = true
    │  └─ historyScrubCount = totalMessages
    ├─ Check if totalMessages >= 10
    └─ If yes: forceSummarize(contactId) in background
                ↓
13. ScrapeOverlay shows "Done! X messages captured"
                ↓
14. Auto-dismisses after ~3500ms
```

---

## Summarization Flow

```
1. forceSummarize(contactId) triggered
   (from SCRAPE_COMPLETE or manual)
                ↓
2. Load recent 200 messages
                ↓
3. analyzeConversation(messages)
   ├─ Local stats: topics, emoji rates, initiator
   ├─ Response gap analysis
   ├─ Top words extraction
   └─ Returns ConversationStats
                ↓
4. formatMessagesForSummary()
   └─ Group messages by sender
                ↓
5. buildStatsContext(stats)
   └─ Create analytics summary for LLM
                ↓
6. Call LLM with custom summarization prompt
   ├─ System: "You are maintaining a conversation summary"
   ├─ Include: stats context
   └─ Messages: formatted conversation
                ↓
7. LLM returns: rawSummary (raw text)
                ↓
8. buildStructuredSummary(rawSummary, stats)
   ├─ Parse into: keyTopics, insideJokes, dynamics
   ├─ Extract: communicationStyle
   ├─ Build: StructuredSummary object
   └─ Keep rawSummary for fallback
                ↓
9. Save both:
   ├─ contact.conversationSummary = rawText
   └─ contact.structuredSummary = structured
                ↓
10. Next generation uses this in buildMessageHistory()
                ↓
11. Popover context panel shows:
    ├─ keyTopics
    ├─ insideJokes
    ├─ emotionalDynamics
    └─ communicationStyle (emoji usage, message length)
```

---

## Message Deduplication Strategy

```
PROBLEM: Overlapping API interception + DOM scraping = duplicate messages

SOLUTION: Multi-layered dedup

1. CONTENT-BASED DEDUP (storeMessagesDeduped)
   ├─ Build fingerprint: `sender:content.slice(0,60)`
   ├─ Check all existing messages
   ├─ Skip if fingerprint exists (same sender, same content)
   └─ Result: Eliminates repeated content

2. ID-BASED DEDUP (deterministic hashing)
   ├─ DOM-extracted messages: id = dom-{hash(content+sender)}
   ├─ Same message in next scrape = same hash = same ID
   ├─ Dexie checks ID uniqueness
   └─ Result: Deterministic dedup across scrapes

3. GHOST MESSAGE DETECTION (reconcileMessages)
   ├─ After scraping, compare DB vs DOM
   ├─ If sent-* ID not in DOM → marked verified=false
   ├─ Reason: User deleted or generation failed
   └─ Result: Filtered out from future LLM context

FLOW:
  API response → extractedMessages
       ↓
  storeMessagesDeduped()
       ├─ Remove by content fingerprint
       ├─ Store new → DB
       └─ Return newCount
       ↓
  Later: reconcileMessages()
       ├─ Mark unverified
       └─ Update DB
```

---

## Component Dependency Tree

```
background.ts (service worker)
├─ generationQueue
├─ generationPipeline
│  ├─ generator.ts
│  │  ├─ context-builder.ts
│  │  │  └─ lib/llm/prompt-builder.ts
│  │  │     ├─ lib/llm/tones.ts
│  │  │     └─ lib/pipeline/analyzer.ts
│  │  ├─ lib/llm/{claude,gemini}.ts
│  │  └─ summarizer.ts
│  │     └─ analyzer.ts
├─ lib/db/{contacts,messages,replies}.ts
└─ browser.tabs.sendMessage()

content.ts (content script)
├─ adapter (InstagramAdapter)
├─ StatusPopover.tsx
│  ├─ ToneSelector.tsx
│  └─ ContactToast.tsx
├─ ScrapeOverlay.tsx
└─ browser.runtime.sendMessage()

sidepanel/App.tsx (side panel)
├─ Dashboard.tsx
├─ ContactEditor.tsx
├─ ConversationView.tsx
└─ Settings.tsx
```

---

## Critical Decision Points

| Decision | Where | If YES | If NO |
|----------|-------|--------|-------|
| Auto-generate? | `content.ts::resolveContactStatus()` | Pre-fill popover with reply | Wait for manual button click |
| Use custom prompt? | `context-builder.ts::buildContext()` | Replace entire system prompt | Use auto-generated 6-layer |
| Fresh-start mode? | `generateReply(freshStart=true)` | Send ZERO history to LLM | Send last 80 messages |
| Scrape history? | `content.ts` (check historyScrubbed) | Auto trigger scrape loop | Skip scraping |
| Summarize? | `generator.ts`, `summarizer.ts` | Threshold check: messages >= 5 | Skip summarization |
| Mark verified? | `reconcileMessages()` | Keep in LLM context | Filter out (ghost) |

---

## State Machine: Contact Status

```
┌──────────────┐
│     IDLE     │ (waiting for message)
└──────┬───────┘
       │ [Contact messages]
       ↓
┌──────────────────────┐
│   LAST_FROM_CONTACT  │ (ready to reply)
└──────┬───────────────┘
       │ [isActive=true?]
       ├─ YES → GENERATING
       └─ NO → IDLE (contact inactive)
           │
           ├─ [Manual: Generate Now] → GENERATING
           └─ [Manual: Start Fresh] → GENERATING
       ↓
┌──────────────────────┐
│   GENERATING         │ (LLM processing)
└──────┬───────────────┘
       │
       ├─ [Success] → READY
       └─ [Error] → ERROR
           │
       ↓
┌──────────────────────┐
│      READY           │ (reply shown in popover)
└──────┬───────────────┘
       │
       ├─ [Send] → IDLE (message inserted & sent)
       ├─ [Redo] → GENERATING (regenerate)
       ├─ [Tone Change] → GENERATING
       └─ [Dismiss] → IDLE (discard reply)
```
