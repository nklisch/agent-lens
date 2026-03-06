/**
 * Hidden oracle tests for the ts-payroll scenario.
 * Copied into workspace after agent finishes.
 * Uses Node.js built-in test runner: npx tsx --test test_validation.ts
 *
 * Tests each of the three bugs independently, plus integration checks.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { payrollConfig, sarah, sarahPeriod, tom, tomPeriod } from "./data.ts";
import { calculateOvertime } from "./overtime.ts";
import { generatePayStub } from "./payroll.ts";
import { calculateTax } from "./tax.ts";

// --- Bug 1: Progressive tax brackets ---

test("progressive tax on $2,300 should be $386", () => {
	// Bracket 1: $1,000 * 0.10 = $100
	// Bracket 2: $1,300 * 0.22 = $286
	// Total: $386
	const tax = calculateTax(2300, payrollConfig.taxBrackets);
	assert.equal(tax, 386, `Expected progressive tax of $386 on $2,300, got $${tax}`);
});

test("progressive tax on $500 should be $50", () => {
	// All in first bracket: $500 * 0.10 = $50
	const tax = calculateTax(500, payrollConfig.taxBrackets);
	assert.equal(tax, 50, `Expected $50 tax on $500, got $${tax}`);
});

test("progressive tax on $4,000 should be $860", () => {
	// Bracket 1: $1,000 * 0.10 = $100
	// Bracket 2: $2,000 * 0.22 = $440
	// Bracket 3: $1,000 * 0.32 = $320
	// Total: $860
	const tax = calculateTax(4000, payrollConfig.taxBrackets);
	assert.equal(tax, 860, `Expected progressive tax of $860 on $4,000, got $${tax}`);
});

// --- Bug 2: PTO should not count toward overtime ---

test("overtime from 48 hours worked with 8 PTO should be 8 OT hours", () => {
	const result = calculateOvertime(48, 8, 50, 40, 1.5);
	assert.equal(result.overtimeHours, 8, `Expected 8 OT hours, got ${result.overtimeHours}`);
});

test("overtime gross from 48 hours at $50/hr should be $2,600", () => {
	// Regular: 40 * $50 = $2,000
	// OT: 8 * $50 * 1.5 = $600
	// Total: $2,600
	const result = calculateOvertime(48, 8, 50, 40, 1.5);
	assert.equal(result.totalGross, 2600, `Expected $2,600 gross, got $${result.totalGross}`);
});

test("35 hours worked with 8 PTO should have 0 OT hours", () => {
	const result = calculateOvertime(35, 8, 50, 40, 1.5);
	assert.equal(result.overtimeHours, 0, `Expected 0 OT hours, got ${result.overtimeHours}`);
});

// --- Bug 3: Pre-tax deductions should not be subtracted twice ---

test("Sarah Parker net pay is $1,814 (not double-deducted)", () => {
	const stub = generatePayStub(sarah, sarahPeriod, payrollConfig);
	// Correct: net = gross - preTax - tax - postTax
	//        = $2,600 - $300 - $386 - $100 = $1,814
	assert.equal(stub.netPay, 1814, `Expected net $1,814, got $${stub.netPay}`);
});

test("Sarah Parker taxable income is $2,300", () => {
	const stub = generatePayStub(sarah, sarahPeriod, payrollConfig);
	assert.equal(stub.taxableIncome, 2300, `Expected taxable $2,300, got $${stub.taxableIncome}`);
});

test("Sarah Parker tax is $386", () => {
	const stub = generatePayStub(sarah, sarahPeriod, payrollConfig);
	assert.equal(stub.tax, 386, `Expected tax $386, got $${stub.tax}`);
});

// --- Tom Wilson: unaffected by any of the bugs ---

test("Tom Wilson net pay is $700", () => {
	const stub = generatePayStub(tom, tomPeriod, payrollConfig);
	// Gross: $800 (salaried)
	// Pre-tax: $0
	// Taxable: $800
	// Tax: $800 * 0.10 = $80 (all in first bracket, same either way)
	// Post-tax: $20
	// Net: $800 - $0 - $80 - $20 = $700
	assert.equal(stub.netPay, 700, `Expected Tom net $700, got $${stub.netPay}`);
});

test("Tom Wilson gross pay is $800", () => {
	const stub = generatePayStub(tom, tomPeriod, payrollConfig);
	assert.equal(stub.grossPay, 800, `Expected Tom gross $800, got $${stub.grossPay}`);
});

// --- Full integration ---

test("Sarah Parker complete pay stub values", () => {
	const stub = generatePayStub(sarah, sarahPeriod, payrollConfig);
	assert.equal(stub.grossPay, 2600, "gross");
	assert.equal(stub.preTaxDeductions, 300, "preTax");
	assert.equal(stub.taxableIncome, 2300, "taxable");
	assert.equal(stub.tax, 386, "tax");
	assert.equal(stub.postTaxDeductions, 100, "postTax");
	assert.equal(stub.netPay, 1814, "net");
});
