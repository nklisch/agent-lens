import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["tests/agent-harness/**/*.test.ts"],
		// Agent runs are slow and expensive — generous timeouts
		testTimeout: 300_000, // 5 min per test
		hookTimeout: 60_000,
		// Run sequentially — agents are expensive
		maxConcurrency: 1,
	},
});
