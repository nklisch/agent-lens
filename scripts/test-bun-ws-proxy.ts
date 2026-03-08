/**
 * WebSocket proxy to intercept js-debug ↔ Bun CDP messages
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { parseDAPMessage } from "./dap-helpers.ts";

const { getJsDebugAdapterPath } = await import("../src/adapters/js-debug-adapter.ts");

async function allocatePort(): Promise<number> {
	return new Promise((resolve) => {
		const srv = createServer();
		srv.listen(0, "127.0.0.1", () => {
			const port = (srv.address() as { port: number }).port;
			srv.close(() => resolve(port));
		});
	});
}

const dapPort = await allocatePort();
const realInspectPort = await allocatePort();
const proxyPort = await allocatePort();
const FIXTURE = "/home/nathan/dev/agent-lens/tests/fixtures/bun/conformance.ts";

// Spawn Bun with real port
const bunOut: string[] = [];
const bunProc = spawn("bun", [`--inspect-brk=127.0.0.1:${realInspectPort}`, FIXTURE], { stdio: "pipe" });
bunProc.stdout.on("data", (d: Buffer) => process.stdout.write("[bun stdout] " + d));
bunProc.stderr.on("data", (d: Buffer) => bunOut.push(d.toString()));
await new Promise((r) => setTimeout(r, 1500));

const wsAddr = bunOut.join("").match(/ws:\/\/[^\s]+/)?.[0];
const wsPath = wsAddr ? new URL(wsAddr).pathname : "";
console.log("Bun WebSocket:", wsAddr);

// Create a proxy WebSocket server using Bun's built-in server
const proxyWsUrl = `ws://127.0.0.1:${proxyPort}${wsPath}`;
console.log("Proxy URL:", proxyWsUrl);

let bunWs: WebSocket | null = null;
let clientWs: WebSocket | null = null;

const server = Bun.serve({
	port: proxyPort,
	hostname: "127.0.0.1",
	fetch(req, server) {
		if (server.upgrade(req)) return;
		return new Response("WebSocket proxy");
	},
	websocket: {
		open(ws) {
			console.log("[proxy] client connected");
			clientWs = ws as unknown as WebSocket;
			// Connect to Bun
			bunWs = new WebSocket(wsAddr!);
			bunWs.onopen = () => console.log("[proxy] connected to Bun");
			bunWs.onmessage = (e: MessageEvent) => {
				const msg = JSON.parse(e.data as string);
				if (!JSON.stringify(msg).includes("node_internals") && !JSON.stringify(msg).includes("internal/")) {
					console.log("[Bun→jsd]", JSON.stringify(msg).substring(0, 300));
				} else {
					process.stdout.write("b");
				}
				ws.send(e.data as string);
			};
		},
		message(ws, data) {
			const msg = JSON.parse(data as string);
			if (!JSON.stringify(msg).includes("node_internals")) {
				console.log("[jsd→Bun]", JSON.stringify(msg).substring(0, 300));
			}
			bunWs?.send(data as string);
		},
		close() {
			console.log("[proxy] client disconnected");
		},
	},
});

console.log("Proxy server running on port", proxyPort);

// Spawn js-debug
const dapAdapterPath = await getJsDebugAdapterPath();
const jsDebug = spawn("node", [dapAdapterPath, String(dapPort), "127.0.0.1"], { stdio: "pipe" });
jsDebug.stdout.on("data", (d: Buffer) => process.stdout.write("[jsd] " + d));
await new Promise((r) => setTimeout(r, 800));

// Now connect the parent session to js-debug, using proxy URL as websocketAddress
const net = await import("node:net");
let buf = Buffer.alloc(0);
let seq = 1;
const parentSock = net.createConnection({ host: "127.0.0.1", port: dapPort });
const send = (cmd: string, args?: Record<string, unknown>) => {
	const json = JSON.stringify({ seq: seq++, type: "request", command: cmd, arguments: args });
	parentSock.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
	console.log(`[parent] >> ${cmd}`);
};
const sendResp = (reqSeq: number, cmd: string) => {
	const json = JSON.stringify({ seq: seq++, type: "response", request_seq: reqSeq, success: true, command: cmd, body: {} });
	parentSock.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
};

parentSock.on("data", (chunk: Buffer) => {
	buf = Buffer.concat([buf, chunk]);
	while (true) {
		const h = buf.indexOf("\r\n\r\n");
		if (h === -1) break;
		const m = buf
			.subarray(0, h)
			.toString()
			.match(/Content-Length:\s*(\d+)/i);
		if (!m) {
			buf = buf.subarray(h + 4);
			continue;
		}
		const len = parseInt(m[1]);
		const start = h + 4;
		if (buf.length < start + len) break;
		const msg = JSON.parse(buf.subarray(start, start + len).toString());
		buf = buf.subarray(start + len);
		console.log(`[parent] << ${msg.type} ${msg.command ?? msg.event}`);
		if (msg.type === "event" && msg.event === "initialized") {
			send("configurationDone");
			send("attach", { type: "pwa-node", port: realInspectPort, host: "127.0.0.1", websocketAddress: proxyWsUrl });
		} else if (msg.type === "request" && msg.command === "startDebugging") {
			sendResp(msg.seq, "startDebugging");
			console.log("Got child config:", JSON.stringify(msg.arguments.configuration));
			setTimeout(() => {
				jsDebug.kill();
				bunProc.kill();
				server.stop();
			}, 2000);
		} else if (msg.type === "request") {
			sendResp(msg.seq, msg.command);
		}
	}
});

send("initialize", { clientID: "agent-lens", adapterID: "agent-lens", linesStartAt1: true, columnsStartAt1: true, supportsStartDebuggingRequest: true });
await new Promise((r) => setTimeout(r, 12000));
jsDebug.kill();
bunProc.kill();
server.stop();
