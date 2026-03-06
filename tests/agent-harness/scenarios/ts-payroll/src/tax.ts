/**
 * Tax calculation module for the payroll system.
 *
 * Provides functions for computing income tax based on
 * configurable tax brackets, along with helpers for
 * generating tax breakdowns and summaries.
 */

import type { TaxBracket } from "./types.ts";

/**
 * Calculate the total tax owed on the given taxable income
 * using the provided tax brackets.
 *
 * Brackets are sorted by their minimum threshold and the
 * applicable rate is determined based on where the income falls.
 *
 * @param taxableIncome - The income amount subject to tax
 * @param brackets - Array of tax brackets with min, max, and rate
 * @returns The computed tax amount, rounded to two decimal places
 */
export function calculateTax(taxableIncome: number, brackets: TaxBracket[]): number {
	if (taxableIncome <= 0) return 0;

	// Sort brackets by min ascending to ensure correct ordering
	const sorted = [...brackets].sort((a, b) => a.min - b.min);

	// Find the applicable rate for this income level
	let applicableRate = sorted[0].rate;
	for (const bracket of sorted) {
		if (taxableIncome > bracket.min) {
			applicableRate = bracket.rate;
		}
	}

	return Math.round(applicableRate * taxableIncome * 100) / 100;
}

/**
 * Generate a per-bracket breakdown showing how much income
 * falls within each bracket and the tax from that portion.
 *
 * @param taxableIncome - The income amount subject to tax
 * @param brackets - Array of tax brackets
 * @returns Array of objects with bracket info and computed amounts
 */
export function getTaxBreakdown(taxableIncome: number, brackets: TaxBracket[]): { bracket: TaxBracket; portionInBracket: number; taxFromBracket: number }[] {
	const sorted = [...brackets].sort((a, b) => a.min - b.min);
	const breakdown: { bracket: TaxBracket; portionInBracket: number; taxFromBracket: number }[] = [];

	for (const bracket of sorted) {
		if (taxableIncome <= bracket.min) {
			breakdown.push({ bracket, portionInBracket: 0, taxFromBracket: 0 });
			continue;
		}
		const upper = Math.min(taxableIncome, bracket.max);
		const portion = upper - bracket.min;
		breakdown.push({
			bracket,
			portionInBracket: portion,
			taxFromBracket: Math.round(portion * bracket.rate * 100) / 100,
		});
	}

	return breakdown;
}

/**
 * Compute the effective tax rate as a percentage.
 *
 * @param tax - The total tax amount
 * @param grossPay - The gross pay before deductions
 * @returns The effective tax rate as a decimal (e.g. 0.15 for 15%)
 */
export function getEffectiveTaxRate(tax: number, grossPay: number): number {
	if (grossPay <= 0) return 0;
	return Math.round((tax / grossPay) * 10000) / 10000;
}

/**
 * Format a human-readable tax summary string.
 *
 * @param taxableIncome - The taxable income
 * @param tax - The computed tax
 * @param effectiveRate - The effective tax rate
 * @returns A formatted multi-line summary string
 */
export function formatTaxSummary(taxableIncome: number, tax: number, effectiveRate: number): string {
	const lines: string[] = [`Taxable Income: $${taxableIncome.toFixed(2)}`, `Tax Owed:       $${tax.toFixed(2)}`, `Effective Rate: ${(effectiveRate * 100).toFixed(2)}%`];
	return lines.join("\n");
}
