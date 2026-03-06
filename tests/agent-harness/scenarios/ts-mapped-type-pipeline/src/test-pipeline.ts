/**
 * Visible failing test — agent can see and run this.
 * Uses Node.js built-in test runner: node --import tsx --test test-pipeline.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import type { RawEvent } from "./pipeline.ts";
import { runPipeline } from "./pipeline.ts";

const purchaseEvents: RawEvent[] = [
	{
		id: "evt-001",
		type: "purchase",
		version: 1,
		payload: { revenue: 5000, productId: "PROD-A", quantity: 2, currency: "USD" },
		metadata: { source: "web", sessionId: "sess-001", timestamp: 1700000001, userId: "user-001" },
	},
	{
		id: "evt-002",
		type: "purchase",
		version: 1,
		payload: { revenue: 12000, productId: "PROD-B", quantity: 1, currency: "USD" },
		metadata: { source: "web", sessionId: "sess-002", timestamp: 1700000002, userId: "user-002" },
	},
	{
		id: "evt-003",
		type: "purchase",
		version: 2,
		payload: { revenue: 7500, productId: "PROD-C", quantity: 3, currency: "USD" },
		metadata: { source: "mobile-ios", sessionId: "sess-003", timestamp: 1700000003, userId: "user-003" },
	},
	{
		id: "evt-004",
		type: "purchase",
		version: 2,
		payload: { revenue: 3000, productId: "PROD-A", quantity: 1, currency: "USD" },
		metadata: { source: "mobile-android", sessionId: "sess-004", timestamp: 1700000004, userId: "user-004" },
	},
];

test("total revenue sums all purchase amounts in dollars", () => {
	const report = runPipeline(purchaseEvents);
	assert.equal(report.totalRevenue, 275, `Expected total revenue $275.00, got $${report.totalRevenue}`);
});

test("purchase event count is correct", () => {
	const report = runPipeline(purchaseEvents);
	assert.equal(report.eventCounts.purchase, 4, `Expected 4 purchase events, got ${report.eventCounts.purchase}`);
});
