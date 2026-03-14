---
title: Browser Observation Overview
description: What browser observation captures, why it matters for AI agents, and how to get started.
---

# Browser Observation

Krometrail connects to Chrome via CDP and records everything happening in a browser session — without requiring any changes to the application code.

## Why It Matters

When you're debugging a web app, you can see the bug happen — a spinner that never stops, a form that silently fails, a page that loads wrong data. But when you hand the problem to your coding agent, all it has is source code and maybe an error message.

Browser observation bridges that gap. You browse your app normally, drop markers when something goes wrong, and your agent gets a complete session transcript — network requests, console errors, framework state, screenshots — everything it needs to investigate without you describing the bug in chat.

## What Gets Captured

| Category | Details |
|----------|---------|
| **Network** | Every request/response with headers, bodies, status codes, timing, and WebSocket frames |
| **Console** | All console output with levels, arguments, and stack traces |
| **DOM mutations** | Structural changes: forms, dialogs, sections — not every attribute tweak |
| **User input** | Clicks, form submissions, field changes |
| **Screenshots** | Periodic snapshots and navigation-triggered captures |
| **Storage** | localStorage/sessionStorage mutations and cross-tab events |
| **Framework state** | React and Vue component lifecycles, state/prop diffs, store mutations |
| **Framework errors** | Auto-detected anti-patterns (stale closures, infinite re-renders, missing cleanup) |

## How It Works

1. Krometrail launches (or connects to) a Chrome instance via CDP
2. A recording session captures events into a SQLite-backed store
3. The agent investigates the recorded session using search, inspect, and diff tools
4. Framework state (if enabled) is captured via injected DevTools hook scripts that fire before any page code runs

## Typical Workflow

1. **You** start a recording session (via your agent or CLI)
2. **You** use the app in Chrome — click around, fill forms, reproduce the bug
3. **You** drop markers at key moments ("form submitted", "page broke")
4. **Your agent** searches the recorded session, inspects events, diffs state changes, and traces the bug to source code

The agent accesses the session data through MCP tools (`chrome_start`, `session_search`, `session_inspect`, `session_diff`) or equivalent CLI commands.

## Next Steps

- [Recording Sessions](./recording-sessions) — `chrome_start`, `chrome_stop`, markers, tab filtering
- [Search](./investigation-tools/search) — Full-text and structured event search
- [Inspect](./investigation-tools/inspect) — Deep-dive into individual events
- [Diff](./investigation-tools/diff) — Compare two moments in a session
- [React Observation](./framework-observation/react) — Component lifecycles and bug patterns
- [Vue Observation](./framework-observation/vue) — Vue 2/3, Pinia, and Vuex
