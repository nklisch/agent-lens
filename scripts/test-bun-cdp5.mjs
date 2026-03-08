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

let msgId = 1;
const pending = new Map();
const ws = new globalThis.WebSocket(wsAddr);
ws.onmessage = (e) => {
	const msg = JSON.parse(e.data);
	if (msg.id && pending.has(msg.id)) {
		pending.get(msg.id)(msg);
		pending.delete(msg.id);
	}
};

const events = [];
ws.addEventListener("message", (e) => {
	const msg = JSON.parse(e.data);
	if (!msg.id) events.push(msg);
});

await new Promise((r) => ws.addEventListener("open", r));

const send = (method, params = {}) =>
	new Promise((resolve) => {
		const id = msgId++;
		pending.set(id, resolve);
		ws.send(JSON.stringify({ id, method, params }));
		console.log(">> send", method, JSON.stringify(params).substring(0, 80));
	});

await send("Debugger.enable");
await send("Runtime.enable");

// Try arming Debugger.pause to trigger the --inspect-brk start
const pauseResult = await send("Debugger.pause");
console.log("Debugger.pause:", JSON.stringify(pauseResult));

// Wait for paused event
await new Promise((resolve) => {
	const listener = (e) => {
		const msg = JSON.parse(e.data);
		if (msg.method === "Debugger.paused") {
			console.log("PAUSED!", JSON.stringify(msg.params).substring(0, 300));
			// Set breakpoints NOW while paused
			resolve(msg);
		}
		if (msg.method === "Debugger.scriptParsed") {
			const url = msg.params?.url ?? "";
			if (!url.includes("bun:") && !url.includes("internal/")) {
				console.log("[scriptParsed]", url);
			}
		}
	};
	ws.addEventListener("message", listener);
	setTimeout(() => {
		ws.removeEventListener("message", listener);
		resolve(null);
	}, 5000);
}).then(async (pauseMsg) => {
	if (!pauseMsg) {
		console.log("No paused event");
		return;
	}
	// Set breakpoint while paused
	const bp = await send("Debugger.setBreakpointByUrl", { lineNumber: 11, url: `file://${FIXTURE}` });
	console.log("Breakpoint while paused:", JSON.stringify(bp.result));
	await send("Debugger.resume");

	// Wait for breakpoint hit
	await new Promise((resolve) => {
		const listener = (e) => {
			const msg = JSON.parse(e.data);
			if (msg.method === "Debugger.paused") {
				console.log("BREAKPOINT HIT!", JSON.stringify(msg.params).substring(0, 300));
				resolve();
			}
		};
		ws.addEventListener("message", listener);
		setTimeout(() => {
			console.log("No breakpoint hit");
			resolve();
		}, 5000);
	});
});

console.log("Total async events:", events.length);
bunProc.kill();
