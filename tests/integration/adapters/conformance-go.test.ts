import { resolve } from "node:path";
import { describe } from "vitest";
import { GoAdapter } from "../../../src/adapters/go.js";
import { createSessionManager } from "../../../src/core/session-manager.js";
import type { ConformanceFixture } from "../../harness/adapter-conformance.js";
import { runConformanceSuite } from "../../harness/adapter-conformance.js";
import { SKIP_NO_DLV } from "../../helpers/dlv-check.js";

const FIXTURE_PATH = resolve(import.meta.dirname, "../../fixtures/go/conformance.go");

const fixture: ConformanceFixture = {
	filePath: FIXTURE_PATH,
	command: `go run ${FIXTURE_PATH}`,
	language: "go",
	loopBodyLine: 16,
	functionCallLine: 17,
	insideFunctionLine: 8,
	expectedLocals: ["items", "total", "item"],
	evalExpression: "len(items)",
	evalExpectedSubstring: "3",
};

describe.skipIf(SKIP_NO_DLV)("Go adapter conformance", () => {
	runConformanceSuite(new GoAdapter(), fixture, createSessionManager);
});
