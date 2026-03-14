# CLI Command Reference

All commands follow the pattern: `krometrail <command> [options]`

## Session management

```
krometrail launch "<cmd>" [--break <bp>] [--stop-on-entry] [--language <lang>]
krometrail attach --language <lang> [--port <n>] [--pid <n>]
krometrail stop [--session <id>]
krometrail status [--session <id>]
```

## Execution control

```
krometrail continue [--timeout <ms>]
krometrail step over|into|out [--count <n>]
krometrail run-to <file>:<line> [--timeout <ms>]
```

## Breakpoints

```
krometrail break <file>:<line>[,<line>,...] [when <cond>] [hit <cond>] [log '<msg>']
krometrail break --exceptions <filter>
krometrail break --clear <file>
krometrail breakpoints
```

### Conditional breakpoint examples

```
krometrail break "cart.py:42 when discount < 0"
krometrail break "loop.py:10 hit >=100"
krometrail break "app.py:30 log 'total={total}, items={len(items)}'"
```

## Inspection

```
krometrail eval "<expr>" [--frame <n>] [--depth <n>]
krometrail vars [--scope local|global|closure|all] [--filter "<regex>"]
krometrail stack [--frames <n>] [--source]
krometrail source <file>[:<start>-<end>]
krometrail watch "<expr>" ["<expr>" ...]
krometrail unwatch "<expr>"
```

## Session history and output

```
krometrail log [--detailed]
krometrail output [--stderr|--stdout] [--since-action <n>]
krometrail threads
```

## Browser recording

```
krometrail browser start --url <url> [--profile krometrail] [--framework-state]
krometrail browser start --attach
krometrail browser mark "<description>"
krometrail browser status
krometrail browser stop [--close-browser]
```

## Browser session investigation

```
krometrail browser sessions [--has-errors] [--limit <n>]
krometrail browser overview <session-id> [--around-marker <marker-id>]
krometrail browser search <session-id> --query "<text>" [--status-codes <codes>] [--event-types <types>]
krometrail browser inspect <session-id> --event <event-id>
krometrail browser inspect <session-id> --marker <marker-id>
krometrail browser diff <session-id> --before <ts> --after <ts>
krometrail browser diff <session-id> --from-marker "<name>" --to-marker "<name>"
krometrail browser replay-context <session-id> [--format reproduction_steps|playwright|cypress]
krometrail browser export <session-id> --format har --output <file>
```

## Diagnostics

```
krometrail doctor
```
