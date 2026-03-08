/**
 * Aggregation utilities for transformed transaction records.
 *
 * Provides monthly summaries, category breakdowns,
 * daily totals, and top-transaction extraction.
 */

/**
 * Generate monthly summaries keyed by "YYYY-MM".
 * Each summary includes total revenue, record count, and per-category breakdown.
 */
export function monthlySummary(records) {
	const months = {};
	for (const record of records) {
		const key = `${record.date.getFullYear()}-${String(record.date.getMonth() + 1).padStart(2, "0")}`;
		if (!months[key]) {
			months[key] = { month: key, total: 0, count: 0, categories: {} };
		}
		months[key].total += record.amount;
		months[key].count += 1;

		const cat = record.category;
		if (!months[key].categories[cat]) {
			months[key].categories[cat] = 0;
		}
		months[key].categories[cat] += record.amount;
	}

	for (const summary of Object.values(months)) {
		summary.total = Math.round(summary.total * 100) / 100;
		for (const cat of Object.keys(summary.categories)) {
			summary.categories[cat] = Math.round(summary.categories[cat] * 100) / 100;
		}
	}

	return months;
}

/**
 * Compute the grand total across all records.
 */
export function grandTotal(records) {
	const sum = records.reduce((acc, r) => acc + r.amount, 0);
	return Math.round(sum * 100) / 100;
}

/**
 * Break down totals by normalized category.
 */
export function categoryBreakdown(records) {
	const categories = {};
	for (const record of records) {
		const cat = record.category;
		if (!categories[cat]) {
			categories[cat] = { category: cat, total: 0, count: 0 };
		}
		categories[cat].total += record.amount;
		categories[cat].count += 1;
	}
	for (const entry of Object.values(categories)) {
		entry.total = Math.round(entry.total * 100) / 100;
	}
	return categories;
}

/**
 * Compute daily totals keyed by "YYYY-MM-DD".
 */
export function dailyTotals(records) {
	const days = {};
	for (const record of records) {
		const d = record.date;
		const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
		if (!days[key]) {
			days[key] = 0;
		}
		days[key] += record.amount;
	}
	for (const key of Object.keys(days)) {
		days[key] = Math.round(days[key] * 100) / 100;
	}
	return days;
}

/**
 * Return the top N records by amount, descending.
 */
export function topTransactions(records, n = 5) {
	return [...records].sort((a, b) => b.amount - a.amount).slice(0, n);
}

/**
 * Compute a running cumulative total over records sorted by date.
 */
export function cumulativeTotal(records) {
	const sorted = [...records].sort((a, b) => a.date - b.date);
	let running = 0;
	return sorted.map((r) => {
		running += r.amount;
		return {
			date: r.date,
			amount: r.amount,
			cumulative: Math.round(running * 100) / 100,
		};
	});
}
