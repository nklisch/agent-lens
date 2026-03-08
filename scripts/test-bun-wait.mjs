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
// Use --inspect-wait instead of --inspect-brk
const bunProc = spawn("bun", [`--inspect-wait=127.0.0.1:${inspectPort}`, FIXTURE], { stdio: "pipe" });
bunProc.stdout.on("data", (d) => process.stdout.write("[bun stdout] " + d));
bunProc.stderr.on("data", (d) => bunOut.push(d.toString()));
await new Promise((r) => setTimeout(r, 1200));

const wsAddr = bunOut.join("").match(/ws:\/\/[^\s]+/)?.[0];
console.log("wsAddr:", wsAddr);

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

const send = (method, params = {}) =>
	new Promise((resolve) => {
		const id = msgId++;
		pending.set(id, resolve);
		ws.send(JSON.stringify({ id, method, params }));
		console.log(">> send", method);
	});

// Set breakpoint at line 12 BEFORE Bun starts executing
const bp = await send("Debugger.setBreakpointByUrl", { lineNumber: 11, url: `file://${FIXTURE}` });
console.log("Breakpoint result:", JSON.stringify(bp.result));

await send("Debugger.enable");
await send("Runtime.enable");

// See if Bun starts now
await new Promise((r) => setTimeout(r, 1000));
console.log("After enable, waiting for breakpoint...");

// Try the trigger
const r1 = await send("Runtime.runIfWaitingForDebugger");
console.log("runIfWaitingForDebugger:", JSON.stringify(r1).substring(0, 100));

const r2 = await send("Runtime.evaluate", { expression: "globalThis.__jsDebugIsReady = true;" });
console.log("evaluate:", JSON.stringify(r2).substring(0, 100));

// Wait for paused event
await new Promise((resolve) => {
	ws.addEventListener("message", (e) => {
		const msg = JSON.parse(e.data);
		if (msg.method === "Debugger.paused") {
			console.log("\n*** PAUSED! ***", JSON.stringify(msg.params?.callFrames?.[0]?.location));
			resolve();
		}
		if (msg.method === "Debugger.scriptParsed") {
			const url = msg.params?.url ?? "";
			if (!url.startsWith("bun:") && !url.includes("/internal/")) {
				console.log("[scriptParsed]", url);
			}
		}
	});
	setTimeout(() => {
		console.log("\nTimeout");
		resolve();
	}, 5000);
});

bunProc.kill();
