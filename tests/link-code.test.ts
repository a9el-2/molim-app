import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LINK_CODE_TTL_HOURS,
  generateLinkCode,
  hashLinkCode,
  normalizeLinkCode,
  linkCodeExpiry,
  isLinkCodeExpired,
  isLinkCodeUsable,
} from "../src/app/lib/link-code.ts";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

test("توليد الرمز: صيغة ثلاث مجموعات، ورموز من الأبجدية الآمنة", () => {
  const code = generateLinkCode();
  assert.match(code, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  for (const char of code.replace(/-/g, "")) {
    assert.ok(
      CODE_ALPHABET.includes(char),
      `الحرف ${char} خارج الأبجدية الآمنة`
    );
  }
  assert.equal(code.length, 14);
});

test("توليد الرمز: عشوائي ولا يتكرر بشكل عملي", () => {
  const codes = new Set<string>();
  for (let i = 0; i < 100; i += 1) {
    codes.add(generateLinkCode());
  }
  assert.ok(codes.size >= 99, `توقعنا رموزًا شبه فريدة، حصلنا على ${codes.size}`);
});

test("تطبيع الرمز: إزالة الفراغات والشرطات وتحويل للأحرف الكبيرة", () => {
  assert.equal(normalizeLinkCode(" abcd-efgh-jklm "), "ABCDEFGHJKLM");
  assert.equal(normalizeLinkCode("ABCD EFGH JKLM"), "ABCDEFGHJKLM");
  assert.equal(normalizeLinkCode("abcd"), "ABCD");
  assert.equal(normalizeLinkCode(""), "");
});

test("التجزئة: ثابتة، وتتجاهل الصيغة، وتنتج SHA-256 بطول 64", () => {
  const a = hashLinkCode("abcd-efgh-jklm");
  const b = hashLinkCode("ABCD EFGH JKLM");
  assert.equal(a, b);
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.notEqual(a, hashLinkCode("abcd-efgh-jkln"));
});

test("التجزئة: لا تطابق الرمز الأصلي (لا يُخزَّن الرمز الخام)", () => {
  const code = "ABCD-EFGH-JKLM";
  const hash = hashLinkCode(code);
  assert.notEqual(hash, code);
  assert.ok(!hash.includes(code.replace(/-/g, "")));
});

test("الانتهاء: الرمز يُنشأ لمدة 48 ساعة", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const expiry = new Date(linkCodeExpiry(now)).getTime();
  const expected = now.getTime() + LINK_CODE_TTL_HOURS * 3600 * 1000;
  assert.equal(expiry, expected);
});

test("الانتهاء: يميّز المنتهي من الساري والقيم غير الصالحة", () => {
  const now = Date.now();
  assert.equal(isLinkCodeExpired(new Date(now - 1000).toISOString(), now), true);
  assert.equal(isLinkCodeExpired(new Date(now + 1000).toISOString(), now), false);
  assert.equal(isLinkCodeExpired(null, now), true);
  assert.equal(isLinkCodeExpired(undefined, now), true);
  assert.equal(isLinkCodeExpired("not-a-date", now), true);
});

test("صلاحية الرمز: يقبل الرمز الصالح غير المستخدم غير المنتهي", () => {
  const future = new Date(Date.now() + 3600_000).toISOString();
  const hash = hashLinkCode("ABCD-EFGH-JKLM");
  const record = {
    link_code: hash,
    link_code_expires_at: future,
    link_code_used_at: null,
    telegram_id: null,
  };
  assert.equal(isLinkCodeUsable(record, hash), true);
});

test("صلاحية الرمز: يرفض التجزئة غير المطابقة", () => {
  const future = new Date(Date.now() + 3600_000).toISOString();
  const hash = hashLinkCode("ABCD-EFGH-JKLM");
  const record = { link_code: hash, link_code_expires_at: future };
  assert.equal(isLinkCodeUsable(record, hashLinkCode("ZZZZ-ZZZZ-ZZZZ")), false);
});

test("صلاحية الرمز: يرفض المستخدم مسبقًا (منع إعادة الاستخدام)", () => {
  const future = new Date(Date.now() + 3600_000).toISOString();
  const hash = hashLinkCode("ABCD-EFGH-JKLM");
  const record = {
    link_code: hash,
    link_code_expires_at: future,
    link_code_used_at: new Date().toISOString(),
    telegram_id: null,
  };
  assert.equal(isLinkCodeUsable(record, hash), false);
});

test("صلاحية الرمز: يرفض المنتهي الصلاحية", () => {
  const past = new Date(Date.now() - 1000).toISOString();
  const hash = hashLinkCode("ABCD-EFGH-JKLM");
  const record = {
    link_code: hash,
    link_code_expires_at: past,
    link_code_used_at: null,
    telegram_id: null,
  };
  assert.equal(isLinkCodeUsable(record, hash), false);
});

test("صلاحية الرمز: يرفض عضوًا مرتبطًا بتيليجرام مسبقًا", () => {
  const future = new Date(Date.now() + 3600_000).toISOString();
  const hash = hashLinkCode("ABCD-EFGH-JKLM");
  const record = {
    link_code: hash,
    link_code_expires_at: future,
    link_code_used_at: null,
    telegram_id: 123456,
  };
  assert.equal(isLinkCodeUsable(record, hash), false);
});

test("صلاحية الرمز: يرفض السجل الفارغ أو بلا تجزئة", () => {
  assert.equal(isLinkCodeUsable(null, "x"), false);
  assert.equal(isLinkCodeUsable(undefined, "x"), false);
  assert.equal(isLinkCodeUsable({}, "x"), false);
});

test("صلاحية الرمز: اختلاف الطول في التجزئة يُرفض بأمان (مقارنة ثابتة الزمن)", () => {
  const future = new Date(Date.now() + 3600_000).toISOString();
  const hash = hashLinkCode("ABCD-EFGH-JKLM");
  const record = { link_code: hash.slice(0, 32), link_code_expires_at: future };
  assert.doesNotThrow(() => isLinkCodeUsable(record, hash));
  assert.equal(isLinkCodeUsable(record, hash), false);
});

test("محاكاة ذرّية (منطقية فقط): مطالبتان متزامنتان، واحدة فقط تنجح", async () => {
  // ملاحظة: هذا يحاكي منطق العلامة (CAS) المُطبّق في المسار عبر شرط
  // .is("link_code_used_at", null). لا يحاكي سلوك قاعدة البيانات الحقيقية.
  const future = new Date(Date.now() + 3600_000).toISOString();
  const hash = hashLinkCode("ABCD-EFGH-JKLM");
  const record = {
    link_code: hash,
    link_code_expires_at: future,
    link_code_used_at: null as string | null,
    telegram_id: null as number | null,
  };

  async function claim(): Promise<boolean> {
    if (!isLinkCodeUsable(record, hash)) return false;
    record.link_code_used_at = new Date().toISOString();
    return true;
  }

  const results = await Promise.all([claim(), claim(), claim()]);
  assert.equal(results.filter(Boolean).length, 1);
});
