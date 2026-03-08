/**
 * Estimate token count for a string (rough heuristic: chars / 4).
 */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

/**
 * A section of rendered output with a priority.
 * Higher priority sections are kept; lower priority sections are dropped first.
 */
export interface RenderSection {
	/** Unique identifier for this section. */
	key: string;
	/** Rendered text content. */
	content: string;
	/** Priority (higher = more important, kept longer). */
	priority: number;
}

/**
 * Fit sections within a token budget.
 * Includes sections in priority order (highest first) until the budget is exhausted.
 * Returns the included sections in their original order (by key).
 */
export function fitToBudget(sections: RenderSection[], budget: number): RenderSection[] {
	const byPriority = [...sections].sort((a, b) => b.priority - a.priority);

	let remaining = budget;
	const included = new Set<string>();

	for (const section of byPriority) {
		const tokens = estimateTokens(section.content);
		if (tokens <= remaining) {
			included.add(section.key);
			remaining -= tokens;
		}
	}

	return sections.filter((s) => included.has(s.key));
}

/**
 * Truncate a string to fit within a token budget.
 * Appends "... (truncated)" if truncation occurs.
 */
export function truncateToTokens(text: string, maxTokens: number): string {
	const maxChars = maxTokens * 4;
	if (text.length <= maxChars) return text;
	return `${text.slice(0, maxChars - 20)}\n... (truncated)`;
}
