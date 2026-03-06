/**
 * Core type definitions for the payroll processing system.
 *
 * These interfaces define the shape of all data flowing through
 * the payroll pipeline: employees, pay periods, deductions,
 * tax brackets, and the resulting pay stubs.
 */

/** A single tax bracket with a minimum, maximum, and marginal rate. */
export interface TaxBracket {
	min: number;
	max: number; // Infinity for the last bracket
	rate: number;
}

/** Employee record with pay type and deduction elections. */
export interface Employee {
	id: string;
	name: string;
	type: "hourly" | "salaried";
	rate: number; // hourly rate or period salary
	overtimeEligible: boolean;
	deductions: Deduction[];
}

/** A single payroll deduction (pre-tax or post-tax). */
export interface Deduction {
	name: string;
	amount: number;
	type: "pre_tax" | "post_tax";
}

/** A pay period with dates and hours information. */
export interface PayPeriod {
	startDate: string;
	endDate: string;
	hoursWorked: number;
	ptoHours: number;
}

/** Result of overtime calculation for hourly employees. */
export interface OvertimeResult {
	regularHours: number;
	overtimeHours: number;
	regularPay: number;
	overtimePay: number;
	totalGross: number;
}

/** The final pay stub generated for an employee. */
export interface PayStub {
	employee: Employee;
	period: PayPeriod;
	grossPay: number;
	preTaxDeductions: number;
	taxableIncome: number;
	tax: number;
	postTaxDeductions: number;
	netPay: number;
	details: PayDetails;
}

/** Detailed breakdown attached to a pay stub. */
export interface PayDetails {
	overtime: OvertimeResult | null;
	deductionBreakdown: DeductionSummary;
	effectiveTaxRate: number;
}

/** Summary of all deductions split by type. */
export interface DeductionSummary {
	preTax: { name: string; amount: number }[];
	postTax: { name: string; amount: number }[];
	preTaxTotal: number;
	postTaxTotal: number;
	total: number;
}

/** Configuration for a payroll run. */
export interface PayrollConfig {
	taxBrackets: TaxBracket[];
	overtimeThreshold: number;
	overtimeMultiplier: number;
}
