import { spawn } from "node:child_process";
import * as http from "node:http";
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

function httpGet(url) {
	return new Promise((resolve) => {
		const req = http.get(url, (res) => {
			let data = "";
			res.on("data", (c) => (data += c));
			res.on("end", () => resolve({ status: res.statusCode, body: data.substring(0, 500) }));
		});
		req.on("error", (e) => resolve({ error: e.message }));
		req.setTimeout(3000, () => {
			req.destroy();
			resolve({ error: "timeout" });
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

// Check all HTTP endpoints
for (const path of ["/", "/json", "/json/list", "/json/version", "/inspect", "/debug"]) {
	const result = await httpGet(`http://127.0.0.1:${inspectPort}${path}`);
	console.log(`GET ${path}:`, JSON.stringify(result).substring(0, 200));
}

bunProc.kill();
