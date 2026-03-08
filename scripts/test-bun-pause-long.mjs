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

ws.addEventListener("message", (e) => {
	const msg = JSON.parse(e.data);
	if (msg.id && pending.has(msg.id)) {
		pending.get(msg.id)(msg);
		pending.delete(msg.id);
	} else {
		const s = JSON.stringify(msg).substring(0, 250);
		if (!s.includes("node_internals") && !s.includes("bun:") && !s.includes("/internal/")) {
			console.log("[event]", s);
		} else process.stdout.write(".");
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

// Step 1: Enable debugger
await send("Debugger.enable");
await send("Runtime.enable");
console.log("Enabled, setting breakpoint...");

// Set breakpoint
const bp = await send("Debugger.setBreakpointByUrl", { lineNumber: 11, url: `file://${FIXTURE}` });
console.log("Breakpoint result:", JSON.stringify(bp.result));

// Step 2: Arm pause
await send("Debugger.pause");
console.log("Pause armed, waiting 10 seconds for any events...");

// Wait with periodic checks
for (let i = 0; i < 10; i++) {
	await new Promise((r) => setTimeout(r, 1000));
	process.stdout.write(`[${i + 1}s] `);
}
console.log("\nDone waiting");
bunProc.kill();
