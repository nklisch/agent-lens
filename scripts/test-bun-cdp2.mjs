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
bunProc.stderr.on("data", (d) => {
	bunOut.push(d.toString());
	process.stdout.write("[bun] " + d);
});
await new Promise((r) => setTimeout(r, 1200));

const wsAddr = bunOut.join("").match(/ws:\/\/[^\s]+/)?.[0];
console.log("WebSocket URL:", wsAddr);

// Connect directly via WebSocket CDP - log EVERYTHING
const ws = new globalThis.WebSocket(wsAddr);
const allMessages = [];
ws.onmessage = (e) => {
	const msg = JSON.parse(e.data);
	allMessages.push(msg);
	const preview = JSON.stringify(msg).substring(0, 200);
	console.log("[cdp]", preview);
};

await new Promise((r) => ws.addEventListener("open", r));
console.log("CDP connected - waiting 2s for any immediate events");
await new Promise((r) => setTimeout(r, 2000));
console.log("Events received so far:", allMessages.length);

// Now enable debugger
let msgId = 1;
const pending = new Map();
ws.onmessage = (e) => {
	const msg = JSON.parse(e.data);
	allMessages.push(msg);
	console.log("[cdp]", JSON.stringify(msg).substring(0, 200));
	if (msg.id && pending.has(msg.id)) {
		pending.get(msg.id)(msg);
		pending.delete(msg.id);
	}
};

const send = (method, params = {}) =>
	new Promise((resolve) => {
		const id = msgId++;
		pending.set(id, resolve);
		ws.send(JSON.stringify({ id, method, params }));
		console.log(">> send", method);
	});

const r1 = await send("Debugger.enable");
console.log("Debugger.enable result:", JSON.stringify(r1).substring(0, 200));

await new Promise((r) => setTimeout(r, 500));
console.log("Total events:", allMessages.length);

bunProc.kill();
