import { formatPermissions, getEffectivePermissions, hasPermission } from "./permissions.ts";
import { isValidRole } from "./roles.ts";
import type { AccessRequest, AccessResult, AuditEntry, Permissions } from "./types.ts";

export function checkAccess(request: AccessRequest): AccessResult {
	const { role, resource, action } = request;

	if (!isValidRole(role)) {
		return {
			granted: false,
			role,
			resource,
			action,
			effectivePermissions: {},
		};
	}

	const effectivePerms = getEffectivePermissions(role);
	const granted = hasPermission(effectivePerms, resource, action);

	return {
		granted,
		role,
		resource,
		action,
		effectivePermissions: effectivePerms,
	};
}

export function checkAccessBatch(requests: AccessRequest[]): AccessResult[] {
	return requests.map((req) => checkAccess(req));
}

export function checkAllGranted(requests: AccessRequest[]): boolean {
	const results = checkAccessBatch(requests);
	return results.every((r) => r.granted);
}

export function checkAnyGranted(requests: AccessRequest[]): boolean {
	const results = checkAccessBatch(requests);
	return results.some((r) => r.granted);
}

export function createAuditEntry(request: AccessRequest, result: AccessResult, principal: string, sessionId: string): AuditEntry {
	return {
		timestamp: new Date(),
		request,
		result,
		principal,
		sessionId,
	};
}

export function summarizeAccess(role: string): string {
	if (!isValidRole(role)) {
		return `Role "${role}" does not exist.`;
	}

	const perms = getEffectivePermissions(role);
	return `Effective permissions for "${role}":\n${formatPermissions(perms)}`;
}

export function diffPermissions(roleA: string, roleB: string): { onlyA: Permissions; onlyB: Permissions; shared: Permissions } {
	const permsA = getEffectivePermissions(roleA);
	const permsB = getEffectivePermissions(roleB);

	const onlyA: Permissions = {};
	const onlyB: Permissions = {};
	const shared: Permissions = {};

	const allResources = new Set([...Object.keys(permsA), ...Object.keys(permsB)]);

	for (const resource of allResources) {
		const a = permsA[resource] || {};
		const b = permsB[resource] || {};
		const allActions = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof import("./types.ts").Permission>;

		for (const action of allActions) {
			const inA = a[action] === true;
			const inB = b[action] === true;

			if (inA && !inB) {
				if (!onlyA[resource]) onlyA[resource] = {};
				onlyA[resource][action] = true;
			} else if (!inA && inB) {
				if (!onlyB[resource]) onlyB[resource] = {};
				onlyB[resource][action] = true;
			} else if (inA && inB) {
				if (!shared[resource]) shared[resource] = {};
				shared[resource][action] = true;
			}
		}
	}

	return { onlyA, onlyB, shared };
}
