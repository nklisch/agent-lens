import { getErrorMessage } from "../../core/errors.js";

/**
 * Shared MCP tool response helpers.
 */

export function errorResponse(err: unknown): { content: Array<{ type: "text"; text: string }>; isError: true } {
	return { content: [{ type: "text" as const, text: getErrorMessage(err) }], isError: true };
}

export function textResponse(text: string): { content: Array<{ type: "text"; text: string }> } {
	return { content: [{ type: "text" as const, text }] };
}
