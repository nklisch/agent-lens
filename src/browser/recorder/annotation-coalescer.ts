import type { Severity } from "../../core/enums.js";

export interface PendingAnnotation {
	label: string;
	source: string;
	severity?: Severity;
	firstTs: number;
	lastTs: number;
	count: number;
	metadata?: Record<string, unknown>;
}

export interface CoalescerConfig {
	/** Coalesce window in ms. Annotations with the same label within this window
	 *  are merged into a single event. Default: 1000. */
	windowMs?: number;
}

/**
 * Buffers annotations per-label and flushes them as coalesced events after
 * a configurable quiet window. Prevents annotation spam from tight loops.
 */
export class AnnotationCoalescer {
	private pending: Map<string, PendingAnnotation>;
	private timers: Map<string, ReturnType<typeof setTimeout>>;
	private windowMs: number;
	private onFlush: (annotation: PendingAnnotation) => void;

	constructor(onFlush: (annotation: PendingAnnotation) => void, config?: CoalescerConfig) {
		this.onFlush = onFlush;
		this.windowMs = config?.windowMs ?? 1000;
		this.pending = new Map();
		this.timers = new Map();
	}

	/** Record an annotation. Starts or extends the coalesce window for this label. */
	add(label: string, source: string, ts: number, severity?: Severity, metadata?: Record<string, unknown>): void {
		const existing = this.pending.get(label);

		if (existing) {
			// Increment count, update lastTs, merge metadata (last-write-wins per key)
			existing.count++;
			existing.lastTs = ts;
			if (metadata) {
				existing.metadata = { ...(existing.metadata ?? {}), ...metadata };
			}
			// Reset timer
			const oldTimer = this.timers.get(label);
			if (oldTimer !== undefined) clearTimeout(oldTimer);
		} else {
			// Create new entry
			this.pending.set(label, {
				label,
				source,
				severity,
				firstTs: ts,
				lastTs: ts,
				count: 1,
				metadata,
			});
		}

		// (Re)start timer
		const timer = setTimeout(() => {
			const ann = this.pending.get(label);
			if (ann) {
				this.pending.delete(label);
				this.timers.delete(label);
				this.onFlush(ann);
			}
		}, this.windowMs);
		this.timers.set(label, timer);
	}

	/** Flush all pending annotations immediately (used on session stop). */
	flushAll(): void {
		for (const [label, timer] of this.timers) {
			clearTimeout(timer);
			this.timers.delete(label);
		}
		for (const [label, ann] of this.pending) {
			this.pending.delete(label);
			this.onFlush(ann);
		}
	}

	/** Clean up all timers without flushing. */
	dispose(): void {
		for (const timer of this.timers.values()) {
			clearTimeout(timer);
		}
		this.timers.clear();
		this.pending.clear();
	}
}
