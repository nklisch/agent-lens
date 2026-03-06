// Cross-adapter E2E test matrix.
// Runs the same MCP-level scenarios across Python, Node.js, and Go.
// Each language suite is skipped if its debugger is not installed.
import { resolve } from "node:path";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { SKIP_NO_CSHARP } from "../../helpers/csharp-check.js";
import { SKIP_NO_DEBUGPY } from "../../helpers/debugpy-check.js";
import { SKIP_NO_DLV } from "../../helpers/dlv-check.js";
import { SKIP_NO_KOTLIN } from "../../helpers/kotlin-check.js";
import { callTool, createTestClient } from "../../helpers/mcp-test-client.js";
import { SKIP_NO_NODE_DEBUG } from "../../helpers/node-check.js";
import { SKIP_NO_RDBG } from "../../helpers/ruby-check.js";
import { SKIP_NO_SWIFT } from "../../helpers/swift-check.js";

interface McpFixture {
	language: string;
	command: string;
	filePath: string;
	/** Line inside the loop body where a breakpoint reliably hits */
	loopBodyLine: number;
	/** Language-appropriate condition expression that is true when loop index is 3 */
	conditionExpression: string;
	/** Substring expected in stdout after the program runs to completion */
	outputSubstring: string;
	/** Variable names expected in local scope at loopBodyLine */
	expectedLocals: string[];
	/** Expression to evaluate at loopBodyLine */
	evalExpression: string;
	/** Substring expected in the evaluation result */
	evalExpectedSubstring: string;
	/** Whether the adapter supports stop_on_entry (Delve does not) */
	supportsStopOnEntry: boolean;
	/** Whether the adapter supports conditional breakpoints (KDA does not) */
	supportsConditionalBreakpoints?: boolean;
}

const PYTHON_FIXTURE = resolve(import.meta.dirname, "../../fixtures/python/simple-loop.py");
const NODE_FIXTURE = resolve(import.meta.dirname, "../../fixtures/node/simple-loop.js");
const GO_FIXTURE = resolve(import.meta.dirname, "../../fixtures/go/simple-loop.go");
const RUBY_FIXTURE = resolve(import.meta.dirname, "../../fixtures/ruby/simple-loop.rb");
const CSHARP_FIXTURE = resolve(import.meta.dirname, "../../fixtures/csharp/SimpleLoop.cs");
const SWIFT_FIXTURE = resolve(import.meta.dirname, "../../fixtures/swift/simple-loop.swift");
const KOTLIN_FIXTURE = resolve(import.meta.dirname, "../../fixtures/kotlin/SimpleLoop.kt");

// simple-loop.py       — line 7:  `total += i`  (inside sum_range, i starts at 0)
// simple-loop.js       — line 8:  `total += i`  (inside sumRange, i starts at 0)
// simple-loop.go       — line 10: `total += i`  (inside sumRange, i starts at 0)
// simple-loop.rb       — line 4:  `total += i`  (inside sum_range block, i starts at 0)
// SimpleLoop.cs        — line 8:  `total += i;` (inside SumRange, i starts at 0)
// simple-loop.swift    — line 4:  `total += i`  (inside sumRange, i starts at 0)
// SimpleLoop.kt        — line 4:  `total += i`  (inside sumRange, i starts at 0)

