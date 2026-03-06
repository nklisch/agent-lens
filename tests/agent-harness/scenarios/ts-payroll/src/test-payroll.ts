import assert from "node:assert/strict";
import { test } from "node:test";
import { payrollConfig, sarah, sarahPeriod } from "./data.ts";
import { generatePayStub } from "./payroll.ts";

test("Sarah Parker net pay should be $1,814", () => {
	const stub = generatePayStub(sarah, sarahPeriod, payrollConfig);
	assert.equal(stub.netPay, 1814, `Expected $1,814 net, got $${stub.netPay}`);
});

test("Sarah Parker gross pay should be $2,600", () => {
	const stub = generatePayStub(sarah, sarahPeriod, payrollConfig);
	assert.equal(stub.grossPay, 2600, `Expected $2,600 gross, got $${stub.grossPay}`);
});
