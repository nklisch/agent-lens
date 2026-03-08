/**
 * Minimal direct CDP test: connect to Bun's WebSocket inspector and try to resume.
 * Goal: discover the correct CDP sequence to make Bun start executing.
 *
 * Tests both --inspect-brk and --inspect-wait.
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

function wsConnect(url) {
	return new Promise((resolve, reject) => {
		const ws = new globalThis.WebSocket(url);
		ws.onopen = () => resolve(ws);
		ws.onerror = (e) => reject(new Error("ws error: " + e.message));
		setTimeout(() => reject(new Error("ws connect timeout")), 5000);
	});
}

async function runTest(flag, label) {
	console.log(`\n${"=".repeat(60)}`);
	console.log(`TEST: ${label} (${flag})`);
	console.log("=".repeat(60));

	const port = await allocatePort();
	const bunProc = spawn("bun", [`${flag}=127.0.0.1:${port}`, FIXTURE], {
		stdio: "pipe",
		cwd: "/home/nathan/dev/agent-lens",
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

	const ws = await wsConnect(wsUrl);
	let msgId = 1;
	const pending = new Map();
	const events = [];

	ws.onmessage = (e) => {
		const msg = JSON.parse(e.data);
		console.log("<< CDP:", JSON.stringify(msg).substring(0, 300));
		if (msg.id && pending.has(msg.id)) {
			const { resolve, reject } = pending.get(msg.id);
			pending.delete(msg.id);
			if (msg.error) reject(new Error(msg.error.message));
			else resolve(msg.result ?? {});
		} else {
			events.push(msg);
		}
	};

	const send = (method, params = {}) => {
		const id = msgId++;
		const json = JSON.stringify({ id, method, params });
		console.log(">> CDP:", method, JSON.stringify(params).substring(0, 100));
		ws.send(json);
		return new Promise((resolve, reject) => {
			pending.set(id, { resolve, reject });
			setTimeout(() => {
				if (pending.has(id)) {
					pending.delete(id);
					reject(new Error(`${method} timed out`));
				}
			}, 5000);
		});
	};

	try {
		// Step 1: Enable runtime and debugger
		console.log("\n--- Step 1: Enable domains ---");
		try { await send("Runtime.enable"); } catch (e) { console.log("Runtime.enable:", e.message); }
		try { await send("Debugger.enable"); } catch (e) { console.log("Debugger.enable:", e.message); }

		await new Promise((r) => setTimeout(r, 500));
		console.log("Events so far:", events.map((e) => e.method));

		// Step 2: Check if we got a paused event
		const pausedEvent = events.find((e) => e.method === "Debugger.paused");
		if (pausedEvent) {
			console.log("\n*** Got Debugger.paused! reason:", pausedEvent.params?.reason);
			console.log("callFrames:", JSON.stringify(pausedEvent.params?.callFrames?.slice(0, 2)).substring(0, 200));
		} else {
			console.log("\nNo Debugger.paused event received yet");
		}

		// Step 3: Set a breakpoint by URL before resuming
		console.log("\n--- Step 2: Set breakpoint at line 12 ---");
		try {
			const bpResult = await send("Debugger.setBreakpointByUrl", {
				lineNumber: 11, // 0-indexed
				url: `file://${FIXTURE}`,
			});
			console.log("setBreakpointByUrl result:", JSON.stringify(bpResult).substring(0, 200));
		} catch (e) {
			console.log("setBreakpointByUrl error:", e.message);
		}

		// Step 4: Try to resume
		console.log("\n--- Step 3: Try Debugger.resume ---");
		try {
			await send("Debugger.resume");
			console.log("Debugger.resume: SUCCESS");
		} catch (e) {
			console.log("Debugger.resume error:", e.message);
		}

		// Step 5: Try Runtime.runIfWaitingForDebugger
		console.log("\n--- Step 4: Try Runtime.runIfWaitingForDebugger ---");
		try {
			await send("Runtime.runIfWaitingForDebugger");
			console.log("Runtime.runIfWaitingForDebugger: SUCCESS");
		} catch (e) {
			console.log("Runtime.runIfWaitingForDebugger error:", e.message);
		}

		// Step 6: Try Runtime.evaluate
		console.log("\n--- Step 5: Try Runtime.evaluate ---");
		try {
			const evalResult = await send("Runtime.evaluate", { expression: "1+1" });
			console.log("Runtime.evaluate result:", JSON.stringify(evalResult).substring(0, 200));
		} catch (e) {
			console.log("Runtime.evaluate error:", e.message);
		}

		// Wait a bit and check for new events
		await new Promise((r) => setTimeout(r, 2000));
		console.log("\nAll events received:", events.map((e) => e.method));

		const stopped = events.find((e) => e.method === "Debugger.paused" && e !== pausedEvent);
		if (stopped) {
			console.log("\n*** BREAKPOINT HIT! ***", JSON.stringify(stopped).substring(0, 300));
		}

	} catch (e) {
		console.log("Error:", e.message);
	}

	ws.close();
	bunProc.kill();
	await new Promise((r) => setTimeout(r, 300));
}

// Test 1: --inspect-brk
await runTest("--inspect-brk", "inspect-brk");

// Test 2: --inspect-wait
await runTest("--inspect-wait", "inspect-wait");

console.log("\nDone.");
