import { registerDriver } from "../lib/agents.js";
import type { AgentDriver, AgentMetrics, AgentRunOptions, AgentRunResult } from "../lib/config.js";

async function spawnCaptured(args: string[], workDir: string, env?: Record<string, string>, timeoutMs?: number): Promise<AgentRunResult> {
	const start = Date.now();

	const proc = Bun.spawn(["claude", ...args], {
		cwd: workDir,
		stdout: "pipe",
		stderr: "pipe",
		env: { ...process.env, ...env },
	});

	let killed = false;
	const timer = timeoutMs
		? setTimeout(() => {
				killed = true;
				proc.kill();
			}, timeoutMs)
		: null;

	const exitCode = await proc.exited;
	if (timer) clearTimeout(timer);

	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();

	return {
		exitCode: killed ? null : exitCode,
		stdout,
		stderr,
		timedOut: killed,
		durationMs: Date.now() - start,
	};
}

/**
 * Parse metrics from Claude Code stream-json output.
 * Claude Code emits newline-delimited JSON events. The "result" event at the
 * end contains cost, turns, and token usage.
 */
function parseClaudeMetrics(stdout: string): Partial<AgentMetrics> {
	const lines = stdout.split("\n").filter((l) => l.trim().startsWith("{"));
	let model: string | null = null;
	let toolCalls: Record<string, number> = {};

	for (const line of lines) {
		try {
			const data = JSON.parse(line) as Record<string, unknown>;

			// Capture model from system init event
			if (data.type === "system" && data.subtype === "init" && typeof data.model === "string") {
				model = data.model;
			}

			// Count tool_use events
			if (data.type === "tool_use" && typeof data.tool_name === "string") {
				const name = data.tool_name as string;
				toolCalls[name] = (toolCalls[name] ?? 0) + 1;
			}

			// Extract metrics from result event
			if (data.type === "result") {
				const usage = data.usage as Record<string, number> | undefined;
				return {
					costUsd: typeof data.cost_usd === "number" ? data.cost_usd : null,
					numTurns: typeof data.num_turns === "number" ? data.num_turns : null,
					tokensInput: usage?.input_tokens ?? null,
					tokensOutput: usage?.output_tokens ?? null,
					model,
					toolCalls,
				};
			}
		} catch {
			// Skip malformed lines
		}
	}

	return { model, toolCalls };
}

const claudeCode: AgentDriver = {
	name: "claude-code",

	async available() {
		try {
			const proc = Bun.spawn(["claude", "--version"], { stdout: "pipe", stderr: "pipe" });
			await proc.exited;
			return proc.exitCode === 0;
		} catch {
			return false;
		}
	},

	async version() {
		try {
			const proc = Bun.spawn(["claude", "--version"], { stdout: "pipe", stderr: "pipe" });
			await proc.exited;
			const out = await new Response(proc.stdout).text();
			return out.trim().split("\n")[0] ?? "unknown";
		} catch {
			return "unknown";
		}
	},

	async run(options: AgentRunOptions): Promise<AgentRunResult> {
		const args: string[] = [
			// Non-interactive prompt mode
			"-p",
			options.prompt,
			// MCP server config
			"--mcp-config",
			options.mcpConfigPath,
			// Skip permission prompts — agent runs in isolated temp workspace
			"--dangerously-skip-permissions",
			// Turn limit
			"--max-turns",
			"50",
			// Stream JSON for metrics parsing
			"--output-format",
			"stream-json",
		];

		if (options.maxBudgetUsd !== undefined) {
			args.push("--max-budget-usd", String(options.maxBudgetUsd));
		}

		return spawnCaptured(args, options.workDir, options.env, options.timeoutMs);
	},

	parseMetrics(result: AgentRunResult): AgentMetrics {
		const parsed = parseClaudeMetrics(result.stdout);
		return {
			costUsd: parsed.costUsd ?? null,
			numTurns: parsed.numTurns ?? null,
			tokensInput: parsed.tokensInput ?? null,
			tokensOutput: parsed.tokensOutput ?? null,
			model: parsed.model ?? null,
			agentVersion: null, // filled in by harness after run
			toolCalls: parsed.toolCalls ?? {},
		};
	},
};

registerDriver(() => claudeCode);
