import { resolve } from "node:path";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SKIP_NO_DEBUGPY } from "../../helpers/debugpy-check.js";
import { callTool, createTestClient } from "../../helpers/mcp-test-client.js";

const FIXTURE = resolve(import.meta.dirname, "../../fixtures/python/discount-bug.py");

describe.skipIf(SKIP_NO_DEBUGPY)("E2E: discount-bug scenario", () => {
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

	it("full debug scenario: launch → continue → evaluate → stop", async () => {
		// 1. Launch with breakpoint at line 13 (discount = calculate_discount(...))
		const launchResult = await callTool(client, "debug_launch", {
			command: `python3 ${FIXTURE}`,
			breakpoints: [
				{
					file: FIXTURE,
					breakpoints: [{ line: 13 }],
				},
			],
		});
		expect(launchResult).toContain("Session:");
		sessionId = launchResult.match(/Session: ([a-f0-9]{8})/)?.[1] ?? "";
		expect(sessionId).toBeTruthy();

		// 2. Continue to breakpoint
		const viewport = await callTool(client, "debug_continue", {
			session_id: sessionId,
			timeout_ms: 10_000,
		});
		expect(viewport).toContain("STOPPED");

		// 3. Evaluate discount expression
		const evalResult = await callTool(client, "debug_evaluate", {
			session_id: sessionId,
			expression: "tier_multipliers['gold']",
		});
		expect(evalResult).toContain("1.0");

		// 4. Stop session
		const stopResult = await callTool(client, "debug_stop", { session_id: sessionId });
		expect(stopResult).toContain("terminated");
		sessionId = "";
	});
});
