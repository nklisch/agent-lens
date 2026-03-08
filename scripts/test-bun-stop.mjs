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
function connectTCP(host, port, retries = 8, delay = 300) {
	return new Promise((resolve, reject) => {
		let attempts = 0;
		const try_ = () => {
			const sock = net.createConnection({ host, port });
			sock.once("connect", () => resolve(sock));
			sock.once("error", (err) => {
				sock.destroy();
				if (++attempts < retries) setTimeout(try_, delay);
				else reject(err);
			});
		};
		try_();
	});
}
function parseDAPFrames(buf, callback) {
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
		try {
			callback(JSON.parse(buf.subarray(start, start + len).toString()));
		} catch {}
		buf = buf.subarray(start + len);
	}
	return buf;
}

const { getJsDebugAdapterPath } = await import("../src/adapters/js-debug-adapter.ts");
const dapAdapterPath = await getJsDebugAdapterPath();
const dapPort = await allocatePort();
const inspectPort = await allocatePort();
const FIXTURE = "/home/nathan/dev/agent-lens/tests/fixtures/bun/conformance.ts";

console.log("ports: dap=%d inspect=%d", dapPort, inspectPort);

const jsDebug = spawn("node", [dapAdapterPath, String(dapPort), "127.0.0.1"], { stdio: "pipe" });
jsDebug.stdout.on("data", (d) => process.stdout.write("[jsd] " + d));
await new Promise((r) => setTimeout(r, 800));

const bunOut = [];
const bunProc = spawn("bun", [`--inspect-brk=127.0.0.1:${inspectPort}`, FIXTURE], { stdio: "pipe" });
bunProc.stderr.on("data", (d) => {
	bunOut.push(d.toString());
	process.stdout.write("[bun] " + d);
});
await new Promise((r) => setTimeout(r, 1200));

const wsAddr = bunOut.join("").match(/ws:\/\/[^\s]+/)?.[0];
console.log("WebSocket URL:", wsAddr);

// Parent session
let childConfig = null;
await new Promise((resolve, reject) => {
	const sock = net.createConnection({ host: "127.0.0.1", port: dapPort });
	let buf = Buffer.alloc(0);
	let seq = 1;
	const send = (cmd, args) => {
		const json = JSON.stringify({ seq: seq++, type: "request", command: cmd, arguments: args });
		sock.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
	};
	const sendResp = (reqSeq, cmd) => {
		const json = JSON.stringify({ seq: seq++, type: "response", request_seq: reqSeq, success: true, command: cmd, body: {} });
		sock.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
	};
	sock.on("data", (chunk) => {
		buf = parseDAPFrames(Buffer.concat([buf, chunk]), (msg) => {
			console.log("[parent] <<", msg.type, msg.command ?? msg.event);
			if (msg.type === "event" && msg.event === "initialized") {
				send("configurationDone");
				send("attach", { type: "pwa-node", port: inspectPort, host: "127.0.0.1", ...(wsAddr ? { websocketAddress: wsAddr } : {}) });
			} else if (msg.type === "request" && msg.command === "startDebugging") {
				childConfig = msg.arguments.configuration;
				sendResp(msg.seq, "startDebugging");
				sock.destroy();
				resolve();
			} else if (msg.type === "request") {
				sendResp(msg.seq, msg.command);
			}
		});
	});
	sock.once("error", reject);
	send("initialize", { clientID: "agent-lens", adapterID: "agent-lens", linesStartAt1: true, columnsStartAt1: true, supportsStartDebuggingRequest: true });
	setTimeout(() => reject(new Error("parent timeout")), 10000);
});

console.log("Child config:", JSON.stringify(childConfig));

// Child session — try stopOnEntry: true to verify connection works
await new Promise((resolve, reject) => {
	const sock = net.createConnection({ host: "127.0.0.1", port: dapPort });
	let buf = Buffer.alloc(0);
	let seq = 1;
	let initialized = false;
	let attached = false;
	const send = (cmd, args) => {
		const json = JSON.stringify({ seq: seq++, type: "request", command: cmd, arguments: args });
		console.log("[child] >>", cmd);
		sock.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
	};
	const sendResp = (reqSeq, cmd) => {
		const json = JSON.stringify({ seq: seq++, type: "response", request_seq: reqSeq, success: true, command: cmd, body: {} });
		sock.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
	};
	sock.on("data", (chunk) => {
		buf = parseDAPFrames(Buffer.concat([buf, chunk]), (msg) => {
			if (msg.type === "event" && msg.event === "loadedSource") return; // too noisy
			console.log("[child] <<", JSON.stringify(msg).substring(0, 200));
			if (msg.type === "event" && msg.event === "initialized" && !initialized) {
				initialized = true;
				// Send attach FIRST with stopOnEntry: true, THEN setBreakpoints, THEN configDone
				send("attach", { ...childConfig, stopOnEntry: true });
			} else if (msg.type === "response" && msg.command === "attach" && !attached) {
				attached = true;
				send("setBreakpoints", { source: { path: FIXTURE }, breakpoints: [{ line: 12 }] });
			} else if (msg.type === "response" && msg.command === "setBreakpoints") {
				send("configurationDone", {});
			} else if (msg.type === "event" && msg.event === "stopped") {
				console.log("SUCCESS! stopped at:", JSON.stringify(msg.body));
				sock.destroy();
				resolve();
			} else if (msg.type === "request") {
				sendResp(msg.seq, msg.command);
			}
		});
	});
	sock.once("error", reject);
	send("initialize", { clientID: "agent-lens", adapterID: "agent-lens", linesStartAt1: true, columnsStartAt1: true, supportsStartDebuggingRequest: true });
	setTimeout(() => reject(new Error("child timeout")), 15000);
});

jsDebug.kill();
bunProc.kill();
