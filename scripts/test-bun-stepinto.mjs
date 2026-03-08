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
bunProc.stdout.on("data", (d) => process.stdout.write("[bun stdout] " + d));
bunProc.stderr.on("data", (d) => bunOut.push(d.toString()));
await new Promise((r) => setTimeout(r, 1200));

const wsAddr = bunOut.join("").match(/ws:\/\/[^\s]+/)?.[0];
const ws = new globalThis.WebSocket(wsAddr);
let msgId = 1;
const pending = new Map();

const allEvents = [];
ws.addEventListener("message", (e) => {
	const msg = JSON.parse(e.data);
	if (msg.id && pending.has(msg.id)) {
		pending.get(msg.id)(msg);
		pending.delete(msg.id);
	} else if (msg.method) {
		allEvents.push(msg);
		const url = msg.params?.url ?? msg.params?.source?.url ?? "";
		if (!url.startsWith("bun:") && !url.includes("node_internals") && !url.includes("/internal/")) {
			console.log("[event]", msg.method, JSON.stringify(msg.params).substring(0, 200));
		}
	}
});
await new Promise((r) => ws.addEventListener("open", r));

const send = (method, params = {}) =>
	new Promise((resolve) => {
		const id = msgId++;
		pending.set(id, resolve);
		ws.send(JSON.stringify({ id, method, params }));
		console.log(">> send", method);
	});

await send("Debugger.enable");
await send("Runtime.enable");
await send("Debugger.setBreakpointByUrl", { lineNumber: 11, url: `file://${FIXTURE}` });

// Try Debugger.stepInto (maybe this triggers the start)
const r = await send("Debugger.stepInto");
console.log("stepInto:", JSON.stringify(r));

// Try Debugger.resume
const r2 = await send("Debugger.resume");
console.log("resume:", JSON.stringify(r2));

// Now wait for anything
await new Promise((r) => setTimeout(r, 5000));
console.log("Total events:", allEvents.length);
console.log("Methods seen:", [...new Set(allEvents.map((m) => m.method))].join(", "));
bunProc.kill();
