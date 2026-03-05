/**
 * Hidden oracle tests — copied into workspace after agent finishes.
 * Uses Node.js built-in test runner (node --test).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidEmail, validateUsers, filterValidUsers, validationReport } from "./parser.js";

test("valid email returns true", () => {
	assert.equal(isValidEmail("alice@example.com"), true);
});

test("invalid email returns false", () => {
	assert.equal(isValidEmail("not-an-email"), false);
});

test("same email returns true on consecutive calls", () => {
	assert.equal(isValidEmail("bob@test.org"), true);
	assert.equal(isValidEmail("bob@test.org"), true);
	assert.equal(isValidEmail("bob@test.org"), true);
});

test("multiple different valid emails all return true", () => {
	assert.equal(isValidEmail("a@b.com"), true);
	assert.equal(isValidEmail("c@d.org"), true);
	assert.equal(isValidEmail("e@f.net"), true);
});

test("validateUsers marks all valid emails correctly", () => {
	const users = [
		{ name: "A", email: "a@b.com" },
		{ name: "B", email: "b@c.org" },
		{ name: "C", email: "c@d.net" },
	];
	const validated = validateUsers(users);
	for (const u of validated) {
		assert.equal(u.emailValid, true, `${u.name} (${u.email}) should be valid`);
	}
});

test("validateUsers marks invalid email correctly", () => {
	const users = [
		{ name: "A", email: "valid@test.com" },
		{ name: "B", email: "not-valid" },
	];
	const validated = validateUsers(users);
	assert.equal(validated[0].emailValid, true);
	assert.equal(validated[1].emailValid, false);
});

test("filterValidUsers returns only valid", () => {
	const users = [
		{ name: "A", email: "a@b.com" },
		{ name: "B", email: "bad" },
		{ name: "C", email: "c@d.com" },
	];
	const valid = filterValidUsers(users);
	assert.equal(valid.length, 2);
});

test("validationReport counts correctly", () => {
	const users = [
		{ name: "A", email: "alice@example.com" },
		{ name: "B", email: "bob@test.org" },
		{ name: "C", email: "carol@domain.co" },
	];
	const report = validationReport(users);
	assert.equal(report.total, 3);
	assert.equal(report.valid, 3);
	assert.equal(report.invalid, 0);
});

test("validationReport with mix of valid and invalid", () => {
	const users = [
		{ name: "A", email: "good@example.com" },
		{ name: "B", email: "nope" },
		{ name: "C", email: "also.good@test.org" },
		{ name: "D", email: "@broken" },
	];
	const report = validationReport(users);
	assert.equal(report.valid, 2);
	assert.equal(report.invalid, 2);
});

test("regression: regex lastIndex does not cause alternating results", () => {
	// If the g flag is present, consecutive calls alternate true/false
	const results = [];
	for (let i = 0; i < 6; i++) {
		results.push(isValidEmail("test@example.com"));
	}
	assert.deepEqual(results, [true, true, true, true, true, true], `Expected all true, got ${JSON.stringify(results)}`);
});
