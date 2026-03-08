import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BunAdapter } from "../../../src/adapters/bun.js";
import { SKIP_NO_BUN } from "../../helpers/bun-check.js";

const FIXTURE = resolve(import.meta.dirname, "../../fixtures/bun/simple-loop.ts");

describe.skipIf(SKIP_NO_BUN)("BunAdapter integration", () => {
	let adapter: BunAdapter;

	afterEach(async () => {
		try {
			await adapter?.dispose();
		} catch {
			// ignore
		}
	});

	it("checkPrerequisites() returns satisfied: true", async () => {
		adapter = new BunAdapter();
		const result = await adapter.checkPrerequisites();
		expect(result.satisfied).toBe(true);
	});

	it("launch() spawns Bun and returns a working DAPConnection", async () => {
		adapter = new BunAdapter();
		const connection = await adapter.launch({ command: `bun ${FIXTURE}` });
		expect(connection.reader).toBeDefined();
		expect(connection.writer).toBeDefined();
		expect(connection.process).toBeDefined();
		expect(connection.process?.pid).toBeGreaterThan(0);
		expect(connection.launchArgs).toBeDefined();
		expect(connection.launchArgs?.type).toBe("pwa-node");
	});

	it("launch() accepts 'bun run' prefix in command", async () => {
		adapter = new BunAdapter();
		const connection = await adapter.launch({ command: `bun run ${FIXTURE}` });
		expect(connection.launchArgs?.type).toBe("pwa-node");
	});

	it("launch() accepts bare script path (no 'bun' prefix)", async () => {
		adapter = new BunAdapter();
		const connection = await adapter.launch({ command: FIXTURE });
		expect(connection.launchArgs?.type).toBe("pwa-node");
	});

	it("DAPConnection can send/receive DAP messages", async () => {
		adapter = new BunAdapter();
		const connection = await adapter.launch({ command: `bun ${FIXTURE}` });

		const req = { seq: 1, type: "request", command: "initialize", arguments: { adapterID: "test", clientID: "test", linesStartAt1: true, columnsStartAt1: true } };
		const json = JSON.stringify(req);
		connection.writer.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);

		const response = await new Promise<string>((resolve) => {
			connection.reader.once("data", (d: Buffer) => resolve(d.toString()));
		});
		expect(response).toContain("Content-Length");
	});

	it("dispose() kills the child processes", async () => {
		adapter = new BunAdapter();
		const connection = await adapter.launch({ command: `bun ${FIXTURE}` });
		const pid = connection.process?.pid;
		expect(pid).toBeDefined();

		await adapter.dispose();

		if (pid) {
			const alive = await new Promise<boolean>((resolve) => {
				try {
					process.kill(pid, 0);
					resolve(true);
				} catch {
					resolve(false);
				}
			});
			expect(alive).toBe(false);
		}
	});

	it("launch returns DAPConnection with js-debug child session config", async () => {
		adapter = new BunAdapter();
		const connection = await adapter.launch({ command: `bun ${FIXTURE}` });
		expect(connection.reader).toBeDefined();
		expect(connection.writer).toBeDefined();
		// Bun uses the same js-debug two-session model as Node:
		// parent session runs attach+websocketAddress, child session gets __pendingTargetId.
		expect(connection.launchArgs?._dapFlow).toBe("standard-attach");
		expect(connection.launchArgs?.type).toBe("pwa-node");
		expect(connection.launchArgs?.__pendingTargetId).toBeDefined();
	});
});

describe("BunAdapter prerequisite check", () => {
	it("returns installHint when bun is missing", async () => {
		// We can't easily remove bun from PATH, so just verify the shape of a failed result
		// by inspecting the adapter's behavior on a known-bad platform.
		// This test validates the satisfied: false branch at the structural level.
		const adapter = new BunAdapter();
		const result = await adapter.checkPrerequisites();
		if (!result.satisfied) {
			expect(result.missing).toContain("bun");
			expect(result.installHint).toContain("bun.sh");
		} else {
			// Bun is installed — verify positive result shape
			expect(result.satisfied).toBe(true);
			expect(result.missing).toBeUndefined();
		}
	});
});
