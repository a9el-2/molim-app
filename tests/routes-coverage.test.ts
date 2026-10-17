import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import {
  canAccessRoute,
  ROUTE_ACCESS_RULES,
  PUBLIC_ROUTES,
} from "../src/app/lib/roles.ts";
import type { UserRole } from "../src/app/lib/roles.ts";

/* =========================================
   مساعد: جمع كل ملفات page.tsx داخل src/app
   ========================================= */
function collectPages(dir: string, result: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // تجاهل المجلدات الخاصة (api, components, lib, …)
      if (!entry.startsWith("_") && entry !== "api" && entry !== "components" && entry !== "lib") {
        collectPages(full, result);
      }
    } else if (entry === "page.tsx") {
      result.push(full);
    }
  }
  return result;
}

/** تحويل مسار ملف إلى مسار URL — مثال: src/app/hours-review/page.tsx → /hours-review */
function filePathToRoute(filePath: string, appDir: string): string {
  const rel = relative(appDir, filePath).split(sep).join("/"); // e.g. "hours-review/page.tsx" or "page.tsx"
  const withoutPage = rel.replace(/(^|\/)?page\.tsx$/, ""); // e.g. "hours-review" or ""
  return withoutPage === "" ? "/" : `/${withoutPage}`;
}

const APP_DIR = join(import.meta.dirname, "..", "src", "app");
const allPages = collectPages(APP_DIR);
const allRoutes = allPages.map((p) => filePathToRoute(p, APP_DIR));

/* =========================================
   اختبار التغطية: كل صفحة page.tsx يجب أن تكون
   مسجّلة في ROUTE_ACCESS_RULES أو في PUBLIC_ROUTES
   ========================================= */
test("كل ملف page.tsx مسجّل إما في ROUTE_ACCESS_RULES أو PUBLIC_ROUTES", () => {
  const missing: string[] = [];
  for (const route of allRoutes) {
    const inRules = route in ROUTE_ACCESS_RULES;
    const inPublic = PUBLIC_ROUTES.includes(route);
    if (!inRules && !inPublic) {
      missing.push(route);
    }
  }
  assert.deepEqual(
    missing,
    [],
    `الصفحات التالية غير مسجّلة في ROUTE_ACCESS_RULES ولا PUBLIC_ROUTES:\n${missing.join("\n")}`
  );
});

/* =========================================
   اختبار Fail-Closed: مسار غير معروف يُرفض
   ========================================= */
test("مسار غير مسجّل يُرجع false (Fail-Closed)", () => {
  const allRoles: UserRole[] = ["VOLUNTEER", "DEPARTMENT_HEAD", "HR", "ADMIN", "SUPER_ADMIN"];
  for (const role of allRoles) {
    assert.equal(
      canAccessRoute(role, "/non-existent-page"),
      false,
      `يُتوقع رفض ${role} من /non-existent-page`
    );
  }
});

/* =========================================
   اختبار: مسار مسجّل يقبل دوره ويرفض غيره
   ========================================= */
test("مسار /roles يقبل SUPER_ADMIN فقط ويرفض الباقي", () => {
  assert.equal(canAccessRoute("SUPER_ADMIN", "/roles"), true);
  const denied: UserRole[] = ["VOLUNTEER", "DEPARTMENT_HEAD", "HR", "ADMIN"];
  for (const role of denied) {
    assert.equal(
      canAccessRoute(role, "/roles"),
      false,
      `يُتوقع رفض ${role} من /roles`
    );
  }
});

test("مسار /certificate-requests يقبل HR و SUPER_ADMIN فقط", () => {
  assert.equal(canAccessRoute("HR", "/certificate-requests"), true);
  assert.equal(canAccessRoute("SUPER_ADMIN", "/certificate-requests"), true);
  const denied: UserRole[] = ["VOLUNTEER", "DEPARTMENT_HEAD", "ADMIN"];
  for (const role of denied) {
    assert.equal(
      canAccessRoute(role, "/certificate-requests"),
      false,
      `يُتوقع رفض ${role} من /certificate-requests`
    );
  }
});

/* =========================================
   اختبار: مسار عام يُقبل لأي دور
   ========================================= */
test("المسارات العامة تُقبل لأي دور", () => {
  const allRoles: UserRole[] = ["VOLUNTEER", "DEPARTMENT_HEAD", "HR", "ADMIN", "SUPER_ADMIN"];
  for (const route of PUBLIC_ROUTES) {
    for (const role of allRoles) {
      assert.equal(
        canAccessRoute(role, route),
        true,
        `يُتوقع قبول ${role} على المسار العام ${route}`
      );
    }
  }
});
