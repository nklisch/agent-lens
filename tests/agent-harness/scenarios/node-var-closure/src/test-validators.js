/**
 * Visible failing test — agent can see and run this.
 * Uses Node.js built-in test runner (node --test).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { validateAll } from "./validators.js";

test("each validator checks its own range, not the last range", () => {
	const ranges = [
		{ name: "low", low: 0, high: 10 },
		{ name: "mid", low: 11, high: 20 },
		{ name: "high", low: 21, high: 30 },
	];
	const values = [5, 15, 25];
	const results = validateAll(ranges, values);

	assert.deepEqual(results.low, [5], `"low" should match [5], got ${JSON.stringify(results.low)}`);
	assert.deepEqual(results.mid, [15], `"mid" should match [15], got ${JSON.stringify(results.mid)}`);
	assert.deepEqual(results.high, [25], `"high" should match [25], got ${JSON.stringify(results.high)}`);
});
