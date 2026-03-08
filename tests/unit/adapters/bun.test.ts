import { describe, expect, it } from "vitest";
import { BunAdapter, parseBunCommand } from "../../../src/adapters/bun.js";

describe("parseBunCommand", () => {
	it("parses bare script", () => {
		const result = parseBunCommand("script.ts");
		expect(result.script).toBe("script.ts");
		expect(result.args).toEqual([]);
	});

	it("strips 'bun' prefix", () => {
		const result = parseBunCommand("bun script.ts");
		expect(result.script).toBe("script.ts");
		expect(result.args).toEqual([]);
	});

	it("strips 'bun run' prefix", () => {
		const result = parseBunCommand("bun run script.ts");
		expect(result.script).toBe("script.ts");
		expect(result.args).toEqual([]);
	});

	it("preserves script args after 'bun run'", () => {
		const result = parseBunCommand("bun run script.ts --verbose --port 3000");
		expect(result.script).toBe("script.ts");
		expect(result.args).toEqual(["--verbose", "--port", "3000"]);
	});

	it("preserves script args after bare 'bun'", () => {
		const result = parseBunCommand("bun app.ts arg1 arg2");
		expect(result.script).toBe("app.ts");
		expect(result.args).toEqual(["arg1", "arg2"]);
	});

	it("strips --inspect flags", () => {
		const result = parseBunCommand("bun --inspect=9229 script.ts");
		expect(result.script).toBe("script.ts");
		expect(result.args).toEqual([]);
	});

	it("strips --inspect-brk flags", () => {
		const result = parseBunCommand("bun --inspect-brk script.ts --flag");
		expect(result.script).toBe("script.ts");
		expect(result.args).toEqual(["--flag"]);
	});

	it("handles absolute path scripts", () => {
		const result = parseBunCommand("bun run /abs/path/to/worker.ts --env prod");
		expect(result.script).toBe("/abs/path/to/worker.ts");
		expect(result.args).toEqual(["--env", "prod"]);
	});

	it("handles .js files (Bun runs .js too)", () => {
		const result = parseBunCommand("bun run server.js");
		expect(result.script).toBe("server.js");
		expect(result.args).toEqual([]);
	});

	it("does not strip 'run' if not preceded by 'bun'", () => {
		// 'run' is only stripped after 'bun'
		const result = parseBunCommand("run-script.ts");
		expect(result.script).toBe("run-script.ts");
		expect(result.args).toEqual([]);
	});
});

describe("BunAdapter", () => {
	it("has correct id and displayName", () => {
		const adapter = new BunAdapter();
		expect(adapter.id).toBe("bun");
		expect(adapter.displayName).toBe("Bun (inspector)");
	});

	it("includes TypeScript file extensions", () => {
		const adapter = new BunAdapter();
		expect(adapter.fileExtensions).toContain(".ts");
		expect(adapter.fileExtensions).toContain(".tsx");
		expect(adapter.fileExtensions).toContain(".js");
	});

	it("has 'bun' alias", () => {
		const adapter = new BunAdapter();
		expect(adapter.aliases).toContain("bun");
	});
});
