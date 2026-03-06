/**
 * Expense querying and filtering utilities.
 *
 * Provides functions to slice and group expense data
 * by date, category, type, and other criteria.
 */

import { getTopCategory } from "./categories.js";

/**
 * Filter expenses to those matching a specific month.
 *
 * @param {Array} expenses - Full expense array
 * @param {number} year    - Four-digit year (e.g. 2024)
 * @param {number} month   - Zero-indexed month (0 = January, 11 = December)
 * @returns {Array} Expenses in the given month
 */
export function filterByMonth(expenses, year, month) {
	return expenses.filter((e) => {
		const d = new Date(e.date);
		return d.getMonth() === month;
	});
}

/**
 * Filter expenses by top-level category.
 *
 * @param {Array} expenses - Expense array
 * @param {string} category - Top-level category name (e.g. "Meals")
 * @returns {Array} Matching expenses
 */
export function filterByCategory(expenses, category) {
	return expenses.filter((e) => getTopCategory(e.category) === category);
}

/**
 * Filter expenses by type ("expense" or "refund").
 *
 * @param {Array} expenses - Expense array
 * @param {string} type    - "expense" or "refund"
 * @returns {Array} Matching expenses
 */
export function filterByType(expenses, type) {
	return expenses.filter((e) => e.type === type);
}

/**
 * Filter expenses within an inclusive date range.
 *
 * @param {Array} expenses  - Expense array
 * @param {string} startDate - Start date (ISO format, inclusive)
 * @param {string} endDate   - End date (ISO format, inclusive)
 * @returns {Array} Expenses within the range
 */
export function filterByDateRange(expenses, startDate, endDate) {
	const start = new Date(startDate);
	const end = new Date(endDate);
	return expenses.filter((e) => {
		const d = new Date(e.date);
		return d >= start && d <= end;
	});
}

/**
 * Group expenses by date, returning an object keyed by ISO date string.
 *
 * @param {Array} expenses - Expense array
 * @returns {Object} Map of date string to expense array
 */
export function groupByDate(expenses) {
	const groups = {};
	for (const expense of expenses) {
		const key = expense.date;
		if (!groups[key]) {
			groups[key] = [];
		}
		groups[key].push(expense);
	}
	return groups;
}

/**
 * Sort expenses by amount in descending order (largest first).
 * Returns a new array; does not modify the input.
 *
 * @param {Array} expenses - Expense array
 * @returns {Array} Sorted copy
 */
export function sortByAmount(expenses) {
	return [...expenses].sort((a, b) => b.amount - a.amount);
}

/**
 * Get a summary of how many expenses exist per submitter.
 *
 * @param {Array} expenses - Expense array
 * @returns {Object} Map of submitter name to count
 */
export function countBySubmitter(expenses) {
	const counts = {};
	for (const e of expenses) {
		counts[e.submittedBy] = (counts[e.submittedBy] || 0) + 1;
	}
	return counts;
}
