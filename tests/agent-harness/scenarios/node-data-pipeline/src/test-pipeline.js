/**
 * Visible failing test — agent can see and run this.
 * Uses Node.js built-in test runner (node --test).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { runPipeline } from "./pipeline.js";

test("grand total matches expected revenue", () => {
	const result = runPipeline();
	assert.equal(result.total, 12000.0, `Expected grand total $12,000.00, got $${result.total}`);
});

test("March revenue is correct", () => {
	const result = runPipeline();
	const march = result.monthly["2024-03"];
	assert.ok(march, `No data for March 2024. Months found: ${Object.keys(result.monthly).join(", ")}`);
	assert.equal(march.total, 6550.0, `Expected March total $6,550.00, got $${march.total}`);
});

test("all 10 records are processed", () => {
	const result = runPipeline();
	assert.equal(result.recordCount, 10, `Expected 10 records, got ${result.recordCount}`);
});
