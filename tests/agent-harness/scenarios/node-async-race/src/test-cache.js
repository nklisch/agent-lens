/**
 * Visible failing test — agent can see and run this.
 * Uses Node.js built-in test runner (node --test).
 */

import assert from "node:assert/strict";
import { before, test } from "node:test";
import { cacheClear, cacheGet, cacheSet } from "./file-cache.js";

before(async () => {
	await cacheClear();
});

test("write and immediately read back", async () => {
	await cacheSet("name", "alice");
	const value = await cacheGet("name");
	assert.equal(value, "alice", `Expected 'alice', got ${JSON.stringify(value)}`);
});

test("overwrite existing key", async () => {
	await cacheSet("count", 1);
	await cacheSet("count", 2);
	const value = await cacheGet("count");
	assert.equal(value, 2, `Expected 2, got ${JSON.stringify(value)}`);
});
