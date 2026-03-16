import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkLatestVersion, detectInstallTypeFrom, isNewer, performAutoUpdate, shouldCheckForUpdate } from "../../../src/core/auto-update.js";

// ---------------------------------------------------------------------------
// isNewer
// ---------------------------------------------------------------------------

describe("isNewer", () => {
	it("returns true when remote minor is higher", () => {
		expect(isNewer("0.3.0", "0.2.4")).toBe(true);
	});

	it("returns false when versions are equal", () => {
		expect(isNewer("0.2.4", "0.2.4")).toBe(false);
	});

	it("returns false when remote is older", () => {
		expect(isNewer("0.2.3", "0.2.4")).toBe(false);
	});

	it("returns true when remote major is higher", () => {
		expect(isNewer("1.0.0", "0.9.9")).toBe(true);
	});

	it("handles v prefix on remote", () => {
		expect(isNewer("v0.3.0", "0.2.4")).toBe(true);
	});

	it("handles v prefix on local", () => {
		expect(isNewer("0.3.0", "v0.2.4")).toBe(true);
	});

	it("handles v prefix on both", () => {
		expect(isNewer("v0.3.0", "v0.2.4")).toBe(true);
	});

	it("returns false when current is newer (dev build scenario)", () => {
		expect(isNewer("0.2.4", "0.3.0")).toBe(false);
	});

	it("handles patch-level updates", () => {
		expect(isNewer("0.2.5", "0.2.4")).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// detectInstallTypeFrom
// ---------------------------------------------------------------------------

describe("detectInstallTypeFrom", () => {
	const baseEnv: NodeJS.ProcessEnv = {};

	it("detects dev install from src/cli/index.ts in argv", () => {
		const result = detectInstallTypeFrom("/usr/bin/bun", ["/usr/bin/bun", "/home/user/dev/krometrail/src/cli/index.ts"], baseEnv);
		expect(result.type).toBe("dev");
		expect(result.binaryPath).toBeUndefined();
	});

	it("detects dev install from src/mcp/index.ts in argv", () => {
		const result = detectInstallTypeFrom("/usr/bin/bun", ["/usr/bin/bun", "/home/user/dev/krometrail/src/mcp/index.ts"], baseEnv);
		expect(result.type).toBe("dev");
	});

	it("detects binary install from ~/.local/bin/krometrail", () => {
		const result = detectInstallTypeFrom("/home/user/.local/bin/krometrail", ["/home/user/.local/bin/krometrail", "--mcp"], baseEnv);
		expect(result.type).toBe("binary");
		expect(result.binaryPath).toBe("/home/user/.local/bin/krometrail");
		expect(result.packageManager).toBeUndefined();
	});

	it("detects binary install from /usr/local/bin/krometrail", () => {
		const result = detectInstallTypeFrom("/usr/local/bin/krometrail", ["/usr/local/bin/krometrail", "--mcp"], baseEnv);
		expect(result.type).toBe("binary");
		expect(result.binaryPath).toBe("/usr/local/bin/krometrail");
	});

	it("does NOT detect bun binary as binary install (contains /.bun/)", () => {
		const result = detectInstallTypeFrom("/home/user/.bun/bin/bun", ["/home/user/.bun/bin/bun", "/home/user/.bun/install/cache/krometrail@0.2.5/node_modules/.bin/krometrail"], baseEnv);
		// Not a binary install since execPath contains /.bun/
		expect(result.type).not.toBe("binary");
	});

	it("detects bunx install from script path containing /.bun/", () => {
		const result = detectInstallTypeFrom("/home/user/.bun/bin/bun", ["/home/user/.bun/bin/bun", "/home/user/.bun/install/cache/krometrail/node_modules/.bin/krometrail"], baseEnv);
		expect(result.type).toBe("bunx");
		expect(result.binaryPath).toBeUndefined();
	});

	it("detects npx install from npm_execpath env var", () => {
		const env = { npm_execpath: "/usr/lib/node_modules/npm/bin/npm-cli.js" };
		const result = detectInstallTypeFrom("/usr/bin/node", ["/usr/bin/node", "/home/user/.npm/_npx/abc/node_modules/.bin/krometrail"], env);
		expect(result.type).toBe("npx");
		expect(result.binaryPath).toBeUndefined();
	});

	it("detects npx install from /.npm/_npx/ in script path", () => {
		const result = detectInstallTypeFrom("/usr/bin/node", ["/usr/bin/node", "/home/user/.npm/_npx/abc123/node_modules/.bin/krometrail"], baseEnv);
		expect(result.type).toBe("npx");
	});

	it("detects global npm install", () => {
		const result = detectInstallTypeFrom("/usr/bin/node", ["/usr/bin/node", "/usr/lib/node_modules/krometrail/src/cli/index.js"], baseEnv);
		expect(result.type).toBe("global-npm");
		expect(result.packageManager).toBe("npm");
		expect(result.binaryPath).toBeUndefined();
	});

	it("detects bun global install", () => {
		const result = detectInstallTypeFrom("/home/user/.bun/bin/bun", ["/home/user/.bun/bin/bun", "/home/user/.bun/install/global/node_modules/krometrail/src/cli/index.js"], baseEnv);
		expect(result.type).toBe("global-npm");
		expect(result.packageManager).toBe("bun");
	});

	it("defaults to binary when type cannot be determined", () => {
		const result = detectInstallTypeFrom("/some/custom/path/krometrail-runner", ["/some/custom/path/krometrail-runner", "--mcp"], baseEnv);
		expect(result.type).toBe("binary");
		expect(result.binaryPath).toBe("/some/custom/path/krometrail-runner");
	});
});

// ---------------------------------------------------------------------------
// shouldCheckForUpdate
// ---------------------------------------------------------------------------

describe("shouldCheckForUpdate", () => {
	let tmpDir: string;

	beforeEach(() => {
		// Use a unique temp directory per test
		tmpDir = join("/tmp", `krometrail-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(tmpDir, { recursive: true });
	});

	it("returns true on first run (no file exists)", () => {
		const filePath = join(tmpDir, "last-update-check");
		expect(shouldCheckForUpdate(filePath)).toBe(true);
	});

	it("returns false when called within the throttle window", () => {
		const filePath = join(tmpDir, "last-update-check");
		// First call writes the file
		shouldCheckForUpdate(filePath);
		// Second call should be throttled
		expect(shouldCheckForUpdate(filePath)).toBe(false);
	});

	it("returns true after throttle window has elapsed", () => {
		const filePath = join(tmpDir, "last-update-check");
		// Write a timestamp that is 2 hours in the past
		const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
		writeFileSync(filePath, String(twoHoursAgo), "utf8");
		expect(shouldCheckForUpdate(filePath)).toBe(true);
	});

	it("creates the directory if it does not exist", () => {
		const nestedDir = join(tmpDir, "nested", "dir");
		const filePath = join(nestedDir, "last-update-check");
		expect(shouldCheckForUpdate(filePath)).toBe(true);
		// The file should now exist
		expect(existsSync(filePath)).toBe(true);
	});

	it("returns true if the file contains invalid content (fail open)", () => {
		const filePath = join(tmpDir, "last-update-check");
		writeFileSync(filePath, "not-a-number", "utf8");
		expect(shouldCheckForUpdate(filePath)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// checkLatestVersion (with fetch mocking)
// ---------------------------------------------------------------------------

describe("checkLatestVersion", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns updateAvailable: true when remote is newer", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ tag_name: "v99.0.0" }), { status: 200 }));
		const result = await checkLatestVersion();
		expect(result).not.toBeNull();
		expect(result?.updateAvailable).toBe(true);
		expect(result?.latestVersion).toBe("v99.0.0");
	});

	it("returns updateAvailable: false when versions match", async () => {
		// Use the current package version so no update is available
		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ tag_name: "v0.2.5" }), { status: 200 }));
		const result = await checkLatestVersion();
		expect(result).not.toBeNull();
		expect(result?.updateAvailable).toBe(false);
	});

	it("returns null on network error", async () => {
		vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));
		const result = await checkLatestVersion();
		expect(result).toBeNull();
	});

	it("returns null on non-OK response", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 404 }));
		const result = await checkLatestVersion();
		expect(result).toBeNull();
	});

	it("returns null when tag_name is missing", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ name: "Release" }), { status: 200 }));
		const result = await checkLatestVersion();
		expect(result).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// performAutoUpdate — orchestration logic
// ---------------------------------------------------------------------------

describe("performAutoUpdate", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		// Clean up env var
		delete process.env.KROMETRAIL_NO_UPDATE;
	});

	it("returns without doing anything when KROMETRAIL_NO_UPDATE=1", async () => {
		process.env.KROMETRAIL_NO_UPDATE = "1";
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		performAutoUpdate();
		// Give any potential async work a tick to run
		await new Promise((r) => setTimeout(r, 10));
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("does not fetch when install type is dev", async () => {
		// Temporarily override argv to look like dev
		const originalArgv = process.argv.slice();
		process.argv[1] = "/home/user/dev/krometrail/src/cli/index.ts";
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		performAutoUpdate();
		await new Promise((r) => setTimeout(r, 10));
		expect(fetchSpy).not.toHaveBeenCalled();
		process.argv.splice(0, process.argv.length, ...originalArgv);
	});

	it("does not throw even when everything fails", () => {
		vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("catastrophic failure"));
		// Should never throw
		expect(() => performAutoUpdate()).not.toThrow();
	});
});
