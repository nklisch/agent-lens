import { resolveRoleChain } from "./roles.ts";
import type { Permission, Permissions, Role } from "./types.ts";

export function mergePermissions(roles: Role[]): Permissions {
	let merged: Permissions = {};

	for (const role of roles) {
		merged = { ...merged, ...role.permissions };
	}

	return merged;
}

export function hasPermission(permissions: Permissions, resource: string, action: keyof Permission): boolean {
	const resourcePerms = permissions[resource];
	if (!resourcePerms) return false;
	return resourcePerms[action] === true;
}

export function getEffectivePermissions(roleName: string): Permissions {
	const chain = resolveRoleChain(roleName);
	return mergePermissions(chain);
}

export function formatPermissions(perms: Permissions): string {
	const lines: string[] = [];
	for (const [resource, actions] of Object.entries(perms)) {
		const granted = Object.entries(actions)
			.filter(([, v]) => v === true)
			.map(([k]) => k);
		if (granted.length > 0) {
			lines.push(`  ${resource}: ${granted.join(", ")}`);
		}
	}
	return lines.length > 0 ? lines.join("\n") : "  (none)";
}

export function listGrantedActions(perms: Permissions, resource: string): string[] {
	const resourcePerms = perms[resource];
	if (!resourcePerms) return [];
	return Object.entries(resourcePerms)
		.filter(([, v]) => v === true)
		.map(([k]) => k);
}

export function countPermissions(perms: Permissions): number {
	let count = 0;
	for (const actions of Object.values(perms)) {
		count += Object.values(actions).filter((v) => v === true).length;
	}
	return count;
}
