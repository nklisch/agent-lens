/**
 * Hidden oracle tests — copied into workspace after agent finishes.
 * Uses Node.js built-in test runner (node --test).
 */

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { cacheClear, cacheGet, cacheSet } from "./file-cache.js";

before(async () => {
	await cacheClear();
});

after(async () => {
	await cacheClear();
});

test("write and immediately read returns written value", async () => {
	await cacheSet("key1", "value1");
	const v = await cacheGet("key1");
	assert.equal(v, "value1");
});

test("second write overwrites first", async () => {
	await cacheSet("key2", "first");
	await cacheSet("key2", "second");
	const v = await cacheGet("key2");
	assert.equal(v, "second");
});

test("multiple keys are independent", async () => {
	await cacheSet("a", 1);
	await cacheSet("b", 2);
	assert.equal(await cacheGet("a"), 1);
	assert.equal(await cacheGet("b"), 2);
});

test("missing key returns undefined", async () => {
	const v = await cacheGet("nonexistent-key-xyz");
	assert.equal(v, undefined);
});

test("regression: no race between write and read", async () => {
	// Write and read in rapid succession — must not return stale data
	for (let i = 0; i < 5; i++) {
		await cacheSet("race", i);
		const v = await cacheGet("race");
		assert.equal(v, i, `Iteration ${i}: expected ${i}, got ${v}`);
	}
});
