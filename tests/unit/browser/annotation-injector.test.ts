import { describe, expect, it } from "vitest";
import { getAnnotationInjectionScript } from "../../../src/browser/recorder/annotation-injector.js";

describe("getAnnotationInjectionScript", () => {
	it("returns a string containing __krometrail", () => {
		const script = getAnnotationInjectionScript();
		expect(typeof script).toBe("string");
		expect(script).toContain("__krometrail");
	});

	it("script is an IIFE", () => {
		const script = getAnnotationInjectionScript().trim();
		expect(script.startsWith("(function()")).toBe(true);
	});

	it("script uses only var declarations (no let/const)", () => {
		const script = getAnnotationInjectionScript();
		expect(script).not.toMatch(/\blet\b/);
		expect(script).not.toMatch(/\bconst\b/);
	});
});
