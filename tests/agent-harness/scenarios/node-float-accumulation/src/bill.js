/**
 * Restaurant bill splitting utility.
 */

/**
 * Split a restaurant bill evenly among numPeople, including tip.
 *
 * @param {number} total - Pre-tip total in dollars
 * @param {number} numPeople - Number of people splitting the bill
 * @param {number} [tipPct=0.18] - Tip percentage as a decimal (default 18%)
 * @returns {{ perPerson: number, shares: number[], totalWithTip: number, totalShares: number }}
 */
export function splitBill(total, numPeople, tipPct = 0.18) {
	const tip = total * tipPct;
	const billWithTip = total + tip;
	const perPerson = billWithTip / numPeople;

	// Verify the split adds up exactly
	const shares = Array(numPeople).fill(perPerson);
	const totalShares = shares.reduce((a, b) => a + b, 0);

	if (totalShares !== billWithTip) {
		// Distribute any remainder to the last share before rounding,
		// keeping the grand total exact.
		shares[numPeople - 1] += billWithTip - totalShares;
	}

	const round2 = (n) => Math.round(n * 100) / 100;
	const roundedShares = shares.map(round2);

	return {
		perPerson: round2(perPerson),
		shares: roundedShares,
		totalWithTip: round2(billWithTip),
		totalShares: round2(roundedShares.reduce((a, b) => a + b, 0)),
	};
}
