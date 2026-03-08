import { beforeEach, describe, expect, it } from "vitest";
import { InputTracker } from "../../../src/browser/recorder/input-tracker.js";

describe("InputTracker dom_mutation events", () => {
	let tracker: InputTracker;

	beforeEach(() => {
		tracker = new InputTracker();
	});

	it("processes dom_mutation into dom_mutation event", () => {
		const result = tracker.processInputEvent(
			JSON.stringify({
				type: "dom_mutation",
				ts: Date.now(),
				added: [{ selector: "#modal", tag: "dialog", text: "Are you sure?" }],
				removed: [],
			}),
			"tab1",
		);
		expect(result?.type).toBe("dom_mutation");
		expect(result?.data.added).toHaveLength(1);
		expect((result?.data.added as Array<{ selector: string }>)[0].selector).toBe("#modal");
	});

	it("processes removals", () => {
		const result = tracker.processInputEvent(
			JSON.stringify({
				type: "dom_mutation",
				ts: Date.now(),
				added: [],
				removed: [{ selector: '[data-testid="loading-spinner"]', tag: "div" }],
			}),
			"tab1",
		);
		expect(result?.data.removed).toHaveLength(1);
	});

	it("summary contains selector names", () => {
		const result = tracker.processInputEvent(JSON.stringify({ type: "dom_mutation", ts: Date.now(), added: [{ selector: "#confirm-dialog", tag: "dialog" }], removed: [] }), "tab1");
		expect(result?.summary).toContain("#confirm-dialog");
	});

	it("summary shows + prefix for added elements", () => {
		const result = tracker.processInputEvent(JSON.stringify({ type: "dom_mutation", ts: Date.now(), added: [{ selector: "#banner", tag: "div" }], removed: [] }), "tab1");
		expect(result?.summary).toContain("+1");
	});

	it("summary shows - prefix for removed elements", () => {
		const result = tracker.processInputEvent(JSON.stringify({ type: "dom_mutation", ts: Date.now(), added: [], removed: [{ selector: "#spinner", tag: "div" }] }), "tab1");
		expect(result?.summary).toContain("-1");
	});

	it("summary contains both added and removed when both present", () => {
		const result = tracker.processInputEvent(
			JSON.stringify({
				type: "dom_mutation",
				ts: Date.now(),
				added: [{ selector: "#new", tag: "section" }],
				removed: [{ selector: "#old", tag: "section" }],
			}),
			"tab1",
		);
		expect(result?.summary).toContain("#new");
		expect(result?.summary).toContain("#old");
	});

	it("uses the ts from the event payload as timestamp", () => {
		const ts = 1700000010000;
		const result = tracker.processInputEvent(JSON.stringify({ type: "dom_mutation", ts, added: [], removed: [] }), "tab1");
		expect(result?.timestamp).toBe(ts);
	});

	it("includes tabId in the event", () => {
		const result = tracker.processInputEvent(JSON.stringify({ type: "dom_mutation", ts: Date.now(), added: [{ selector: "#x", tag: "div" }], removed: [] }), "myTab");
		expect(result?.tabId).toBe("myTab");
	});

	it("handles empty added and removed arrays", () => {
		const result = tracker.processInputEvent(JSON.stringify({ type: "dom_mutation", ts: Date.now(), added: [], removed: [] }), "tab1");
		expect(result?.type).toBe("dom_mutation");
		expect(result?.summary).toContain("DOM:");
	});
});
