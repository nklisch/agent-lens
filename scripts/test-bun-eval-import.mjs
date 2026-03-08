/**
 * Test: trigger user script execution via Runtime.evaluate + dynamic import.
 *
 * Since --inspect-brk doesn't expose a CDP resume mechanism, try:
 * 1. Connect to Bun's WebSocket
 * 2. Enable Debugger, set breakpoint
 * 3. Use Runtime.evaluate to import() the user script
 * 4. Watch for Debugger.paused
 */
import { spawn } from "node:child_process";
import * as net from "node:net";

const FIXTURE = "/home/nathan/dev/agent-lens/tests/fixtures/bun/conformance.ts";

async function allocatePort() {
	return new Promise((resolve) => {
		const srv = net.createServer();
		srv.listen(0, "127.0.0.1", () => {
			const port = srv.address().port;
			srv.close(() => resolve(port));
		});
	});
}

const port = await allocatePort();

// Use --inspect (no brk/wait) so Bun starts without pausing
const bunProc = spawn("bun", [`--inspect=127.0.0.1:${port}`, "--smol"], {
	stdio: "pipe",
	cwd: "/home/nathan/dev/agent-lens",
	// Don't pass a script! Start Bun in REPL/idle mode so it doesn't exit immediately
});

const stderrLines = [];
bunProc.stderr.on("data", (d) => {
	stderrLines.push(d.toString());
	process.stdout.write("[bun] " + d);
});
bunProc.stdout.on("data", (d) => process.stdout.write("[bun-out] " + d));
bunProc.on("exit", (code) => console.log("[bun] exited code:", code));

// Wait for WebSocket URL
const wsUrl = await new Promise((resolve, reject) => {
	const timer = setTimeout(() => reject(new Error("bun startup timeout")), 8000);
	const check = () => {
		const all = stderrLines.join("");
		const m = all.match(/ws:\/\/\S+/);
		if (m) {
			clearTimeout(timer);
			resolve(m[0]);
		} else {
			setTimeout(check, 100);
		}
	};
	check();
});
console.log("WebSocket URL:", wsUrl);

const ws = new globalThis.WebSocket(wsUrl);
await new Promise((resolve, reject) => {
	ws.onopen = resolve;
	ws.onerror = (e) => reject(new Error("ws error"));
	setTimeout(() => reject(new Error("ws connect timeout")), 5000);
});

let msgId = 1;
const pending = new Map();
const allEvents = [];

ws.onmessage = (e) => {
	const msg = JSON.parse(e.data);
	const preview = JSON.stringify(msg).substring(0, 300);
	console.log("<< CDP:", preview);
	if (msg.id && pending.has(msg.id)) {
		const { resolve, reject } = pending.get(msg.id);
		pending.delete(msg.id);
		if (msg.error) reject(new Error(JSON.stringify(msg.error)));
		else resolve(msg.result ?? {});
	} else if (msg.method) {
		allEvents.push(msg);
	}
};

const send = (method, params = {}) => {
	const id = msgId++;
	const json = JSON.stringify({ id, method, params });
	console.log(">> CDP:", method, JSON.stringify(params).substring(0, 150));
	ws.send(json);
	return new Promise((resolve, reject) => {
		pending.set(id, { resolve, reject });
		setTimeout(() => {
			if (pending.has(id)) {
				pending.delete(id);
				reject(new Error(`${method} timed out`));
			}
		}, 8000);
	});
};

// Enable domains
await send("Runtime.enable");
await send("Debugger.enable");

// Set breakpoint at line 12 of conformance.ts (0-indexed = 11)
const bpResult = await send("Debugger.setBreakpointByUrl", {
	lineNumber: 11,
	url: `file://${FIXTURE}`,
});
console.log("setBreakpointByUrl:", JSON.stringify(bpResult));

// Wait for Debugger.paused event listener
const pausedPromise = new Promise((resolve) => {
	const check = setInterval(() => {
		const paused = allEvents.find((e) => e.method === "Debugger.paused");
		if (paused) {
			clearInterval(check);
			resolve(paused);
		}
	}, 100);
	setTimeout(() => {
		clearInterval(check);
		resolve(null);
	}, 15000);
});

// Trigger the script via dynamic import through evaluate
console.log("\n--- Evaluating import() of conformance.ts ---");
try {
	// Use awaitPromise: false so it returns immediately (the import runs async)
	const evalResult = await send("Runtime.evaluate", {
		expression: `import("${FIXTURE}")`,
		awaitPromise: false,
	});
	console.log("evaluate result:", JSON.stringify(evalResult).substring(0, 300));
} catch (e) {
	console.log("evaluate error:", e.message);
}

// Wait for the paused event
console.log("\nWaiting for Debugger.paused...");
const paused = await pausedPromise;

if (paused) {
	console.log("\n*** BREAKPOINT HIT! ***");
	console.log(JSON.stringify(paused).substring(0, 500));
} else {
	console.log("\nNo Debugger.paused received.");
	console.log("Events received:", allEvents.map((e) => e.method));
}

ws.close();
bunProc.kill();
