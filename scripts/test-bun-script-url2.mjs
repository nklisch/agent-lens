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

const ws = new globalThis.WebSocket(wsAddr);
let msgId = 1;
const pending = new Map();
const scriptParsedUrls = [];

ws.addEventListener("message", (e) => {
	const msg = JSON.parse(e.data);
	if (msg.id && pending.has(msg.id)) {
		pending.get(msg.id)(msg);
		pending.delete(msg.id);
	} else if (msg.method === "Debugger.scriptParsed") {
		const url = msg.params?.url ?? "";
		if (!url.startsWith("bun:") && !url.includes("/internal/") && !url.includes("node_internals")) {
			console.log("[scriptParsed]", url);
			scriptParsedUrls.push(url);
		}
	} else if (msg.method === "Debugger.paused") {
		console.log("[PAUSED]", JSON.stringify(msg.params?.callFrames?.[0]?.location).substring(0, 200));
		console.log("  reason:", msg.params?.reason);
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

// Set breakpoints using different URL formats to find what works
await send("Debugger.setBreakpointByUrl", { lineNumber: 11, url: `file://${FIXTURE}` });
await send("Debugger.setBreakpointByUrl", { lineNumber: 11, urlRegex: "conformance" });
await send("Debugger.setBreakpoint", { location: { scriptId: "1", lineNumber: 11, columnNumber: 0 } });

// Now try to start Bun by sending the sequence js-debug would send
// Maybe sendting Runtime.evaluate with a specific expression?
// Or maybe Bun starts running when the first debugger DISCONNECTS?
// Or maybe it needs a specific Bun-proprietary message?

// Let's try connecting with the actual Bun js-debug auto-attach sequence
// Looking at Bun docs: it uses Chrome's CDP, so perhaps Debugger.enable triggers the start

// Maybe Node.js's approach: after attaching, call runScript
const runResult = await send("Runtime.evaluate", {
	expression: "typeof globalThis",
	includeCommandLineAPI: false,
});
console.log("Runtime.evaluate typeof globalThis:", JSON.stringify(runResult.result));

await new Promise((r) => setTimeout(r, 5000));
console.log("Script parsed URLs:", scriptParsedUrls);
bunProc.kill();
