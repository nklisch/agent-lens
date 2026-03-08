/**
 * Test: use js-debug's launch mode with runtimeExecutable: "bun"
 * instead of the attach+websocketAddress approach.
 *
 * Hypothesis: js-debug's own watchdog mechanism may be able to trigger
 * Bun to start executing without needing Runtime.runIfWaitingForDebugger.
 */
import { spawn } from "node:child_process";
import * as net from "node:net";

async function allocatePort() {
	return new Promise((resolve) => {
		const srv = net.createServer();
		srv.listen(0, "127.0.0.1", () => {
			const port = srv.address().port;
			srv.close(() => resolve(port));
		});
	});
}

function connectTCP(host, port, retries = 10, delay = 300) {
	return new Promise((resolve, reject) => {
		let attempts = 0;
		const try_ = () => {
			const sock = net.createConnection({ host, port });
			sock.once("connect", () => resolve(sock));
			sock.once("error", (err) => {
				sock.destroy();
				if (++attempts < retries) setTimeout(try_, delay);
				else reject(err);
			});
		};
		try_();
	});
}

function parseDAPFrames(buf, callback) {
	while (true) {
		const h = buf.indexOf("\r\n\r\n");
		if (h === -1) break;
		const m = buf.subarray(0, h).toString().match(/Content-Length:\s*(\d+)/i);
		if (!m) {
			buf = buf.subarray(h + 4);
			continue;
		}
		const len = parseInt(m[1]);
		const start = h + 4;
		if (buf.length < start + len) break;
		try {
			callback(JSON.parse(buf.subarray(start, start + len).toString()));
		} catch {}
		buf = buf.subarray(start + len);
	}
	return buf;
}

const { getJsDebugAdapterPath } = await import("../src/adapters/js-debug-adapter.ts");
const dapAdapterPath = await getJsDebugAdapterPath();
const dapPort = await allocatePort();
const FIXTURE = "/home/nathan/dev/agent-lens/tests/fixtures/bun/conformance.ts";

console.log("dap port:", dapPort);
console.log("fixture:", FIXTURE);

// Spawn js-debug DAP adapter
const jsDebug = spawn("node", [dapAdapterPath, String(dapPort), "127.0.0.1"], { stdio: "pipe" });
jsDebug.stdout.on("data", (d) => process.stdout.write("[jsd-out] " + d));
jsDebug.stderr.on("data", (d) => process.stdout.write("[jsd-err] " + d));
await new Promise((r) => setTimeout(r, 800));

// Connect parent session
const sock = await connectTCP("127.0.0.1", dapPort);
console.log("Connected to js-debug");

let buf = Buffer.alloc(0);
let seq = 1;
let phase = "init"; // init -> launching -> waiting_child -> done

const send = (cmd, args) => {
	const json = JSON.stringify({ seq: seq++, type: "request", command: cmd, arguments: args });
	console.log(">> [parent]", cmd, args ? JSON.stringify(args).substring(0, 100) : "");
	sock.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
};
const sendResp = (reqSeq, cmd) => {
	const json = JSON.stringify({ seq: seq++, type: "response", request_seq: reqSeq, success: true, command: cmd, body: {} });
	sock.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
};

let childConfig = null;
const childPromise = new Promise((resolve, reject) => {
	const timer = setTimeout(() => reject(new Error("timeout waiting for startDebugging")), 15000);

	sock.on("data", (chunk) => {
		buf = parseDAPFrames(Buffer.concat([buf, chunk]), (msg) => {
			console.log("<< [parent]", JSON.stringify(msg).substring(0, 200));

			if (msg.type === "response" && msg.command === "initialize") {
				// For launch mode, send configurationDone then launch
				send("configurationDone");
				send("launch", {
					type: "pwa-node",
					request: "launch",
					program: FIXTURE,
					runtimeExecutable: "bun",
					args: [],
					cwd: "/home/nathan/dev/agent-lens",
					stopOnEntry: false,
					sourceMaps: true,
					noDebug: false,
				});
			} else if (msg.type === "request" && msg.command === "startDebugging") {
				clearTimeout(timer);
				sendResp(msg.seq, "startDebugging");
				childConfig = msg.arguments.configuration;
				console.log("Got child config:", JSON.stringify(childConfig).substring(0, 300));
				resolve(childConfig);
			} else if (msg.type === "request") {
				sendResp(msg.seq, msg.command);
			}
		});
	});
	sock.once("error", (e) => { clearTimeout(timer); reject(e); });
});

send("initialize", {
	clientID: "agent-lens",
	adapterID: "agent-lens",
	linesStartAt1: true,
	columnsStartAt1: true,
	supportsStartDebuggingRequest: true,
});

let gotChild;
try {
	gotChild = await childPromise;
} catch (e) {
	console.log("PARENT FAILED:", e.message);
	jsDebug.kill();
	process.exit(1);
}

// Now connect child session and try to hit a breakpoint
console.log("\n=== Connecting child session ===");
const childSock = await connectTCP("127.0.0.1", dapPort);
let cbuf = Buffer.alloc(0);
let cseq = 1;

const csend = (cmd, args) => {
	const json = JSON.stringify({ seq: cseq++, type: "request", command: cmd, arguments: args });
	console.log(">> [child]", cmd, args ? JSON.stringify(args).substring(0, 100) : "");
	childSock.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
};
const csendResp = (reqSeq, cmd) => {
	const json = JSON.stringify({ seq: cseq++, type: "response", request_seq: reqSeq, success: true, command: cmd, body: {} });
	childSock.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
};

const stoppedPromise = new Promise((resolve, reject) => {
	const timer = setTimeout(() => reject(new Error("timeout waiting for stopped event")), 20000);
	let initialized = false;
	let attached = false;

	childSock.on("data", (chunk) => {
		cbuf = parseDAPFrames(Buffer.concat([cbuf, chunk]), (msg) => {
			console.log("<< [child]", JSON.stringify(msg).substring(0, 300));
			if (msg.type === "response" && msg.command === "initialize") {
				// wait for initialized event
			} else if (msg.type === "event" && msg.event === "initialized" && !initialized) {
				initialized = true;
				csend("setBreakpoints", {
					source: { path: FIXTURE, name: "conformance.ts" },
					breakpoints: [{ line: 12 }],
				});
			} else if (msg.type === "response" && msg.command === "setBreakpoints" && !attached) {
				attached = true;
				csend("configurationDone", {});
				csend("attach", {
					noDebug: false,
					...gotChild,
				});
			} else if (msg.type === "event" && msg.event === "stopped") {
				clearTimeout(timer);
				resolve(msg);
			} else if (msg.type === "request") {
				csendResp(msg.seq, msg.command);
			}
		});
	});
	childSock.once("error", (e) => { clearTimeout(timer); reject(e); });
});

csend("initialize", {
	clientID: "agent-lens",
	adapterID: "agent-lens",
	linesStartAt1: true,
	columnsStartAt1: true,
	supportsStartDebuggingRequest: true,
});

try {
	const stopped = await stoppedPromise;
	console.log("\nSUCCESS! stopped:", JSON.stringify(stopped).substring(0, 300));
} catch (e) {
	console.log("\nFAILED:", e.message);
}

jsDebug.kill();
childSock.destroy();
sock.destroy();
