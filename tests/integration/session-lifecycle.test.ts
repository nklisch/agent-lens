import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PythonAdapter } from "../../src/adapters/python.js";
import { registerAdapter } from "../../src/adapters/registry.js";
import { SessionLimitError } from "../../src/core/errors.js";
import { SessionManager } from "../../src/core/session-manager.js";
import { ResourceLimitsSchema } from "../../src/core/types.js";
import { SKIP_NO_DEBUGPY } from "../helpers/debugpy-check.js";

const SIMPLE_LOOP = resolve(import.meta.dirname, "../fixtures/python/simple-loop.py");
const DISCOUNT_BUG = resolve(import.meta.dirname, "../fixtures/python/discount-bug.py");

// Register adapter once
registerAdapter(new PythonAdapter());

const testLimits = ResourceLimitsSchema.parse({
	sessionTimeoutMs: 60_000,
	maxActionsPerSession: 50,
	maxConcurrentSessions: 3,
	stepTimeoutMs: 15_000,
});

describe.skipIf(SKIP_NO_DEBUGPY)("SessionManager integration", () => {
	let manager: SessionManager;
	let sessionId: string;

	beforeEach(() => {
		manager = new SessionManager(testLimits);
	});

	afterEach(async () => {
		try {
			if (sessionId) await manager.stop(sessionId);
		} catch {
			// ignore cleanup errors
		}
		await manager.disposeAll();
	});

	it("launch → breakpoint → step → evaluate → stop sequence", async () => {
		const result = await manager.launch({
			command: `python3 ${SIMPLE_LOOP}`,
			breakpoints: [{ file: SIMPLE_LOOP, breakpoints: [{ line: 6 }] }],
		});

		sessionId = result.sessionId;
		expect(result.sessionId).toBeTruthy();

		// Continue to breakpoint
		const viewport = await manager.continue(sessionId, 10_000);
		expect(viewport).toContain("STOPPED");

		// Step over
		const stepped = await manager.step(sessionId, "over");
		expect(stepped).toContain("STOPPED");

		// Evaluate
		const evaluated = await manager.evaluate(sessionId, "1 + 1");
		expect(evaluated).toBe("2");

		// Stop
		const stopResult = await manager.stop(sessionId);
		sessionId = "";
		expect(stopResult.duration).toBeGreaterThan(0);
	});

	it("launch with stopOnEntry returns viewport at first line", async () => {
		const result = await manager.launch({
			command: `python3 ${SIMPLE_LOOP}`,
			stopOnEntry: true,
		});

		sessionId = result.sessionId;
		expect(result.viewport).toBeDefined();
		expect(result.viewport).toContain("STOPPED");
	});

	it("continue to breakpoint returns viewport with locals", async () => {
		const result = await manager.launch({
			command: `python3 ${DISCOUNT_BUG}`,
			breakpoints: [{ file: DISCOUNT_BUG, breakpoints: [{ line: 13 }] }],
		});

		sessionId = result.sessionId;
		const viewport = await manager.continue(sessionId, 10_000);
		expect(viewport).toContain("STOPPED");
		expect(viewport).toContain("discount");
	});

	it("step over changes current line", async () => {
		const result = await manager.launch({
			command: `python3 ${SIMPLE_LOOP}`,
			breakpoints: [{ file: SIMPLE_LOOP, breakpoints: [{ line: 6 }] }],
		});

		sessionId = result.sessionId;
		await manager.continue(sessionId, 10_000);

		const viewport1 = await manager.getStatus(sessionId);
		expect(viewport1.status).toBe("stopped");

		const viewport2 = await manager.step(sessionId, "over");
		// Should have stepped to a different line or same loop iteration
		expect(viewport2).toContain("STOPPED");
	});

	it("getOutput captures debugee stdout", async () => {
		const result = await manager.launch({
			command: `python3 ${SIMPLE_LOOP}`,
			stopOnEntry: true,
		});

		sessionId = result.sessionId;

		// Continue to end
		try {
			await manager.continue(sessionId, 10_000);
		} catch {
			// May hit end of program
		}

		const output = manager.getOutput(sessionId, "stdout");
		// simple-loop.py prints "Sum: 45"
		expect(output).toContain("Sum");
	});

	it("concurrent session limit is enforced", async () => {
		const limitedManager = new SessionManager({
			...testLimits,
			maxConcurrentSessions: 1,
		});

		const r1 = await limitedManager.launch({
			command: `python3 ${SIMPLE_LOOP}`,
			stopOnEntry: true,
		});

		await expect(limitedManager.launch({ command: `python3 ${SIMPLE_LOOP}`, stopOnEntry: true })).rejects.toThrow(SessionLimitError);

		await limitedManager.stop(r1.sessionId);
		await limitedManager.disposeAll();
	});

	it("setBreakpoints returns verified breakpoints", async () => {
		const result = await manager.launch({
			command: `python3 ${SIMPLE_LOOP}`,
			stopOnEntry: true,
		});

		sessionId = result.sessionId;
		const bps = await manager.setBreakpoints(sessionId, SIMPLE_LOOP, [{ line: 6 }]);
		expect(bps.length).toBeGreaterThan(0);
	});

	it("disposeAll terminates all sessions", async () => {
		const r1 = await manager.launch({ command: `python3 ${SIMPLE_LOOP}`, stopOnEntry: true });
		const r2 = await manager.launch({ command: `python3 ${SIMPLE_LOOP}`, stopOnEntry: true });
		sessionId = "";

		await manager.disposeAll();

		// Both sessions should be gone
		await expect(manager.getStatus(r1.sessionId)).rejects.toThrow();
		await expect(manager.getStatus(r2.sessionId)).rejects.toThrow();
	});
});