const FIXTURES: Array<{ fixture: McpFixture; skip: boolean }> = [
	{
		fixture: {
			language: "Python",
			command: `python3 ${PYTHON_FIXTURE}`,
			filePath: PYTHON_FIXTURE,
			loopBodyLine: 7,
			conditionExpression: "i == 3",
			outputSubstring: "Sum",
			expectedLocals: ["i", "total"],
			evalExpression: "i + 1",
			evalExpectedSubstring: "1",
			supportsStopOnEntry: true,
		},
		skip: SKIP_NO_DEBUGPY,
	},
	{
		fixture: {
			language: "Node.js",
			command: `node ${NODE_FIXTURE}`,
			filePath: NODE_FIXTURE,
			loopBodyLine: 8,
			conditionExpression: "i === 3",
			outputSubstring: "Sum",
			expectedLocals: ["i", "total"],
			evalExpression: "i + 1",
			evalExpectedSubstring: "1",
			supportsStopOnEntry: true,
		},
		skip: SKIP_NO_NODE_DEBUG,
	},
	{
		fixture: {
			language: "Go",
			command: `go run ${GO_FIXTURE}`,
			filePath: GO_FIXTURE,
			loopBodyLine: 10,
			conditionExpression: "i == 3",
			outputSubstring: "Sum",
			expectedLocals: ["i", "total"],
			evalExpression: "i + 1",
			evalExpectedSubstring: "1",
			supportsStopOnEntry: false, // Delve does not support stop_on_entry with go run
		},
		skip: SKIP_NO_DLV,
	},
	{
		fixture: {
			language: "Ruby",
			command: `ruby ${RUBY_FIXTURE}`,
			filePath: RUBY_FIXTURE,
			loopBodyLine: 4,
			conditionExpression: "i == 3",
			outputSubstring: "Sum",
			expectedLocals: ["i", "total"],
			evalExpression: "i + 1",
			evalExpectedSubstring: "1",
			supportsStopOnEntry: false,
		},
		skip: SKIP_NO_RDBG,
	},
	{
		fixture: {
			language: "C#",
			command: CSHARP_FIXTURE,
			filePath: CSHARP_FIXTURE,
			loopBodyLine: 8,
			conditionExpression: "i == 3",
			outputSubstring: "Sum",
			expectedLocals: ["i", "total"],
			evalExpression: "i + 1",
			evalExpectedSubstring: "1",
			supportsStopOnEntry: false,
		},
		skip: SKIP_NO_CSHARP,
	},
	{
		fixture: {
			language: "Swift",
			command: SWIFT_FIXTURE,
			filePath: SWIFT_FIXTURE,
			loopBodyLine: 4,
			conditionExpression: "i == 3",
			outputSubstring: "Sum",
			expectedLocals: ["i", "total"],
			evalExpression: "i + 1",
			evalExpectedSubstring: "1",
			supportsStopOnEntry: false,
		},
		skip: SKIP_NO_SWIFT,
	},
	{
		fixture: {
			language: "Kotlin",
			command: KOTLIN_FIXTURE,
			filePath: KOTLIN_FIXTURE,
			loopBodyLine: 4,
			conditionExpression: "i == 3",
			outputSubstring: "Sum",
			expectedLocals: ["i", "total"],
			evalExpression: "i + 1",
			evalExpectedSubstring: "1",
			supportsStopOnEntry: false,
			supportsConditionalBreakpoints: false,
		},
		skip: SKIP_NO_KOTLIN,
	},
];

