/**
 * Codex agent driver.
 *
 * Codex uses the CLI (bash commands) rather than MCP tools — the agent-lens
 * skill file is included in the system prompt to tell Codex how to use the CLI.
 * The MCP config is ignored for this driver.
 *
 * Flags used:
 *   --approval-mode full-auto   — skip approval prompts for all actions
 *   --quiet                     — suppress interactive UI
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { registerDriver } from "../lib/agents.js";
import type { AgentDriver, AgentMetrics, AgentRunOptions, AgentRunResult } from "../lib/config.js";
import { spawnCapture } from "../lib/spawn.js";

const SKILL_PATH = resolve(import.meta.dirname, "../../../skill.md");

async function readSkillFile(): Promise<string> {
	try {
		return await readFile(SKILL_PATH, "utf-8");
	} catch {
		return "";
	}
}

const codex: AgentDriver = {
	name: "codex",

	async available() {
		try {
			const result = await spawnCapture("codex", ["--version"]);
			return result.exitCode === 0;
		} catch {
			return false;
		}
	},

	async version() {
		try {
			const result = await spawnCapture("codex", ["--version"]);
			return result.stdout.trim().split("\n")[0] ?? "unknown";
		} catch {
			return "unknown";
		}
	},

	async run(options: AgentRunOptions): Promise<AgentRunResult> {
		const start = Date.now();
		const skill = await readSkillFile();
		const fullPrompt = skill ? `${skill}\n\n---\n\n${options.prompt}` : options.prompt;

		const args: string[] = ["--approval-mode", "full-auto", "--quiet", fullPrompt];

		const result = await spawnCapture("codex", args, {
			cwd: options.workDir,
			env: options.env,
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
		const toolCallMatches = result.stdout.matchAll(/agent-lens\s+([\w-]+)/g);
		const toolCalls: Record<string, number> = {};
		for (const m of toolCallMatches) {
			const tool = `agent-lens-${m[1]}`;
			toolCalls[tool] = (toolCalls[tool] ?? 0) + 1;
		}

		return {
			costUsd: null,
			numTurns: null,
			tokensInput: null,
			tokensOutput: null,
			model: null,
			agentVersion: null,
			toolCalls,
		};
	},
};

registerDriver(() => codex);
