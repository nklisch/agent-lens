import { z } from "zod";

export const TOOL_GROUPS = ["debug", "browser"] as const;
export const ToolGroupSchema = z.enum(TOOL_GROUPS);
export type ToolGroup = z.infer<typeof ToolGroupSchema>;

/**
 * Parse a comma-separated tool group string (e.g. "browser" or "debug,browser").
 * Returns all groups if input is undefined/empty.
 * Throws on invalid group names.
 */
export function parseToolGroups(input: string | undefined): Set<ToolGroup> {
	if (!input || input.trim() === "") {
		return new Set(TOOL_GROUPS);
	}
	const groups = input.split(",").map((s) => s.trim());
	const parsed = groups.map((g) => ToolGroupSchema.parse(g));
	return new Set(parsed);
}
