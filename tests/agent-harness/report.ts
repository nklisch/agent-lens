#!/usr/bin/env bun
/**
 * Agent harness report generator.
 *
 * Reads result.json files from trace directories and produces a publishable
 * markdown report and machine-readable JSON summary.
 *
 * Usage:
 *   bun run test:agent:report                        # latest trace dir
 *   bun run test:agent:report --dir .traces/2026-03  # specific dir
 *   bun run test:agent:report --format json          # JSON output only
 *   bun run test:agent:report --out report.md        # write to file
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { RunResult } from "./lib/config.js";

const TRACES_DIR = resolve(import.meta.dirname, ".traces");

// --- CLI arg parsing ---

function parseArgs(): { dir?: string; format: "markdown" | "json"; out?: string } {
	const args = process.argv.slice(2);
	const get = (flag: string) => {
		const i = args.indexOf(flag);
		return i !== -1 ? args[i + 1] : undefined;
	};
	const format = get("--format") === "json" ? "json" : "markdown";
	return { dir: get("--dir"), format, out: get("--out") };
}

// --- Result loading ---

async function loadResults(suiteDir: string): Promise<RunResult[]> {
	const results: RunResult[] = [];
	let agents: string[] = [];

	try {
		const entries = await readdir(suiteDir, { withFileTypes: true });
		agents = entries.filter((e) => e.isDirectory()).map((e) => e.name);
	} catch {
		return results;
	}

	for (const agent of agents) {
		const agentDir = join(suiteDir, agent);
		let scenarios: string[] = [];
		try {
			const entries = await readdir(agentDir, { withFileTypes: true });
			scenarios = entries.filter((e) => e.isDirectory()).map((e) => e.name);
		} catch {
			continue;
		}

		for (const scenario of scenarios) {
			const resultPath = join(agentDir, scenario, "result.json");
			try {
				const raw = await readFile(resultPath, "utf-8");
				results.push(JSON.parse(raw) as RunResult);
			} catch {
				// Missing or malformed — skip
			}
		}
	}

	return results;
}

async function findLatestSuiteDir(): Promise<string> {
	const entries = await readdir(TRACES_DIR, { withFileTypes: true });
	const dirs = entries
		.filter((e) => e.isDirectory())
		.map((e) => e.name)
		.sort()
		.reverse();

	if (dirs.length === 0) {
		throw new Error(`No trace directories found in ${TRACES_DIR}. Run bun run test:agent first.`);
	}
	return join(TRACES_DIR, dirs[0]);
}

// --- Markdown report generation ---

interface AgentSummary {
	agent: string;
	model: string | null;
	agentVersion: string | null;
	total: number;
	passed: number;
	avgDurationMs: number;
	avgCostUsd: number | null;
}

interface ScenarioResult {
	scenario: string;
	agent: string;
	passed: boolean;
	durationMs: number;
	costUsd: number | null;
	numTurns: number | null;
	toolCallSummary: string;
}

function formatDuration(ms: number): string {
	return `${(ms / 1000).toFixed(0)}s`;
}

function formatCost(usd: number | null): string {
	if (usd === null) return "n/a";
	return `$${usd.toFixed(3)}`;
}

function toolCallSummary(toolCalls: Record<string, number>): string {
	if (!toolCalls || Object.keys(toolCalls).length === 0) return "—";
	return Object.entries(toolCalls)
		.sort((a, b) => b[1] - a[1])
		.map(([tool, count]) => {
			// Shorten tool names: "debug_continue" → "continue", "mcp__agent-lens__debug_launch" → "launch"
			const short = tool.replace(/^mcp__agent-lens__debug_/, "").replace(/^debug_/, "");
			return count > 1 ? `${short}(${count})` : short;
		})
		.join(", ");
}

function generateMarkdown(results: RunResult[], suiteDir: string): string {
	if (results.length === 0) {
		return "# Agent Lens — Agent Test Report\n\nNo results found.\n";
	}

	const agentLensVersion = results[0]?.agentLensVersion ?? "unknown";
	const date = results[0]?.timestamp.slice(0, 10) ?? new Date().toISOString().slice(0, 10);

	// Build per-agent summaries
	const agentMap = new Map<string, RunResult[]>();
	for (const r of results) {
		const list = agentMap.get(r.agent) ?? [];
		list.push(r);
		agentMap.set(r.agent, list);
	}

	const agentSummaries: AgentSummary[] = [];
	for (const [agent, runs] of agentMap) {
		const passed = runs.filter((r) => r.passed).length;
		const costs = runs.map((r) => r.metrics.costUsd).filter((c) => c !== null) as number[];
		const avgCost = costs.length > 0 ? costs.reduce((a, b) => a + b, 0) / costs.length : null;
		const avgDuration = runs.reduce((a, r) => a + r.durationMs, 0) / runs.length;
		const model = runs.find((r) => r.metrics.model)?.metrics.model ?? null;
		const agentVersion = runs.find((r) => r.metrics.agentVersion)?.metrics.agentVersion ?? null;

		agentSummaries.push({ agent, model, agentVersion, total: runs.length, passed, avgDurationMs: avgDuration, avgCostUsd: avgCost });
	}

	// Build per-scenario results
	const scenarioNames = [...new Set(results.map((r) => r.scenario))].sort();
	const scenarioRows: ScenarioResult[] = [];
	for (const scenario of scenarioNames) {
		for (const r of results.filter((x) => x.scenario === scenario)) {
			scenarioRows.push({
				scenario,
				agent: r.agent,
				passed: r.passed,
				durationMs: r.durationMs,
				costUsd: r.metrics.costUsd,
				numTurns: r.metrics.numTurns,
				toolCallSummary: toolCallSummary(r.metrics.toolCalls),
			});
		}
	}

	// Build tool usage table
	const toolTotals = new Map<string, number>();
	for (const r of results) {
		for (const [tool, count] of Object.entries(r.metrics.toolCalls ?? {})) {
			toolTotals.set(tool, (toolTotals.get(tool) ?? 0) + count);
		}
	}

	const lines: string[] = [];

	lines.push("# Agent Lens — Agent Test Report");
	lines.push("");
	lines.push(`**Date:** ${date}`);
	lines.push(`**Agent Lens version:** ${agentLensVersion}`);
	lines.push(`**Trace directory:** \`${suiteDir}\``);
	lines.push("");

	// Summary table
	lines.push("## Summary");
	lines.push("");
	lines.push("| Agent | Version | Scenarios | Passed | Pass Rate | Avg Duration | Avg Cost |");
	lines.push("|-------|---------|-----------|--------|-----------|--------------|----------|");
	for (const s of agentSummaries) {
		const agentLabel = s.model ? `${s.agent} (${s.model})` : s.agent;
		const versionLabel = s.agentVersion ?? "unknown";
		const passRate = `${Math.round((s.passed / s.total) * 100)}%`;
		lines.push(`| ${agentLabel} | ${versionLabel} | ${s.total} | ${s.passed} | ${passRate} | ${formatDuration(s.avgDurationMs)} | ${formatCost(s.avgCostUsd)} |`);
	}
	lines.push("");

	// Per-scenario tables
	lines.push("## Results by Scenario");
	lines.push("");
	for (const scenario of scenarioNames) {
		lines.push(`### ${scenario}`);
		lines.push("");
		lines.push("| Agent | Result | Duration | Cost | Turns | Debug Tools Used |");
		lines.push("|-------|--------|----------|------|-------|------------------|");
		for (const row of scenarioRows.filter((r) => r.scenario === scenario)) {
			const resultLabel = row.passed ? "**PASS**" : "FAIL";
			lines.push(`| ${row.agent} | ${resultLabel} | ${formatDuration(row.durationMs)} | ${formatCost(row.costUsd)} | ${row.numTurns ?? "n/a"} | ${row.toolCallSummary} |`);
		}
		lines.push("");
	}

	// Tool usage
	if (toolTotals.size > 0) {
		lines.push("## Tool Usage Patterns");
		lines.push("");
		lines.push("| Tool | Total Calls | Avg per Run |");
		lines.push("|------|-------------|-------------|");
		const sorted = [...toolTotals.entries()].sort((a, b) => b[1] - a[1]);
		for (const [tool, total] of sorted) {
			const avg = (total / results.length).toFixed(1);
			lines.push(`| ${tool} | ${total} | ${avg} |`);
		}
		lines.push("");
	}

	return lines.join("\n");
}

// --- JSON report generation ---

interface Report {
	date: string;
	agentLensVersion: string;
	suiteDir: string;
	results: RunResult[];
	summary: {
		totalRuns: number;
		passed: number;
		failed: number;
		passRate: string;
	};
}

function generateJson(results: RunResult[], suiteDir: string): Report {
	const passed = results.filter((r) => r.passed).length;
	return {
		date: results[0]?.timestamp.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
		agentLensVersion: results[0]?.agentLensVersion ?? "unknown",
		suiteDir,
		results,
		summary: {
			totalRuns: results.length,
			passed,
			failed: results.length - passed,
			passRate: results.length > 0 ? `${Math.round((passed / results.length) * 100)}%` : "0%",
		},
	};
}

// --- Main ---

async function main(): Promise<void> {
	const { dir, format, out } = parseArgs();

	let suiteDir: string;
	if (dir) {
		suiteDir = resolve(TRACES_DIR, dir);
	} else {
		suiteDir = await findLatestSuiteDir();
	}

	console.error(`[report] Loading results from: ${suiteDir}`);
	const results = await loadResults(suiteDir);
	console.error(`[report] Found ${results.length} result(s)`);

	let output: string;
	if (format === "json") {
		output = JSON.stringify(generateJson(results, suiteDir), null, 2);
	} else {
		output = generateMarkdown(results, suiteDir);
	}

	if (out) {
		await writeFile(resolve(out), output);
		console.error(`[report] Written to: ${out}`);
	} else {
		process.stdout.write(output);
	}

	// Also always write the report to the trace dir
	const mdPath = join(suiteDir, "report.md");
	const jsonPath = join(suiteDir, "report.json");
	await writeFile(mdPath, generateMarkdown(results, suiteDir));
	await writeFile(jsonPath, JSON.stringify(generateJson(results, suiteDir), null, 2));
	console.error(`[report] Saved to: ${mdPath}`);
}

await main();
