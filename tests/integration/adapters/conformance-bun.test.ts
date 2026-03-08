import { resolve } from "node:path";
import { describe } from "vitest";
import { BunAdapter } from "../../../src/adapters/bun.js";
import { registerAllAdapters } from "../../../src/adapters/registry.js";
import { createSessionManager } from "../../../src/core/session-manager.js";
import type { ConformanceFixture } from "../../harness/adapter-conformance.js";
import { runConformanceSuite } from "../../harness/adapter-conformance.js";
import { SKIP_NO_BUN } from "../../helpers/bun-check.js";

registerAllAdapters();

const FIXTURE_PATH = resolve(import.meta.dirname, "../../fixtures/bun/conformance.ts");

const fixture: ConformanceFixture = {
	filePath: FIXTURE_PATH,
	command: `bun ${FIXTURE_PATH}`,
	language: "bun",
	loopBodyLine: 12,
	functionCallLine: 13,
	insideFunctionLine: 4,
	expectedLocals: ["items", "total", "i"],
	evalExpression: "items.length",
	evalExpectedSubstring: "3",
};

describe.skipIf(SKIP_NO_BUN)("Bun adapter conformance", () => {
	runConformanceSuite(new BunAdapter(), fixture, createSessionManager);
});
