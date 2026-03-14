---
name: krometrail
description: Runtime debugging and browser observation for AI agents. Use when a test fails and reading the code isn't enough, when you need to inspect runtime values, or when the user has recorded a browser session with markers for you to investigate. Gives you a live debugger (breakpoints, stepping, variable inspection) across 10 languages, plus full browser session recording (network, console, DOM, framework state, screenshots) that you can search, inspect, and diff.
license: MIT
compatibility: Requires debugger binaries for the target language (e.g., debugpy for Python, dlv for Go). Chrome/Chromium for browser observation. Works with any MCP-compatible agent or via CLI.
metadata:
  author: krometrail
  version: "0.1"
allowed-tools: Bash(krometrail:*)
---

# Krometrail — Runtime Debugging & Browser Observation

Use krometrail when you need to inspect runtime state to diagnose a bug, or when the user has recorded a browser session for you to investigate.

## When to use

**Runtime debugging:**
- A test fails but the code looks correct — inspect runtime values at the failure point
- You suspect a wrong calculation or off-by-one — set a breakpoint and check locals
- A function returns an unexpected value — step into it and trace the data flow
- An exception occurs deep in a call chain — break on exceptions to see the exact state

**Browser observation:**
- The user reproduced a bug in the browser and dropped markers — investigate the session
- A web app has network errors, console errors, or unexpected behavior — search and inspect the recording
- You need to understand what happened in the browser at a specific moment — use inspect and diff

## MCP tools

If krometrail is registered as an MCP server, use these tools directly:

| Tool | Purpose |
|------|---------|
| `debug_launch` | Start a debug session with initial breakpoints |
| `debug_stop` | End a session — **always call when done** |
| `debug_continue` | Resume to next breakpoint or program end |
| `debug_step` | Step `over`, `into`, or `out` |
| `debug_run_to` | Run to a specific file:line |
| `debug_set_breakpoints` | Set/replace breakpoints in a file (supports conditions, logpoints) |
| `debug_set_exception_breakpoints` | Break on exceptions |
| `debug_evaluate` | Evaluate an expression in the stopped context |
| `debug_variables` | Show variables (local, global, closure) |
| `debug_stack_trace` | Show the call stack |
| `debug_source` | Read source with line numbers |
| `debug_watch` | Add watch expressions — shown in every viewport |
| `debug_action_log` | Review investigation history |
| `debug_output` | Get stdout/stderr from the target |
| `debug_attach` | Attach to a running process |
| `debug_threads` | List threads (goroutines, Python threads) |

### Example: find a wrong discount value

```
debug_launch({
  command: "python3 -m pytest test_discount.py -x",
  breakpoints: [{ file: "discount.py", breakpoints: [{ line: 12 }] }]
})
# → viewport shows source, locals, and stack at line 12

debug_evaluate({ session_id: "...", expression: "rate" })
# → rate = 1.0  (should be 0.1!)

debug_stop({ session_id: "..." })
# Fix the bug with confidence
```

## Browser observation tools (MCP)

| Tool | Purpose |
|------|---------|
| `chrome_start` | Launch Chrome and start recording (network, console, DOM, framework state) |
| `chrome_status` | Check recording state |
| `chrome_mark` | Place a named marker at the current moment |
| `chrome_stop` | Stop recording — session is saved for investigation |
| `session_list` | List recorded sessions (filter by errors, URL, etc.) |
| `session_overview` | Structured overview of a session — event counts, markers, errors |
| `session_search` | Search events by text, status codes, event types, framework patterns |
| `session_inspect` | Deep-dive into a specific event, marker, or timestamp |
| `session_diff` | Compare two moments in a session (before/after a marker) |
| `session_replay_context` | Generate reproduction steps or test scaffolds (Playwright, Cypress) |

### Example: investigate a user-reported browser bug

The user reproduced the bug and placed markers. You investigate:

