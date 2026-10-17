import { test } from "node:test";
import assert from "node:assert/strict";
import { isDemoBypassAllowed } from "../src/app/lib/demo-mode.ts";

test("demo bypass: مسموح حصراً عند NODE_ENV === 'development' و NEXT_PUBLIC_DEMO === '1'", () => {
  assert.equal(isDemoBypassAllowed("development", "1"), true);
});

test("demo bypass: مرفوض تماماً في production حتى مع NEXT_PUBLIC_DEMO === '1'", () => {
  assert.equal(isDemoBypassAllowed("production", "1"), false);
});

test("demo bypass: مرفوض تماماً في test حتى مع NEXT_PUBLIC_DEMO === '1'", () => {
  assert.equal(isDemoBypassAllowed("test", "1"), false);
});

test("demo bypass: مرفوض تماماً عندما يكون NODE_ENV غير معرّف (undefined)", () => {
  assert.equal(isDemoBypassAllowed(undefined, "1"), false);
});

test("demo bypass: مرفوض في أي بيئة أخرى مثل staging أو فارغة", () => {
  assert.equal(isDemoBypassAllowed("staging", "1"), false);
  assert.equal(isDemoBypassAllowed("", "1"), false);
});

test("demo bypass: مرفوض في development إذا لم تكن القيمة '1' بالضبط", () => {
  assert.equal(isDemoBypassAllowed("development", "0"), false);
  assert.equal(isDemoBypassAllowed("development", undefined), false);
  assert.equal(isDemoBypassAllowed("development", ""), false);
  assert.equal(isDemoBypassAllowed("development", "true"), false);
});

test("demo bypass: مرفوض عند غياب كلا المتغيرين", () => {
  assert.equal(isDemoBypassAllowed(undefined, undefined), false);
});
