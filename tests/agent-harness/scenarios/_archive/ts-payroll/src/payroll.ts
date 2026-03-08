/**
 * Core payroll processing module.
 *
 * Orchestrates the full pay stub generation pipeline:
 * gross pay -> deductions -> tax -> net pay.
 *
 * Coordinates between the overtime, deductions, and tax
 * modules to produce a complete PayStub for each employee.
 */

import { getDeductionSummary } from "./deductions.ts";
import { calculateOvertime, calculateSalariedPay, isOvertimeEligible } from "./overtime.ts";
import { calculateTax, getEffectiveTaxRate } from "./tax.ts";
import type { Employee, PayPeriod, PayrollConfig, PayStub } from "./types.ts";

/**
 * Generate a complete pay stub for a single employee.
 *
 * This is the main entry point for individual payroll processing.
 * It computes gross pay (including overtime if applicable),
 * applies pre-tax deductions, calculates tax on the resulting
 * taxable income, and then subtracts post-tax deductions to
 * arrive at net pay.
 *
 * @param employee - The employee to process
 * @param payPeriod - The current pay period details
 * @param config - Payroll configuration (brackets, OT rules)
 * @returns A fully computed PayStub
 */
export function generatePayStub(employee: Employee, payPeriod: PayPeriod, config: PayrollConfig): PayStub {
	// Step 1: Calculate gross pay
	let overtime = null;
	let grossPay: number;

	if (employee.type === "hourly") {
		if (isOvertimeEligible(employee)) {
			overtime = calculateOvertime(payPeriod.hoursWorked, payPeriod.ptoHours, employee.rate, config.overtimeThreshold, config.overtimeMultiplier);
			grossPay = overtime.totalGross;
		} else {
			grossPay = payPeriod.hoursWorked * employee.rate;
		}
	} else {
		const salaried = calculateSalariedPay(employee.rate);
		grossPay = salaried.totalGross;
	}

	// Step 2: Process deductions
	const allDeductions = getDeductionSummary(employee.deductions);
	const preTaxTotal = allDeductions.preTaxTotal;
	const postTaxTotal = allDeductions.postTaxTotal;

	// Step 3: Calculate taxable income (gross minus pre-tax deductions)
	const taxableIncome = grossPay - preTaxTotal;

	// Step 4: Calculate tax on taxable income
	const tax = calculateTax(taxableIncome, config.taxBrackets);

	// Step 5: Calculate net pay
	// Start from taxable income (already has pre-tax removed),
	// subtract tax and all deductions
	const netPay = taxableIncome - tax - allDeductions.total;

	// Step 6: Compute effective tax rate for reporting
	const effectiveTaxRate = getEffectiveTaxRate(tax, grossPay);

	return {
		employee,
		period: payPeriod,
		grossPay,
		preTaxDeductions: preTaxTotal,
		taxableIncome,
		tax,
		postTaxDeductions: postTaxTotal,
		netPay,
		details: {
			overtime,
			deductionBreakdown: allDeductions,
			effectiveTaxRate,
		},
	};
}

/**
 * Process payroll for a batch of employees.
 *
 * Takes parallel arrays of employees and their pay periods,
 * generates a pay stub for each pair, and returns the results.
 *
 * @param employees - Array of employees to process
 * @param payPeriods - Corresponding pay periods (same order)
 * @param config - Payroll configuration
 * @returns Array of PayStub results
 * @throws Error if arrays have different lengths
 */
export function processPayroll(employees: Employee[], payPeriods: PayPeriod[], config: PayrollConfig): PayStub[] {
	if (employees.length !== payPeriods.length) {
		throw new Error(`Employee count (${employees.length}) must match pay period count (${payPeriods.length})`);
	}

	const stubs: PayStub[] = [];
	for (let i = 0; i < employees.length; i++) {
		stubs.push(generatePayStub(employees[i], payPeriods[i], config));
	}

	return stubs;
}
