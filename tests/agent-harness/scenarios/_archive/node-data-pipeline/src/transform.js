/**
 * Business transformation layer for transaction records.
 *
 * Applies amount parsing, category normalization,
 * quarter assignment, and tax classification.
 */

const CATEGORY_MAP = {
	sales: "revenue-sales",
	services: "revenue-services",
	consulting: "revenue-services",
	refund: "contra-revenue",
	return: "contra-revenue",
};

const TAXABLE_CATEGORIES = new Set(["revenue-sales", "revenue-services"]);

const QUARTER_RANGES = [
	{ q: "Q1", start: 0, end: 2 },
	{ q: "Q2", start: 3, end: 5 },
	{ q: "Q3", start: 6, end: 8 },
	{ q: "Q4", start: 9, end: 11 },
];

/**
 * Parse a currency string into a numeric value.
 * Strips the leading dollar sign before parsing.
 */
function parseAmount(amountStr) {
	return parseFloat(amountStr.replace("$", ""));
}

/**
 * Map raw category names to normalized accounting categories.
 */
function normalizeCategory(category) {
	const lower = category.toLowerCase().trim();
	return CATEGORY_MAP[lower] || `other-${lower}`;
}

/**
 * Determine the fiscal quarter from a Date object.
 */
function getQuarter(date) {
	const month = date.getMonth();
	for (const range of QUARTER_RANGES) {
		if (month >= range.start && month <= range.end) {
			return range.q;
		}
	}
	return "Q?";
}

/**
 * Check if a normalized category is taxable.
 */
function isTaxable(normalizedCategory) {
	return TAXABLE_CATEGORIES.has(normalizedCategory);
}

/**
 * Apply exchange rate conversion.
 * Currently unused but reserved for multi-currency support.
 */
export function applyExchangeRate(amount, fromCurrency, toCurrency, rates) {
	if (fromCurrency === toCurrency) return amount;
	const fromRate = rates[fromCurrency];
	const toRate = rates[toCurrency];
	if (!fromRate || !toRate) {
		throw new Error(`Unknown currency pair: ${fromCurrency} -> ${toCurrency}`);
	}
	return (amount / fromRate) * toRate;
}

/**
 * Calculate a simple moving average over a window of amounts.
 */
export function movingAverage(amounts, windowSize) {
	if (windowSize <= 0 || amounts.length === 0) return [];
	const result = [];
	for (let i = 0; i < amounts.length; i++) {
		const start = Math.max(0, i - windowSize + 1);
		const window = amounts.slice(start, i + 1);
		const avg = window.reduce((sum, v) => sum + v, 0) / window.length;
		result.push(Math.round(avg * 100) / 100);
	}
	return result;
}

/**
 * Transform parsed records: resolve amounts, normalize categories,
 * assign quarters, and flag taxability.
 */
export function transformRecords(records) {
	return records.map((record) => {
		const normalizedCategory = normalizeCategory(record.category);
		return {
			...record,
			amount: parseAmount(record.amount),
			category: normalizedCategory,
			rawCategory: record.category,
			quarter: getQuarter(record.date),
			taxable: isTaxable(normalizedCategory),
		};
	});
}
