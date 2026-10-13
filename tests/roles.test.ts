import { test } from "node:test";
import assert from "node:assert/strict";

import { canAccessRoute, ROUTE_ACCESS_RULES } from "../src/app/lib/roles.ts";
import { canManageMembers } from "../src/app/lib/access-control.ts";
import type { UserRole } from "../src/app/lib/roles.ts";

test("صلاحيات /invitations في الواجهة تطابق سياسة الخادم (canManageMembers)", () => {
  const allowed: UserRole[] = ["HR", "ADMIN", "SUPER_ADMIN"];
  const denied: UserRole[] = ["VOLUNTEER", "DEPARTMENT_HEAD"];

  for (const role of allowed) {
    assert.equal(canAccessRoute(role, "/invitations"), true, `يُتوقع السماح لـ${role}`);
    assert.equal(canManageMembers(role), true, `يُتوقع أن يدير ${role} الأعضاء`);
  }

  for (const role of denied) {
    assert.equal(canAccessRoute(role, "/invitations"), false, `يُتوقع منع ${role}`);
    assert.equal(canManageMembers(role), false, `يُتوقع أن لا يدير ${role} الأعضاء`);
  }
});

test("قاعدة /invitations تسرد الأدوار الثلاثة بالضبط", () => {
  assert.deepEqual(
    [...ROUTE_ACCESS_RULES["/invitations"]].sort(),
    ["ADMIN", "HR", "SUPER_ADMIN"]
  );
});
