import { beforeEach, describe, expect, it } from "vitest";
import { InputTracker } from "../../../src/browser/recorder/input-tracker.js";

describe("InputTracker storage events", () => {
	let tracker: InputTracker;

	beforeEach(() => {
		tracker = new InputTracker();
	});

	it("processes storage 'added' into storage_change event", () => {
		const result = tracker.processInputEvent(JSON.stringify({ type: "storage", ts: Date.now(), storageType: "local", changeType: "added", key: "draft", newValue: '{"name":"Alice"}' }), "tab1");
		expect(result?.type).toBe("storage_change");
		expect(result?.data.changeType).toBe("added");
		expect(result?.data.key).toBe("draft");
		expect(result?.data.newValue).toBe('{"name":"Alice"}');
	});

	it("processes storage 'removed' into storage_change event with oldValue", () => {
		const result = tracker.processInputEvent(JSON.stringify({ type: "storage", ts: Date.now(), storageType: "session", changeType: "removed", key: "token", oldValue: "abc123" }), "tab1");
		expect(result?.type).toBe("storage_change");
		expect(result?.data.changeType).toBe("removed");
		expect(result?.data.oldValue).toBe("abc123");
		expect(result?.data.storageType).toBe("session");
	});

	it("includes localStorage vs sessionStorage distinction", () => {
		const local = tracker.processInputEvent(JSON.stringify({ type: "storage", ts: Date.now(), storageType: "local", changeType: "set", key: "x", newValue: "1" }), "tab1");
		const session = tracker.processInputEvent(JSON.stringify({ type: "storage", ts: Date.now(), storageType: "session", changeType: "set", key: "x", newValue: "1" }), "tab1");
		expect(local?.data.storageType).toBe("local");
		expect(session?.data.storageType).toBe("session");
	});

	it("summary contains key name", () => {
		const result = tracker.processInputEvent(JSON.stringify({ type: "storage", ts: Date.now(), storageType: "local", changeType: "added", key: "cart", newValue: "[]" }), "tab1");
		expect(result?.summary).toContain("cart");
	});

	it("summary for cleared event does not include key", () => {
		const result = tracker.processInputEvent(JSON.stringify({ type: "storage", ts: Date.now(), storageType: "local", changeType: "cleared" }), "tab1");
		expect(result?.type).toBe("storage_change");
		expect(result?.summary).toContain("cleared");
	});

	it("includes crossTab flag when present", () => {
		const result = tracker.processInputEvent(JSON.stringify({ type: "storage", ts: Date.now(), storageType: "local", changeType: "set", key: "k", newValue: "v", crossTab: true }), "tab1");
		expect(result?.data.crossTab).toBe(true);
	});

	it("defaults crossTab to false when absent", () => {
		const result = tracker.processInputEvent(JSON.stringify({ type: "storage", ts: Date.now(), storageType: "local", changeType: "added", key: "k", newValue: "v" }), "tab1");
		expect(result?.data.crossTab).toBe(false);
	});

	it("uses the ts from the event payload as timestamp", () => {
		const ts = 1700000005000;
		const result = tracker.processInputEvent(JSON.stringify({ type: "storage", ts, storageType: "local", changeType: "added", key: "k", newValue: "v" }), "tab1");
		expect(result?.timestamp).toBe(ts);
	});

	it("summary includes localStorage label for local storage type", () => {
		const result = tracker.processInputEvent(JSON.stringify({ type: "storage", ts: Date.now(), storageType: "local", changeType: "set", key: "myKey", newValue: "val" }), "tab1");
		expect(result?.summary).toContain("localStorage");
	});

	it("summary includes sessionStorage label for session storage type", () => {
		const result = tracker.processInputEvent(JSON.stringify({ type: "storage", ts: Date.now(), storageType: "session", changeType: "set", key: "myKey", newValue: "val" }), "tab1");
		expect(result?.summary).toContain("sessionStorage");
	});
});
