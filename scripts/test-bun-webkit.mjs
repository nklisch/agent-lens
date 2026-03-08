import { spawn } from "node:child_process";
import * as net from "node:net";

async function allocatePort() {
	return new Promise((resolve) => {
		const srv = net.createServer();
		srv.listen(0, "127.0.0.1", () => { const port = srv.address().port; srv.close(() => resolve(port)); });
	});
}

const inspectPort = await allocatePort();
const FIXTURE = "/home/nathan/dev/agent-lens/tests/fixtures/bun/conformance.ts";

const bunOut = [];
const bunProc = spawn("bun", [`--inspect-wait=127.0.0.1:${inspectPort}`, FIXTURE], { stdio: "pipe" });
bunProc.stdout.on("data", (d) => process.stdout.write("[bun stdout] " + d));
bunProc.stderr.on("data", (d) => bunOut.push(d.toString()));
await new Promise((r) => setTimeout(r, 1200));

const wsAddr = bunOut.join("").match(/ws:\/\/[^\s]+/)?.[0];
const ws = new globalThis.WebSocket(wsAddr);
let msgId = 1;
const pending = new Map();

ws.addEventListener("message", (e) => {
	const msg = JSON.parse(e.data);
	if (msg.id && pending.has(msg.id)) {
		pending.get(msg.id)(msg);
		pending.delete(msg.id);
	} else if (msg.method) {
		const s = JSON.stringify(msg).substring(0, 250);
		if (!s.includes("bun:") && !s.includes("node_internals") && !s.includes("/internal/")) {
			console.log("[event]", msg.method, JSON.stringify(msg.params ?? {}).substring(0, 200));
		} else process.stdout.write(".");
	}
});
await new Promise((r) => ws.addEventListener("open", r));

const send = (method, params = {}) => new Promise((resolve) => {
	const id = msgId++;
	pending.set(id, resolve);
	ws.send(JSON.stringify({ id, method, params }));
	console.log(">> send", method, JSON.stringify(params).substring(0, 60));
});

// WebKit JSC sequence
await send("Debugger.enable");
await send("Debugger.setBreakpointsActive", { breakpointsActive: true });
await send("Debugger.setPauseOnDebuggerStatements", { enabled: true });
await send("Debugger.setPauseOnExceptions", { state: "uncaught" });
await send("Runtime.enable");
await send("Debugger.setBreakpointByUrl", { lineNumber: 11, url: `file://${FIXTURE}` });
await send("Debugger.setBreakpointByUrl", { lineNumber: 11, urlRegex: "conformance" });

// WebKit might use a different "resume" mechanism
const res1 = await send("Debugger.resume", {});
console.log("resume:", JSON.stringify(res1).substring(0, 100));

// Try Timeline.start (WebKit specific)
const timelineR = await send("Timeline.start", {});
console.log("Timeline.start:", JSON.stringify(timelineR).substring(0, 100));

// Wait for paused event
await new Promise((resolve) => {
	ws.addEventListener("message", (e) => {
		const msg = JSON.parse(e.data);
		if (msg.method === "Debugger.paused") {
			console.log("\n*** PAUSED! ***", JSON.stringify(msg.params).substring(0, 400));
			resolve();
		}
		if (msg.method === "Debugger.scriptParsed") {
			const url = msg.params?.url ?? "";
			if (!url.startsWith("bun:") && !url.includes("/internal/")) {
				console.log("[scriptParsed]", url);
			}
		}
	});
	setTimeout(() => { console.log("\nTimeout - no pause"); resolve(); }, 6000);
});

bunProc.kill();