function runMcpSuite(fixture: McpFixture): void {
	const TIMEOUT = 30_000;
	const basename = fixture.filePath.split("/").pop()!;

	let client: Client;
	let cleanup: () => Promise<void>;
	let sessionId = "";

	beforeAll(async () => {
		({ client, cleanup } = await createTestClient());
	});

	afterAll(async () => {
		await cleanup();
	});

	afterEach(async () => {
		if (sessionId) {
			try {
				await callTool(client, "debug_stop", { session_id: sessionId });
			} catch {
				// already stopped or never fully launched — ignore
			}
			sessionId = "";
		}
	});

	it(
		"launch → breakpoint → STOPPED and filename in viewport",
		async () => {
			const launch = await callTool(client, "debug_launch", {
				command: fixture.command,
				breakpoints: [{ file: fixture.filePath, breakpoints: [{ line: fixture.loopBodyLine }] }],
			});
			sessionId = launch.match(/Session: ([a-f0-9]{8})/)?.[1] ?? "";
			expect(sessionId).toBeTruthy();

			const viewport = await callTool(client, "debug_continue", { session_id: sessionId, timeout_ms: TIMEOUT });
			expect(viewport).toContain("STOPPED");
			expect(viewport).toContain(basename);
		},
		TIMEOUT,
	);

	it(
		"step over → still STOPPED",
		async () => {
			const launch = await callTool(client, "debug_launch", {
				command: fixture.command,
				breakpoints: [{ file: fixture.filePath, breakpoints: [{ line: fixture.loopBodyLine }] }],
			});
			sessionId = launch.match(/Session: ([a-f0-9]{8})/)?.[1] ?? "";
			expect(sessionId).toBeTruthy();

			await callTool(client, "debug_continue", { session_id: sessionId, timeout_ms: TIMEOUT });
			const afterStep = await callTool(client, "debug_step", { session_id: sessionId, direction: "over" });
			expect(afterStep).toContain("STOPPED");
		},
		TIMEOUT,
	);

	it(
		"variables → expected locals present",
		async () => {
			const launch = await callTool(client, "debug_launch", {
				command: fixture.command,
				breakpoints: [{ file: fixture.filePath, breakpoints: [{ line: fixture.loopBodyLine }] }],
			});
			sessionId = launch.match(/Session: ([a-f0-9]{8})/)?.[1] ?? "";
			expect(sessionId).toBeTruthy();

			await callTool(client, "debug_continue", { session_id: sessionId, timeout_ms: TIMEOUT });
			const vars = await callTool(client, "debug_variables", { session_id: sessionId, scope: "local" });
			for (const name of fixture.expectedLocals) {
				expect(vars).toContain(name);
			}
		},
		TIMEOUT,
	);

	it(
		"stack trace → filename present",
		async () => {
			const launch = await callTool(client, "debug_launch", {
				command: fixture.command,
				breakpoints: [{ file: fixture.filePath, breakpoints: [{ line: fixture.loopBodyLine }] }],
			});
			sessionId = launch.match(/Session: ([a-f0-9]{8})/)?.[1] ?? "";
			expect(sessionId).toBeTruthy();

			await callTool(client, "debug_continue", { session_id: sessionId, timeout_ms: TIMEOUT });
			const stack = await callTool(client, "debug_stack_trace", { session_id: sessionId });
			expect(stack).toContain(basename);
		},
		TIMEOUT,
	);

	it.skipIf(!fixture.supportsStopOnEntry)(
		"output capture → stdout contains expected output",
		async () => {
			const launch = await callTool(client, "debug_launch", {
				command: fixture.command,
				stop_on_entry: true,
			});
			sessionId = launch.match(/Session: ([a-f0-9]{8})/)?.[1] ?? "";
			expect(sessionId).toBeTruthy();

			try {
				await callTool(client, "debug_continue", { session_id: sessionId, timeout_ms: TIMEOUT });
			} catch {
				// program may terminate without stopping — that's fine
			}

			const output = await callTool(client, "debug_output", { session_id: sessionId, stream: "stdout" });
			expect(output).toContain(fixture.outputSubstring);
		},
		TIMEOUT,
	);

	it.skipIf(fixture.supportsConditionalBreakpoints === false)(
		"conditional breakpoint → stops with i = 3",
		async () => {
			const launch = await callTool(client, "debug_launch", {
				command: fixture.command,
				breakpoints: [{ file: fixture.filePath, breakpoints: [{ line: fixture.loopBodyLine, condition: fixture.conditionExpression }] }],
			});
			sessionId = launch.match(/Session: ([a-f0-9]{8})/)?.[1] ?? "";
			expect(sessionId).toBeTruthy();

			const viewport = await callTool(client, "debug_continue", { session_id: sessionId, timeout_ms: TIMEOUT });
			expect(viewport).toContain("STOPPED");
			// Verify i=3 via variables — viewport format varies per adapter
			const vars = await callTool(client, "debug_variables", { session_id: sessionId, scope: "local" });
			expect(vars).toMatch(/i\s*[=:]\s*(?:<\w+:\s*)?3/);
		},
		TIMEOUT,
	);

	it(
		"evaluate expression → returns expected value",
		async () => {
			const launch = await callTool(client, "debug_launch", {
				command: fixture.command,
				breakpoints: [{ file: fixture.filePath, breakpoints: [{ line: fixture.loopBodyLine }] }],
			});
			sessionId = launch.match(/Session: ([a-f0-9]{8})/)?.[1] ?? "";
			expect(sessionId).toBeTruthy();

			await callTool(client, "debug_continue", { session_id: sessionId, timeout_ms: TIMEOUT });
			const result = await callTool(client, "debug_evaluate", { session_id: sessionId, expression: fixture.evalExpression });
			expect(result).toContain(fixture.evalExpectedSubstring);
		},
		TIMEOUT,
	);

	it(
		"debug_status → capabilities section present",
		async () => {
			const launch = await callTool(client, "debug_launch", {
				command: fixture.command,
				breakpoints: [{ file: fixture.filePath, breakpoints: [{ line: fixture.loopBodyLine }] }],
			});
			sessionId = launch.match(/Session: ([a-f0-9]{8})/)?.[1] ?? "";
			expect(sessionId).toBeTruthy();

			await callTool(client, "debug_continue", { session_id: sessionId, timeout_ms: TIMEOUT });
			const status = await callTool(client, "debug_status", { session_id: sessionId });
			expect(status).toContain("Capabilities:");
		},
		TIMEOUT,
	);

	it(
		"clean stop → session terminates",
		async () => {
			const launch = await callTool(client, "debug_launch", {
				command: fixture.command,
				breakpoints: [{ file: fixture.filePath, breakpoints: [{ line: fixture.loopBodyLine }] }],
			});
			sessionId = launch.match(/Session: ([a-f0-9]{8})/)?.[1] ?? "";
			expect(sessionId).toBeTruthy();

			const stopResult = await callTool(client, "debug_stop", { session_id: sessionId });
			sessionId = ""; // already stopped, prevent double-stop in afterEach
			expect(stopResult).toMatch(/terminated|stopped/i);
		},
		TIMEOUT,
	);
}

for (const { fixture, skip } of FIXTURES) {
	describe.skipIf(skip)(`E2E cross-adapter: ${fixture.language}`, () => {
		runMcpSuite(fixture);
	});
}
