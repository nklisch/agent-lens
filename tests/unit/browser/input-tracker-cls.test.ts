import { beforeEach, describe, expect, it } from "vitest";
import { InputTracker } from "../../../src/browser/recorder/input-tracker.js";

describe("InputTracker CLS processing", () => {
	let tracker: InputTracker;

	beforeEach(() => {
		tracker = new InputTracker();
	});

	describe("processInputEvent — cls type", () => {
		it("processes cls event into performance RecordedEvent", () => {
			const data = JSON.stringify({ type: "cls", ts: Date.now(), metric: "CLS", value: 0.32 });
			const event = tracker.processInputEvent(data, "tab1");

			expect(event).not.toBeNull();
			expect(event?.type).toBe("performance");
			expect(event?.data.metric).toBe("CLS");
			expect(event?.data.value).toBe(0.32);
		});

		it("summary includes the CLS value", () => {
			const data = JSON.stringify({ type: "cls", ts: Date.now(), metric: "CLS", value: 0.15 });
			const event = tracker.processInputEvent(data, "tab1");

			expect(event?.summary).toContain("CLS:");
			expect(event?.summary).toContain("0.15");
		});

		it("handles string value by parsing it as float", () => {
			const data = JSON.stringify({ type: "cls", ts: Date.now(), metric: "CLS", value: "0.27" });
			const event = tracker.processInputEvent(data, "tab1");

			expect(event).not.toBeNull();
			expect(event?.data.value).toBe(0.27);
		});

		it("uses the ts from the event payload as timestamp", () => {
			const ts = 1700000005000;
			const data = JSON.stringify({ type: "cls", ts, metric: "CLS", value: 0.1 });
			const event = tracker.processInputEvent(data, "tab1");

			expect(event?.timestamp).toBe(ts);
		});

		it("includes tabId in the event", () => {
			const data = JSON.stringify({ type: "cls", ts: Date.now(), metric: "CLS", value: 0.05 });
			const event = tracker.processInputEvent(data, "myTab");

			expect(event?.tabId).toBe("myTab");
		});
	});

	describe("getInjectionScript — CLS PerformanceObserver", () => {
		it("contains PerformanceObserver", () => {
			expect(tracker.getInjectionScript()).toContain("PerformanceObserver");
		});

		it("observes layout-shift type", () => {
			expect(tracker.getInjectionScript()).toContain("layout-shift");
		});

		it("checks hadRecentInput to exclude input-driven shifts", () => {
			expect(tracker.getInjectionScript()).toContain("hadRecentInput");
		});

		it("reports cls events via the report function", () => {
			expect(tracker.getInjectionScript()).toContain("report('cls'");
		});

		it("uses a delta threshold before reporting", () => {
			expect(tracker.getInjectionScript()).toContain("lastReported");
		});
	});

	describe("getInjectionScript — storage proxy", () => {
		it("includes localStorage proxy", () => {
			const script = tracker.getInjectionScript();
			expect(script).toContain("localStorage");
			expect(script).toContain("setItem");
			expect(script).toContain("removeItem");
		});

		it("includes sessionStorage proxy", () => {
			expect(tracker.getInjectionScript()).toContain("sessionStorage");
		});

		it("reports storage events via the report function", () => {
			expect(tracker.getInjectionScript()).toContain("report('storage'");
		});
	});

	describe("getInjectionScript — MutationObserver", () => {
		it("includes MutationObserver", () => {
			expect(tracker.getInjectionScript()).toContain("MutationObserver");
		});

		it("uses childList with subtree", () => {
			expect(tracker.getInjectionScript()).toContain("childList");
			expect(tracker.getInjectionScript()).toContain("subtree");
		});

		it("reports dom_mutation events via the report function", () => {
			expect(tracker.getInjectionScript()).toContain("report('dom_mutation'");
		});

		it("uses 500ms debounce timer", () => {
			expect(tracker.getInjectionScript()).toContain("setTimeout(flush, 500)");
		});
	});

	describe("existing input events are unchanged", () => {
		it("still processes click events", () => {
			const data = JSON.stringify({ type: "click", ts: Date.now(), selector: "#btn", text: "OK", tag: "button" });
			const event = tracker.processInputEvent(data, "tab1");
			expect(event?.type).toBe("user_input");
		});

		it("still processes marker events", () => {
			const data = JSON.stringify({ type: "marker", ts: Date.now(), label: "Test" });
			const event = tracker.processInputEvent(data, "tab1");
			expect(event?.type).toBe("marker");
		});
	});
});
