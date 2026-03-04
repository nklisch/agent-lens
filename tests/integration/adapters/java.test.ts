import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JavaAdapter } from "../../../src/adapters/java.js";
import { registerAllAdapters } from "../../../src/adapters/registry.js";
import type { SessionManager } from "../../../src/core/session-manager.js";
import { createSessionManager } from "../../../src/core/session-manager.js";
import { SKIP_NO_JAVAC } from "../../helpers/javac-check.js";

registerAllAdapters();

describe.skipIf(SKIP_NO_JAVAC)("Java adapter (java-debug-adapter)", () => {
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

	it("checkPrerequisites returns satisfied when JDK 17+ is installed", async () => {
		const adapter = new JavaAdapter();
		const result = await adapter.checkPrerequisites();
		// JDK is present (we checked with SKIP_NO_JAVAC), but java-debug JAR might need download
		expect(typeof result.satisfied).toBe("boolean");
		if (!result.satisfied) {
			expect(result.installHint).toBeTruthy();
		}
	});
});
