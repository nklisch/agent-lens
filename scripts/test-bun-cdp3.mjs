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
});
await new Promise((r) => setTimeout(r, 1200));

const wsAddr = bunOut.join("").match(/ws:\/\/[^\s]+/)?.[0];

// Connect directly via WebSocket CDP
let msgId = 1;
const pending = new Map();

const ws = new globalThis.WebSocket(wsAddr);
ws.onmessage = (e) => {
	const msg = JSON.parse(e.data);
	const preview = JSON.stringify(msg).substring(0, 250);
	if (!preview.includes("bun:") && !preview.includes("node_internals") && !preview.includes("internal/")) {
		console.log("[cdp]", preview);
	} else {
		process.stdout.write(".");
	}
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
	});

await new Promise((r) => ws.addEventListener("open", r));

// Set breakpoints BEFORE enabling debugger
const bp = await send("Debugger.setBreakpointByUrl", { lineNumber: 11, url: `file://${FIXTURE}` });
console.log("Pre-enable breakpoint:", JSON.stringify(bp.result));

// Now enable - this might start execution
console.log("Enabling Debugger...");
const enableResult = await send("Debugger.enable");
console.log("Enabled:", JSON.stringify(enableResult.result));

// Wait for any paused/scriptParsed events
await new Promise((resolve) => {
	const listener = (e) => {
		const msg = JSON.parse(e.data);
		if (msg.method === "Debugger.paused") {
			console.log("\nPAUSED!", JSON.stringify(msg.params).substring(0, 300));
			ws.removeEventListener("message", listener);
			resolve("paused");
		}
	};
	ws.addEventListener("message", listener);
	setTimeout(() => {
		ws.removeEventListener("message", listener);
		resolve("timeout");
	}, 5000);
}).then((r) => console.log("Result:", r));

console.log();
bunProc.kill();
