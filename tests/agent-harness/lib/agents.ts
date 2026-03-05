import type { AgentDriver } from "./config.js";

// Registry of all known agent drivers.
// Add new drivers here as they are implemented.
const DRIVER_REGISTRY: (() => AgentDriver)[] = [];

/**
 * Register an agent driver factory. Called by each driver module at import time.
 */
export function registerDriver(factory: () => AgentDriver): void {
	DRIVER_REGISTRY.push(factory);
}

/**
 * Discover all available agents, optionally filtered by AGENT env var.
 * Only returns agents whose binaries are present on PATH.
 */
export async function discoverAgents(): Promise<AgentDriver[]> {
	// Lazy-import drivers so they self-register
	await import("../drivers/claude-code.js");
	await import("../drivers/codex.js");

	const filter = process.env.AGENT ?? null;
	const available: AgentDriver[] = [];

	for (const factory of DRIVER_REGISTRY) {
		const driver = factory();
		if (filter && driver.name !== filter) continue;
		const ok = await driver.available();
		if (ok) {
			available.push(driver);
		} else {
			console.warn(`[agent-harness] Agent '${driver.name}' not available — skipping`);
		}
	}

	if (available.length === 0) {
		const filterMsg = filter ? ` matching AGENT=${filter}` : "";
		throw new Error(`No agent binaries found${filterMsg}. Install claude or codex and ensure they are on PATH.`);
	}

	return available;
}
