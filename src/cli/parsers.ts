import type { Breakpoint } from "../core/types.js";

/**
 * A file-grouped breakpoint set, ready for the session manager.
 */
export interface FileBreakpoints {
	file: string;
	breakpoints: Breakpoint[];
}

/**
 * Parse a CLI breakpoint string into structured breakpoint(s).
 *
 * Supported formats:
 *   "file:line"                           → simple breakpoint
 *   "file:line,line,line"                 → multiple lines in same file
 *   "file:line when <condition>"          → conditional breakpoint
 *   "file:line hit >=N"                   → hit count condition
 *   "file:line log '<message>'"           → logpoint
 *   "file:line when <cond> log '<msg>'"   → conditional logpoint
 *
 * @throws Error if the string cannot be parsed
 */
export function parseBreakpointString(input: string): FileBreakpoints {
	// Split on the first colon to get file and rest
	const colonIdx = input.indexOf(":");
	if (colonIdx === -1) {
		throw new Error(`Invalid breakpoint format: "${input}". Expected "file:line[,line] [when <cond>] [hit <cond>] [log '<msg>']"`);
	}

	const file = input.slice(0, colonIdx);
	const rest = input.slice(colonIdx + 1);

	if (!file) {
		throw new Error(`Invalid breakpoint format: "${input}". File path cannot be empty.`);
	}

	// Extract line numbers from the beginning of rest (before any keywords)
	// Line numbers are comma-separated integers, possibly followed by a space and a keyword
	const linePartMatch = rest.match(/^([\d,]+)/);
	if (!linePartMatch) {
		throw new Error(`Invalid breakpoint format: "${input}". Expected line number after colon.`);
	}

	const linePart = linePartMatch[1];
	const lineNumbers = linePart.split(",").map((s) => {
		const n = Number.parseInt(s.trim(), 10);
		if (Number.isNaN(n) || n <= 0) {
			throw new Error(`Invalid line number "${s}" in breakpoint: "${input}"`);
		}
		return n;
	});

	// Remainder after line numbers
	const remainder = rest.slice(linePart.length).trim();

	// Extract modifiers using regex
	const whenMatch = remainder.match(/\bwhen\s+(.+?)(?=\s+(?:hit|log)\b|$)/);
	const hitMatch = remainder.match(/\bhit\s+(\S+)/);
	const logMatch = remainder.match(/\blog\s+(['"])(.*?)\1/);

	const condition = whenMatch ? whenMatch[1].trim() : undefined;
	const hitCondition = hitMatch ? hitMatch[1].trim() : undefined;
	const logMessage = logMatch ? logMatch[2] : undefined;

	const breakpoints: Breakpoint[] = lineNumbers.map((line) => {
		const bp: Breakpoint = { line };
		if (condition !== undefined) bp.condition = condition;
		if (hitCondition !== undefined) bp.hitCondition = hitCondition;
		if (logMessage !== undefined) bp.logMessage = logMessage;
		return bp;
	});

	return { file, breakpoints };
}

/**
 * Parse a "file:line" or "file:start-end" source range string.
 *
 * Examples:
 *   "discount.py"          → { file: "discount.py" }
 *   "discount.py:15"       → { file: "discount.py", startLine: 15 }
 *   "discount.py:15-30"    → { file: "discount.py", startLine: 15, endLine: 30 }
 */
export function parseSourceRange(input: string): {
	file: string;
	startLine?: number;
	endLine?: number;
} {
	const colonIdx = input.lastIndexOf(":");
	if (colonIdx === -1) {
		return { file: input };
	}

	const file = input.slice(0, colonIdx);
	const rangePart = input.slice(colonIdx + 1);

	if (!rangePart) {
		return { file };
	}

	if (rangePart.includes("-")) {
		const [startStr, endStr] = rangePart.split("-");
		const startLine = Number.parseInt(startStr, 10);
		const endLine = Number.parseInt(endStr, 10);
		if (Number.isNaN(startLine) || Number.isNaN(endLine)) {
			throw new Error(`Invalid source range "${rangePart}" in: "${input}"`);
		}
		return { file, startLine, endLine };
	}

	const startLine = Number.parseInt(rangePart, 10);
	if (Number.isNaN(startLine)) {
		throw new Error(`Invalid line number "${rangePart}" in: "${input}"`);
	}
	return { file, startLine };
}

/**
 * Parse a "file:line" location string for run-to.
 *
 * Example: "order.py:150" → { file: "order.py", line: 150 }
 *
 * @throws Error if the string cannot be parsed
 */
export function parseLocation(input: string): { file: string; line: number } {
	const colonIdx = input.lastIndexOf(":");
	if (colonIdx === -1) {
		throw new Error(`Invalid location format: "${input}". Expected "file:line".`);
	}

	const file = input.slice(0, colonIdx);
	const lineStr = input.slice(colonIdx + 1);

	if (!file) {
		throw new Error(`Invalid location format: "${input}". File path cannot be empty.`);
	}

	const line = Number.parseInt(lineStr, 10);
	if (Number.isNaN(line) || line <= 0) {
		throw new Error(`Invalid line number "${lineStr}" in location: "${input}"`);
	}

	return { file, line };
}
