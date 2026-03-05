import { resolve } from "node:path";
import { describe } from "vitest";
import { NodeAdapter } from "../../../src/adapters/node.js";
import { registerAllAdapters } from "../../../src/adapters/registry.js";
import { createSessionManager } from "../../../src/core/session-manager.js";
import type { ConformanceFixture } from "../../harness/adapter-conformance.js";
import { runConformanceSuite } from "../../harness/adapter-conformance.js";
import { SKIP_NO_NODE_DEBUG } from "../../helpers/node-check.js";

registerAllAdapters();

const FIXTURE_PATH = resolve(import.meta.dirname, "../../fixtures/node/conformance.js");

const fixture: ConformanceFixture = {
	filePath: FIXTURE_PATH,
	command: `node ${FIXTURE_PATH}`,
	language: "node",
	loopBodyLine: 12,
	functionCallLine: 13,
	insideFunctionLine: 4,
	expectedLocals: ["items", "total", "i"],
	evalExpression: "items.length",
	evalExpectedSubstring: "3",
};

describe.skipIf(SKIP_NO_NODE_DEBUG)("Node.js adapter conformance", () => {
	runConformanceSuite(new NodeAdapter(), fixture, createSessionManager);
});
