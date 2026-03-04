import { resolve } from "node:path";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SKIP_NO_DEBUGPY } from "../../helpers/debugpy-check.js";
import { callTool, createTestClient } from "../../helpers/mcp-test-client.js";

const FIXTURE = resolve(import.meta.dirname, "../../fixtures/python/simple-loop.py");

describe.skipIf(SKIP_NO_DEBUGPY)("E2E: output capture", () => {
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

	it("captures stdout from simple-loop.py", async () => {
		// 1. Launch with stopOnEntry
		const launchText = await callTool(client, "debug_launch", {
			command: `python3 ${FIXTURE}`,
			stop_on_entry: true,
		});
		sessionId = launchText.match(/Session: ([a-f0-9]{8})/)?.[1] ?? "";
		expect(sessionId).toBeTruthy();

		// 2. Continue to end (simple-loop.py runs to completion)
		try {
			await callTool(client, "debug_continue", {
				session_id: sessionId,
				timeout_ms: 10_000,
			});
		} catch {
			// May terminate without stopping
		}

		// 3. Get stdout output — should contain "Sum: 45"
		const output = await callTool(client, "debug_output", {
			session_id: sessionId,
			stream: "stdout",
		});
		expect(output).toContain("Sum");

		// 4. Stop
		await callTool(client, "debug_stop", { session_id: sessionId });
		sessionId = "";
	});
});
