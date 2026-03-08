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
bunProc.stderr.on("data", (d) => {
	bunOut.push(d.toString());
	process.stdout.write("[bun] " + d);
});
await new Promise((r) => setTimeout(r, 1200));

const wsAddr = bunOut.join("").match(/ws:\/\/[^\s]+/)?.[0];
console.log("wsAddr:", wsAddr);

// Connect, set breakpoints, THEN close the websocket
// Maybe Bun starts executing when the first connection closes?
const ws1 = new globalThis.WebSocket(wsAddr);
await new Promise((r) => ws1.addEventListener("open", r));
console.log("ws1 opened");

let msgId = 1;
const pending1 = new Map();
ws1.addEventListener("message", (e) => {
	const msg = JSON.parse(e.data);
	if (msg.id && pending1.has(msg.id)) {
		pending1.get(msg.id)(msg);
		pending1.delete(msg.id);
	}
});
const send1 = (method, params = {}) =>
	new Promise((resolve) => {
		const id = msgId++;
		pending1.set(id, resolve);
		ws1.send(JSON.stringify({ id, method, params }));
	});

await send1("Debugger.enable");
await send1("Runtime.enable");

// Close ws1 - does this trigger Bun to start?
ws1.close();
console.log("ws1 closed, waiting 2 seconds...");
await new Promise((r) => setTimeout(r, 2000));

// Now connect ws2 to see what Bun is doing
const ws2 = new globalThis.WebSocket(wsAddr);
ws2.addEventListener("message", (e) => {
	const msg = JSON.parse(e.data);
	const s = JSON.stringify(msg).substring(0, 250);
	if (!s.includes("bun:") && !s.includes("node_internals") && !s.includes("/internal/")) {
		console.log("[ws2 event]", s);
	} else process.stdout.write(".");
});
await new Promise((r) =>
	ws2.addEventListener("open", () => {
		console.log("ws2 opened");
		r();
	}),
);

let msgId2 = 1;
const pending2 = new Map();
ws2.addEventListener("message", (e) => {
	const msg = JSON.parse(e.data);
	if (msg.id && pending2.has(msg.id)) {
		pending2.get(msg.id)(msg);
		pending2.delete(msg.id);
	}
});
const send2 = (method, params = {}) =>
	new Promise((resolve) => {
		const id = msgId2++;
		pending2.set(id, resolve);
		ws2.send(JSON.stringify({ id, method, params }));
	});

await send2("Debugger.enable");
const bp = await send2("Debugger.setBreakpointByUrl", { lineNumber: 11, url: `file://${FIXTURE}` });
console.log("Breakpoint in ws2:", JSON.stringify(bp.result));

await new Promise((r) => setTimeout(r, 3000));
bunProc.kill();
