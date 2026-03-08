export interface Permission {
	read?: boolean;
	write?: boolean;
	create?: boolean;
	delete?: boolean;
	export?: boolean;
}

export type Permissions = Record<string, Permission>;

export interface Role {
	name: string;
	extends: string | null;
	permissions: Permissions;
}

export interface AccessRequest {
	role: string;
	resource: string;
	action: keyof Permission;
}

export interface AccessResult {
	granted: boolean;
	role: string;
	resource: string;
	action: string;
	effectivePermissions: Permissions;
}

export interface AuditEntry {
	timestamp: Date;
	request: AccessRequest;
	result: AccessResult;
	principal: string;
	sessionId: string;
}

export interface PolicyOverride {
	resource: string;
	action: keyof Permission;
	effect: "allow" | "deny";
	condition?: string;
	priority: number;
}

export type AuditSeverity = "info" | "warn" | "critical";

export function classifyAuditSeverity(entry: AuditEntry): AuditSeverity {
	if (!entry.result.granted && entry.request.action === "delete") {
		return "critical";
	}
	if (!entry.result.granted) {
		return "warn";
	}
	return "info";
}
