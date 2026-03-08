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
bunProc.stdout.on("data", (d) => { console.log("[BUN STDOUT]", d.toString().trim()); });
bunProc.on("exit", (code, sig) => console.log("[bun exit]", code, sig));
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

const send = (method, params = {}) => {
	const id = msgId++;
	const p = new Promise((resolve) => pending.set(id, resolve));
	ws.send(JSON.stringify({ id, method, params }));
	return p;
};

// js-debug sequence: first initialize, then concurrently run waitForDebugger + evaluate
await send("Debugger.enable");
await send("Runtime.enable");
await send("Debugger.setBreakpointByUrl", { lineNumber: 11, url: `file://${FIXTURE}` });

// CONCURRENT (like js-debug does it)
console.log("Sending runIfWaitingForDebugger + evaluate CONCURRENTLY...");
const [r1, r2] = await Promise.all([
	send("Runtime.runIfWaitingForDebugger"),
	send("Runtime.evaluate", { expression: "globalThis.__jsDebugIsReady = true;" }),
]);
console.log("runIfWaitingForDebugger:", JSON.stringify(r1).substring(0, 100));
console.log("evaluate:", JSON.stringify(r2).substring(0, 100));

// Wait for paused or scriptParsed
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
	setTimeout(() => { console.log("Timeout"); resolve(); }, 5000);
});

bunProc.kill();
