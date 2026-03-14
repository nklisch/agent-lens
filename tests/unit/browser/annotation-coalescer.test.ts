import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingAnnotation } from "../../../src/browser/recorder/annotation-coalescer.js";
import { AnnotationCoalescer } from "../../../src/browser/recorder/annotation-coalescer.js";

describe("AnnotationCoalescer", () => {
	let onFlush: ReturnType<typeof vi.fn>;
	let coalescer: AnnotationCoalescer;

	beforeEach(() => {
		vi.useFakeTimers();
		onFlush = vi.fn();
		coalescer = new AnnotationCoalescer(onFlush, { windowMs: 1000 });
	});

	afterEach(() => {
		coalescer.dispose();
		vi.useRealTimers();
	});

	it("flushes a single annotation after windowMs", () => {
		coalescer.add("render", "api", 1000);
		expect(onFlush).not.toHaveBeenCalled();

		vi.advanceTimersByTime(1000);

		expect(onFlush).toHaveBeenCalledOnce();
		const ann = onFlush.mock.calls[0][0] as PendingAnnotation;
		expect(ann.label).toBe("render");
		expect(ann.count).toBe(1);
		expect(ann.firstTs).toBe(1000);
		expect(ann.lastTs).toBe(1000);
	});

	it("coalesces same-label annotations within window into one event with count", () => {
		coalescer.add("render", "api", 1000);
		coalescer.add("render", "api", 1100);
		coalescer.add("render", "api", 1200);

		vi.advanceTimersByTime(2200);

		expect(onFlush).toHaveBeenCalledOnce();
		const ann = onFlush.mock.calls[0][0] as PendingAnnotation;
		expect(ann.count).toBe(3);
	});

	it("tracks firstTs and lastTs across coalesced annotations", () => {
		coalescer.add("render", "api", 1000);
		coalescer.add("render", "api", 1050);
		coalescer.add("render", "api", 1080);

		vi.advanceTimersByTime(2100);

		const ann = onFlush.mock.calls[0][0] as PendingAnnotation;
		expect(ann.firstTs).toBe(1000);
		expect(ann.lastTs).toBe(1080);
	});

	it("coalesces labels independently — different labels produce separate flushes", () => {
		coalescer.add("render", "api", 1000);
		coalescer.add("navigate", "api", 1050);

		vi.advanceTimersByTime(2100);

		expect(onFlush).toHaveBeenCalledTimes(2);
		const labels = onFlush.mock.calls.map((c) => (c[0] as PendingAnnotation).label);
		expect(labels).toContain("render");
		expect(labels).toContain("navigate");
	});

	it("merges metadata with last-write-wins per key", () => {
		coalescer.add("event", "api", 1000, undefined, { a: 1, b: "first" });
		coalescer.add("event", "api", 1050, undefined, { b: "second", c: 3 });

		vi.advanceTimersByTime(2100);

		const ann = onFlush.mock.calls[0][0] as PendingAnnotation;
		expect(ann.metadata).toEqual({ a: 1, b: "second", c: 3 });
	});

	it("resets timer on each new annotation for same label", () => {
		coalescer.add("render", "api", 1000);
		vi.advanceTimersByTime(800);
		expect(onFlush).not.toHaveBeenCalled();

		// Reset timer — should not flush until 1000ms after this second call
		coalescer.add("render", "api", 1800);
		vi.advanceTimersByTime(800);
		expect(onFlush).not.toHaveBeenCalled();

		vi.advanceTimersByTime(200);
		expect(onFlush).toHaveBeenCalledOnce();
	});

	it("flushAll() emits all pending annotations immediately", () => {
		coalescer.add("render", "api", 1000);
		coalescer.add("navigate", "api", 1050);

		coalescer.flushAll();

		expect(onFlush).toHaveBeenCalledTimes(2);
		// No further calls after flush
		vi.advanceTimersByTime(2000);
		expect(onFlush).toHaveBeenCalledTimes(2);
	});

	it("dispose() clears timers without flushing", () => {
		coalescer.add("render", "api", 1000);
		coalescer.add("navigate", "api", 1050);

		coalescer.dispose();

		vi.advanceTimersByTime(2000);
		expect(onFlush).not.toHaveBeenCalled();
	});

	it("handles undefined severity and metadata gracefully", () => {
		coalescer.add("bare", "api", 1000);

		vi.advanceTimersByTime(1000);

		expect(onFlush).toHaveBeenCalledOnce();
		const ann = onFlush.mock.calls[0][0] as PendingAnnotation;
		expect(ann.severity).toBeUndefined();
		expect(ann.metadata).toBeUndefined();
	});
});
