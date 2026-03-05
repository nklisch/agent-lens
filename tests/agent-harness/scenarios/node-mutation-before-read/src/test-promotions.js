/**
 * Visible failing test — agent can see and run this.
 * Uses Node.js built-in test runner (node --test).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { applyPromotions } from "./promotions.js";

test("avgOriginalPrice reflects pre-promotion prices", () => {
	const catalog = {
		"SKU-001": { name: "Widget A", price: 100, category: "electronics" },
		"SKU-002": { name: "Widget B", price: 200, category: "electronics" },
		"SKU-003": { name: "Gadget C", price: 300, category: "accessories" },
	};
	const promotions = {
		"SKU-001": 50, // 100 -> 50
		"SKU-002": 150, // 200 -> 150
	};

	const result = applyPromotions(catalog, promotions);

	// Average of ORIGINAL prices: (100 + 200 + 300) / 3 = 200
	assert.equal(
		result.avgOriginalPrice,
		200,
		`Expected avgOriginalPrice=200 (from originals 100+200+300), got ${result.avgOriginalPrice}`,
	);
});

test("totalSavings is correct", () => {
	const catalog = {
		"SKU-001": { name: "A", price: 100, category: "x" },
		"SKU-002": { name: "B", price: 200, category: "x" },
	};
	const promotions = { "SKU-001": 75, "SKU-002": 180 };

	const result = applyPromotions(catalog, promotions);
	assert.equal(result.totalSavings, 45, `Expected totalSavings=45, got ${result.totalSavings}`);
});
