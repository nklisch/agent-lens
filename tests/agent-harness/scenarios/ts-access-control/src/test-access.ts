import assert from "node:assert/strict";
import { test } from "node:test";
import { checkAccess } from "./evaluator.ts";

test("admin can delete users", () => {
	const result = checkAccess({ role: "admin", resource: "users", action: "delete" });
	assert.equal(result.granted, true, `Admin should be able to delete users. Effective permissions: ${JSON.stringify(result.effectivePermissions)}`);
});

test("admin can read reports (inherited from viewer)", () => {
	const result = checkAccess({ role: "admin", resource: "reports", action: "read" });
	assert.equal(result.granted, true, `Admin should inherit viewer's report access. Effective permissions: ${JSON.stringify(result.effectivePermissions)}`);
});

test("admin can create documents (inherited from editor)", () => {
	const result = checkAccess({ role: "admin", resource: "documents", action: "create" });
	assert.equal(result.granted, true, `Admin should inherit editor's document create. Effective permissions: ${JSON.stringify(result.effectivePermissions)}`);
});
