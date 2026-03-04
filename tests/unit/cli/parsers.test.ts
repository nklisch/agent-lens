import { describe, expect, it } from "vitest";
import { parseBreakpointString, parseLocation, parseSourceRange } from "../../../src/cli/parsers.js";

describe("parseBreakpointString", () => {
	it("parses a simple file:line breakpoint", () => {
		const result = parseBreakpointString("order.py:147");
		expect(result).toEqual({
			file: "order.py",
			breakpoints: [{ line: 147 }],
		});
	});

	it("parses multiple lines in the same file", () => {
		const result = parseBreakpointString("order.py:147,150,155");
		expect(result).toEqual({
			file: "order.py",
			breakpoints: [{ line: 147 }, { line: 150 }, { line: 155 }],
		});
	});

	it("parses a conditional breakpoint (when)", () => {
		const result = parseBreakpointString("order.py:147 when discount < 0");
		expect(result.file).toBe("order.py");
		expect(result.breakpoints).toHaveLength(1);
		expect(result.breakpoints[0].line).toBe(147);
		expect(result.breakpoints[0].condition).toBe("discount < 0");
	});

	it("parses a hit count breakpoint", () => {
		const result = parseBreakpointString("order.py:147 hit >=100");
		expect(result.file).toBe("order.py");
		expect(result.breakpoints[0].hitCondition).toBe(">=100");
	});

	it("parses a logpoint with single quotes", () => {
		const result = parseBreakpointString("order.py:147 log 'discount={discount}'");
		expect(result.file).toBe("order.py");
		expect(result.breakpoints[0].logMessage).toBe("discount={discount}");
	});

	it("parses a logpoint with double quotes", () => {
		const result = parseBreakpointString('order.py:147 log "value={x}"');
		expect(result.breakpoints[0].logMessage).toBe("value={x}");
	});

	it("parses condition + logMessage", () => {
		const result = parseBreakpointString("order.py:147 when discount < 0 log 'bad'");
		expect(result.breakpoints[0].condition).toBe("discount < 0");
		expect(result.breakpoints[0].logMessage).toBe("bad");
	});

	it("applies condition to all lines in a multi-line breakpoint", () => {
		const result = parseBreakpointString("order.py:10,20 when x > 5");
		expect(result.breakpoints).toHaveLength(2);
		expect(result.breakpoints[0].condition).toBe("x > 5");
		expect(result.breakpoints[1].condition).toBe("x > 5");
	});

	it("throws on missing colon", () => {
		expect(() => parseBreakpointString("order.py")).toThrow();
	});

	it("throws on invalid line number", () => {
		expect(() => parseBreakpointString("order.py:abc")).toThrow();
	});

	it("throws on zero line number", () => {
		expect(() => parseBreakpointString("order.py:0")).toThrow();
	});

	it("throws on empty file path", () => {
		expect(() => parseBreakpointString(":10")).toThrow();
	});
});

describe("parseSourceRange", () => {
	it("parses file only", () => {
		expect(parseSourceRange("discount.py")).toEqual({ file: "discount.py" });
	});

	it("parses file:line", () => {
		expect(parseSourceRange("discount.py:15")).toEqual({ file: "discount.py", startLine: 15 });
	});

	it("parses file:start-end range", () => {
		expect(parseSourceRange("discount.py:15-30")).toEqual({ file: "discount.py", startLine: 15, endLine: 30 });
	});

	it("handles paths with colons (Windows style) — last colon wins", () => {
		const result = parseSourceRange("src/file.py:10");
		expect(result.file).toBe("src/file.py");
		expect(result.startLine).toBe(10);
	});
});

describe("parseLocation", () => {
	it("parses file:line", () => {
		expect(parseLocation("order.py:150")).toEqual({ file: "order.py", line: 150 });
	});

	it("throws when no colon", () => {
		expect(() => parseLocation("order.py")).toThrow();
	});

	it("throws when line is not a number", () => {
		expect(() => parseLocation("order.py:abc")).toThrow();
	});

	it("throws when line is zero", () => {
		expect(() => parseLocation("order.py:0")).toThrow();
	});

	it("throws when file is empty", () => {
		expect(() => parseLocation(":10")).toThrow();
	});
});
