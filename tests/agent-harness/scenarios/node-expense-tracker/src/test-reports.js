/**
 * Visible failing tests for the expense tracker.
 * Uses Node.js built-in test runner (node --test).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { generateBudgetReport } from "./budgets.js";
import { ALL_EXPENSES, BUDGETS } from "./data.js";
import { generateMonthlyReport } from "./reports.js";

test("January 2024 total expenses", () => {
	const report = generateMonthlyReport(ALL_EXPENSES, 2024, 0);
	assert.equal(report.total, 840.0, `Expected $840.00, got $${report.total}`);
});

test("Meals category total for January 2024", () => {
	const report = generateMonthlyReport(ALL_EXPENSES, 2024, 0);
	assert.equal(report.categories["Meals"], 155.0, `Expected Meals $155.00, got $${report.categories["Meals"]}`);
});

test("only January 2024 expenses included", () => {
	const report = generateMonthlyReport(ALL_EXPENSES, 2024, 0);
	assert.equal(report.count, 9, `Expected 9 expenses, got ${report.count}`);
});

test("Meals budget shows correct spend", () => {
	const report = generateMonthlyReport(ALL_EXPENSES, 2024, 0);
	const budgetReport = generateBudgetReport(report.categories, BUDGETS);
	const mealsBudget = budgetReport.items.find((i) => i.category === "Meals");
	assert.ok(mealsBudget, "Meals should appear in budget report");
	assert.equal(mealsBudget.spent, 155.0, `Expected Meals spent $155.00, got $${mealsBudget.spent}`);
});
