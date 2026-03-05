# CLI Command Reference

All commands follow the pattern: `agent-lens <command> [options]`

## Session management

```
agent-lens launch "<cmd>" [--break <bp>] [--stop-on-entry] [--language <lang>]
agent-lens stop [--session <id>]
agent-lens status [--session <id>]
```

## Execution control

```
agent-lens continue [--timeout <ms>]
agent-lens step over|into|out [--count <n>]
agent-lens run-to <file>:<line> [--timeout <ms>]
```

## Breakpoints

```
agent-lens break <file>:<line>[,<line>,...] [when <cond>] [hit <cond>] [log '<msg>']
agent-lens break --exceptions <filter>
agent-lens break --clear <file>
agent-lens breakpoints
```

### Conditional breakpoint examples

```
agent-lens break "cart.py:42 when discount < 0"
agent-lens break "loop.py:10 hit >=100"
agent-lens break "app.py:30 log 'total={total}, items={len(items)}'"
```

## Inspection

```
agent-lens eval "<expr>" [--frame <n>] [--depth <n>]
agent-lens vars [--scope local|global|closure|all] [--filter "<regex>"]
agent-lens stack [--frames <n>] [--source]
agent-lens source <file>[:<start>-<end>]
agent-lens watch "<expr>" ["<expr>" ...]
```

## Session history and output

```
agent-lens log [--detailed]
agent-lens output [--stderr|--stdout] [--since-action <n>]
```

## Diagnostics

```
agent-lens doctor
```
