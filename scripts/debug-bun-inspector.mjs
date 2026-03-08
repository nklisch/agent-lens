/**
 * Diagnostic: test IPv4 vs IPv6 binding for Bun's inspector.
 */
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
			res.on("end", () => resolve({ status: res.statusCode, body: data.substring(0, 200) }));
		});
		req.on("error", (e) => resolve({ error: e.message }));
		req.setTimeout(3000, () => {
			req.destroy();
			resolve({ error: "timeout" });
		});
	});
}

// Test 1: default port (Bun picks host)
const port1 = await allocatePort();
const bunDefault = spawn("bun", [`--inspect-brk=${port1}`, "tests/fixtures/bun/simple-loop.ts"], {
	cwd: "/home/nathan/dev/agent-lens",
	stdio: "pipe",
});
bunDefault.stderr.on("data", (d) => console.log("default stderr:", d.toString().trim()));
await new Promise((r) => setTimeout(r, 1500));

console.log("--- Testing default (port only) ---");
console.log("IPv4 /json/list:", JSON.stringify(await httpGet(`http://127.0.0.1:${port1}/json/list`)));
console.log("IPv6 /json/list:", JSON.stringify(await httpGet(`http://[::1]:${port1}/json/list`)));
console.log("IPv4 /json:", JSON.stringify(await httpGet(`http://127.0.0.1:${port1}/json`)));

// Test 2: explicit 127.0.0.1 host
const port2 = await allocatePort();
const bunIPv4 = spawn("bun", [`--inspect-brk=127.0.0.1:${port2}`, "tests/fixtures/bun/simple-loop.ts"], {
	cwd: "/home/nathan/dev/agent-lens",
	stdio: "pipe",
});
bunIPv4.stderr.on("data", (d) => console.log("ipv4 stderr:", d.toString().trim()));
await new Promise((r) => setTimeout(r, 1500));

console.log("--- Testing explicit 127.0.0.1 ---"); // breakpoint here
console.log("IPv4 /json/list:", JSON.stringify(await httpGet(`http://127.0.0.1:${port2}/json/list`)));
console.log("IPv4 /json:", JSON.stringify(await httpGet(`http://127.0.0.1:${port2}/json`)));

bunDefault.kill();
bunIPv4.kill();
console.log("done");
