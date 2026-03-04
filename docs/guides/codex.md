# Using Agent Lens with OpenAI Codex

Agent Lens gives Codex runtime debugging via the CLI. Include the skill file in the system prompt so Codex knows the available commands.

## Installation

```bash
npm install -g agent-lens
# or
npx agent-lens doctor  # check without installing globally
```

## Setup: System Prompt

Include the agent-lens skill file in the system prompt:

```bash
# Print the skill file content
agent-lens skill
```

Copy the output into your Codex system prompt. This gives Codex the exact command syntax and debugging strategy.

Alternatively, add a shorter reference:

```
You have access to `agent-lens` for runtime debugging. Available commands:
- agent-lens launch "<command>" [-b file:line]  # start debug session
- agent-lens continue / step over|into|out      # control execution
- agent-lens eval "<expression>"                # inspect values
- agent-lens vars [--scope local|global]        # list variables
- agent-lens break <file:line> [when <cond>]    # set breakpoints
- agent-lens stop                               # end session
```

## Example Workflow

System prompt includes the skill file. User says:

> The `calculate_discount` function returns wrong values for gold tier customers. Debug it.

Codex will:

1. `agent-lens launch "python3 -m pytest tests/ -k test_gold" -b discount.py:42`
2. `agent-lens continue`
3. `agent-lens eval "tier"`
4. `agent-lens eval "tier_multipliers['gold']"`
5. `agent-lens step into`
6. Identify the bug and explain it

## Tips for Codex

- **Parallel tool use**: Codex can run multiple `agent-lens` commands in parallel using bash. For example, evaluate multiple expressions simultaneously.
- **Context management**: The viewport output is compact by design. Each stop shows ~400 tokens of context including source, locals, and stack.
- **Session persistence**: Sessions are managed by a background daemon. Codex can start a session and continue working in multiple turns.
- **Multiple sessions**: Use `--session <id>` to target a specific session when multiple are active.

## Verifying Setup

```bash
agent-lens doctor
```

This checks which language adapters are installed. Codex should run this first when debugging a project to understand what languages are supported.
