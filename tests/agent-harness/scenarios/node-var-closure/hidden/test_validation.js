/**
 * Hidden oracle tests — copied into workspace after agent finishes.
 * Uses Node.js built-in test runner (node --test).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { makeRangeValidators, validateAll, passesAll } from "./validators.js";

test("each validator checks its own range", () => {
	const ranges = [
		{ name: "low", low: 0, high: 10 },
		{ name: "mid", low: 11, high: 20 },
		{ name: "high", low: 21, high: 30 },
	];
	const results = validateAll(ranges, [5, 15, 25]);
	assert.deepEqual(results.low, [5]);
	assert.deepEqual(results.mid, [15]);
	assert.deepEqual(results.high, [25]);
});

test("validators handle overlapping ranges", () => {
	const ranges = [
		{ name: "a", low: 0, high: 15 },
		{ name: "b", low: 10, high: 25 },
	];
	const results = validateAll(ranges, [5, 12, 20]);
	assert.deepEqual(results.a, [5, 12]);
	assert.deepEqual(results.b, [12, 20]);
});

test("single range works correctly", () => {
	const ranges = [{ name: "only", low: 5, high: 10 }];
	const results = validateAll(ranges, [3, 5, 7, 10, 12]);
	assert.deepEqual(results.only, [5, 7, 10]);
});

test("boundary values are included", () => {
	const ranges = [{ name: "r", low: 10, high: 20 }];
	const results = validateAll(ranges, [9, 10, 15, 20, 21]);
	assert.deepEqual(results.r, [10, 15, 20]);
});

test("makeRangeValidators creates correct number of validators", () => {
	const ranges = [
		{ name: "a", low: 0, high: 10 },
		{ name: "b", low: 20, high: 30 },
		{ name: "c", low: 40, high: 50 },
	];
	const validators = makeRangeValidators(ranges);
	assert.equal(validators.length, 3);
});

test("validators have correct names", () => {
	const ranges = [
		{ name: "alpha", low: 0, high: 10 },
		{ name: "beta", low: 20, high: 30 },
	];
	const validators = makeRangeValidators(ranges);
	assert.equal(validators[0].name, "alpha");
	assert.equal(validators[1].name, "beta");
});

test("first validator does not use last range values", () => {
	const ranges = [
		{ name: "small", low: 0, high: 5 },
		{ name: "big", low: 100, high: 200 },
	];
	const validators = makeRangeValidators(ranges);
	// If bug present, first validator uses big's range (100-200)
	assert.equal(validators[0].validate(3), true, "3 should be in range [0,5]");
	assert.equal(validators[0].validate(150), false, "150 should NOT be in range [0,5]");
});

test("passesAll checks all ranges", () => {
	const ranges = [
		{ name: "a", low: 0, high: 100 },
		{ name: "b", low: 50, high: 150 },
	];
	assert.equal(passesAll(ranges, 75), true);
	assert.equal(passesAll(ranges, 25), false); // outside b
	assert.equal(passesAll(ranges, 125), false); // outside a
});

test("regression: closures capture per-iteration values, not shared var", () => {
	const ranges = [
		{ name: "low", low: 0, high: 10 },
		{ name: "high", low: 90, high: 100 },
	];
	const results = validateAll(ranges, [5, 95]);
	assert.deepEqual(results.low, [5], "low validator should only match 5");
	assert.deepEqual(results.high, [95], "high validator should only match 95");
});
