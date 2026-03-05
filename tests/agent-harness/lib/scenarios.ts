import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Scenario } from "./config.js";
import { ScenarioConfigSchema } from "./config.js";

const SCENARIOS_DIR = resolve(import.meta.dirname, "../scenarios");

/**
 * Parse a scenario directory into a Scenario object.
 */
async function loadScenario(dir: string): Promise<Scenario> {
	const configPath = join(dir, "scenario.json");
	const raw = JSON.parse(await readFile(configPath, "utf-8"));
	const config = ScenarioConfigSchema.parse(raw);

	return {
		name: config.scenario.name,
		description: config.scenario.description,
		language: config.scenario.language,
		timeoutSeconds: config.scenario.timeout_seconds,
		maxBudgetUsd: config.scenario.max_budget_usd,
		setupCommands: config.setup.commands,
		visibleTestCommand: config.visible_test.command,
		validationCommand: config.validation.command,
		scenarioDir: dir,
		srcDir: join(dir, "src"),
		hiddenDir: join(dir, "hidden"),
		promptPath: join(dir, "prompt.md"),
	};
}

/**
 * Discover all available scenarios, optionally filtered by SCENARIO env var.
 */
export async function discoverScenarios(): Promise<Scenario[]> {
	const filter = process.env.SCENARIO ?? null;
	const entries = await readdir(SCENARIOS_DIR, { withFileTypes: true });

	const scenarios: Scenario[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		if (filter && entry.name !== filter) continue;

		const dir = join(SCENARIOS_DIR, entry.name);
		try {
			const scenario = await loadScenario(dir);
			scenarios.push(scenario);
		} catch (err) {
			console.warn(`[agent-harness] Skipping ${entry.name}: failed to parse scenario.json — ${err}`);
		}
	}

	if (scenarios.length === 0) {
		if (filter) {
			throw new Error(`No scenario found matching SCENARIO=${filter}`);
		}
		throw new Error(`No scenarios found in ${SCENARIOS_DIR}`);
	}

	return scenarios;
}
