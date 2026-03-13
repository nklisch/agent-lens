# Using Bugscope with OpenAI Codex

Bugscope gives Codex runtime debugging via the CLI. Include the skill file in the system prompt so Codex knows the available commands.

## Installation

```bash
npm install -g bugscope
# or
npx bugscope doctor  # check without installing globally
```

## Setup: System Prompt

Include the bugscope skill file in the system prompt:

```bash
# Print the skill file content
bugscope skill
```

Copy the output into your Codex system prompt. This gives Codex the exact command syntax and debugging strategy.

Alternatively, add a shorter reference:

```
You have access to `bugscope` for runtime debugging. Available commands:
- bugscope launch "<command>" [-b file:line]  # start debug session
- bugscope continue / step over|into|out      # control execution
- bugscope eval "<expression>"                # inspect values
- bugscope vars [--scope local|global]        # list variables
- bugscope break <file:line> [when <cond>]    # set breakpoints
- bugscope stop                               # end session
```

## Example Workflow

System prompt includes the skill file. User says:

> The `calculate_discount` function returns wrong values for gold tier customers. Debug it.

Codex will:

1. `bugscope launch "python3 -m pytest tests/ -k test_gold" -b discount.py:42`
2. `bugscope continue`
3. `bugscope eval "tier"`
4. `bugscope eval "tier_multipliers['gold']"`
5. `bugscope step into`
6. Identify the bug and explain it

## Tips for Codex

- **Parallel tool use**: Codex can run multiple `bugscope` commands in parallel using bash. For example, evaluate multiple expressions simultaneously.
- **Context management**: The viewport output is compact by design. Each stop shows ~400 tokens of context including source, locals, and stack.
- **Session persistence**: Sessions are managed by a background daemon. Codex can start a session and continue working in multiple turns.
- **Multiple sessions**: Use `--session <id>` to target a specific session when multiple are active.

## Verifying Setup

```bash
bugscope doctor
```

This checks which language adapters are installed. Codex should run this first when debugging a project to understand what languages are supported.
