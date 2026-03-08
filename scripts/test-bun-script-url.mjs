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
// Use --inspect (NOT --inspect-brk) so Bun starts immediately
const bunProc = spawn("bun", [`--inspect=127.0.0.1:${inspectPort}`, FIXTURE], { stdio: "pipe" });
bunProc.stdout.on("data", (d) => process.stdout.write("[bun stdout] " + d));
bunProc.stderr.on("data", (d) => bunOut.push(d.toString()));
await new Promise((r) => setTimeout(r, 200)); // connect quickly before script ends

const wsAddr = bunOut.join("").match(/ws:\/\/[^\s]+/)?.[0];
if (!wsAddr) {
	console.log("No WebSocket URL - Bun may have already finished");
	bunProc.kill();
	process.exit(0);
}
console.log("wsAddr:", wsAddr);

const ws = new globalThis.WebSocket(wsAddr);
let msgId = 1;
const pending = new Map();
ws.addEventListener("message", (e) => {
	const msg = JSON.parse(e.data);
	if (msg.id && pending.has(msg.id)) {
		pending.get(msg.id)(msg);
		pending.delete(msg.id);
	} else if (msg.method === "Debugger.scriptParsed") {
		const url = msg.params?.url ?? "";
		const hash = msg.params?.hash ?? "";
		console.log("[scriptParsed]", url, hash ? `(hash: ${hash.substring(0, 8)})` : "");
	} else if (msg.method === "Debugger.paused") {
		console.log("[paused]", JSON.stringify(msg.params).substring(0, 200));
	}
});
await new Promise((r) => ws.addEventListener("open", r));

const send = (method, params = {}) =>
	new Promise((resolve) => {
		const id = msgId++;
		pending.set(id, resolve);
		ws.send(JSON.stringify({ id, method, params }));
	});

await send("Debugger.enable");
await send("Runtime.enable");
// Set a breakpoint and try to trigger execution
await send("Debugger.setBreakpointByUrl", { lineNumber: 11, url: `file://${FIXTURE}` });
await send("Debugger.setBreakpointByUrl", { lineNumber: 17, urlRegex: "conformance" });

await new Promise((r) => setTimeout(r, 3000));
bunProc.kill();
