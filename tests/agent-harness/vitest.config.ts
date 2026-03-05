import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["tests/agent-harness/**/*.test.ts"],
		// Agent runs are slow and expensive — generous timeouts
		testTimeout: 300_000, // 5 min per test
		hookTimeout: 60_000,
		// Run tests sequentially — each test spawns a real LLM agent
		pool: "forks",
		poolOptions: {
			forks: {
				singleFork: true,
			},
		},
		// Concurrency off — agents are expensive
		sequence: {
			concurrent: false,
		},
	},
});
