import { test } from "node:test";
import assert from "node:assert/strict";

import { timingSafeEqual } from "../src/app/lib/timing-safe.ts";

test("مقارنة ثابتة الزمن: النصوص المتطابقة تُقبل", () => {
  assert.equal(timingSafeEqual("abc123", "abc123"), true);
  assert.equal(
    timingSafeEqual(
      "be2e2a3383d924c8d4f4015c6a6998a116aea8ae50ee6562edf31075b8724392",
      "be2e2a3383d924c8d4f4015c6a6998a116aea8ae50ee6562edf31075b8724392"
    ),
    true
  );
});

test("مقارنة ثابتة الزمن: اختلاف حرف واحد يُرفض", () => {
  const a = "be2e2a3383d924c8d4f4015c6a6998a116aea8ae50ee6562edf31075b8724392";
  const b = "be2e2a3383d924c8d4f4015c6a6998a116aea8ae50ee6562edf31075b8724393";
  assert.equal(timingSafeEqual(a, b), false);
});

test("مقارنة ثابتة الزمن: اختلاف الطول يُرفض دون رمي استثناء", () => {
  assert.doesNotThrow(() => timingSafeEqual("abc", "abcd"));
  assert.equal(timingSafeEqual("abc", "abcd"), false);
  assert.equal(timingSafeEqual("", "a"), false);
});

test("مقارنة ثابتة الزمن: القيم الفارغة وغير النصية تُرفض", () => {
  assert.equal(timingSafeEqual(null, "x"), false);
  assert.equal(timingSafeEqual("x", null), false);
  assert.equal(timingSafeEqual(undefined, undefined), false);
  assert.equal(timingSafeEqual("", ""), true);
  assert.equal(
    timingSafeEqual(123 as unknown as string, "123"),
    false
  );
});

test("مقارنة ثابتة الزمن: النصوص متعددة البايتات المتطابقة تُقبل", () => {
  assert.equal(timingSafeEqual("مُلم", "مُلم"), true);
  assert.equal(timingSafeEqual("مُلم", "مُلى"), false);
});
