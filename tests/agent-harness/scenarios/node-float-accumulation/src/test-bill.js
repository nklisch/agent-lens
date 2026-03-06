/**
 * Visible failing test — agent can see and run this.
 * Uses Node.js built-in test runner (node --test).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { splitBill } from "./bill.js";

test("totalShares matches totalWithTip", () => {
	// $47 bill, 3 people, 18% tip -> $55.46 total
	// Rounded shares [18.49, 18.49, 18.49] sum to $55.47, not $55.46
	const result = splitBill(47, 3);
	assert.equal(
		result.totalShares,
		result.totalWithTip,
		`totalShares ${result.totalShares} !== totalWithTip ${result.totalWithTip} — shares ${JSON.stringify(result.shares)} don't sum to the expected total`,
	);
});

test("totalShares matches totalWithTip for 6 people", () => {
	const result = splitBill(53, 6);
	assert.equal(result.totalShares, result.totalWithTip, `totalShares ${result.totalShares} !== totalWithTip ${result.totalWithTip}`);
});

test("exact split works correctly", () => {
	const result = splitBill(30, 3, 0);
	assert.equal(result.totalShares, 30);
	assert.equal(result.totalWithTip, 30);
});
