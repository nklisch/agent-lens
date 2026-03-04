import { resolve } from "node:path";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SKIP_NO_DEBUGPY } from "../../helpers/debugpy-check.js";
import { callTool, createTestClient } from "../../helpers/mcp-test-client.js";

const FIXTURE = resolve(import.meta.dirname, "../../fixtures/python/simple-loop.py");

describe.skipIf(SKIP_NO_DEBUGPY)("E2E: step and inspect", () => {
	let client: Client;
	let cleanup: () => Promise<void>;
	let sessionId: string;

	beforeAll(async () => {
		({ client, cleanup } = await createTestClient());
	});

	afterAll(async () => {
		if (sessionId) {
			try {
				await callTool(client, "debug_stop", { session_id: sessionId });
			} catch {
				// ignore
			}
		}
		await cleanup();
	});

	it("step through simple-loop.py and inspect variables", async () => {
		// 1. Launch with breakpoint at line 6 (inside loop)
		const launchText = await callTool(client, "debug_launch", {
			command: `python3 ${FIXTURE}`,
			breakpoints: [{ file: FIXTURE, breakpoints: [{ line: 6 }] }],
		});
		sessionId = launchText.match(/Session: ([a-f0-9]{8})/)?.[1] ?? "";
		expect(sessionId).toBeTruthy();

		// 2. Continue to breakpoint
		const viewport1 = await callTool(client, "debug_continue", {
			session_id: sessionId,
			timeout_ms: 10_000,
		});
		expect(viewport1).toContain("STOPPED");

		// 3. Step over
		const viewport2 = await callTool(client, "debug_step", {
			session_id: sessionId,
			direction: "over",
		});
		expect(viewport2).toContain("STOPPED");

		// 4. Get variables
		const vars = await callTool(client, "debug_variables", {
			session_id: sessionId,
			scope: "local",
		});
		expect(typeof vars).toBe("string");

		// 5. Get stack trace
		const stack = await callTool(client, "debug_stack_trace", { session_id: sessionId });
		expect(stack).toContain("simple-loop.py");

		// 6. Stop
		await callTool(client, "debug_stop", { session_id: sessionId });
		sessionId = "";
	});
});
