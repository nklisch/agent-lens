/**
 * Exact replication of the session-manager flow for Bun.
 * Mirrors runJsDebugBunParentSession + session-manager standard-attach child session.
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
function connectTCP(host, port, retries = 5, delay = 300) {
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
		const m = buf
			.subarray(0, h)
			.toString()
			.match(/Content-Length:\s*(\d+)/i);
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

function runParentSession(sock, attachArgs) {
	return new Promise((resolve, reject) => {
		let buf = Buffer.alloc(0);
		let seq = 1;
		let settled = false;
		const timer = setTimeout(() => {
			settled = true;
			reject(new Error("startDebugging timeout"));
		}, 15000);
		const send = (cmd, args) => {
			const json = JSON.stringify({ seq: seq++, type: "request", command: cmd, arguments: args });
			console.log("[parent] >>", cmd);
			sock.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
		};
		const sendResp = (reqSeq, cmd) => {
			const json = JSON.stringify({ seq: seq++, type: "response", request_seq: reqSeq, success: true, command: cmd, body: {} });
			sock.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
		};
		sock.on("data", (chunk) => {
			buf = parseDAPFrames(Buffer.concat([buf, chunk]), (msg) => {
				console.log("[parent] <<", JSON.stringify(msg).substring(0, 150));
				if (msg.type === "response" && msg.command === "initialize") {
					send("configurationDone");
					send("attach", attachArgs);
				} else if (msg.type === "event" && msg.event === "initialized") {
					// already handled above via initialize response
				} else if (msg.type === "request" && msg.command === "startDebugging" && !settled) {
					settled = true;
					clearTimeout(timer);
					sendResp(msg.seq, "startDebugging");
					resolve(msg.arguments.configuration);
				} else if (msg.type === "request") {
					sendResp(msg.seq, msg.command);
				}
			});
		});
		sock.once("error", (e) => {
			if (!settled) {
				settled = true;
				clearTimeout(timer);
				reject(e);
			}
		});
		send("initialize", { clientID: "agent-lens", adapterID: "agent-lens", linesStartAt1: true, columnsStartAt1: true, supportsStartDebuggingRequest: true });
	});
}

function runChildSession(sock, childConfig, fixturePath) {
	return new Promise((resolve, reject) => {
		let buf = Buffer.alloc(0);
		let seq = 1;
		let gotInitialized = false;
		let attachSent = false;
		const timer = setTimeout(() => reject(new Error("child session stopped timeout")), 15000);
		const send = (cmd, args) => {
			const json = JSON.stringify({ seq: seq++, type: "request", command: cmd, arguments: args });
			console.log("[child] >>", cmd, args ? JSON.stringify(args).substring(0, 80) : "");
			sock.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
		};
		const sendResp = (reqSeq, cmd) => {
			const json = JSON.stringify({ seq: seq++, type: "response", request_seq: reqSeq, success: true, command: cmd, body: {} });
			sock.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
		};
		sock.on("data", (chunk) => {
			buf = parseDAPFrames(Buffer.concat([buf, chunk]), (msg) => {
				console.log("[child] <<", JSON.stringify(msg).substring(0, 200));
				if (msg.type === "response" && msg.command === "initialize") {
					// do nothing — wait for initialized event
				} else if (msg.type === "event" && msg.event === "initialized" && !gotInitialized) {
					gotInitialized = true;
					send("setBreakpoints", { source: { path: fixturePath, name: "conformance.ts" }, breakpoints: [{ line: 12 }] });
				} else if (msg.type === "response" && msg.command === "setBreakpoints" && !attachSent) {
					attachSent = true;
					send("configurationDone", {});
					// Attach with the full child config including __pendingTargetId
					send("attach", {
						noDebug: false,
						program: `bun ${fixturePath}`,
						stopOnEntry: false,
						...childConfig,
					});
				} else if (msg.type === "event" && msg.event === "stopped") {
					clearTimeout(timer);
					resolve(msg);
				} else if (msg.type === "request") {
					sendResp(msg.seq, msg.command);
				}
			});
		});
		sock.once("error", (e) => {
			clearTimeout(timer);
			reject(e);
		});
		send("initialize", { clientID: "agent-lens", adapterID: "agent-lens", linesStartAt1: true, columnsStartAt1: true, supportsStartDebuggingRequest: true });
	});
}

// ── Main ──
const { getJsDebugAdapterPath } = await import("../src/adapters/js-debug-adapter.ts");
const dapAdapterPath = await getJsDebugAdapterPath();
const dapPort = await allocatePort();
const inspectPort = await allocatePort();
const FIXTURE = "/home/nathan/dev/agent-lens/tests/fixtures/bun/conformance.ts";

console.log("ports: dap=%d inspect=%d", dapPort, inspectPort);

const jsDebug = spawn("node", [dapAdapterPath, String(dapPort), "127.0.0.1"], { stdio: "pipe" });
jsDebug.stdout.on("data", (d) => process.stdout.write("[jsd] " + d));
await new Promise((r) => setTimeout(r, 800));

const bunOut = [];
const bunProc = spawn("bun", [`--inspect-brk=127.0.0.1:${inspectPort}`, FIXTURE], { stdio: "pipe" });
bunProc.stderr.on("data", (d) => {
	bunOut.push(d.toString());
	process.stdout.write("[bun] " + d);
});
await new Promise((r) => setTimeout(r, 1200));

const wsMatch = bunOut.join("").match(/ws:\/\/[^\s]+/);
const wsAddr = wsMatch ? wsMatch[0] : undefined;
console.log("WebSocket URL:", wsAddr);

// Parent session
const parentSock = await connectTCP("127.0.0.1", dapPort);
const childConfig = await runParentSession(parentSock, { type: "pwa-node", port: inspectPort, host: "127.0.0.1", ...(wsAddr ? { websocketAddress: wsAddr } : {}) });
console.log("Got child config:", JSON.stringify(childConfig));

// Child session
const childSock = await connectTCP("127.0.0.1", dapPort);
try {
	const stopped = await runChildSession(childSock, childConfig, FIXTURE);
	console.log("SUCCESS! stopped event:", JSON.stringify(stopped).substring(0, 300));
} catch (e) {
	console.log("FAILED:", e.message);
}

jsDebug.kill();
bunProc.kill();
