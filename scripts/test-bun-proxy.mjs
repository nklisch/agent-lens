/**
 * WebSocket proxy: sits between js-debug and Bun, logs all messages
 */
import { spawn } from "node:child_process";
import * as http from "node:http";
import * as net from "node:net";

const { getJsDebugAdapterPath } = await import("../src/adapters/js-debug-adapter.ts");

async function allocatePort() {
	return new Promise((resolve) => {
		const srv = net.createServer();
		srv.listen(0, "127.0.0.1", () => {
			const port = srv.address().port;
			srv.close(() => resolve(port));
		});
	});
}

const dapPort = await allocatePort();
const inspectPort = await allocatePort();
const proxyPort = await allocatePort();
const FIXTURE = "/home/nathan/dev/agent-lens/tests/fixtures/bun/conformance.ts";

// Spawn Bun
const bunOut = [];
const bunProc = spawn("bun", [`--inspect-brk=127.0.0.1:${inspectPort}`, FIXTURE], { stdio: "pipe" });
bunProc.stdout.on("data", (d) => process.stdout.write("[bun stdout] " + d));
bunProc.stderr.on("data", (d) => bunOut.push(d.toString()));
await new Promise((r) => setTimeout(r, 1200));
const bunWsAddr = bunOut.join("").match(/ws:\/\/[^\s]+/)?.[0];
const bunWsPath = new URL(bunWsAddr).pathname;
console.log("Bun WebSocket:", bunWsAddr);

// Create a simple WebSocket proxy HTTP server
// When js-debug connects to ws://127.0.0.1:proxyPort/path, we:
// 1. Connect to Bun's WebSocket at bunWsAddr
// 2. Forward all messages in both directions, logging them
const { WebSocketServer } = (await import("ws")).default !== undefined ? await import("ws") : { WebSocketServer: null };

if (!WebSocketServer) {
	console.log("ws not available, using different approach");
	process.exit(1);
}

// Spawn js-debug
const dapAdapterPath = await getJsDebugAdapterPath();
const jsDebug = spawn("node", [dapAdapterPath, String(dapPort), "127.0.0.1"], { stdio: "pipe" });
jsDebug.stdout.on("data", (d) => process.stdout.write("[jsd] " + d));
await new Promise((r) => setTimeout(r, 800));

console.log("js-debug and Bun both running. Would need WebSocket proxy to intercept.");
console.log("Instead, checking js-debug source for what CDP it sends...");

jsDebug.kill();
bunProc.kill();
