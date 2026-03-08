/**
 * Deduction processing module for the payroll system.
 *
 * Splits employee deductions into pre-tax and post-tax categories,
 * computes totals, and validates that deductions don't exceed gross pay.
 */

import type { Deduction, DeductionSummary } from "./types.ts";

/**
 * Build a complete deduction summary from an array of deductions.
 *
 * Groups deductions into pre-tax and post-tax, computes subtotals
 * for each category, and a grand total across all deductions.
 *
 * @param deductions - Array of employee deduction elections
 * @returns A DeductionSummary with categorized amounts and totals
 */
export function getDeductionSummary(deductions: Deduction[]): DeductionSummary {
	const preTax = getPreTaxDeductions(deductions);
	const postTax = getPostTaxDeductions(deductions);

	const preTaxTotal = preTax.reduce((sum, d) => sum + d.amount, 0);
	const postTaxTotal = postTax.reduce((sum, d) => sum + d.amount, 0);

	return {
		preTax: preTax.map((d) => ({ name: d.name, amount: d.amount })),
		postTax: postTax.map((d) => ({ name: d.name, amount: d.amount })),
		preTaxTotal,
		postTaxTotal,
		total: preTaxTotal + postTaxTotal,
	};
}

/**
 * Filter deductions to only pre-tax items.
 *
 * Pre-tax deductions reduce taxable income (e.g., 401(k),
 * health insurance premiums, HSA contributions).
 *
 * @param deductions - Array of all deductions
 * @returns Only the pre-tax deductions
 */
export function getPreTaxDeductions(deductions: Deduction[]): Deduction[] {
	return deductions.filter((d) => d.type === "pre_tax");
}

/**
 * Filter deductions to only post-tax items.
 *
 * Post-tax deductions are taken after tax computation
 * (e.g., parking, transit, Roth contributions).
 *
 * @param deductions - Array of all deductions
 * @returns Only the post-tax deductions
 */
export function getPostTaxDeductions(deductions: Deduction[]): Deduction[] {
	return deductions.filter((d) => d.type === "post_tax");
}

/**
 * Validate that total deductions don't exceed gross pay.
 *
 * Returns an object indicating whether deductions are valid
 * and the remaining pay after all deductions.
 *
 * @param deductions - Array of employee deductions
 * @param grossPay - The employee's gross pay for the period
 * @returns Validation result with remaining amount
 */
export function validateDeductions(deductions: Deduction[], grossPay: number): { valid: boolean; totalDeductions: number; remaining: number } {
	const summary = getDeductionSummary(deductions);
	const remaining = grossPay - summary.total;

	return {
		valid: remaining >= 0,
		totalDeductions: summary.total,
		remaining,
	};
}
