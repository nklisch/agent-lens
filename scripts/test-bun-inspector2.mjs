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
bunProc.stdout.on("data", (d) => { console.log("[bun stdout]", d.toString()); });
bunProc.stderr.on("data", (d) => bunOut.push(d.toString()));
bunProc.on("exit", (code) => console.log("[bun exit]", code));
await new Promise((r) => setTimeout(r, 1200));

const wsAddr = bunOut.join("").match(/ws:\/\/[^\s]+/)?.[0];
const ws = new globalThis.WebSocket(wsAddr);
ws.addEventListener("close", () => console.log("[ws closed]"));
ws.addEventListener("error", (e) => console.log("[ws error]", e.message ?? e));

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
	console.log(">> send", method);
});

// Inspector.enable was the trigger!
const r0 = await send("Inspector.enable");
console.log("Inspector.enable:", JSON.stringify(r0).substring(0, 100));

// Set breakpoints BEFORE enabling
const bp = await send("Debugger.setBreakpointByUrl", { lineNumber: 11, url: `file://${FIXTURE}` });
console.log("Breakpoint:", JSON.stringify(bp.result));

await send("Debugger.setBreakpointsActive", { breakpointsActive: true });
await send("Debugger.setPauseOnDebuggerStatements", { enabled: true });
await send("Debugger.enable");
await send("Runtime.enable");

console.log("Waiting 8 seconds for breakpoint or script completion...");
await new Promise(r => setTimeout(r, 8000));
console.log("Done.");
bunProc.kill();
