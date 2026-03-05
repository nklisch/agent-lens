/**
 * Hidden oracle tests — copied into workspace after agent finishes.
 * Uses Node.js built-in test runner (node --test).
 */

import assert from "node:assert/strict";
import { before, test } from "node:test";
import { processRequest, getConfig, resetConfig } from "./config-loader.js";

before(() => resetConfig());

test("processRequest returns configLoaded true", async () => {
	resetConfig();
	const result = await processRequest({ url: "/test" });
	assert.equal(result.configLoaded, true);
});

test("processRequest uses fetched timeout", async () => {
	resetConfig();
	const result = await processRequest({ url: "/test" });
	assert.equal(result.timeout, 5000);
});

test("processRequest uses fetched maxRetries", async () => {
	resetConfig();
	const result = await processRequest({ url: "/test" });
	assert.equal(result.maxRetries, 3);
});

test("processRequest preserves request data", async () => {
	resetConfig();
	const result = await processRequest({ url: "/api", method: "GET" });
	assert.equal(result.url, "/api");
	assert.equal(result.method, "GET");
});

test("config is not null after processRequest", async () => {
	resetConfig();
	await processRequest({});
	const config = getConfig();
	assert.notEqual(config, null, "config should be loaded after processRequest");
});

test("config has expected features", async () => {
	resetConfig();
	await processRequest({});
	const config = getConfig();
	assert.ok(Array.isArray(config.features), "features should be an array");
	assert.ok(config.features.includes("caching"), "features should include caching");
});

test("regression: config not null due to .then microtask ordering", async () => {
	resetConfig();
	const result = await processRequest({ url: "/check" });
	assert.notEqual(result.configLoaded, false, "configLoaded should not be false — .then must be awaited");
	assert.notEqual(result.timeout, 1000, "timeout should not be the fallback value");
});
