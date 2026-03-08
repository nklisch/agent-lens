/**
 * Test: use --inspect (no brk) with a keepalive script, then import() the fixture
 * via Runtime.evaluate to trigger breakpoints.
 */
import { spawn } from "node:child_process";
import * as net from "node:net";

const FIXTURE = "/home/nathan/dev/agent-lens/tests/fixtures/bun/conformance.ts";
const KEEPALIVE = "/home/nathan/dev/agent-lens/tests/fixtures/bun/keepalive.ts";

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
console.log("port:", port);

const bunProc = spawn("bun", [`--inspect=127.0.0.1:${port}`, KEEPALIVE], {
	stdio: "pipe",
	cwd: "/home/nathan/dev/agent-lens",
});

const stderrLines = [];
bunProc.stderr.on("data", (d) => {
	stderrLines.push(d.toString());
	process.stdout.write("[bun] " + d);
});
bunProc.stdout.on("data", (d) => process.stdout.write("[bun-out] " + d));
bunProc.on("exit", (code) => console.log("[bun] exited:", code));

// Wait for WebSocket URL
const wsUrl = await new Promise((resolve, reject) => {
	const timer = setTimeout(() => reject(new Error("bun startup timeout")), 8000);
	const check = () => {
		const all = stderrLines.join("");
		const m = all.match(/ws:\/\/\S+/);
		if (m) { clearTimeout(timer); resolve(m[0]); }
		else setTimeout(check, 100);
	};
	check();
});
console.log("WebSocket URL:", wsUrl);

const ws = new globalThis.WebSocket(wsUrl);
await new Promise((resolve, reject) => {
	ws.onopen = resolve;
	ws.onerror = () => reject(new Error("ws error"));
	setTimeout(() => reject(new Error("ws connect timeout")), 5000);
});

let msgId = 1;
const pending = new Map();
const allEvents = [];

ws.onmessage = (e) => {
	const msg = JSON.parse(e.data);
	console.log("<< CDP:", JSON.stringify(msg).substring(0, 300));
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
await new Promise((r) => setTimeout(r, 200));

// Set breakpoint at line 12 (0-indexed = 11) of conformance.ts
const bpResult = await send("Debugger.setBreakpointByUrl", {
	lineNumber: 11,
	url: `file://${FIXTURE}`,
});
console.log("\nsetBreakpointByUrl result:", JSON.stringify(bpResult));

// Set up paused listener
const pausedPromise = new Promise((resolve) => {
	const checkPaused = () => {
		const paused = allEvents.find((e) => e.method === "Debugger.paused");
		if (paused) { resolve(paused); return; }
		setTimeout(checkPaused, 50);
	};
	setTimeout(() => resolve(null), 12000);
	checkPaused();
});

// Trigger the script via dynamic import in evaluate
console.log("\n--- Triggering import() of conformance.ts ---");
try {
	const evalResult = await send("Runtime.evaluate", {
		expression: `import(${JSON.stringify(FIXTURE)})`,
		awaitPromise: false,
	});
	console.log("evaluate result:", JSON.stringify(evalResult).substring(0, 300));
} catch (e) {
	console.log("evaluate error:", e.message);
}

// Also check what scriptParsed events we get
await new Promise((r) => setTimeout(r, 1000));
const parsedScripts = allEvents.filter((e) => e.method === "Debugger.scriptParsed");
console.log("\nParsed scripts:", parsedScripts.map((e) => e.params?.url).filter(Boolean));

// Wait for paused
console.log("\nWaiting for Debugger.paused...");
const paused = await pausedPromise;

if (paused) {
	console.log("\n*** BREAKPOINT HIT! ***");
	console.log(JSON.stringify(paused).substring(0, 500));

	// Try to get variables
	const frame = paused.params?.callFrames?.[0];
	if (frame) {
		console.log("Frame:", frame.functionName, "line:", frame.location?.lineNumber);
	}
} else {
	console.log("\nNo Debugger.paused event received.");
	console.log("All events:", allEvents.map((e) => e.method));
}

ws.close();
bunProc.kill();
