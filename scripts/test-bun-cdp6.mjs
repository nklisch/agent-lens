/**
 * Connect CDP before Bun starts (as js-debug would), catch ALL scriptParsed events
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
bunProc.stdout.on("data", (d) => process.stdout.write("[bun stdout] " + d));
bunProc.stderr.on("data", (d) => bunOut.push(d.toString()));
await new Promise((r) => setTimeout(r, 1200));

const wsAddr = bunOut.join("").match(/ws:\/\/[^\s]+/)?.[0];
console.log("wsAddr:", wsAddr);

let msgId = 1;
const pending = new Map();
const ws = new globalThis.WebSocket(wsAddr);
ws.onmessage = (e) => {
	const msg = JSON.parse(e.data);
	if (msg.id && pending.has(msg.id)) {
		pending.get(msg.id)(msg);
		pending.delete(msg.id);
	} else if (msg.method) {
		// Log ALL events
		console.log("[event]", msg.method, JSON.stringify(msg.params ?? {}).substring(0, 300));
	}
};
await new Promise((r) => ws.addEventListener("open", r));

const send = (method, params = {}) =>
	new Promise((resolve) => {
		const id = msgId++;
		pending.set(id, resolve);
		ws.send(JSON.stringify({ id, method, params }));
	});

await send("Debugger.enable");
await send("Runtime.enable");
await send("Debugger.setBreakpointByUrl", { lineNumber: 11, url: `file://${FIXTURE}` });
await send("Debugger.setBreakpointByUrl", { lineNumber: 11, urlRegex: "conformance" });

// Now try to start Bun - simulate what js-debug does
// Maybe js-debug uses a special sequence?
// Try: pause first, then resume differently
await send("Debugger.pause");

// Simulate "configurationDone" equivalent - maybe just resume?
await new Promise((r) => setTimeout(r, 500));

// Let's try Runtime.evaluate which MIGHT start things
const evalResult = await send("Runtime.evaluate", { expression: "1+1" });
console.log("Runtime.evaluate:", JSON.stringify(evalResult).substring(0, 200));

await new Promise((r) => setTimeout(r, 3000));
console.log("\n=== Done ===");
bunProc.kill();
