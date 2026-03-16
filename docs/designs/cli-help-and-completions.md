# Design: CLI Help on No-Args & Shell Completion Installation

## Overview

Two improvements to the krometrail CLI:

1. **No-args shows help**: Running `krometrail` with no arguments currently produces no output and exits 0. It should display the same help as `--help`.
2. **Shell completions**: Add a `krometrail completions <shell>` subcommand that outputs completion scripts for bash, zsh, and fish.

## Root Cause: No-Args Silence

Citty's `runCommand` (line 186 of `node_modules/citty/dist/index.mjs`) only throws `E_NO_COMMAND` when `!cmd.run`. Since our main command has a `run()` handler (for `--mcp`), citty calls `run()` which does nothing when `--mcp` is false. The comment in `src/cli/index.ts:36` ("citty shows help by default") is incorrect.

---

## Implementation Units

### Unit 1: Show Help on No-Args

**File**: `src/cli/index.ts`

```typescript
import { defineCommand, runMain, showUsage } from "citty";
// ... existing imports ...

const main = defineCommand({
	meta: {
		name: "krometrail",
		version: pkg.version,
		description: "Runtime debugging viewport for AI coding agents",
	},
	args: {
		mcp: {
			type: "boolean",
			description: "Start as an MCP server on stdio instead of running the CLI",
			default: false,
		},
		tools: {
			type: "string",
			description: "Comma-separated tool groups to expose (debug, browser). Default: all. Only used with --mcp.",
		},
	},
	async run({ args, cmd }) {
		if (args.mcp) {
			sendPing("mcp_start");
			const { startMcpServer } = await import("../mcp/index.js");
			const { parseToolGroups } = await import("../mcp/tool-groups.js");
			await startMcpServer({ toolGroups: parseToolGroups(args.tools) });
			return;
		}
		sendPing("run");
		await showUsage(cmd);
	},
	subCommands: {
		debug: debugCommand,
		browser: browserCommand,
		doctor: doctorCommand,
		commands: commandsCommand,
		completions: () => import("./commands/completions.js").then((m) => m.completionsCommand),
		_daemon: () =>
			defineCommand({
				meta: { hidden: true },
				async run() {
					await import("../daemon/entry.js");
				},
			}),
	},
});

runMain(main);
```

**Implementation Notes**:
- Import `showUsage` from citty
- Call `await showUsage(cmd)` in the `run()` handler when `--mcp` is not set, instead of doing nothing
- The `cmd` parameter is available from the `CommandContext` passed to `run()`
- Add `completions` to the `subCommands` map with lazy import (same pattern as `_daemon`)
- Remove the incorrect comment about citty showing help by default

**Acceptance Criteria**:
- [ ] `krometrail` (no args) outputs the same help text as `krometrail --help`
- [ ] `krometrail` (no args) exits with code 0
- [ ] `krometrail --mcp` still starts the MCP server (no regression)
- [ ] `krometrail --help` still works (no regression)
- [ ] `completions` appears in help output under COMMANDS

---

### Unit 2: Completion Script Generator

**File**: `src/cli/commands/completions.ts`

```typescript
import { defineCommand } from "citty";
import { buildCommandInventory, type CommandsData, type CommandInfo } from "./commands.js";

export const completionsCommand: ReturnType<typeof defineCommand>;

/**
 * Generate a bash completion script from the command inventory.
 */
function generateBashCompletions(inventory: CommandsData): string;

/**
 * Generate a zsh completion script from the command inventory.
 */
function generateZshCompletions(inventory: CommandsData): string;

/**
 * Generate a fish completion script from the command inventory.
 */
function generateFishCompletions(inventory: CommandsData): string;
```

The command definition:

