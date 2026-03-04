# Agent Lens — Debugging Skill

You have access to `agent-lens`, a CLI debugger. Use it when you need to
inspect runtime state to diagnose a bug — especially when static code
reading and test output aren't enough to identify the root cause.

## Quick start
  agent-lens launch "<command>" --break <file>:<line>
  agent-lens continue          # run to next breakpoint
  agent-lens step into|over|out
  agent-lens eval "<expr>"     # evaluate expression at current stop
  agent-lens vars              # show local variables
  agent-lens stop              # end session

## Conditional breakpoints
  agent-lens break "<file>:<line> when <condition>"

## All commands
  agent-lens launch "<cmd>" [--break <bp>] [--stop-on-entry] [--language <lang>]
  agent-lens stop [--session <id>]
  agent-lens status [--session <id>]
  agent-lens continue [--timeout <ms>]
  agent-lens step over|into|out [--count <n>]
  agent-lens run-to <file>:<line> [--timeout <ms>]
  agent-lens break <file>:<line>[,<line>,...] [when <cond>] [hit <cond>] [log '<msg>']
  agent-lens break --exceptions <filter>
  agent-lens break --clear <file>
  agent-lens breakpoints
  agent-lens eval "<expr>" [--frame <n>] [--depth <n>]
  agent-lens vars [--scope local|global|closure|all] [--filter "<regex>"]
  agent-lens stack [--frames <n>] [--source]
  agent-lens source <file>[:<start>-<end>]
  agent-lens watch "<expr>" ["<expr>" ...]
  agent-lens log [--detailed]
  agent-lens output [--stderr|--stdout] [--since-action <n>]
  agent-lens doctor

## Strategy
1. Start by setting a breakpoint where you expect the bug to manifest.
2. Inspect locals. Look for unexpected values.
3. If the bad value came from a function call, set a breakpoint inside
   that function and re-launch.
4. Use `agent-lens eval` to test hypotheses without modifying code.
5. Once you identify the root cause, stop the session and fix the code.

## Key rules
- Always call `agent-lens stop` when done to clean up.
- Prefer conditional breakpoints over stepping through loops.
- Each command prints a viewport showing source, locals, and stack.
- If a session times out (5 min default), re-launch.
