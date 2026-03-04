import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PythonAdapter } from "../../../src/adapters/python.js";
import { registerAdapter } from "../../../src/adapters/registry.js";
import { SessionLimitError } from "../../../src/core/errors.js";
import { SessionManager } from "../../../src/core/session-manager.js";
import type { ResourceLimits } from "../../../src/core/types.js";
import { SKIP_NO_DEBUGPY } from "../../helpers/debugpy-check.js";

const FIXTURE = resolve(import.meta.dirname, "../../fixtures/python/simple-loop.py");
registerAdapter(new PythonAdapter());

const tinyLimits: ResourceLimits = {
	sessionTimeoutMs: 60_000,
	maxActionsPerSession: 3,
	maxConcurrentSessions: 2,
	stepTimeoutMs: 10_000,
	maxOutputBytes: 1_048_576,
	maxEvaluateTimeMs: 5_000,
};

describe.skipIf(SKIP_NO_DEBUGPY)("E2E: session limits", () => {
	let manager: SessionManager;
	let sessionId: string;

	beforeAll(() => {
		manager = new SessionManager(tinyLimits);
	});

	afterAll(async () => {
		await manager.disposeAll();
	});

	it("hits action limit after maxActionsPerSession steps", async () => {
		const result = await manager.launch({
			command: `python3 ${FIXTURE}`,
			breakpoints: [{ file: FIXTURE, breakpoints: [{ line: 6 }] }],
		});

		sessionId = result.sessionId;

		// Continue to first stop
		await manager.continue(sessionId, 10_000);

		// Exhaust action limit with steps
		let limitHit = false;
		for (let i = 0; i < 10; i++) {
			try {
				await manager.step(sessionId, "over");
			} catch (err) {
				if (err instanceof SessionLimitError) {
					limitHit = true;
					break;
				}
				break;
			}
		}

		expect(limitHit).toBe(true);

		try {
			await manager.stop(sessionId);
		} catch {
			// ignore
		}
		sessionId = "";
	});
});
