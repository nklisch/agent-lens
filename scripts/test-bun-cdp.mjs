/**
 * Direct CDP test: Connect to Bun WebSocket and see what source URLs it reports
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

const inspectPort = await allocatePort();
const FIXTURE = "/home/nathan/dev/agent-lens/tests/fixtures/bun/conformance.ts";

const bunOut = [];
const bunProc = spawn("bun", [`--inspect-brk=127.0.0.1:${inspectPort}`, FIXTURE], { stdio: "pipe" });
bunProc.stderr.on("data", (d) => {
	bunOut.push(d.toString());
	process.stdout.write("[bun] " + d);
});
await new Promise((r) => setTimeout(r, 1200));

const wsAddr = bunOut.join("").match(/ws:\/\/[^\s]+/)?.[0];
console.log("WebSocket URL:", wsAddr);

// Connect directly via WebSocket CDP
const ws = new globalThis.WebSocket(wsAddr);
let msgId = 1;
const pending = new Map();

ws.onmessage = (e) => {
	const msg = JSON.parse(e.data);
	if (msg.id && pending.has(msg.id)) {
		pending.get(msg.id)(msg);
		pending.delete(msg.id);
	} else {
		const preview = JSON.stringify(msg).substring(0, 200);
		if (!preview.includes("node_internals") && !preview.includes("<anonymous>")) {
			console.log("[cdp event]", preview);
		}
	}
};

const send = (method, params = {}) =>
	new Promise((resolve) => {
		const id = msgId++;
		pending.set(id, resolve);
		ws.send(JSON.stringify({ id, method, params }));
	});

await new Promise((r) => ws.addEventListener("open", r));
console.log("CDP connected");

await send("Debugger.enable");
await send("Runtime.enable");
console.log("Debugger and Runtime enabled");

// Set a breakpoint at conformance.ts line 12
const bp = await send("Debugger.setBreakpointByUrl", {
	lineNumber: 11, // 0-indexed
	url: `file://${FIXTURE}`,
});
console.log("Breakpoint set:", JSON.stringify(bp));

// Also try with just the filename
const bp2 = await send("Debugger.setBreakpointByUrl", {
	lineNumber: 11,
	urlRegex: "conformance\\.ts",
});
console.log("Breakpoint (regex) set:", JSON.stringify(bp2));

// Resume Bun
const resumed = await send("Debugger.resume");
console.log("Resumed:", JSON.stringify(resumed));

// Wait for stopped event
await new Promise((resolve) => {
	ws.addEventListener("message", (e) => {
		const msg = JSON.parse(e.data);
		if (msg.method === "Debugger.paused") {
			console.log("STOPPED!", JSON.stringify(msg.params).substring(0, 300));
			resolve();
		}
		if (msg.method === "Debugger.scriptParsed") {
			const url = msg.params?.url ?? "";
			if (!url.includes("node_internals") && !url.includes("bun:")) {
				console.log("[scriptParsed]", JSON.stringify(msg.params).substring(0, 200));
			}
		}
	});
	setTimeout(() => {
		console.log("TIMEOUT: no stopped event");
		resolve();
	}, 10000);
});

bunProc.kill();
