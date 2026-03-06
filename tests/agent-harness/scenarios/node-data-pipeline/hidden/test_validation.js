/**
 * Hidden oracle tests — copied into workspace after agent finishes.
 * Uses Node.js built-in test runner (node --test).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { runPipeline } from "./pipeline.js";

test("all records processed (none dropped)", () => {
	const result = runPipeline();
	assert.equal(result.recordCount, 10);
});

test("January total", () => {
	const result = runPipeline();
	assert.equal(result.monthly["2024-01"].total, 1250.0);
});

test("February total", () => {
	const result = runPipeline();
	assert.equal(result.monthly["2024-02"].total, 4200.0);
});

test("March total", () => {
	const result = runPipeline();
	assert.equal(result.monthly["2024-03"].total, 6550.0);
});

test("grand total", () => {
	const result = runPipeline();
	assert.equal(result.total, 12000.0);
});

test("no records in wrong months", () => {
	const result = runPipeline();
	const months = Object.keys(result.monthly).sort();
	assert.deepEqual(months, ["2024-01", "2024-02", "2024-03"]);
});

test("amounts over 1000 parsed correctly", () => {
	const result = runPipeline();
	const large = result.transformed.filter((r) => r.amount > 1000);
	assert.equal(large.length, 4);
});

test("January record count", () => {
	const result = runPipeline();
	assert.equal(result.monthly["2024-01"].count, 2);
});

test("February record count", () => {
	const result = runPipeline();
	assert.equal(result.monthly["2024-02"].count, 3);
});

test("March record count", () => {
	const result = runPipeline();
	assert.equal(result.monthly["2024-03"].count, 5);
});