```
session_list({ has_errors: true })
# → Shows sessions with errors

session_overview({ session_id: "abc123", around_marker: "checkout broke" })
# → Network errors, console errors, framework state around the marker

session_search({ session_id: "abc123", status_codes: [500], query: "payment" })
# → POST /api/orders → 500, response body with error details

session_inspect({ session_id: "abc123", event_id: "evt_42" })
# → Full request/response headers, body, timing

session_diff({ session_id: "abc123", from: "marker:form loaded", to: "marker:checkout broke" })
# → What changed: new network errors, state mutations, console errors
```

## CLI commands

If using krometrail via CLI:

**Debugging:**
```bash
krometrail launch "python3 -m pytest test_discount.py -x" --break discount.py:12
krometrail eval "rate"
krometrail vars
krometrail step over
krometrail continue
krometrail stop
```

**Browser:**
```bash
krometrail browser start --url http://localhost:3000 --profile krometrail
krometrail browser mark "submitted form"
krometrail browser stop
krometrail browser sessions --has-errors
krometrail browser overview <session-id>
krometrail browser search <session-id> --status-codes 500
krometrail browser inspect <session-id> --event <event-id>
krometrail browser diff <session-id> --before <ts> --after <ts>
```

See [references/cli.md](references/cli.md) for the full command reference and [references/chrome.md](references/chrome.md) for browser-specific details.

## Language support

Each language has specific setup requirements and features. See the reference for your target language:

- [Python](references/python.md) — debugpy, pytest/Flask/Django auto-detection
- [JavaScript / TypeScript](references/javascript.md) — js-debug, Jest/Mocha, attach via `--inspect`
- [Go](references/go.md) — Delve, go run/test/exec modes, goroutine threads
- [Rust](references/rust.md) — CodeLLDB, cargo run/test, auto-build
- [C/C++](references/cpp.md) — GDB v14+ / LLDB, auto-compile source files
- [Java](references/java.md) — java-debug-adapter, JDWP attach

## Debugging servers and services

For HTTP servers (Flask, Express, Go net/http, etc.), `debug_launch` starts the server and returns immediately — it does NOT block waiting for a breakpoint. Use this workflow:

1. **Launch the server under the debugger with breakpoints set**
2. **Send HTTP requests via Bash** (curl, wget, etc.) to trigger the code path
3. **Call `debug_continue`** — it will catch the breakpoint hit and return the viewport

### Example: debug a Flask pricing endpoint

```
debug_launch({
  command: "python app.py",
  breakpoints: [{ file: "pricing.py", breakpoints: [{ line: 45 }] }]
})
# → Session started, status: running (server is listening)

# Send a request to trigger the breakpoint — use Bash tool:
# curl -X POST http://localhost:5001/price -H 'Content-Type: application/json' -d '{"item": "ABC", "qty": 5}'

debug_continue({ session_id: "..." })
# → Viewport shows source, locals, and stack at line 45

debug_variables({ session_id: "..." })
# → Inspect the request data and computed values

debug_stop({ session_id: "..." })
```

### Tips for multi-service architectures

- Debug **one service at a time** — launch it under the debugger while running the others normally
- Write a small script that calls the function directly, or that sends HTTP requests to the running service to trigger the code path you want to debug
- Use `debug_evaluate` to test corrected expressions before editing code

## Debugging strategy

1. **Start with a hypothesis.** Read the failing test and code. Form a theory about what's wrong.
2. **Set a breakpoint at the decision point.** Where does the code choose the path that leads to the wrong result?
3. **Inspect locals.** Look for values that don't match expectations.
4. **Trace upstream.** If a variable has the wrong value, where did it come from? Set a breakpoint there and re-launch.
5. **Use `eval` to test fixes.** Evaluate corrected expressions before modifying code.
6. **Stop the session and apply the fix.**

### Tips

- Prefer conditional breakpoints over stepping through loops: `{ line: 42, condition: "i == 99" }`
- Use `debug_watch` to track key expressions across multiple stops
- Use `debug_action_log` to review what you've already checked
- Each action returns a viewport — source context, locals, stack, and watches — in one view
- Sessions auto-expire after 5 minutes of inactivity
- **Always call `debug_stop` when finished** to clean up debugger processes
