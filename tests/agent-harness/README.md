# Agent Harness

Evaluates AI agents on real debugging tasks. An agent is given a buggy program, access to agent-lens (or not), and must fix the bug. Pass/fail is determined by a hidden oracle test the agent never saw.

## Running

```bash
bun run test:agent                    # all agents × all scenarios × all modes
bun run test:agent:report             # generate report from latest trace run
```

Filter with env vars (combinable):

```bash
AGENT=claude-code bun run test:agent
SCENARIO=python-discount-bug bun run test:agent
RUN_MODE=mcp bun run test:agent
RUN_MODE=mcp,baseline bun run test:agent
TRACE_DIR=./results bun run test:agent
```

> This suite is NOT run in CI. It spawns real agent binaries and costs money.

## Modes

Each scenario runs in three modes to measure the value of agent-lens:

| Mode | What the agent gets |
|------|---------------------|
| `baseline` | Nothing — code reading, test output, bash only |
| `cli` | `agent-lens` CLI on PATH + skill file injected into context |
| `mcp` | agent-lens MCP server configured — full `debug_*` tool access |

## Scenarios

36 scenarios across three language suites:

| Suite | Count | Levels |
|-------|-------|--------|
| Python | 13 | 1–5 |
| Node.js | 11 | 1–5 |
| TypeScript | 12 | 1–5 |

Levels 1–2 are shallow bugs (wrong constant, off-by-one). Levels 3–5 are progressively harder: state bugs, async/closure issues, type-system traps, multi-file pipelines.

## Scenario Layout

```
scenarios/<name>/
  scenario.json      # metadata, test commands, timeout, budget
  prompt.md          # what the agent is told
  src/               # files copied into the agent's workspace
  hidden/            # oracle test copied in after the agent finishes
```

`scenario.json` fields:

```json
{
  "scenario": {
    "name": "python-discount-bug",
    "language": "python",
    "description": "...",
    "timeout_seconds": 180,
    "max_budget_usd": 0.5
  },
  "setup": { "commands": [] },
  "visible_test": { "command": "python3 -m pytest test_discount.py -x -q 2>&1" },
  "validation":   { "command": "python3 -m pytest test_validation.py -x -q 2>&1" }
}
```

- `visible_test` — the agent can run this to see failures; checked before and after the run
- `validation` — the hidden oracle; run after the agent finishes, using files from `hidden/`
- `setup.commands` — run inside the workspace before the agent starts (e.g. `npm install`)

## Traces

Results are saved under `.traces/<timestamp>/`:

```
.traces/<timestamp>/
  meta.json
  <agent>/
    <scenario>/
      <mode>/
        result.json          # structured pass/fail + metrics
        agent-stdout.txt
        agent-stderr.txt
        session.log
        workspace-diff.patch
```

`result.json` includes: pass/fail, duration, token usage, turn count, tool call counts, the git diff, and the agent's final summary.

## Report

```bash
bun run test:agent:report                        # latest trace dir → stdout (markdown)
bun run test:agent:report --dir .traces/2026-03  # specific run
bun run test:agent:report --format json          # JSON to stdout
bun run test:agent:report --out report.md        # write to file
```

The report also writes `report.json`, `report.md`, and updates `.traces/index.json` automatically.

## Agents

Drivers live in `drivers/`. Currently:

- `claude-code` — Claude Code CLI (`claude`)
- `codex` — OpenAI Codex CLI (stubbed, not yet enabled)

Add a new agent by implementing the `AgentDriver` interface in `lib/config.ts` and registering it in `lib/agents.ts`.

## Adding a Scenario

1. Create `scenarios/<name>/` with the layout above
2. Write a buggy `src/` program and a passing visible test
3. Write `hidden/test_validation.*` — a stricter test that only passes when the bug is fixed
4. Write `prompt.md` — tell the agent what's broken (symptoms, not the answer)
5. Write `scenario.json` — set a realistic timeout and budget

The harness copies `src/` into a fresh temp directory, git-inits it, runs setup commands, then hands control to the agent. After the agent exits, `hidden/` is copied in and the validation command is run.

## Diagnostics

If agent spawning is broken outside the harness:

```bash
bash tests/agent-harness/diagnose.sh
```

Run this from a terminal that is NOT inside a Claude Code session (the `CLAUDECODE` env var must be unset).
