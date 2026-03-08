import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const port = Number.parseInt(process.argv[2] ?? "0", 10);

/** Simulated server-side state — allows tests to inject failures. */
let failNextSubmit = false;
let apiDelayMs = 0;
const wsClients: Set<import("bun").ServerWebSocket<unknown>> = new Set();

const server = Bun.serve({
	port,
	fetch(req, server) {
		const url = new URL(req.url);

		// --- WebSocket upgrade ---
		if (url.pathname === "/ws/ticker" && server.upgrade(req)) {
			return undefined;
		}

		// --- Static pages ---
		if (url.pathname === "/" || url.pathname === "/index.html") {
			return servePage("pages/index.html");
		}
		if (url.pathname === "/login") {
			return servePage("pages/login.html");
		}
		if (url.pathname === "/dashboard") {
			return servePage("pages/dashboard.html");
		}
		if (url.pathname === "/settings") {
			return servePage("pages/settings.html");
		}
		if (url.pathname === "/error-page") {
			return servePage("pages/error.html");
		}
		if (url.pathname === "/static/app.js") {
			return serveFile("static/app.js", "application/javascript");
		}

		// --- API endpoints ---

		// Login: validates username + password, returns JWT-like token
		if (url.pathname === "/api/login" && req.method === "POST") {
			return req.json().then(async (body) => {
				if (apiDelayMs > 0) await delay(apiDelayMs);
				const { username, password } = body as { username: string; password: string };
				if (!username || !password) {
					return Response.json({ error: "Username and password are required", fields: { username: !username, password: !password } }, { status: 422 });
				}
				if (username === "admin" && password === "wrong") {
					return Response.json({ error: "Invalid credentials" }, { status: 401 });
				}
				return Response.json({ token: "test-jwt-token-12345", user: { id: 1, name: username } });
			});
		}

		// Dashboard data: returns items list
		if (url.pathname === "/api/dashboard" && req.method === "GET") {
			return (async () => {
				if (apiDelayMs > 0) await delay(apiDelayMs);
				return Response.json({
					stats: { users: 142, revenue: 12450, orders: 38 },
					recentOrders: [
						{ id: "ORD-001", customer: "Alice", total: 89.99, status: "shipped" },
						{ id: "ORD-002", customer: "Bob", total: 149.5, status: "pending" },
						{ id: "ORD-003", customer: "Carol", total: 34.0, status: "delivered" },
					],
				});
			})();
		}

		// Settings update: validates fields, optionally fails
		if (url.pathname === "/api/settings" && req.method === "PUT") {
			return req.json().then(async (body) => {
				if (apiDelayMs > 0) await delay(apiDelayMs);
				if (failNextSubmit) {
					failNextSubmit = false;
					return Response.json({ error: "Validation failed", details: { email: "Invalid email format", phone: "Phone must be 10 digits" } }, { status: 422 });
				}
				const { email, phone, name } = body as Record<string, string>;
				if (!email?.includes("@")) {
					return Response.json({ error: "Invalid email", details: { email: "Must contain @" } }, { status: 422 });
				}
				return Response.json({ success: true, updated: { email, phone, name } });
			});
		}

		// --- Test control endpoints (not part of the "app", used by tests to inject failures) ---
		if (url.pathname === "/__test__/fail-next-submit") {
			failNextSubmit = true;
			return Response.json({ ok: true });
		}
		if (url.pathname === "/__test__/set-delay") {
			apiDelayMs = Number.parseInt(url.searchParams.get("ms") ?? "0", 10);
			return Response.json({ ok: true, delayMs: apiDelayMs });
		}
		if (url.pathname === "/__test__/broadcast-ws") {
			const msg = url.searchParams.get("msg") ?? "ping";
			for (const ws of wsClients) ws.send(msg);
			return Response.json({ ok: true, sent: wsClients.size });
		}
		if (url.pathname === "/__test__/close-ws") {
			for (const ws of wsClients) ws.close(1006, "Server closed");
			wsClients.clear();
			return Response.json({ ok: true });
		}

		return new Response("Not Found", { status: 404 });
	},
	websocket: {
		open(ws) {
			wsClients.add(ws);
			ws.send(JSON.stringify({ type: "connected", ts: Date.now() }));
		},
		message(ws, msg) {
			// Echo back with server timestamp
			ws.send(JSON.stringify({ type: "echo", original: String(msg), ts: Date.now() }));
		},
		close(ws) {
			wsClients.delete(ws);
		},
	},
});

function servePage(relativePath: string): Response {
	const html = readFileSync(join(__dirname, relativePath), "utf8");
	return new Response(html, { headers: { "Content-Type": "text/html" } });
}

function serveFile(relativePath: string, contentType: string): Response {
	const content = readFileSync(join(__dirname, relativePath), "utf8");
	return new Response(content, { headers: { "Content-Type": contentType } });
}

function delay(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

process.stdout.write(`READY:${server.port}\n`);
