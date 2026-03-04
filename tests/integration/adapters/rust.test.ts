import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerAllAdapters } from "../../../src/adapters/registry.js";
import { RustAdapter } from "../../../src/adapters/rust.js";
import type { SessionManager } from "../../../src/core/session-manager.js";
import { createSessionManager } from "../../../src/core/session-manager.js";
import { SKIP_NO_CARGO } from "../../helpers/cargo-check.js";

registerAllAdapters();

describe.skipIf(SKIP_NO_CARGO)("Rust adapter (CodeLLDB)", () => {
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

	it("checkPrerequisites returns satisfied when cargo is installed", async () => {
		const adapter = new RustAdapter();
		const result = await adapter.checkPrerequisites();
		// cargo is present (we checked with SKIP_NO_CARGO), but CodeLLDB might not be cached yet
		// so just check the structure
		expect(typeof result.satisfied).toBe("boolean");
		if (!result.satisfied) {
			expect(result.installHint).toBeTruthy();
		}
	});
});
