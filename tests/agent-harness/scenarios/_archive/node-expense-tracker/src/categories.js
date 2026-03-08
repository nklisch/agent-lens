/**
 * Category hierarchy utilities.
 *
 * Expense categories use a path format with ">" as the separator,
 * e.g. "Meals > Business Lunch" or "Travel > Flights".
 *
 * This module handles parsing, validation, and grouping of
 * hierarchical category paths.
 */

/**
 * Extract the top-level category from a hierarchical path.
 *
 * Examples:
 *   "Travel > Flights"      → "Travel"
 *   "Office > Supplies"     → "Office"
 *   "Uncategorized"         → "Uncategorized"
 *
 * @param {string} categoryPath - Full category path
 * @returns {string} Top-level category name
 */
export function getTopCategory(categoryPath) {
	if (!categoryPath || typeof categoryPath !== "string") {
		return "Uncategorized";
	}
	const parts = categoryPath.split(">");
	return parts[0];
}

/**
 * Get the full category path as an array of segments.
 *
 * @param {string} categoryPath - Full category path
 * @returns {string[]} Array of path segments
 */
export function getCategoryPath(categoryPath) {
	if (!categoryPath || typeof categoryPath !== "string") {
		return ["Uncategorized"];
	}
	return categoryPath.split(">").map((s) => s.trim());
}

/**
 * Extract all unique top-level categories from a list of expenses.
 *
 * @param {Array} expenses - Array of expense records
 * @returns {string[]} Sorted array of top-level category names
 */
export function getAllTopCategories(expenses) {
	const categories = new Set();
	for (const expense of expenses) {
		categories.add(getTopCategory(expense.category));
	}
	return [...categories].sort();
}

/**
 * Validate that a category path follows the expected format.
 * Must be non-empty and use ">" as the hierarchy separator.
 *
 * @param {string} categoryPath
 * @returns {{ valid: boolean, segments: string[], error?: string }}
 */
export function validateCategory(categoryPath) {
	if (!categoryPath || typeof categoryPath !== "string") {
		return { valid: false, segments: [], error: "Category path is required" };
	}
	if (categoryPath.includes("/") || categoryPath.includes("\\")) {
		return {
			valid: false,
			segments: [],
			error: "Use '>' as separator, not '/' or '\\'",
		};
	}
	const segments = categoryPath.split(">").map((s) => s.trim());
	if (segments.some((s) => s.length === 0)) {
		return {
			valid: false,
			segments,
			error: "Empty segment in category path",
		};
	}
	return { valid: true, segments };
}

/**
 * Suggest the closest matching category from a list of known categories.
 * Uses simple substring matching and Levenshtein-like scoring.
 *
 * @param {string} input - User-provided category string
 * @param {string[]} known - Array of valid category paths
 * @returns {{ match: string | null, confidence: number }}
 */
export function suggestCategory(input, known) {
	if (!input || known.length === 0) {
		return { match: null, confidence: 0 };
	}

	const normalized = input.toLowerCase().trim();
	let bestMatch = null;
	let bestScore = 0;

	for (const candidate of known) {
		const candidateLower = candidate.toLowerCase();

		// Exact match
		if (candidateLower === normalized) {
			return { match: candidate, confidence: 1.0 };
		}

		// Starts-with match
		if (candidateLower.startsWith(normalized)) {
			const score = normalized.length / candidateLower.length;
			if (score > bestScore) {
				bestScore = score;
				bestMatch = candidate;
			}
			continue;
		}

		// Contains match
		if (candidateLower.includes(normalized)) {
			const score = (normalized.length / candidateLower.length) * 0.8;
			if (score > bestScore) {
				bestScore = score;
				bestMatch = candidate;
			}
			continue;
		}

		// Check each segment
		const segments = candidateLower.split(">").map((s) => s.trim());
		for (const seg of segments) {
			if (seg.startsWith(normalized)) {
				const score = (normalized.length / seg.length) * 0.6;
				if (score > bestScore) {
					bestScore = score;
					bestMatch = candidate;
				}
			}
		}
	}

	return { match: bestMatch, confidence: bestScore };
}
