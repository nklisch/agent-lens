/**
 * Report generation for expense tracking.
 *
 * Combines filtering, totaling, and category breakdown
 * into structured report objects.
 */

import { getTopCategory } from "./categories.js";
import { filterByMonth } from "./expenses.js";

/**
 * Calculate the total amount for a list of expenses.
 *
 * @param {Array} expenses - Expense array
 * @returns {number} Sum of all expense amounts
 */
export function calculateTotal(expenses) {
	return expenses.reduce((sum, e) => sum + e.amount, 0);
}

/**
 * Break expenses down by top-level category.
 *
 * @param {Array} expenses - Expense array
 * @returns {Object} Map of category name to total amount
 */
export function categoryBreakdown(expenses) {
	const totals = {};
	for (const expense of expenses) {
		const cat = getTopCategory(expense.category);
		if (!totals[cat]) {
			totals[cat] = 0;
		}
		totals[cat] += expense.amount;
	}
	return totals;
}

/**
 * Generate a full monthly expense report.
 *
 * Filters expenses to the target month, calculates the net total,
 * counts transactions, and breaks down spending by top-level category.
 *
 * @param {Array} allExpenses - Complete expense dataset
 * @param {number} year       - Four-digit year
 * @param {number} month      - Zero-indexed month (0 = January)
 * @returns {{ total: number, count: number, categories: Object, expenses: Array }}
 */
export function generateMonthlyReport(allExpenses, year, month) {
	const filtered = filterByMonth(allExpenses, year, month);
	const total = calculateTotal(filtered);
	const categories = categoryBreakdown(filtered);

	return {
		year,
		month,
		total: Math.round(total * 100) / 100,
		count: filtered.length,
		categories,
		expenses: filtered,
	};
}

/**
 * Format a number as a US dollar string.
 *
 * @param {number} amount
 * @returns {string} Formatted string like "$1,234.56"
 */
export function formatCurrency(amount) {
	const sign = amount < 0 ? "-" : "";
	const abs = Math.abs(amount);
	const dollars = Math.floor(abs);
	const cents = Math.round((abs - dollars) * 100);
	const formatted = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	return `${sign}$${formatted}.${String(cents).padStart(2, "0")}`;
}

/**
 * Calculate the average daily spend for a set of expenses
 * within a given number of days.
 *
 * @param {Array} expenses - Expense array
 * @param {number} daysInPeriod - Number of days in the reporting period
 * @returns {number} Average daily spend
 */
export function calculateAverageDaily(expenses, daysInPeriod) {
	if (daysInPeriod <= 0) {
		return 0;
	}
	const total = calculateTotal(expenses);
	return Math.round((total / daysInPeriod) * 100) / 100;
}

/**
 * Find the single largest expense in a list.
 *
 * @param {Array} expenses
 * @returns {Object | null} The expense with the highest amount, or null
 */
export function findLargestExpense(expenses) {
	if (expenses.length === 0) {
		return null;
	}
	return expenses.reduce((max, e) => (e.amount > max.amount ? e : max), expenses[0]);
}

/**
 * Generate a text summary line for a monthly report.
 *
 * @param {{ total: number, count: number }} report
 * @param {string} periodLabel - e.g. "January 2024"
 * @returns {string}
 */
export function reportSummaryLine(report, periodLabel) {
	return `${periodLabel}: ${formatCurrency(report.total)} across ${report.count} transaction(s)`;
}
