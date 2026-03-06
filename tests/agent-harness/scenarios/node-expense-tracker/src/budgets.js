/**
 * Budget tracking and analysis.
 *
 * Compares actual category spending against defined budget limits
 * and provides utilization metrics and projections.
 */

/**
 * Check whether spending in a category is within budget.
 *
 * @param {string} category   - Top-level category name
 * @param {number} spent      - Actual amount spent
 * @param {Object} budgetDef  - Budget definition { monthly, owner }
 * @returns {{ category: string, spent: number, budget: number, remaining: number, over: boolean }}
 */
export function checkBudget(category, spent, budgetDef) {
	const limit = budgetDef.monthly;
	const remaining = limit - spent;
	return {
		category,
		spent: Math.round(spent * 100) / 100,
		budget: limit,
		remaining: Math.round(remaining * 100) / 100,
		over: remaining < 0,
	};
}

/**
 * Generate a budget report across all categories.
 *
 * Matches category totals to budget definitions using exact key lookup.
 * Categories without a matching budget are listed as "unbudgeted".
 *
 * @param {Object} categoryTotals - Map of category name to total spent
 * @param {Object} budgets        - Map of category name to budget definition
 * @returns {{ items: Array, unbudgeted: Array }}
 */
export function generateBudgetReport(categoryTotals, budgets) {
	const items = [];
	const unbudgeted = [];
	const matched = new Set();

	for (const [category, spent] of Object.entries(categoryTotals)) {
		if (budgets[category]) {
			items.push(checkBudget(category, spent, budgets[category]));
			matched.add(category);
		} else {
			unbudgeted.push({ category, spent: Math.round(spent * 100) / 100 });
		}
	}

	// Report budgeted categories with zero spend
	for (const [category, budgetDef] of Object.entries(budgets)) {
		if (!matched.has(category)) {
			items.push(checkBudget(category, 0, budgetDef));
		}
	}

	return { items, unbudgeted };
}

/**
 * Project total spend for the month based on spend so far
 * and the number of days elapsed.
 *
 * @param {number} spentSoFar   - Amount spent so far
 * @param {number} daysElapsed  - Days elapsed in the period
 * @param {number} totalDays    - Total days in the period
 * @returns {number} Projected total spend
 */
export function projectedSpend(spentSoFar, daysElapsed, totalDays) {
	if (daysElapsed <= 0 || totalDays <= 0) {
		return 0;
	}
	const dailyRate = spentSoFar / daysElapsed;
	return Math.round(dailyRate * totalDays * 100) / 100;
}

/**
 * Calculate budget utilization as a percentage.
 *
 * @param {number} spent  - Amount spent
 * @param {number} budget - Budget limit
 * @returns {number} Utilization percentage (0-100+, can exceed 100 if over budget)
 */
export function budgetUtilization(spent, budget) {
	if (budget <= 0) {
		return spent > 0 ? Infinity : 0;
	}
	return Math.round((spent / budget) * 10000) / 100;
}

/**
 * Determine alert level based on utilization percentage.
 *
 * @param {number} utilization - Percentage from budgetUtilization()
 * @returns {"ok" | "warning" | "critical" | "over"}
 */
export function alertLevel(utilization) {
	if (utilization > 100) return "over";
	if (utilization > 90) return "critical";
	if (utilization > 75) return "warning";
	return "ok";
}
