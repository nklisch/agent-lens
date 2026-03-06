The access control system is denying permissions that should be granted. Admin users cannot view reports or access the dashboard — these should be inherited from the viewer role through the role chain (admin → editor → viewer). Additionally, admins are losing their ability to delete users, even though that permission is explicitly defined on the admin role.

The system files are `evaluator.ts` (access checks), `permissions.ts` (merging), `roles.ts` (role definitions and chain resolution), and `types.ts` (type definitions). Run `npx tsx --test test-access.ts` to see the failing tests.