```typescript
export const completionsCommand = defineCommand({
	meta: {
		name: "completions",
		description: "Output shell completion script for bash, zsh, or fish",
	},
	args: {
		shell: {
			type: "positional",
			description: "Shell to generate completions for: bash, zsh, or fish",
			required: true,
		},
	},
	async run({ args }) {
		const shell = args.shell;
		if (!["bash", "zsh", "fish"].includes(shell)) {
			process.stderr.write(`Unknown shell: ${shell}. Supported: bash, zsh, fish\n`);
			process.exit(2);
		}

		const inventory = await buildCommandInventory();

		const generators: Record<string, (inv: CommandsData) => string> = {
			bash: generateBashCompletions,
			zsh: generateZshCompletions,
			fish: generateFishCompletions,
		};

		process.stdout.write(generators[shell](inventory));
	},
});
```

**Implementation Notes**:

The completion generators reuse `buildCommandInventory()` from `commands.ts` to introspect the command tree at runtime. This means completions automatically stay in sync with any new commands/args added.

Each generator produces a self-contained shell script.

**Bash completion script** (`generateBashCompletions`):
- Uses `complete -F _krometrail krometrail`
- The `_krometrail()` function inspects `COMP_WORDS` and `COMP_CWORD`
- At position 1: complete with top-level subcommands (`debug`, `browser`, `doctor`, `commands`, `completions`, `--mcp`, `--tools`, `--help`, `--version`)
- At position 2 with `debug`: complete with debug subcommands (`launch`, `attach`, `stop`, `status`, `continue`, `step`, `run-to`, `break`, `breakpoints`, `eval`, `vars`, `stack`, `source`, `watch`, `unwatch`, `log`, `output`, `threads`)
- At position 2 with `browser`: complete with browser subcommands (`start`, `mark`, `status`, `stop`, `sessions`, `overview`, `search`, `inspect`, `diff`, `replay-context`, `export`)
- At position 2 with `completions`: complete with shells (`bash`, `zsh`, `fish`)
- After a subcommand is resolved: complete with that command's `--flag` options from the inventory
- Use `compgen -W` for word generation

**Zsh completion script** (`generateZshCompletions`):
- Uses `compdef _krometrail krometrail`
- Defines `_krometrail()` using `_arguments` and `_describe` zsh completion functions
- First argument dispatches to `_krometrail_debug`, `_krometrail_browser`, etc.
- Each sub-function lists subcommands with descriptions
- Flag completion uses `_arguments` with descriptions from the inventory

**Fish completion script** (`generateFishCompletions`):
- Uses `complete -c krometrail` commands
- Top-level: `complete -c krometrail -n '__fish_use_subcommand' -a 'debug' -d 'Debug commands'`
- Subcommands: `complete -c krometrail -n '__fish_seen_subcommand_from debug' -a 'launch' -d 'Launch a debug session'`
- Flags: `complete -c krometrail -n '__fish_seen_subcommand_from debug launch' -l 'json' -d 'Output as JSON'`
- Fish's declarative model maps cleanly to the command inventory

**Data flow**:
```
buildCommandInventory()
  → CommandsData { groups: [{ name, commands: [{ name, description, args }] }] }
    → generateXxxCompletions(inventory)
      → shell script string written to stdout
```

**Acceptance Criteria**:
- [ ] `krometrail completions bash` outputs valid bash script (parseable by `bash -n`)
- [ ] `krometrail completions zsh` outputs valid zsh script
- [ ] `krometrail completions fish` outputs valid fish script
- [ ] `krometrail completions invalid` exits with code 2 and error message on stderr
- [ ] Bash completions include top-level commands, debug subcommands, browser subcommands, and `--flags`
- [ ] Zsh completions include descriptions for commands and flags
- [ ] Fish completions use conditional completions (`__fish_use_subcommand`, `__fish_seen_subcommand_from`)
- [ ] All completion scripts include a header comment with generation info and install instructions
- [ ] Completions include `--help` and `--version` global flags
- [ ] Completions include the `completions` command itself with shell options

---

## Implementation Order

