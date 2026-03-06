/**
 * Analytics event schema registry.
 * Defines schemas for known event types and the transforms applied to their fields.
 */

export type FieldTransform = (value: unknown) => unknown;

export interface FieldDef {
	type: "string" | "number" | "boolean" | "array" | "object";
	required: boolean;
	transform?: FieldTransform;
}

export interface EventSchema {
	eventType: string;
	version: number;
	fields: Record<string, FieldDef>;
}

// Schema registry — keyed by "eventType:version"
const _schemas = new Map<string, EventSchema>();

export function registerSchema(schema: EventSchema): void {
	_schemas.set(`${schema.eventType}:${schema.version}`, schema);
}

export function getSchema(eventType: string, version: number): EventSchema | undefined {
	return _schemas.get(`${eventType}:${version}`);
}

export function hasSchema(eventType: string, version: number): boolean {
	return _schemas.has(`${eventType}:${version}`);
}

// ────────────────────────────────────────────────────────────────────────────
// Schema definitions

// Purchase events: revenue is stored in cents (integer) in the raw event payload.
// The schema transform normalizes it to dollars (float) for aggregation.
registerSchema({
	eventType: "purchase",
	version: 1,
	fields: {
		revenue: {
			type: "number",
			required: true,
			transform: (v: unknown) => Number(v) / 100, // cents → dollars
		},
		productId: { type: "string", required: true },
		quantity: { type: "number", required: true },
		currency: { type: "string", required: false },
	},
});

// Pageview events: no revenue field, no numeric transforms needed.
registerSchema({
	eventType: "pageview",
	version: 1,
	fields: {
		url: { type: "string", required: true },
		referrer: { type: "string", required: false },
		timeOnPage: { type: "number", required: false },
	},
});

// Signup events: no revenue field.
registerSchema({
	eventType: "signup",
	version: 1,
	fields: {
		plan: { type: "string", required: true },
		source: { type: "string", required: false },
	},
});

// Purchase v2 events use a lightweight payload structure and do not require
// schema-level field transforms — validation is handled at the enrichment stage.
