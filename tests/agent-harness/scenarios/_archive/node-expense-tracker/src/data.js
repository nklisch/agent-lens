/**
 * Expense data store and configuration.
 *
 * Contains all expense records across multiple periods,
 * budget definitions, and reporting period configuration.
 */

import { createBudget, createExpense } from "./models.js";

// ── January 2024 expenses ────────────────────────────────────────────

const jan2024 = [
	createExpense({
		id: "EXP-101",
		date: "2024-01-05",
		amount: 45.0,
		type: "expense",
		category: "Meals > Business Lunch",
		description: "Team lunch at Pho House",
		submittedBy: "alice",
	}),
	createExpense({
		id: "EXP-102",
		date: "2024-01-08",
		amount: 120.0,
		type: "expense",
		category: "Travel > Flights",
		description: "SFO-LAX shuttle flight",
		submittedBy: "bob",
	}),
	createExpense({
		id: "EXP-103",
		date: "2024-01-10",
		amount: 35.0,
		type: "refund",
		category: "Office > Supplies",
		description: "Returned printer cable",
		submittedBy: "carol",
	}),
	createExpense({
		id: "EXP-104",
		date: "2024-01-12",
		amount: 250.0,
		type: "expense",
		category: "Travel > Hotels",
		description: "Conference stay — downtown Marriott",
		submittedBy: "bob",
	}),
	createExpense({
		id: "EXP-105",
		date: "2024-01-15",
		amount: 68.0,
		type: "expense",
		category: "Meals > Client Dinner",
		description: "Client dinner at Nobu",
		submittedBy: "alice",
	}),
	createExpense({
		id: "EXP-106",
		date: "2024-01-18",
		amount: 95.0,
		type: "expense",
		category: "Office > Software",
		description: "IDE license renewal",
		submittedBy: "dave",
	}),
	createExpense({
		id: "EXP-107",
		date: "2024-01-22",
		amount: 180.0,
		type: "expense",
		category: "Travel > Flights",
		description: "LAX-SFO return flight",
		submittedBy: "bob",
	}),
	createExpense({
		id: "EXP-108",
		date: "2024-01-25",
		amount: 42.0,
		type: "expense",
		category: "Meals > Team Event",
		description: "Happy hour at The Craft",
		submittedBy: "alice",
	}),
	createExpense({
		id: "EXP-109",
		date: "2024-01-28",
		amount: 75.0,
		type: "expense",
		category: "Office > Equipment",
		description: "Mechanical keyboard",
		submittedBy: "dave",
	}),
];

// ── January 2023 expenses (prior year) ──────────────────────────────

const jan2023 = [
	createExpense({
		id: "EXP-050",
		date: "2023-01-10",
		amount: 200.0,
		type: "expense",
		category: "Travel > Flights",
		description: "NYC trip — JFK round-trip",
		submittedBy: "bob",
	}),
	createExpense({
		id: "EXP-051",
		date: "2023-01-20",
		amount: 150.0,
		type: "expense",
		category: "Meals > Business Lunch",
		description: "Strategy offsite lunch",
		submittedBy: "alice",
	}),
];

// ── Other 2024 expenses (not January) ────────────────────────────────

const other2024 = [
	createExpense({
		id: "EXP-120",
		date: "2024-02-05",
		amount: 55.0,
		type: "expense",
		category: "Meals > Business Lunch",
		description: "Vendor lunch meeting",
		submittedBy: "alice",
	}),
	createExpense({
		id: "EXP-130",
		date: "2024-03-12",
		amount: 300.0,
		type: "expense",
		category: "Travel > Hotels",
		description: "Q1 summit hotel",
		submittedBy: "bob",
	}),
];

// ── Combined dataset ─────────────────────────────────────────────────

export const ALL_EXPENSES = [...jan2023, ...jan2024, ...other2024];

// ── Budget definitions ───────────────────────────────────────────────

export const BUDGETS = {
	Meals: createBudget("Meals", 200, "Finance"),
	Travel: createBudget("Travel", 600, "Finance"),
	Office: createBudget("Office", 200, "Operations"),
};

// ── Reporting period config ──────────────────────────────────────────

export const CURRENT_PERIOD = {
	year: 2024,
	month: 0, // JavaScript months are 0-indexed (0 = January)
	label: "January 2024",
};

/**
 * Return all unique submitters across the dataset.
 */
export function getSubmitters() {
	const submitters = new Set();
	for (const expense of ALL_EXPENSES) {
		submitters.add(expense.submittedBy);
	}
	return [...submitters].sort();
}

/**
 * Count expenses by type across the entire dataset.
 */
export function countByType() {
	const counts = { expense: 0, refund: 0 };
	for (const e of ALL_EXPENSES) {
		counts[e.type] = (counts[e.type] || 0) + 1;
	}
	return counts;
}
