import type { Role } from "./types.ts";

export const ROLES: Record<string, Role> = {
	viewer: {
		name: "viewer",
		extends: null,
		permissions: {
			documents: { read: true },
			reports: { read: true, export: true },
			dashboard: { read: true },
		},
	},
	editor: {
		name: "editor",
		extends: "viewer",
		permissions: {
			documents: { read: true, write: true, create: true },
			users: { read: true },
		},
	},
	admin: {
		name: "admin",
		extends: "editor",
		permissions: {
			users: { read: true, write: true, delete: true },
			settings: { read: true, write: true },
		},
	},
	auditor: {
		name: "auditor",
		extends: "viewer",
		permissions: {
			audit_log: { read: true, export: true },
			reports: { read: true, export: true, create: true },
		},
	},
};

export function resolveRoleChain(roleName: string): Role[] {
	const role = ROLES[roleName];
	if (!role) return [];

	const chain: Role[] = [role];

	if (role.extends) {
		const parent = ROLES[role.extends];
		if (parent) {
			chain.push(parent);
		}
	}

	return chain;
}

export function getRoleNames(): string[] {
	return Object.keys(ROLES);
}

export function isValidRole(name: string): boolean {
	return name in ROLES;
}

export function getRoleDepth(name: string): number {
	const role = ROLES[name];
	if (!role) return 0;
	if (!role.extends) return 1;
	return 1 + getRoleDepth(role.extends);
}

export function getDirectChildren(roleName: string): string[] {
	return Object.values(ROLES)
		.filter((role) => role.extends === roleName)
		.map((role) => role.name);
}
