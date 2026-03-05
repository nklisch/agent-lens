import { registerDriver } from "../lib/agents.js";
import type { AgentDriver, AgentMetrics, AgentRunOptions, AgentRunResult } from "../lib/config.js";
import { spawnCapture } from "../lib/spawn.js";

/**
 * Parse metrics from Claude Code stream-json output.
 * Claude Code emits newline-delimited JSON events. The "result" event at the
 * end contains cost, turns, and token usage.
 */
function parseClaudeMetrics(stdout: string): Partial<AgentMetrics> {
	const lines = stdout.split("\n").filter((l) => l.trim().startsWith("{"));
	let model: string | null = null;
	const toolCalls: Record<string, number> = {};

	for (const line of lines) {
		try {
			const data = JSON.parse(line) as Record<string, unknown>;

			// Capture model from system init event
			if (data.type === "system" && data.subtype === "init" && typeof data.model === "string") {
				model = data.model;
			}

			// Count tool_use events (appear as content blocks in assistant messages)
			if (data.type === "assistant" && data.message) {
				const msg = data.message as { content?: Array<{ type: string; name?: string }> };
				for (const block of msg.content ?? []) {
					if (block.type === "tool_use" && block.name) {
						toolCalls[block.name] = (toolCalls[block.name] ?? 0) + 1;
					}
				}
			}

			// Extract metrics from result event
			if (data.type === "result") {
				const usage = data.usage as Record<string, number> | undefined;
				const cost = typeof data.total_cost_usd === "number" ? data.total_cost_usd : typeof data.cost_usd === "number" ? data.cost_usd : null;
				return {
					costUsd: cost,
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
			const result = await spawnCapture("claude", ["--version"]);
			return result.exitCode === 0;
		} catch {
			return false;
		}
	},

	async version() {
		try {
			const result = await spawnCapture("claude", ["--version"]);
			return result.stdout.trim().split("\n")[0] ?? "unknown";
		} catch {
			return "unknown";
		}
	},

	async run(options: AgentRunOptions): Promise<AgentRunResult> {
		const start = Date.now();
		const args: string[] = ["-p", options.prompt, "--mcp-config", options.mcpConfigPath, "--dangerously-skip-permissions", "--max-turns", "50", "--output-format", "stream-json", "--verbose"];

		if (options.maxBudgetUsd !== undefined) {
			args.push("--max-budget-usd", String(options.maxBudgetUsd));
		}

		// Unset CLAUDECODE to avoid "nested session" detection when
		// the harness itself is running inside a Claude Code session.
		const env = { ...options.env, CLAUDECODE: "" };

		const result = await spawnCapture("claude", args, {
			cwd: options.workDir,
			env,
			timeoutMs: options.timeoutMs,
		});

		return {
			exitCode: result.exitCode,
			stdout: result.stdout,
			stderr: result.stderr,
			timedOut: result.timedOut,
			durationMs: Date.now() - start,
		};
	},

	parseMetrics(result: AgentRunResult): AgentMetrics {
		const parsed = parseClaudeMetrics(result.stdout);
		return {
			costUsd: parsed.costUsd ?? null,
			numTurns: parsed.numTurns ?? null,
			tokensInput: parsed.tokensInput ?? null,
			tokensOutput: parsed.tokensOutput ?? null,
			model: parsed.model ?? null,
			agentVersion: null,
			toolCalls: parsed.toolCalls ?? {},
		};
	},
};

registerDriver(() => claudeCode);
