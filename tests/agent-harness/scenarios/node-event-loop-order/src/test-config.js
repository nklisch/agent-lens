/**
 * Visible failing test — agent can see and run this.
 * Uses Node.js built-in test runner (node --test).
 */

import assert from "node:assert/strict";
import { before, test } from "node:test";
import { processRequest, resetConfig } from "./config-loader.js";

before(() => resetConfig());

test("processRequest loads config and uses real values", async () => {
	const result = await processRequest({ url: "/api/data" });

	assert.equal(result.configLoaded, true, `Expected configLoaded=true, got ${result.configLoaded}`);
	assert.equal(result.timeout, 5000, `Expected timeout=5000, got ${result.timeout}`);
	assert.equal(result.maxRetries, 3, `Expected maxRetries=3, got ${result.maxRetries}`);
});
