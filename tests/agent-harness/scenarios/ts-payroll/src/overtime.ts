/**
 * Overtime calculation module for the payroll system.
 *
 * Handles the computation of regular and overtime hours/pay
 * for hourly employees, as well as salaried pay handling.
 */

import type { Employee, OvertimeResult } from "./types.ts";

/**
 * Calculate overtime hours and pay for an hourly employee.
 *
 * Hours beyond the overtime threshold are compensated at the
 * overtime multiplier rate. PTO hours are included in the
 * total hours for threshold comparison.
 *
 * @param hoursWorked - Actual hours worked during the period
 * @param ptoHours - Paid time off hours taken during the period
 * @param hourlyRate - The employee's hourly pay rate
 * @param overtimeThreshold - Hours before overtime kicks in (default: 40)
 * @param overtimeMultiplier - Pay multiplier for OT hours (default: 1.5)
 * @returns An OvertimeResult with the full breakdown
 */
export function calculateOvertime(hoursWorked: number, ptoHours: number, hourlyRate: number, overtimeThreshold: number = 40, overtimeMultiplier: number = 1.5): OvertimeResult {
	// Total hours includes PTO for threshold calculation
	const totalHours = hoursWorked + ptoHours;

	// Determine overtime vs regular split
	const overtimeHours = Math.max(0, totalHours - overtimeThreshold);
	const regularHours = Math.min(totalHours, overtimeThreshold);

	// Calculate pay components
	const regularPay = regularHours * hourlyRate;
	const overtimePay = Math.round(overtimeHours * hourlyRate * overtimeMultiplier * 100) / 100;
	const totalGross = regularPay + overtimePay;

	return {
		regularHours,
		overtimeHours,
		regularPay,
		overtimePay,
		totalGross,
	};
}

/**
 * Check whether an employee is eligible for overtime pay.
 *
 * Only hourly employees who are flagged as overtime-eligible
 * can receive overtime compensation.
 *
 * @param employee - The employee to check
 * @returns true if the employee can earn overtime
 */
export function isOvertimeEligible(employee: Employee): boolean {
	return employee.type === "hourly" && employee.overtimeEligible;
}

/**
 * Calculate pay for a salaried employee.
 *
 * Salaried employees receive their fixed rate regardless of
 * hours worked. No overtime calculation is performed.
 *
 * @param salary - The employee's per-period salary
 * @returns An OvertimeResult with zero overtime
 */
export function calculateSalariedPay(salary: number): OvertimeResult {
	return {
		regularHours: 0,
		overtimeHours: 0,
		regularPay: salary,
		overtimePay: 0,
		totalGross: salary,
	};
}
