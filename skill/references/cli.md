# CLI Command Reference

All commands follow the pattern: `bugscope <command> [options]`

## Session management

```
bugscope launch "<cmd>" [--break <bp>] [--stop-on-entry] [--language <lang>]
bugscope stop [--session <id>]
bugscope status [--session <id>]
```

## Execution control

```
bugscope continue [--timeout <ms>]
bugscope step over|into|out [--count <n>]
bugscope run-to <file>:<line> [--timeout <ms>]
```

## Breakpoints

```
bugscope break <file>:<line>[,<line>,...] [when <cond>] [hit <cond>] [log '<msg>']
bugscope break --exceptions <filter>
bugscope break --clear <file>
bugscope breakpoints
```

### Conditional breakpoint examples

```
bugscope break "cart.py:42 when discount < 0"
bugscope break "loop.py:10 hit >=100"
bugscope break "app.py:30 log 'total={total}, items={len(items)}'"
```

## Inspection

```
bugscope eval "<expr>" [--frame <n>] [--depth <n>]
bugscope vars [--scope local|global|closure|all] [--filter "<regex>"]
bugscope stack [--frames <n>] [--source]
bugscope source <file>[:<start>-<end>]
bugscope watch "<expr>" ["<expr>" ...]
```

## Session history and output

```
bugscope log [--detailed]
bugscope output [--stderr|--stdout] [--since-action <n>]
```

## Diagnostics

```
bugscope doctor
```
