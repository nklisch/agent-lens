import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CppAdapter } from "../../../src/adapters/cpp.js";
import { registerAllAdapters } from "../../../src/adapters/registry.js";
import type { SessionManager } from "../../../src/core/session-manager.js";
import { createSessionManager } from "../../../src/core/session-manager.js";
import { SKIP_NO_GDB } from "../../helpers/gdb-check.js";

registerAllAdapters();

const FIXTURE_C = resolve(import.meta.dirname, "../../fixtures/cpp/hello.c");

describe.skipIf(SKIP_NO_GDB)("C/C++ adapter (GDB DAP)", () => {
	let sessionManager: SessionManager;
	let sessionId: string | null = null;

	beforeEach(() => {
		sessionManager = createSessionManager();
	});

	afterEach(async () => {
		if (sessionId) {
			try {
				await sessionManager.stop(sessionId);
			} catch {}
			sessionId = null;
		}
	});

	it("checkPrerequisites returns satisfied when GDB 14+ is available", async () => {
		const adapter = new CppAdapter();
		const result = await adapter.checkPrerequisites();
		expect(result.satisfied).toBe(true);
	});

	it("launches C program and hits a breakpoint", async () => {
		const result = await sessionManager.launch({
			command: FIXTURE_C,
			language: "cpp",
			breakpoints: [{ file: FIXTURE_C, breakpoints: [{ line: 6 }] }],
		});
		sessionId = result.sessionId;

		const viewport = await sessionManager.continue(sessionId, 15_000);
		expect(viewport).toContain("STOPPED");
	}, 30_000);
});
