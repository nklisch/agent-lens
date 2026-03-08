/**
 * Reporting module for the payroll system.
 *
 * Provides functions for generating payroll summaries,
 * formatting pay stubs for display, and computing
 * aggregate statistics across a payroll run.
 */

import type { PayStub } from "./types.ts";

/**
 * Summary statistics for a batch of pay stubs.
 */
interface PayrollSummary {
	totalEmployees: number;
	totalGross: number;
	totalTax: number;
	totalDeductions: number;
	totalNet: number;
	averageNetPay: number;
}

/**
 * Generate aggregate summary statistics from a set of pay stubs.
 *
 * Computes totals and averages across all employees in the
 * payroll batch for reporting and reconciliation purposes.
 *
 * @param payStubs - Array of completed pay stubs
 * @returns Summary statistics for the entire payroll run
 */
export function generatePayrollSummary(payStubs: PayStub[]): PayrollSummary {
	const totalGross = payStubs.reduce((sum, s) => sum + s.grossPay, 0);
	const totalTax = payStubs.reduce((sum, s) => sum + s.tax, 0);
	const totalDeductions = payStubs.reduce((sum, s) => sum + s.preTaxDeductions + s.postTaxDeductions, 0);
	const totalNet = payStubs.reduce((sum, s) => sum + s.netPay, 0);

	return {
		totalEmployees: payStubs.length,
		totalGross,
		totalTax,
		totalDeductions,
		totalNet,
		averageNetPay: payStubs.length > 0 ? Math.round((totalNet / payStubs.length) * 100) / 100 : 0,
	};
}

/**
 * Format a single pay stub into a human-readable string.
 *
 * Produces a multi-line text representation suitable for
 * printing or logging. Includes all major line items.
 *
 * @param payStub - The pay stub to format
 * @returns A formatted string representation
 */
export function formatPayStub(payStub: PayStub): string {
	const lines: string[] = [
		`=== Pay Stub: ${payStub.employee.name} ===`,
		`Period: ${payStub.period.startDate} to ${payStub.period.endDate}`,
		``,
		`Gross Pay:          $${payStub.grossPay.toFixed(2)}`,
		`Pre-Tax Deductions: $${payStub.preTaxDeductions.toFixed(2)}`,
		`Taxable Income:     $${payStub.taxableIncome.toFixed(2)}`,
		`Tax:                $${payStub.tax.toFixed(2)}`,
		`Post-Tax Deductions:$${payStub.postTaxDeductions.toFixed(2)}`,
		``,
		`Net Pay:            $${payStub.netPay.toFixed(2)}`,
		`Effective Tax Rate: ${(payStub.details.effectiveTaxRate * 100).toFixed(2)}%`,
		`================================`,
	];
	return lines.join("\n");
}

/**
 * Calculate the total payroll cost (sum of all net pay).
 *
 * This is a convenience function used in reconciliation
 * to verify that individual stubs sum correctly.
 *
 * @param payStubs - Array of pay stubs to total
 * @returns The sum of all net pay amounts
 */
export function calculateTotalPayroll(payStubs: PayStub[]): number {
	return payStubs.reduce((sum, s) => sum + s.netPay, 0);
}
