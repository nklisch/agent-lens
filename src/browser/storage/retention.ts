import { existsSync, rmSync } from "node:fs";
import { z } from "zod";
import type { BrowserDatabase } from "./database.js";

export const RetentionConfigSchema = z.object({
	/** Max age of recordings in days. Default: 7. */
	maxAgeDays: z.number().default(7),
	/** Run cleanup on startup. Default: true. */
	cleanupOnStartup: z.boolean().default(true),
});

export type RetentionConfig = z.infer<typeof RetentionConfigSchema>;

export class RetentionManager {
	constructor(private config: RetentionConfig) {}

	/**
	 * Clean up recordings older than the retention period.
	 * Sessions with user-placed markers are exempt unless force=true.
	 */
	async cleanup(db: BrowserDatabase, force = false): Promise<{ deleted: number }> {
		const cutoff = Date.now() - this.config.maxAgeDays * 24 * 60 * 60 * 1000;

		const sessions = db.listSessions({ before: cutoff });
		let deleted = 0;

		for (const session of sessions) {
			if (!force) {
				const markers = db.queryMarkers(session.id);
				const hasUserMarkers = markers.some((m) => !m.auto_detected);
				if (hasUserMarkers) continue;
			}

			const dir = session.recording_dir;
			if (dir && existsSync(dir)) {
				rmSync(dir, { recursive: true, force: true });
			}

			db.deleteSession(session.id);
			deleted++;
		}

		return { deleted };
	}
}
