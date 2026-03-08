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
console.log("wsAddr:", wsAddr);
console.log("Connecting WebSocket (no commands)...");

const ws = new globalThis.WebSocket(wsAddr);
ws.addEventListener("message", (e) => {
	const msg = JSON.parse(e.data);
	console.log("[event]", JSON.stringify(msg).substring(0, 200));
});
await new Promise((r) => ws.addEventListener("open", r));
console.log("Connected! Waiting 5 seconds without sending anything...");
await new Promise(r => setTimeout(r, 5000));
console.log("Done.");
bunProc.kill();
