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

const send = (method, params = {}) =>
	new Promise((resolve) => {
		const id = msgId++;
		pending.set(id, resolve);
		ws.send(JSON.stringify({ id, method, params }));
		console.log(">> send", method);
	});

await send("Debugger.enable");
await send("Runtime.enable");

// Try various commands that might trigger execution
const cmds = [
	["Profiler.enable"],
	["HeapProfiler.enable"],
	["Runtime.getIsolateId"],
	["Debugger.setAsyncCallStackDepth", { maxDepth: 32 }],
	["Runtime.setMaxCallStackSizeToCapture", { size: 1000 }],
	["Debugger.enable"], // send again
	["Runtime.enable"], // send again
];

for (const [method, params] of cmds) {
	try {
		const r = await send(method, params ?? {});
		const resp = JSON.stringify(r).substring(0, 100);
		if (!resp.includes("error")) {
			console.log(`${method} SUCCESS:`, resp);
		} else {
			console.log(`${method} error:`, resp);
		}
	} catch (e) {
		console.log(`${method} threw:`, e.message);
	}
	await new Promise((r) => setTimeout(r, 200));
}

console.log("Waiting 3 seconds...");
await new Promise((r) => setTimeout(r, 3000));
bunProc.kill();
