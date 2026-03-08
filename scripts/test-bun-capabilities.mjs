import { spawn } from "node:child_process";
import * as net from "node:net";
import * as http from "node:http";

async function allocatePort() {
	return new Promise((resolve) => {
		const srv = net.createServer();
		srv.listen(0, "127.0.0.1", () => { const port = srv.address().port; srv.close(() => resolve(port)); });
	});
}
function httpGet(url) {
	return new Promise((resolve) => {
		const req = http.get(url, (res) => {
			let data = "";
			res.on("data", (c) => (data += c));
			res.on("end", () => resolve({ status: res.statusCode, body: data }));
		});
		req.on("error", (e) => resolve({ error: e.message }));
		req.setTimeout(3000, () => { req.destroy(); resolve({ error: "timeout" }); });
	});
}

const inspectPort = await allocatePort();
const FIXTURE = "/home/nathan/dev/agent-lens/tests/fixtures/bun/conformance.ts";

const bunOut = [];
const bunProc = spawn("bun", [`--inspect-wait=127.0.0.1:${inspectPort}`, FIXTURE], { stdio: "pipe" });
bunProc.stderr.on("data", (d) => bunOut.push(d.toString()));
await new Promise((r) => setTimeout(r, 1200));

// Get capabilities
const version = await httpGet(`http://127.0.0.1:${inspectPort}/json/version`);
console.log("version:", version.body.substring(0, 300));

const wsAddr = bunOut.join("").match(/ws:\/\/[^\s]+/)?.[0];
const ws = new globalThis.WebSocket(wsAddr);
let msgId = 1;
const pending = new Map();
ws.addEventListener("message", (e) => {
	const msg = JSON.parse(e.data);
	if (msg.id && pending.has(msg.id)) {
		pending.get(msg.id)(msg);
		pending.delete(msg.id);
	}
});
await new Promise((r) => ws.addEventListener("open", r));
const send = (method, params = {}) => new Promise((resolve) => {
	const id = msgId++;
	pending.set(id, resolve);
	ws.send(JSON.stringify({ id, method, params }));
});

// Get available methods via Schema
const schema = await send("Schema.getDomains");
console.log("Schema.getDomains:", JSON.stringify(schema).substring(0, 500));

// Try Jsc domain (WebKit)
const jscR = await send("Jsc.pause");
console.log("Jsc.pause:", JSON.stringify(jscR).substring(0, 200));

bunProc.kill();
