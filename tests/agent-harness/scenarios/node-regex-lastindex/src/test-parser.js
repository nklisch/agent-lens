/**
 * Visible failing test — agent can see and run this.
 * Uses Node.js built-in test runner (node --test).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidEmail, validationReport } from "./parser.js";

test("same valid email returns true on consecutive calls", () => {
	const email = "alice@example.com";
	const first = isValidEmail(email);
	const second = isValidEmail(email);
	assert.equal(first, true, `First call: expected true, got ${first}`);
	assert.equal(second, true, `Second call: expected true, got ${second}`);
});

test("all valid emails are reported as valid", () => {
	const users = [
		{ name: "Alice", email: "alice@example.com" },
		{ name: "Bob", email: "bob@test.org" },
		{ name: "Carol", email: "carol@domain.co" },
	];
	const report = validationReport(users);
	assert.equal(report.valid, 3, `Expected 3 valid, got ${report.valid}. Invalid: ${JSON.stringify(report.invalidEmails)}`);
	assert.equal(report.invalid, 0, `Expected 0 invalid, got ${report.invalid}`);
});
