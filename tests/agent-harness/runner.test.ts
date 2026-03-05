/**
 * Agent test harness runner.
 *
 * Runs real agent binaries against buggy code scenarios and validates the fix
 * using a hidden test the agent never saw.
 *
 * This test suite is NOT run in CI. Run it manually:
 *
 *   bun run test:agent                                      # all agents × all scenarios
 *   AGENT=claude-code bun run test:agent                    # one agent
 *   SCENARIO=python-discount-bug bun run test:agent         # one scenario
 *   AGENT=claude-code SCENARIO=python-discount-bug bun run test:agent
 *
 * Results are saved as structured traces in tests/agent-harness/.traces/.
 * Generate a report:
 *
 *   bun run test:agent:report
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { discoverAgents } from "./lib/agents.js";
import type { AgentDriver, Scenario } from "./lib/config.js";
import { runScenario } from "./lib/harness.js";
import { discoverScenarios } from "./lib/scenarios.js";
import { initSuiteDir, writeSuiteMeta } from "./lib/trace.js";

// Discover scenarios and agents once at module load time.
// These throw if nothing is found — which is the right failure mode.
const scenarios: Scenario[] = await discoverScenarios();
const agents: AgentDriver[] = await discoverAgents();

// One shared trace directory for the entire test suite run.
let suiteDir: string;

beforeAll(async () => {
	suiteDir = await initSuiteDir();
	await writeSuiteMeta(suiteDir, {
		timestamp: new Date().toISOString(),
		scenarios: scenarios.map((s) => s.name),
		agents: agents.map((a) => a.name),
	});
	console.log(`[agent-harness] Traces → ${suiteDir}`);
});

afterAll(() => {
	console.log(`[agent-harness] Run complete. Generate report: bun run test:agent:report`);
});

describe.each(agents)("Agent: $name", (agent) => {
	describe.each(scenarios)("Scenario: $name", (scenario) => {
		it(
			"fixes the bug (hidden test passes)",
			async () => {
				const result = await runScenario(agent, scenario, suiteDir);

				// The only assertion: the hidden oracle test must pass.
				// Failure message includes timing, exit code, and validation output.
				const failMsg = [
					`Agent:    ${agent.name}`,
					`Scenario: ${scenario.name}`,
					`Duration: ${(result.durationMs / 1000).toFixed(1)}s`,
					`Exit code: ${result.agentExitCode ?? "killed"}`,
					`Timed out: ${result.timedOut}`,
					`Visible test passed: ${result.visibleTestAfter}`,
					`Files changed: ${result.filesChanged.join(", ") || "none"}`,
					"",
					"--- Agent stderr ---",
					result.agentStderr ?? "(not captured)",
					"",
					"--- Validation output ---",
					result.validation.stdout,
					result.validation.stderr,
				].join("\n");

				expect(result.passed, failMsg).toBe(true);
			},
			scenario.timeoutSeconds * 1000 + 60_000, // scenario timeout + 60s buffer
		);
	});
});
