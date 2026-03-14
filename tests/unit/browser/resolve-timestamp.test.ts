import { describe, expect, it, vi } from "vitest";
import type { QueryEngine } from "../../../src/browser/investigation/query-engine.js";
import { resolveTimestamp } from "../../../src/browser/investigation/resolve-timestamp.js";

function makeQueryEngine(sessionStartedAt: number, fullEvent?: { timestamp: number } | null): QueryEngine {
	return {
		getSession: vi.fn().mockReturnValue({ started_at: sessionStartedAt }),
		getFullEvent: vi.fn().mockReturnValue(fullEvent ?? null),
	} as unknown as QueryEngine;
}

describe("resolveTimestamp", () => {
	it("parses pure numeric string as epoch ms", () => {
		const qe = makeQueryEngine(0);
		const epochMs = 1704110400000;
		expect(resolveTimestamp(qe, "session-1", String(epochMs))).toBe(epochMs);
	});

	it("parses ISO timestamp to epoch ms", () => {
		const qe = makeQueryEngine(0);
		const iso = "2024-01-01T12:00:00.000Z";
		expect(resolveTimestamp(qe, "session-1", iso)).toBe(new Date(iso).getTime());
	});

	it("parses YYYY-MM-DD ISO date prefix", () => {
		const qe = makeQueryEngine(0);
		const iso = "2024-06-15T00:00:00Z";
		expect(resolveTimestamp(qe, "session-1", iso)).toBe(new Date(iso).getTime());
	});

	it("parses HH:MM:SS relative to session start date", () => {
		// Session started at 2024-01-15T08:00:00Z
		const sessionStart = new Date("2024-01-15T08:00:00.000Z").getTime();
		const qe = makeQueryEngine(sessionStart);

		// "00:05:30" means the same calendar date as session start, at 00:05:30 local
		const ref = "00:05:30";
		const sessionDate = new Date(sessionStart).toISOString().slice(0, 10);
		const expected = new Date(`${sessionDate}T${ref}`).getTime();

		const result = resolveTimestamp(qe, "session-1", ref);
		expect(result).toBe(expected);
		expect(qe.getSession).toHaveBeenCalledWith("session-1");
	});

	it("parses HH:MM (without seconds) relative to session start", () => {
		const sessionStart = new Date("2024-03-01T10:00:00.000Z").getTime();
		const qe = makeQueryEngine(sessionStart);

		const ref = "10:30";
		const sessionDate = new Date(sessionStart).toISOString().slice(0, 10);
		const expected = new Date(`${sessionDate}T${ref}`).getTime();

		expect(resolveTimestamp(qe, "session-1", ref)).toBe(expected);
	});

	it("resolves event_id via queryEngine lookup", () => {
		const eventTimestamp = 1704110400123;
		const qe = makeQueryEngine(0, { timestamp: eventTimestamp });
		const eventId = "a1b2c3d4-0000-0000-0000-000000000001";

		expect(resolveTimestamp(qe, "session-1", eventId)).toBe(eventTimestamp);
		expect(qe.getFullEvent).toHaveBeenCalledWith("session-1", eventId);
	});

	it("throws on unresolvable reference", () => {
		const qe = makeQueryEngine(0, null);
		expect(() => resolveTimestamp(qe, "session-1", "not-a-known-event-id")).toThrow('Cannot resolve "not-a-known-event-id"');
	});
});
