/**
 * Hidden oracle tests — copied into workspace after agent finishes.
 * Uses Node.js built-in test runner (node --test).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { applyPromotions, runPromotionCampaign } from "./promotions.js";

test("avgOriginalPrice with three items, two promoted", () => {
	const catalog = {
		A: { name: "A", price: 100, category: "x" },
		B: { name: "B", price: 200, category: "x" },
		C: { name: "C", price: 300, category: "x" },
	};
	const result = applyPromotions(catalog, { A: 50, B: 150 });
	assert.equal(result.avgOriginalPrice, 200);
});

test("avgOriginalPrice with no promotions", () => {
	const catalog = {
		A: { name: "A", price: 100, category: "x" },
		B: { name: "B", price: 200, category: "x" },
	};
	const result = applyPromotions(catalog, {});
	assert.equal(result.avgOriginalPrice, 150);
});

test("avgOriginalPrice with all items promoted", () => {
	const catalog = {
		A: { name: "A", price: 80, category: "x" },
		B: { name: "B", price: 120, category: "x" },
	};
	const result = applyPromotions(catalog, { A: 40, B: 60 });
	assert.equal(result.avgOriginalPrice, 100);
});

test("avgOriginalPrice single item", () => {
	const catalog = { A: { name: "A", price: 50, category: "x" } };
	const result = applyPromotions(catalog, { A: 25 });
	assert.equal(result.avgOriginalPrice, 50);
});

test("totalSavings correct", () => {
	const catalog = {
		A: { name: "A", price: 100, category: "x" },
		B: { name: "B", price: 200, category: "x" },
	};
	const result = applyPromotions(catalog, { A: 75, B: 180 });
	assert.equal(result.totalSavings, 45);
});

test("updated count correct", () => {
	const catalog = {
		A: { name: "A", price: 100, category: "x" },
		B: { name: "B", price: 200, category: "x" },
	};
	const result = applyPromotions(catalog, { A: 50, MISSING: 10 });
	assert.equal(result.updated, 1);
});

test("nonexistent SKU ignored", () => {
	const catalog = { A: { name: "A", price: 100, category: "x" } };
	const result = applyPromotions(catalog, { MISSING: 50 });
	assert.equal(result.updated, 0);
	assert.equal(result.avgOriginalPrice, 100);
});

test("runPromotionCampaign returns correct summary", () => {
	const catalog = {
		A: { name: "Widget", price: 100, category: "x" },
		B: { name: "Gadget", price: 200, category: "y" },
	};
	const report = runPromotionCampaign(catalog, { A: 70 });
	assert.equal(report.summary.updated, 1);
	assert.equal(report.summary.avgOriginalPrice, 150);
	assert.equal(report.catalogSize, 2);
});

test("regression: avgOriginalPrice uses pre-mutation prices", () => {
	const catalog = {
		EXPENSIVE: { name: "E", price: 1000, category: "x" },
		CHEAP: { name: "C", price: 10, category: "x" },
	};
	const result = applyPromotions(catalog, { EXPENSIVE: 10 });
	// If bug present: (10 + 10) / 2 = 10
	// If fixed: (1000 + 10) / 2 = 505
	assert.equal(result.avgOriginalPrice, 505);
});
