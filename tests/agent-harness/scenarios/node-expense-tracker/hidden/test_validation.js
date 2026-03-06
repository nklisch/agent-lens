/**
 * Hidden oracle tests — copied into workspace after agent finishes.
 * Uses Node.js built-in test runner (node --test).
 *
 * Tests each bug independently to verify all three are fixed.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { generateBudgetReport } from "./budgets.js";
import { getTopCategory } from "./categories.js";
import { ALL_EXPENSES, BUDGETS } from "./data.js";
import { filterByMonth } from "./expenses.js";
import { generateMonthlyReport } from "./reports.js";

// ── Bug 1: Year filtering ────────────────────────────────────────────

test("filter excludes expenses from a different year", () => {
	const jan2024 = filterByMonth(ALL_EXPENSES, 2024, 0);
	const dates = jan2024.map((e) => e.date);
	for (const d of dates) {
		assert.match(d, /^2024-01/, `Expense date ${d} should be in January 2024`);
	}
	assert.equal(jan2024.length, 9, `Expected 9 January 2024 expenses, got ${jan2024.length}`);
});

// ── Bug 2: Refund subtraction ────────────────────────────────────────

test("refund is subtracted from total", () => {
	const jan2024 = filterByMonth(ALL_EXPENSES, 2024, 0);
	const hasRefund = jan2024.some((e) => e.type === "refund");
	assert.ok(hasRefund, "January 2024 should contain at least one refund");

	const report = generateMonthlyReport(ALL_EXPENSES, 2024, 0);
	// If refunds are subtracted, total should be less than the sum of all amounts
	const rawSum = jan2024.reduce((s, e) => s + e.amount, 0);
	assert.ok(report.total < rawSum, `Total ${report.total} should be less than raw sum ${rawSum} because refunds are subtracted`);
});

// ── Bug 3: Category whitespace ───────────────────────────────────────

test("getTopCategory returns trimmed category name", () => {
	const result = getTopCategory("Meals > Business Lunch");
	assert.equal(result, "Meals", `Expected "Meals", got "${result}"`);
});

test("Meals budget correctly matches category spending", () => {
	const report = generateMonthlyReport(ALL_EXPENSES, 2024, 0);
	const budgetReport = generateBudgetReport(report.categories, BUDGETS);

	const mealsBudget = budgetReport.items.find((i) => i.category === "Meals");
	assert.ok(mealsBudget, "Meals should be a budgeted item, not unbudgeted");
	assert.equal(mealsBudget.spent, 155.0, `Meals spent should be $155.00, got $${mealsBudget.spent}`);
});

// ── Correct totals ───────────────────────────────────────────────────

test("net total for January 2024 is 840.00", () => {
	const report = generateMonthlyReport(ALL_EXPENSES, 2024, 0);
	assert.equal(report.total, 840.0, `Expected $840.00, got $${report.total}`);
});

test("Travel category total is 550.00", () => {
	const report = generateMonthlyReport(ALL_EXPENSES, 2024, 0);
	assert.equal(report.categories["Travel"], 550.0, `Expected Travel $550.00, got $${report.categories["Travel"]}`);
});

test("Office category total is 135.00", () => {
	const report = generateMonthlyReport(ALL_EXPENSES, 2024, 0);
	assert.equal(report.categories["Office"], 135.0, `Expected Office $135.00, got $${report.categories["Office"]}`);
});
