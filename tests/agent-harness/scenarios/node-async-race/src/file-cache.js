/**
 * A simple file-backed cache.
 * Stores values as JSON in a temp file, reads them back on demand.
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CACHE_FILE = join(tmpdir(), "agent-lens-test-cache.json");

let memoryCache = {};

/**
 * Write a value to the cache.
 */
export async function cacheSet(key, value) {
	memoryCache[key] = value;
	// BUG: missing await — writeFile is not awaited, so the file write
	// happens asynchronously. If cacheGet is called immediately after,
	// it reads stale data from the file.
	writeFile(CACHE_FILE, JSON.stringify(memoryCache));
}

/**
 * Read a value from the cache.
 * Returns undefined if the key does not exist.
 */
export async function cacheGet(key) {
	try {
		const raw = await readFile(CACHE_FILE, "utf-8");
		const data = JSON.parse(raw);
		return data[key];
	} catch {
		return undefined;
	}
}

/**
 * Clear the cache.
 */
export async function cacheClear() {
	memoryCache = {};
	await writeFile(CACHE_FILE, "{}");
}
