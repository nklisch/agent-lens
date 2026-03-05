import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const TRACES_DIR = resolve(import.meta.dirname, "../.traces");

/**
 * Create a suite-level trace directory for this test run.
 * The directory name is a sanitized ISO timestamp.
 */
export async function initSuiteDir(): Promise<string> {
	const ts = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "T").slice(0, 23);
	const suiteDir = join(TRACES_DIR, ts);
	await mkdir(suiteDir, { recursive: true });
	return suiteDir;
}

/**
 * Write suite-level metadata file.
 */
export async function writeSuiteMeta(suiteDir: string, meta: Record<string, unknown>): Promise<void> {
	await writeFile(join(suiteDir, "meta.json"), JSON.stringify(meta, null, 2));
}
