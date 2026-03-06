import assert from "node:assert/strict";
import { test } from "node:test";
import { checkAccess } from "./evaluator.ts";
import { getEffectivePermissions } from "./permissions.ts";
import { resolveRoleChain } from "./roles.ts";

// --- Bug 1 validation: full chain resolution ---

test("resolveRoleChain returns full chain for admin (admin → editor → viewer)", () => {
	const chain = resolveRoleChain("admin");
	const names = chain.map((r) => r.name);
	assert.deepEqual(names, ["admin", "editor", "viewer"]);
});

test("resolveRoleChain returns full chain for editor (editor → viewer)", () => {
	const chain = resolveRoleChain("editor");
	const names = chain.map((r) => r.name);
	assert.deepEqual(names, ["editor", "viewer"]);
});

test("resolveRoleChain returns single role for viewer (no parent)", () => {
	const chain = resolveRoleChain("viewer");
	const names = chain.map((r) => r.name);
	assert.deepEqual(names, ["viewer"]);
});

test("resolveRoleChain returns full chain for auditor (auditor → viewer)", () => {
	const chain = resolveRoleChain("auditor");
	const names = chain.map((r) => r.name);
	assert.deepEqual(names, ["auditor", "viewer"]);
});

// --- Bug 2 validation: deep merge preserves all permissions ---

test("admin retains users.delete after merging with editor's users", () => {
	const result = checkAccess({ role: "admin", resource: "users", action: "delete" });
	assert.equal(result.granted, true, "Admin's users.delete must survive merge with editor's users");
});

test("admin retains users.write after merging with editor's users", () => {
	const result = checkAccess({ role: "admin", resource: "users", action: "write" });
	assert.equal(result.granted, true, "Admin's users.write must survive merge with editor's users");
});

test("admin inherits documents.write from editor", () => {
	const result = checkAccess({ role: "admin", resource: "documents", action: "write" });
	assert.equal(result.granted, true, "Admin should inherit documents.write from editor");
});

test("admin inherits documents.create from editor", () => {
	const result = checkAccess({ role: "admin", resource: "documents", action: "create" });
	assert.equal(result.granted, true, "Admin should inherit documents.create from editor");
});

// --- Combined: both bugs must be fixed for these to pass ---

test("admin can read reports (inherited through full chain from viewer)", () => {
	const result = checkAccess({ role: "admin", resource: "reports", action: "read" });
	assert.equal(result.granted, true, "Admin must inherit reports.read from viewer via full chain");
});

test("admin can export reports (inherited through full chain from viewer)", () => {
	const result = checkAccess({ role: "admin", resource: "reports", action: "export" });
	assert.equal(result.granted, true, "Admin must inherit reports.export from viewer via full chain");
});

test("admin can read dashboard (inherited through full chain from viewer)", () => {
	const result = checkAccess({ role: "admin", resource: "dashboard", action: "read" });
	assert.equal(result.granted, true, "Admin must inherit dashboard.read from viewer via full chain");
});

test("admin has complete effective permissions", () => {
	const perms = getEffectivePermissions("admin");
	assert.deepEqual(perms.users, { read: true, write: true, delete: true });
	assert.deepEqual(perms.settings, { read: true, write: true });
	assert.deepEqual(perms.documents, { read: true, write: true, create: true });
	assert.deepEqual(perms.reports, { read: true, export: true });
	assert.deepEqual(perms.dashboard, { read: true });
});

// --- Auditor role (extends viewer, not editor) ---

test("auditor inherits viewer permissions", () => {
	const result = checkAccess({ role: "auditor", resource: "dashboard", action: "read" });
	assert.equal(result.granted, true, "Auditor should inherit dashboard.read from viewer");
});

test("auditor has audit_log access", () => {
	const result = checkAccess({ role: "auditor", resource: "audit_log", action: "read" });
	assert.equal(result.granted, true, "Auditor should have audit_log.read");
});

test("auditor does not have editor permissions", () => {
	const result = checkAccess({ role: "auditor", resource: "users", action: "read" });
	assert.equal(result.granted, false, "Auditor should NOT have users.read (not in chain)");
});

test("auditor merges reports correctly with viewer", () => {
	const perms = getEffectivePermissions("auditor");
	assert.deepEqual(perms.reports, { read: true, export: true, create: true });
});

// --- Viewer role: no inheritance, should work directly ---

test("viewer can read documents", () => {
	const result = checkAccess({ role: "viewer", resource: "documents", action: "read" });
	assert.equal(result.granted, true);
});

test("viewer cannot write documents", () => {
	const result = checkAccess({ role: "viewer", resource: "documents", action: "write" });
	assert.equal(result.granted, false);
});
