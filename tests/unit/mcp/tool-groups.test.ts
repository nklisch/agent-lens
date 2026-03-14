import { describe, expect, it } from "vitest";
import { parseToolGroups, TOOL_GROUPS } from "../../../src/mcp/tool-groups.js";

describe("parseToolGroups", () => {
	it("returns all groups for undefined input", () => {
		const result = parseToolGroups(undefined);
		expect(result).toEqual(new Set(TOOL_GROUPS));
	});

	it("returns all groups for empty string", () => {
		const result = parseToolGroups("");
		expect(result).toEqual(new Set(TOOL_GROUPS));
	});

	it("returns all groups for whitespace-only string", () => {
		const result = parseToolGroups("   ");
		expect(result).toEqual(new Set(TOOL_GROUPS));
	});

	it("parses single group: debug", () => {
		const result = parseToolGroups("debug");
		expect(result).toEqual(new Set(["debug"]));
		expect(result.has("debug")).toBe(true);
		expect(result.has("browser")).toBe(false);
	});

	it("parses single group: browser", () => {
		const result = parseToolGroups("browser");
		expect(result).toEqual(new Set(["browser"]));
		expect(result.has("browser")).toBe(true);
		expect(result.has("debug")).toBe(false);
	});

	it("parses comma-separated groups", () => {
		const result = parseToolGroups("debug,browser");
		expect(result).toEqual(new Set(["debug", "browser"]));
	});

	it("trims whitespace around group names", () => {
		const result = parseToolGroups("debug, browser");
		expect(result).toEqual(new Set(["debug", "browser"]));
	});

	it("trims whitespace from single group", () => {
		const result = parseToolGroups("  browser  ");
		expect(result).toEqual(new Set(["browser"]));
	});

	it("throws on invalid group name", () => {
		expect(() => parseToolGroups("invalid")).toThrow();
	});

	it("throws on partially invalid group list", () => {
		expect(() => parseToolGroups("debug,invalid")).toThrow();
	});
});
