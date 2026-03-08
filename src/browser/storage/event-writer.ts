import { closeSync, openSync, readSync, statSync, writeSync } from "node:fs";
import type { RecordedEvent } from "../types.js";

export class EventWriter {
	private fd: number;
	private currentOffset: number;

	constructor(filePath: string) {
		this.fd = openSync(filePath, "a");
		this.currentOffset = statSync(filePath).size;
	}

	/**
	 * Write an event to the JSONL file.
	 * Returns { offset, length } for the SQLite index.
	 */
	write(event: RecordedEvent): { offset: number; length: number } {
		const line = `${JSON.stringify(event)}\n`;
		const bytes = Buffer.from(line, "utf-8");
		const offset = this.currentOffset;

		writeSync(this.fd, bytes);
		this.currentOffset += bytes.length;

		return { offset, length: bytes.length };
	}

	/**
	 * Write a batch of events. Returns offsets for each.
	 */
	writeBatch(events: RecordedEvent[]): Array<{ offset: number; length: number }> {
		return events.map((e) => this.write(e));
	}

	/**
	 * Read a single event by byte offset.
	 */
	static readAt(filePath: string, offset: number, length: number): RecordedEvent {
		const fd = openSync(filePath, "r");
		const buffer = Buffer.alloc(length);
		readSync(fd, buffer, 0, length, offset);
		closeSync(fd);
		return JSON.parse(buffer.toString("utf-8")) as RecordedEvent;
	}

	close(): void {
		if (this.fd >= 0) {
			closeSync(this.fd);
			this.fd = -1;
		}
	}
}
