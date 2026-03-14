import type { QueryEngine } from "./query-engine.js";

/**
 * Resolve a flexible timestamp reference to epoch ms.
 *
 * Accepts:
 * - Pure numeric string: treated as epoch ms
 * - ISO timestamp: "2024-01-01T12:00:00Z" → epoch ms
 * - Relative time HH:MM:SS: resolved relative to session start date
 * - Event ID (UUID): looks up the event's timestamp via queryEngine
 *
 * @throws Error if the reference cannot be resolved
 */
export function resolveTimestamp(queryEngine: QueryEngine, sessionId: string, ref: string): number {
	// Pure numeric string → epoch ms
	if (/^\d+$/.test(ref)) return Number(ref);
	// ISO timestamp (YYYY-MM-DD prefix or contains T+zone offset)
	if (/^\d{4}-\d{2}-\d{2}/.test(ref) || (ref.includes("T") && ref.includes("-"))) {
		return new Date(ref).getTime();
	}
	// HH:MM:SS — resolve relative to session start date
	if (ref.match(/^\d{2}:\d{2}/)) {
		const session = queryEngine.getSession(sessionId);
		const sessionDate = new Date(session.started_at).toISOString().slice(0, 10);
		return new Date(`${sessionDate}T${ref}`).getTime();
	}
	// Event ID — look up by event_id
	const event = queryEngine.getFullEvent(sessionId, ref);
	if (event) return event.timestamp;
	throw new Error(`Cannot resolve "${ref}" to a timestamp or event`);
}
