/**
 * Pipeline orchestrator.
 *
 * Chains parsing, transformation, and aggregation stages
 * to produce a complete revenue report from raw transactions.
 */

import { categoryBreakdown, grandTotal, monthlySummary } from "./aggregate.js";
import { parseTransactions, RAW_TRANSACTIONS } from "./parser.js";
import { transformRecords } from "./transform.js";

/**
 * Run the full transaction processing pipeline.
 *
 * @param {Array} data - Raw transaction array (defaults to embedded data)
 * @returns {{ parsed: Array, transformed: Array, monthly: Object, total: number, recordCount: number, categories: Object }}
 */
export function runPipeline(data = RAW_TRANSACTIONS) {
	const parsed = parseTransactions(data);
	const transformed = transformRecords(parsed);
	const monthly = monthlySummary(transformed);
	const total = grandTotal(transformed);
	const categories = categoryBreakdown(transformed);

	return {
		parsed,
		transformed,
		monthly,
		total,
		recordCount: transformed.length,
		categories,
	};
}

/**
 * Run the pipeline and print a human-readable summary.
 */
export function printReport(data = RAW_TRANSACTIONS) {
	const result = runPipeline(data);
	const lines = [`Transaction Report`, `==================`, `Records processed: ${result.recordCount}`, `Grand total: $${result.total.toFixed(2)}`, ``, `Monthly breakdown:`];

	const sortedMonths = Object.keys(result.monthly).sort();
	for (const key of sortedMonths) {
		const m = result.monthly[key];
		lines.push(`  ${m.month}: $${m.total.toFixed(2)} (${m.count} transactions)`);
	}

	lines.push(``);
	lines.push(`Category breakdown:`);
	for (const [cat, info] of Object.entries(result.categories)) {
		lines.push(`  ${cat}: $${info.total.toFixed(2)} (${info.count} transactions)`);
	}

	return lines.join("\n");
}
