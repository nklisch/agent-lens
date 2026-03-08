import { describe, expect, it } from "vitest";
import { estimateTokens, fitToBudget, type RenderSection, truncateToTokens } from "../../../src/core/token-budget.js";

describe("estimateTokens", () => {
	it("returns 0 for empty string", () => {
		expect(estimateTokens("")).toBe(0);
	});

	it("returns ceil(length / 4)", () => {
		expect(estimateTokens("abcd")).toBe(1);
		expect(estimateTokens("abcde")).toBe(2);
		expect(estimateTokens("a".repeat(100))).toBe(25);
		expect(estimateTokens("a".repeat(101))).toBe(26);
	});

	it("matches existing compression.ts behavior", () => {
		const text = "Hello, world! This is a test.";
		expect(estimateTokens(text)).toBe(Math.ceil(text.length / 4));
	});
});

describe("fitToBudget", () => {
	const sections: RenderSection[] = [
		{ key: "a", content: "a".repeat(40), priority: 1 }, // 10 tokens
		{ key: "b", content: "b".repeat(80), priority: 3 }, // 20 tokens
		{ key: "c", content: "c".repeat(60), priority: 2 }, // 15 tokens
	];

	it("includes all sections when budget is sufficient", () => {
		const result = fitToBudget(sections, 100);
		expect(result.map((s) => s.key)).toEqual(["a", "b", "c"]);
	});

	it("includes highest priority sections first", () => {
		// Budget = 25: can fit b(20) + c(15) = 35? No, just b(20) + a(10) = 30? Still no. b(20) alone fits.
		// b=20 tokens, c=15 tokens, a=10 tokens. Priority: b>c>a.
		// Budget 35: b(20) + c(15) = 35 — exactly fits
		const result = fitToBudget(sections, 35);
		expect(result.map((s) => s.key)).toEqual(["b", "c"]); // original order
	});

	it("returns sections in original display order, not priority order", () => {
		// Budget = 35: includes b (priority 3) and c (priority 2)
		// Original order is a, b, c — so result should be b, c (a not included)
		const result = fitToBudget(sections, 35);
		expect(result[0].key).toBe("b");
		expect(result[1].key).toBe("c");
	});

	it("handles budget exactly equal to total tokens", () => {
		const total = sections.reduce((sum, s) => sum + estimateTokens(s.content), 0);
		const result = fitToBudget(sections, total);
		expect(result).toHaveLength(sections.length);
	});

	it("returns empty array when budget is 0", () => {
		const result = fitToBudget(sections, 0);
		expect(result).toHaveLength(0);
	});

	it("returns empty array for empty sections", () => {
		const result = fitToBudget([], 100);
		expect(result).toHaveLength(0);
	});

	it("skips sections that are too large to fit", () => {
		// budget = 12: can fit b(20)? No. c(15)? No. a(10)? Yes.
		const result = fitToBudget(sections, 12);
		expect(result.map((s) => s.key)).toEqual(["a"]);
	});
});

describe("truncateToTokens", () => {
	it("returns text unchanged when within budget", () => {
		const text = "hello";
		expect(truncateToTokens(text, 10)).toBe(text);
	});

	it("truncates and appends marker when over budget", () => {
		const text = "a".repeat(100);
		const result = truncateToTokens(text, 5); // maxChars = 20
		expect(result).toContain("... (truncated)");
		expect(result.length).toBeLessThan(text.length);
	});

	it("handles exact boundary without truncating", () => {
		const text = "a".repeat(20); // exactly 5 tokens (20 chars)
		expect(truncateToTokens(text, 5)).toBe(text);
	});

	it("truncation result fits within maxChars", () => {
		const text = "a".repeat(200);
		const result = truncateToTokens(text, 10); // maxChars = 40
		expect(result.length).toBeLessThanOrEqual(40 + "\n... (truncated)".length);
	});
});
