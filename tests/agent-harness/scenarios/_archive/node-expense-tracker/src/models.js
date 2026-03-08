/**
 * Expense tracking data structures and factory helpers.
 *
 * All expense records follow a consistent shape for use across
 * the filtering, reporting, and budgeting modules.
 */

/**
 * @typedef {Object} Expense
 * @property {string} id          - Unique identifier (e.g. "EXP-001")
 * @property {string} date        - ISO date string (e.g. "2024-01-05")
 * @property {number} amount      - Positive dollar amount
 * @property {string} type        - "expense" or "refund"
 * @property {string} category    - Hierarchical path (e.g. "Meals > Business Lunch")
 * @property {string} description - Human-readable description
 * @property {string} submittedBy - Employee who submitted the expense
 */

/**
 * @typedef {Object} Budget
 * @property {string} category - Top-level category name (e.g. "Meals")
 * @property {number} monthly  - Monthly budget limit in dollars
 * @property {string} owner    - Budget owner / approver
 */

let expenseCounter = 0;

/**
 * Create a new expense record with defaults applied.
 *
 * @param {Partial<Expense>} fields - Override fields
 * @returns {Expense}
 */
export function createExpense(fields) {
	expenseCounter++;
	return {
		id: fields.id || `EXP-${String(expenseCounter).padStart(3, "0")}`,
		date: fields.date || new Date().toISOString().slice(0, 10),
		amount: fields.amount || 0,
		type: fields.type || "expense",
		category: fields.category || "Uncategorized",
		description: fields.description || "",
		submittedBy: fields.submittedBy || "unknown",
	};
}

/**
 * Create a budget definition.
 *
 * @param {string} category - Top-level category
 * @param {number} monthly  - Monthly limit
 * @param {string} owner    - Approver name
 * @returns {Budget}
 */
export function createBudget(category, monthly, owner = "Finance") {
	return { category, monthly, owner };
}

/**
 * Validate that an expense record has all required fields
 * and that types are correct.
 *
 * @param {Expense} expense
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateExpense(expense) {
	const errors = [];
	if (!expense.id || typeof expense.id !== "string") {
		errors.push("missing or invalid id");
	}
	if (!expense.date || !/^\d{4}-\d{2}-\d{2}$/.test(expense.date)) {
		errors.push("date must be YYYY-MM-DD format");
	}
	if (typeof expense.amount !== "number" || expense.amount < 0) {
		errors.push("amount must be a non-negative number");
	}
	if (!["expense", "refund"].includes(expense.type)) {
		errors.push("type must be 'expense' or 'refund'");
	}
	if (!expense.category || typeof expense.category !== "string") {
		errors.push("missing or invalid category");
	}
	return { valid: errors.length === 0, errors };
}
