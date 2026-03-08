import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			// bun:sqlite is a Bun built-in; alias to better-sqlite3 for vitest/Node.js compatibility
			"bun:sqlite": "better-sqlite3",
		},
	},
	test: {
		include: ["tests/**/*.test.ts"],
		exclude: ["tests/agent-harness/**"],
		testTimeout: 30_000,
		hookTimeout: 15_000,
	},
});
