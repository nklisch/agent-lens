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

// Path to the agent-lens skill file (generated at build time; read from source for dev)
const SKILL_PATH = resolve(import.meta.dirname, "../../../skill.md");

async function readSkillFile(): Promise<string> {
	try {
		return await readFile(SKILL_PATH, "utf-8");
	} catch {
		return "";
	}
}

async function spawnCaptured(args: string[], workDir: string, env?: Record<string, string>, timeoutMs?: number): Promise<AgentRunResult> {
	const start = Date.now();

	const proc = Bun.spawn(["codex", ...args], {
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

const codex: AgentDriver = {
	name: "codex",

	async available() {
		try {
			const proc = Bun.spawn(["codex", "--version"], { stdout: "pipe", stderr: "pipe" });
			await proc.exited;
			return proc.exitCode === 0;
		} catch {
			return false;
		}
	},

	async version() {
		try {
			const proc = Bun.spawn(["codex", "--version"], { stdout: "pipe", stderr: "pipe" });
			await proc.exited;
			const out = await new Response(proc.stdout).text();
			return out.trim().split("\n")[0] ?? "unknown";
		} catch {
			return "unknown";
		}
	},

	async run(options: AgentRunOptions): Promise<AgentRunResult> {
		const skill = await readSkillFile();

		// Prepend skill file to prompt so Codex knows the CLI commands
		const fullPrompt = skill ? `${skill}\n\n---\n\n${options.prompt}` : options.prompt;

		const args: string[] = [
			// Non-interactive auto-approval mode
			"--approval-mode",
			"full-auto",
			// Quiet mode (suppress interactive UI)
			"--quiet",
			fullPrompt,
		];

		return spawnCaptured(args, options.workDir, options.env, options.timeoutMs);
	},

	parseMetrics(result: AgentRunResult): AgentMetrics {
		// Codex outputs plain text; do best-effort regex parsing
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
