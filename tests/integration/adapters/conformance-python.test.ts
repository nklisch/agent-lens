import { resolve } from "node:path";
import { describe } from "vitest";
import { PythonAdapter } from "../../../src/adapters/python.js";
import { createSessionManager } from "../../../src/core/session-manager.js";
import type { ConformanceFixture } from "../../harness/adapter-conformance.js";
import { runConformanceSuite } from "../../harness/adapter-conformance.js";
import { SKIP_NO_DEBUGPY } from "../../helpers/debugpy-check.js";

const FIXTURE_PATH = resolve(import.meta.dirname, "../../fixtures/python/conformance.py");

const fixture: ConformanceFixture = {
	filePath: FIXTURE_PATH,
	command: `python3 ${FIXTURE_PATH}`,
	language: "python",
	loopBodyLine: 11,
	functionCallLine: 12,
	insideFunctionLine: 4,
	expectedLocals: ["items", "total", "i", "item"],
	evalExpression: "len(items)",
	evalExpectedSubstring: "3",
};

describe.skipIf(SKIP_NO_DEBUGPY)("Python adapter conformance", () => {
	runConformanceSuite(new PythonAdapter(), fixture, createSessionManager);
});
