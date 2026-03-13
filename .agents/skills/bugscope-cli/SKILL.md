---
name: bugscope-cli
description: >
  Bugscope CLI reference. Load this skill when invoking the bugscope CLI (bugscope <command>).
  Covers all debug and browser subcommands, flags, breakpoint syntax, output modes, and workflows.
---

# Bugscope CLI Reference

The `bugscope` binary communicates with a background daemon over a Unix socket. Sessions persist between commands.

> **Language-specific setup:** Before launching a debug session, read the reference for your target language.
> - Python → `references/python.md`
> - Node.js / TypeScript → `references/node.md`
> - Go → `references/go.md`
> - Chrome / browser recording → `references/chrome.md`

---

## Global Flags

All session commands accept these:

| Flag | Short | Description |
|------|-------|-------------|
| `--session <id>` | `-s` | Target a specific session (required when multiple are active) |
| `--json` | | Raw JSON output |
| `--quiet` | | Viewport only — no banners or hints |

Auto-resolves session if exactly one is active. Errors if zero or multiple and `--session` is omitted.

---

## Debug Commands

### `bugscope launch "<command>"`
```sh
bugscope launch "python app.py"
bugscope launch "pytest tests/test_order.py -s" --break order.py:147
bugscope launch "node server.js" --stop-on-entry
bugscope launch "go run ./cmd/server"
bugscope launch --config-name "My Config"          # from .vscode/launch.json
```

Flags:
- `-b / --break <spec>` — initial breakpoint (see Breakpoint Syntax below)
- `--language <lang>` — override auto-detection
- `--framework <id>` — override framework detection, or `none`
- `--stop-on-entry` — pause on first executable line
- `--config <path>` — path to launch.json
- `-C / --config-name <name>` — configuration name from launch.json

### `bugscope attach --language <lang>`
```sh
bugscope attach --language python --port 5678
bugscope attach --language node --port 9229
bugscope attach --language go --pid 12345
```

### `bugscope stop`
Terminate the session and kill the process.

### `bugscope status`
Show current session state and viewport (source + locals + call stack).

---

## Execution Control

```sh
bugscope continue [--timeout <ms>]
bugscope step over
bugscope step into
bugscope step out
bugscope step over --count 5
bugscope run-to order.py:150
```

---

## Breakpoints

```sh
bugscope break order.py:147
bugscope break order.py:147,152,160
bugscope break "order.py:147 when discount < 0"
bugscope break "order.py:147 hit >=5"
bugscope break "order.py:147 log processed {count} items"
bugscope break --exceptions uncaught
bugscope break --clear order.py
bugscope breakpoints                    # list all
```

**Breakpoint spec:** `file:line[,line,...] [when <expr>] [hit <n>] [log <msg>]`

Exception filters: Python: `raised`, `uncaught`, `userUnhandled` · Node.js: `all`, `uncaught` · Go: `panic`

---

## State Inspection

```sh
bugscope vars                           # local scope
bugscope vars --scope global
bugscope vars --filter "^user" --frame 2
bugscope stack
bugscope stack --frames 5 --source
bugscope source order.py
bugscope source order.py:140-160
```

Evaluate an expression in the current frame:

```
bugscope eval "cart.total"
bugscope eval "order.total" --frame 1 --depth 3
```

---

## Session Intelligence

```sh
bugscope watch "order.total" "cart.item_count"
bugscope unwatch "cart.item_count"
bugscope log
bugscope log --detailed
bugscope output
bugscope output --stderr
bugscope output --since-action 3
bugscope threads
```

---

## Browser Commands (`bugscope browser <subcommand>`)

> See `references/chrome.md` for setup, CDP errors, and investigation patterns.

```sh
# Recording control
bugscope browser start --url http://localhost:3000 --profile bugscope
bugscope browser start --attach
bugscope browser status
bugscope browser mark "submitted form"
bugscope browser stop
bugscope browser stop --close-browser

# Session investigation
bugscope browser sessions
bugscope browser sessions --has-errors --limit 5
bugscope browser overview <id>
bugscope browser overview <id> --around-marker <marker-id>
bugscope browser search <id> --query "validation error"
bugscope browser search <id> --status-codes 422,500
bugscope browser inspect <id> --event <event-id>
bugscope browser inspect <id> --marker <marker-id>
bugscope browser diff <id> --before <ts> --after <ts>
bugscope browser replay-context <id> --format reproduction_steps
bugscope browser replay-context <id> --format test_scaffold --framework playwright
bugscope browser export <id> --format har --output session.har
```

---

## Diagnostics

```sh
bugscope doctor   # check prerequisites and adapter health
bugscope skill    # print the skill file
```

---

## Output Modes

| Mode | Flag | Content |
|------|------|---------|
| Default | — | Formatted viewport: source + locals + call stack |
| JSON | `--json` | Raw JSON payload |
| Quiet | `--quiet` | Viewport text only, no banners |

---

## Common Workflows

### Debug with a breakpoint
```sh
bugscope launch "python order.py" --break order.py:147
bugscope vars
bugscope step over
bugscope continue
bugscope stop
```

### Debug a test
```sh
bugscope launch "pytest tests/test_order.py::test_discount -s"
bugscope continue
bugscope vars --scope local
bugscope step into
```

### Record a browser flow
```sh
bugscope browser start --url http://localhost:3000 --profile bugscope
# interact in browser
bugscope browser mark "submitted form"
bugscope browser stop
bugscope browser sessions
bugscope browser overview <id>
bugscope browser search <id> --status-codes 422,500
```
