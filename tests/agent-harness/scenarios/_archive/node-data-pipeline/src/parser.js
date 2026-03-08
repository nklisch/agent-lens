/**
 * Transaction data and parsing utilities.
 *
 * Raw transaction records are stored in DD/MM/YYYY date format
 * as received from the European accounting system.
 */

export const RAW_TRANSACTIONS = [
	{ date: "03/01/2024", amount: "$500.00", category: "sales", description: "Widget order #1001" },
	{ date: "15/01/2024", amount: "$750.00", category: "sales", description: "Bulk widget order #1002" },
	{ date: "08/02/2024", amount: "$2,100.00", category: "services", description: "Consulting engagement Q1" },
	{ date: "22/02/2024", amount: "$300.00", category: "sales", description: "Accessory pack #1003" },
	{ date: "05/03/2024", amount: "$1,500.00", category: "sales", description: "Enterprise license #2001" },
	{ date: "10/03/2024", amount: "$450.00", category: "sales", description: "Widget order #1004" },
	{ date: "14/03/2024", amount: "$3,200.00", category: "services", description: "Platform integration project" },
	{ date: "01/03/2024", amount: "$800.00", category: "sales", description: "Widget order #1005" },
	{ date: "25/03/2024", amount: "$600.00", category: "sales", description: "Renewal order #1006" },
	{ date: "07/02/2024", amount: "$1,800.00", category: "services", description: "Security audit" },
];

/**
 * Validate that a raw record has all required fields.
 * Returns an object with { valid, errors }.
 */
export function validateRecord(record) {
	const errors = [];
	if (!record.date || typeof record.date !== "string") {
		errors.push("missing or invalid date field");
	}
	if (!record.amount || typeof record.amount !== "string") {
		errors.push("missing or invalid amount field");
	}
	if (!record.category || typeof record.category !== "string") {
		errors.push("missing or invalid category field");
	}
	if (record.date && !/^\d{2}\/\d{2}\/\d{4}$/.test(record.date)) {
		errors.push(`date format invalid: ${record.date}`);
	}
	if (record.amount && !/^\$[\d,]+\.\d{2}$/.test(record.amount)) {
		errors.push(`amount format invalid: ${record.amount}`);
	}
	return { valid: errors.length === 0, errors };
}

/**
 * Parse a date string from the transaction record.
 */
function parseDate(dateStr) {
	return new Date(dateStr);
}

/**
 * Parse raw transaction data into structured records.
 * Records with invalid dates are skipped to prevent downstream errors.
 */
export function parseTransactions(rawData) {
	const parsed = [];
	for (const record of rawData) {
		const validation = validateRecord(record);
		if (!validation.valid) {
			continue;
		}
		const date = parseDate(record.date);
		if (isNaN(date.getTime())) {
			continue;
		}
		parsed.push({
			date,
			amount: record.amount,
			category: record.category,
			description: record.description,
		});
	}
	return parsed;
}

/**
 * Return only the records that fall within a given year.
 */
export function filterByYear(records, year) {
	return records.filter((r) => r.date.getFullYear() === year);
}

/**
 * Group raw records by their category before parsing.
 */
export function groupByCategory(rawData) {
	const groups = {};
	for (const record of rawData) {
		const cat = record.category || "uncategorized";
		if (!groups[cat]) {
			groups[cat] = [];
		}
		groups[cat].push(record);
	}
	return groups;
}
