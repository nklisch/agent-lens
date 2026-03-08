/**
 * Restaurant bill splitting utility.
 * Splits a bill evenly among diners, including tip.
 */

export interface BillSplit {
	perPerson: number;
	shares: number[];
	totalWithTip: number;
	totalShares: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Split a restaurant bill evenly among `numPeople` diners.
 * A correction step distributes any floating-point remainder to the last share,
 * ensuring the sum of shares equals the total before rounding is applied.
 */
export function splitBill(total: number, numPeople: number, tipPct = 0.18): BillSplit {
	const tip = total * tipPct;
	const billWithTip = total + tip;
	const perPerson = billWithTip / numPeople;

	const shares: number[] = Array(numPeople).fill(perPerson);
	const totalShares = shares.reduce((a: number, b: number) => a + b, 0);

	// Absorb any remainder into the last share to keep the total exact.
	if (totalShares !== billWithTip) {
		shares[numPeople - 1] += billWithTip - totalShares;
	}

	const roundedShares = shares.map(round2);

	return {
		perPerson: round2(perPerson),
		shares: roundedShares,
		totalWithTip: round2(billWithTip),
		totalShares: round2(roundedShares.reduce((a: number, b: number) => a + b, 0)),
	};
}

/**
 * Format a bill split as a human-readable breakdown.
 */
export function formatBillSummary(split: BillSplit): string {
	const lines = [
		`Total with tip: $${split.totalWithTip.toFixed(2)}`,
		`Per person: $${split.perPerson.toFixed(2)}`,
		`Shares: ${split.shares.map((s) => `$${s.toFixed(2)}`).join(", ")}`,
		`Sum of shares: $${split.totalShares.toFixed(2)}`,
	];
	return lines.join("\n");
}
