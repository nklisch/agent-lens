import { PassThrough } from "node:stream";
import type { DebugProtocol } from "@vscode/debugprotocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DAPClient } from "../../../src/core/dap-client.js";
import { DAPClientDisposedError, DAPTimeoutError } from "../../../src/core/errors.js";

function makeStreams() {
	const toClient = new PassThrough(); // server writes here → client reads
	const fromClient = new PassThrough(); // client writes here → server reads
	return { toClient, fromClient };
}

function writeDAP(stream: PassThrough, message: object): void {
	const json = JSON.stringify(message);
	stream.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
}

function makeMockResponse(stream: PassThrough, requestSeq: number, command: string, body: object = {}): void {
	const response: DebugProtocol.Response = {
		type: "response",
		seq: requestSeq + 1000,
		request_seq: requestSeq,
		success: true,
		command,
		body,
	};
	writeDAP(stream, response);
}

function makeMockEvent(stream: PassThrough, event: string, body: object = {}): void {
	const evt: DebugProtocol.Event = {
		type: "event",
		seq: Math.floor(Math.random() * 10000),
		event,
		body,
	};
	writeDAP(stream, evt);
}

describe("DAPClient", () => {
	let client: DAPClient;
	let toClient: PassThrough;
	let fromClient: PassThrough;

	beforeEach(() => {
		const streams = makeStreams();
		toClient = streams.toClient;
		fromClient = streams.fromClient;
		client = new DAPClient({ requestTimeoutMs: 500, stopTimeoutMs: 500 });
		client.attachStreams(toClient, fromClient);
	});

	afterEach(() => {
		client.dispose();
	});

	it("send() resolves with correct response for matching request_seq", async () => {
		const sendPromise = client.send("threads");

		// Read what the client sent
		const written = await new Promise<string>((resolve) => {
			fromClient.once("data", (d: Buffer) => resolve(d.toString()));
		});
		expect(written).toContain('"command":"threads"');
		const headerMatch = written.match(/Content-Length: (\d+)/);
		expect(headerMatch).toBeTruthy();
		const body = JSON.parse(written.slice(written.indexOf("\r\n\r\n") + 4)) as DebugProtocol.Request;

		// Reply
		makeMockResponse(toClient, body.seq, "threads", { threads: [] });

		const response = await sendPromise;
		expect(response.success).toBe(true);
		expect(response.command).toBe("threads");
	});

	it("send() rejects after requestTimeoutMs with DAPTimeoutError", async () => {
		await expect(client.send("threads")).rejects.toThrow(DAPTimeoutError);
	});

	it("send() handles error responses (success: false)", async () => {
		const sendPromise = client.send("evaluate");

		const written = await new Promise<string>((resolve) => {
			fromClient.once("data", (d: Buffer) => resolve(d.toString()));
		});
		const body = JSON.parse(written.slice(written.indexOf("\r\n\r\n") + 4)) as DebugProtocol.Request;

		// Send error response
		const errResponse: DebugProtocol.Response = {
			type: "response",
			seq: 9999,
			request_seq: body.seq,
			success: false,
			command: "evaluate",
			message: "Expression failed",
		};
		writeDAP(toClient, errResponse);

		await expect(sendPromise).rejects.toThrow("Expression failed");
	});

	it("initialize() completes handshake and returns capabilities", async () => {
		const initPromise = client.initialize();

		// Wait for initialize request
		await new Promise<void>((resolve) => {
			fromClient.once("data", (d: Buffer) => {
				const msg = JSON.parse(d.toString().slice(d.toString().indexOf("\r\n\r\n") + 4)) as DebugProtocol.Request;
				expect(msg.command).toBe("initialize");
				// Send response
				makeMockResponse(toClient, msg.seq, "initialize", { supportsConfigurationDoneRequest: true });
				// Send initialized event
				setTimeout(() => makeMockEvent(toClient, "initialized"), 10);
				resolve();
			});
		});

		const caps = await initPromise;
		expect(caps).toBeDefined();
		expect(caps.supportsConfigurationDoneRequest).toBe(true);
		expect(client.connected).toBe(true);
	});

	it("waitForStop() resolves on stopped event", async () => {
		const waitPromise = client.waitForStop(1000);
		makeMockEvent(toClient, "stopped", { reason: "breakpoint", threadId: 1 });
		const result = await waitPromise;
		expect(result.type).toBe("stopped");
		if (result.type === "stopped") {
			expect(result.event.body.reason).toBe("breakpoint");
			expect(result.event.body.threadId).toBe(1);
		}
	});

	it("waitForStop() resolves on terminated event", async () => {
		const waitPromise = client.waitForStop(1000);
		makeMockEvent(toClient, "terminated", {});
		const result = await waitPromise;
		expect(result.type).toBe("terminated");
	});

	it("waitForStop() resolves on exited event", async () => {
		const waitPromise = client.waitForStop(1000);
		makeMockEvent(toClient, "exited", { exitCode: 0 });
		const result = await waitPromise;
		expect(result.type).toBe("exited");
	});

	it("waitForStop() rejects on timeout", async () => {
		await expect(client.waitForStop(100)).rejects.toThrow(DAPTimeoutError);
	});

	it("multiple concurrent send() calls resolve independently", async () => {
		const p1 = client.send<DebugProtocol.ThreadsResponse>("threads");
		const p2 = client.send<DebugProtocol.ScopesResponse>("scopes");

		// Collect two requests
		const messages: DebugProtocol.Request[] = [];
		await new Promise<void>((resolve) => {
			let count = 0;
			fromClient.on("data", (d: Buffer) => {
				const raw = d.toString();
				const bodyStart = raw.indexOf("\r\n\r\n") + 4;
				const msg = JSON.parse(raw.slice(bodyStart)) as DebugProtocol.Request;
				messages.push(msg);
				count++;
				if (count === 2) resolve();
			});
		});

		// Reply in reverse order
		makeMockResponse(toClient, messages[1].seq, "scopes", { scopes: [] });
		makeMockResponse(toClient, messages[0].seq, "threads", { threads: [] });

		const [r1, r2] = await Promise.all([p1, p2]);
		expect(r1.command).toBe("threads");
		expect(r2.command).toBe("scopes");
	});

	it("malformed DAP messages are skipped without crashing", async () => {
		// Write garbage data
		toClient.write("GARBAGE_DATA_NOT_DAP\r\n\r\n{}");
		// Wait a tick and verify client is still functional
		await new Promise((resolve) => setTimeout(resolve, 50));

		const sendPromise = client.send("threads");
		const written = await new Promise<string>((resolve) => {
			fromClient.once("data", (d: Buffer) => resolve(d.toString()));
		});
		const body = JSON.parse(written.slice(written.indexOf("\r\n\r\n") + 4)) as DebugProtocol.Request;
		makeMockResponse(toClient, body.seq, "threads", { threads: [] });
		const response = await sendPromise;
		expect(response.success).toBe(true);
	});

	it("dispose() rejects all pending requests", async () => {
		const p = client.send("threads");
		client.dispose();
		await expect(p).rejects.toThrow(DAPClientDisposedError);
	});

	it("event handlers are called for matching events", async () => {
		let received = false;
		client.on("stopped", () => {
			received = true;
		});
		makeMockEvent(toClient, "stopped", { reason: "step", threadId: 1 });
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(received).toBe(true);
	});

	it("off() removes event handlers", async () => {
		let count = 0;
		const handler = () => {
			count++;
		};
		client.on("stopped", handler);
		client.off("stopped", handler);
		makeMockEvent(toClient, "stopped", { reason: "step", threadId: 1 });
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(count).toBe(0);
	});

	it("send() after dispose() rejects with DAPClientDisposedError", async () => {
		client.dispose();
		await expect(client.send("threads")).rejects.toThrow(DAPClientDisposedError);
	});
});
