/**
 * Hidden oracle tests — copied into workspace after agent finishes.
 * Uses Node.js built-in test runner (node --test).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { splitBill } from "./bill.js";

test("totalShares equals totalWithTip for 3 people", () => {
	const result = splitBill(47, 3);
	assert.equal(result.totalShares, result.totalWithTip);
});

test("totalShares equals totalWithTip for 4 people", () => {
	const result = splitBill(61, 4);
	assert.equal(result.totalShares, result.totalWithTip);
});

test("totalShares equals totalWithTip for 7 people", () => {
	const result = splitBill(100, 7);
	assert.equal(result.totalShares, result.totalWithTip);
});

test("totalWithTip is correct", () => {
	const result = splitBill(100, 2, 0.2);
	assert.equal(result.totalWithTip, 120);
});

test("perPerson is correct for even split", () => {
	const result = splitBill(60, 3, 0);
	assert.equal(result.perPerson, 20);
});

test("zero tip works", () => {
	const result = splitBill(90, 3, 0);
	assert.equal(result.totalWithTip, 90);
	assert.equal(result.totalShares, 90);
});

test("shares length matches numPeople", () => {
	const result = splitBill(100, 5);
	assert.equal(result.shares.length, 5);
});

test("totalShares equals totalWithTip for various inputs", () => {
	const cases = [
		[50, 2, 0.18],
		[75, 4, 0.15],
		[33.33, 3, 0.2],
		[47, 3, 0.18],
		[100, 7, 0.18],
		[53, 6, 0.18],
	];
	for (const [total, n, tip] of cases) {
		const result = splitBill(total, n, tip);
		assert.equal(result.totalShares, result.totalWithTip, `total=${total}, n=${n}: totalShares=${result.totalShares} !== totalWithTip=${result.totalWithTip}`);
	}
});
