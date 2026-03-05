import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["tests/**/*.test.ts"],
		exclude: ["tests/agent-harness/**"],
		testTimeout: 30_000,
		hookTimeout: 15_000,
	},
});
