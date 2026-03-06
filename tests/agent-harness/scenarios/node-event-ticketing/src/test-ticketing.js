/**
 * Visible failing tests for the ShowTime ticketing platform.
 * Uses Node.js built-in test runner (node --test).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkout, applyDiscount } from './checkout.js';
import { getVenue, getAllSeats } from './venues.js';
import { SeatInventory } from './seats.js';
import { calculateEarlyBird, calculateGroupDiscount } from './discounts.js';
import { resetLockedSeats } from './inventory.js';
import { clearConfigCache } from './config.js';

const TEST_PAYMENT = { method: 'card', cardLast4: '4242', cardExpiry: '12/27' };

// ── Test 1: surge event total is correct ───────────────────────────────────
// Expected total: $418.20 (2 × floor at $120, 1.5x surge, $5 baseFee, 12% service fee, $2.50 processing per ticket)
test('purchase 2 floor tickets for surge event: correct total', async () => {
	clearConfigCache();
	resetLockedSeats();
	const result = await checkout('EVT-001', [{ seatId: 'FLOOR-A-2' }, { seatId: 'FLOOR-B-1' }], { payment: TEST_PAYMENT });
	assert.strictEqual(result.success, true, `Checkout failed: ${result.error}`);
	assert.ok(isFinite(result.total), `Order total must be a finite number, got ${result.total}`);
	assert.ok(
		Math.abs(result.total - 418.2) < 1,
		`Expected ~$418.20 (2 floor tickets with 1.5x surge), got $${typeof result.total === 'number' ? result.total.toFixed(2) : result.total}`,
	);
});

// ── Test 2: VIP seats are available ───────────────────────────────────────
test('VIP ticket section has available seats', () => {
	const venue = getVenue('ARENA-001');
	const inventory = new SeatInventory(getAllSeats(venue));
	const vipSeats = inventory.availableSeats.filter((s) => s.section === 'VIP');
	assert.ok(vipSeats.length > 0, `Expected VIP seats to be available, but got ${vipSeats.length} seats`);
});

// ── Test 3: Early-bird discount is 20% ─────────────────────────────────────
test('early-bird 20% discount applies correctly for 45-day advance purchase', () => {
	const daysUntilEvent = 45; // > 30 day window → should get 20% off
	const basePrice = 120;
	const discount = calculateEarlyBird(daysUntilEvent);
	const discountedPrice = applyDiscount(basePrice, discount);
	assert.ok(
		Math.abs(discountedPrice - 96) < 1,
		`Expected ~$96.00 (20% off $120), got $${discountedPrice.toFixed(2)} — early-bird discount may be in wrong format`,
	);
});

// ── Test 4: Simple single-ticket checkout completes (control) ──────────────
// EVT-002 has no pricing override in its config — defaults are fully preserved.
// Occupancy is low (30%) so no surge applies. This test establishes a baseline.
test('single lower-tier ticket checkout for jazz event completes (control)', async () => {
	clearConfigCache();
	resetLockedSeats();
	const result = await checkout('EVT-002', [{ seatId: 'LOWER-D-1' }], { payment: TEST_PAYMENT });
	assert.strictEqual(result.success, true, `Checkout failed: ${result.error}`);
	assert.ok(result.order, 'Order object should exist');
});

// ── Test 5: Group discount applies correctly (passes) ──────────────────────
test('group discount of 15% applies correctly for group of 10', () => {
	const groupSize = 10;
	const basePrice = 100;
	const discount = calculateGroupDiscount(groupSize);
	const discountedPrice = applyDiscount(basePrice, discount);
	// calculateGroupDiscount(10) = 15 (integer), applyDiscount(100, 15) = 85.00
	assert.ok(Math.abs(discountedPrice - 85) < 0.01, `Expected $85.00, got $${discountedPrice.toFixed(2)}`);
});

// ── Test 6: Order ticket count is correct (passes) ─────────────────────────
test('order contains the correct number of tickets for 3-seat purchase', async () => {
	clearConfigCache();
	resetLockedSeats();
	const result = await checkout(
		'EVT-002',
		[{ seatId: 'LOWER-D-2' }, { seatId: 'LOWER-D-3' }, { seatId: 'LOWER-D-6' }],
		{ payment: TEST_PAYMENT },
	);
	assert.strictEqual(result.success, true, `Checkout failed: ${result.error}`);
	assert.strictEqual(result.order.ticketCount, 3, `Expected 3 tickets, got ${result.order.ticketCount}`);
});
