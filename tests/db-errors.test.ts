import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isUniqueViolation,
  isForeignKeyViolation,
  isNotNullViolation,
  isUndefinedFunction,
  isMemberIdConflict,
} from "../src/app/lib/db-errors.ts";

test("كشف انتهاك القيد الفريد: يقبل 23505 رقمًا أو نصًا", () => {
  assert.equal(isUniqueViolation({ code: "23505" }), true);
  assert.equal(isUniqueViolation({ code: 23505 }), true);
});

test("كشف انتهاك القيد الفريد: يرفض الأكواد الأخرى والقيم الفارغة", () => {
  assert.equal(isUniqueViolation({ code: "23503" }), false);
  assert.equal(isUniqueViolation({ code: null }), false);
  assert.equal(isUniqueViolation({}), false);
  assert.equal(isUniqueViolation(null), false);
  assert.equal(isUniqueViolation(undefined), false);
});

test("كشف انتهاك المفتاح الأجنبي و NOT NULL", () => {
  assert.equal(isForeignKeyViolation({ code: "23503" }), true);
  assert.equal(isForeignKeyViolation({ code: "23505" }), false);
  assert.equal(isNotNullViolation({ code: "23502" }), true);
  assert.equal(isNotNullViolation({ code: "23505" }), false);
  assert.equal(isForeignKeyViolation(null), false);
  assert.equal(isNotNullViolation(undefined), false);
});

test("كشف الدالة غير الموجودة: 42883 و PGRST202", () => {
  assert.equal(isUndefinedFunction({ code: "42883" }), true);
  assert.equal(isUndefinedFunction({ code: "PGRST202" }), true);
});

test("كشف الدالة غير الموجودة: من نص الرسالة", () => {
  assert.equal(
    isUndefinedFunction({ message: "Could not find the function public.next_molim_id" }),
    true
  );
  assert.equal(
    isUndefinedFunction({ message: 'function public.next_molim_id() does not exist' }),
    true
  );
});

test("كشف الدالة غير الموجودة: يرفض أخطاء الصلاحيات والاتصال", () => {
  assert.equal(isUndefinedFunction({ code: "42501" }), false); // insufficient_privilege
  assert.equal(isUndefinedFunction({ code: "PGRST301" }), false); // JWT/connection
  assert.equal(isUndefinedFunction({ message: "permission denied" }), false);
  assert.equal(isUndefinedFunction({ code: "23505" }), false);
  assert.equal(isUndefinedFunction(null), false);
  assert.equal(isUndefinedFunction(undefined), false);
});

test("تعارض المعرّف: يُكشف عبر details بصيغة Key (id)=... (سباق معرّفات)", () => {
  assert.equal(
    isMemberIdConflict({
      code: "23505",
      details: 'Key (id)=(MOL-00020) already exists.',
      message: 'duplicate key value violates unique constraint "users_pkey"',
    }),
    true
  );
});

test("تعارض المعرّف: يُكشف عبر اسم قيد/فهرس id في message", () => {
  assert.equal(
    isMemberIdConflict({
      code: "23505",
      message: 'duplicate key value violates unique constraint "users_id_key"',
    }),
    true
  );
  assert.equal(
    isMemberIdConflict({
      code: 23505,
      message: 'duplicate key value violates unique constraint "users_pkey"',
    }),
    true
  );
});

test("تعارض بريد/هاتف/رمز ربط: يُرفض معاملته كتعارض معرّف", () => {
  assert.equal(
    isMemberIdConflict({
      code: "23505",
      details: 'Key (email)=(x@y.org) already exists.',
      message: 'duplicate key value violates unique constraint "users_email_key"',
    }),
    false
  );
  assert.equal(
    isMemberIdConflict({
      code: "23505",
      details: 'Key (phone)=(0512345678) already exists.',
      message: 'duplicate key value violates unique constraint "users_phone_key"',
    }),
    false
  );
  assert.equal(
    isMemberIdConflict({
      code: "23505",
      details: 'Key (link_code)=(abcd...ef) already exists.',
      message: 'duplicate key value violates unique constraint "users_link_code_idx"',
    }),
    false
  );
});

test("تعارض المعرّف: يرفض غير 23505 والقيم الفارغة دون كسر", () => {
  assert.equal(isMemberIdConflict({ code: "23503" }), false);
  assert.equal(isMemberIdConflict({ code: "23505" }), false); // بلا تفاصيل قابلة للتصنيف
  assert.equal(isMemberIdConflict({}), false);
  assert.equal(isMemberIdConflict(null), false);
  assert.equal(isMemberIdConflict(undefined), false);
});