1. **Unit 1**: Show help on no-args — small change in `src/cli/index.ts`, adds `showUsage` import and the lazy `completions` subcommand import
2. **Unit 2**: Completion script generator — new file `src/cli/commands/completions.ts` with the three shell generators

Unit 1 is a prerequisite for Unit 2 only because it adds the `completions` subcommand reference to the main command. They could be developed in parallel as long as the import line is added.

---

## Testing

### Unit Tests: `tests/unit/cli/completions.test.ts`

Test the generator functions directly with a mock `CommandsData` input:

```typescript
import { describe, expect, it } from "vitest";
// Import generator functions (need to be exported for testing)

const mockInventory: CommandsData = {
	version: "0.1.0",
	groups: [
		{
			name: "debug",
			description: "Debug commands",
			commands: [
				{ name: "launch", description: "Launch a debug session", group: "debug", args: [
					{ name: "program", type: "positional", required: true, description: "Program to debug" },
					{ name: "json", type: "boolean", required: false, description: "Output as JSON", default: false },
					{ name: "language", type: "string", required: false, description: "Language" },
				]},
				{ name: "stop", description: "Stop a session", group: "debug", args: [] },
			],
		},
		{
			name: "browser",
			description: "Browser commands",
			commands: [
				{ name: "start", description: "Start recording", group: "browser", args: [] },
			],
		},
	],
};

describe("bash completions", () => {
	it("outputs valid bash syntax", async () => {
		// Generate and check bash -n validates it
	});
	it("includes top-level commands", () => {
		// Check output contains "debug browser doctor commands completions"
	});
	it("includes debug subcommands", () => {
		// Check output contains "launch stop"
	});
	it("includes --flags for subcommands", () => {
		// Check output contains "--json --language"
	});
});

// Similar describe blocks for zsh and fish
```

### E2E Tests: `tests/e2e/cli/completions.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { runCli } from "../../helpers/cli-runner.js";

describe("E2E CLI: completions", () => {
	it("completions bash outputs valid bash script", async () => {
		const result = await runCli(["completions", "bash"]);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("complete");
		expect(result.stdout).toContain("_krometrail");
		// Validate syntax by running bash -n on it
	});

	it("completions zsh outputs valid zsh script", async () => {
		const result = await runCli(["completions", "zsh"]);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("compdef");
		expect(result.stdout).toContain("_krometrail");
	});

	it("completions fish outputs valid fish script", async () => {
		const result = await runCli(["completions", "fish"]);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("complete -c krometrail");
	});

	it("completions with invalid shell exits 2", async () => {
		const result = await runCli(["completions", "powershell"]);
		expect(result.exitCode).toBe(2);
		expect(result.stderr).toContain("Unknown shell");
	});

	it("completions scripts include all top-level commands", async () => {
		const result = await runCli(["completions", "bash"]);
		for (const cmd of ["debug", "browser", "doctor", "commands", "completions"]) {
			expect(result.stdout).toContain(cmd);
		}
	});
});
```

### E2E Tests: No-args help — add to `tests/e2e/cli/installation-claims.test.ts`

```typescript
it("krometrail with no args shows help output", async () => {
	const result = await runCli([]);
	expect(result.exitCode).toBe(0);
	const output = (result.stdout + result.stderr).toLowerCase();
	expect(output).toContain("debug");
	expect(output).toContain("browser");
	expect(output).toContain("doctor");
	expect(output).toContain("usage");
});
```

---

## Verification Checklist

```bash
# 1. No-args shows help
bun run src/cli/index.ts

# 2. --help still works
bun run src/cli/index.ts --help

# 3. --mcp still works
bun run src/cli/index.ts --mcp  # should stay alive

# 4. Completions generate valid scripts
bun run src/cli/index.ts completions bash | bash -n
bun run src/cli/index.ts completions zsh
bun run src/cli/index.ts completions fish

# 5. Invalid shell errors
bun run src/cli/index.ts completions invalid  # exit 2

# 6. Run tests
bun run test:unit
bun run test:e2e
bun run lint
```
