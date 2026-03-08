/**
 * Employee records, pay periods, and payroll configuration.
 *
 * This module serves as the data layer for the payroll system,
 * providing all the reference data needed to compute pay stubs.
 */

import type { Employee, PayPeriod, PayrollConfig } from "./types.ts";

/**
 * Sarah Parker — full-time hourly employee.
 * Works 48 hours this period with 8 hours of PTO.
 * Enrolled in 401(k) pre-tax and parking post-tax.
 */
export const sarah: Employee = {
	id: "EMP-001",
	name: "Sarah Parker",
	type: "hourly",
	rate: 50,
	overtimeEligible: true,
	deductions: [
		{ name: "401(k)", amount: 300, type: "pre_tax" },
		{ name: "Parking", amount: 100, type: "post_tax" },
	],
};

/**
 * Tom Wilson — part-time salaried employee.
 * Fixed salary per period, no overtime eligibility.
 * Only has a post-tax transit deduction.
 */
export const tom: Employee = {
	id: "EMP-002",
	name: "Tom Wilson",
	type: "salaried",
	rate: 800,
	overtimeEligible: false,
	deductions: [{ name: "Transit", amount: 20, type: "post_tax" }],
};

/** Sarah's pay period — biweekly, 48 hours worked plus 8 PTO. */
export const sarahPeriod: PayPeriod = {
	startDate: "2025-01-01",
	endDate: "2025-01-14",
	hoursWorked: 48,
	ptoHours: 8,
};

/** Tom's pay period — biweekly, 20 hours worked, no PTO. */
export const tomPeriod: PayPeriod = {
	startDate: "2025-01-01",
	endDate: "2025-01-14",
	hoursWorked: 20,
	ptoHours: 0,
};

/**
 * Standard payroll configuration.
 *
 * Tax brackets follow a progressive structure:
 *   - $0 to $1,000:    10%
 *   - $1,000 to $3,000: 22%
 *   - $3,000+:          32%
 *
 * Overtime kicks in after 40 hours at 1.5x multiplier.
 */
export const payrollConfig: PayrollConfig = {
	taxBrackets: [
		{ min: 0, max: 1000, rate: 0.1 },
		{ min: 1000, max: 3000, rate: 0.22 },
		{ min: 3000, max: Infinity, rate: 0.32 },
	],
	overtimeThreshold: 40,
	overtimeMultiplier: 1.5,
};

/**
 * All employees in the system. Used by batch payroll processing.
 */
export const allEmployees: Employee[] = [sarah, tom];

/**
 * Map of employee IDs to their current pay periods.
 */
export const currentPayPeriods: Map<string, PayPeriod> = new Map([
	[sarah.id, sarahPeriod],
	[tom.id, tomPeriod],
]);
