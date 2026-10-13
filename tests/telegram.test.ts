import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import {
  validateTelegramInitData,
  isTelegramInitDataFresh,
  TELEGRAM_INIT_MAX_AGE_SEC,
  TELEGRAM_CLOCK_SKEW_SEC,
} from "../src/app/lib/telegram.ts";

const NOW = 1_800_000_000;

test("auth_date: التاريخ الطبيعي (الآن) مقبول", () => {
  assert.equal(isTelegramInitDataFresh(String(NOW), undefined, undefined, NOW), true);
});

test("auth_date: التاريخ المنتهي (أقدم من الحد) مرفوض", () => {
  const stale = NOW - (TELEGRAM_INIT_MAX_AGE_SEC + 1);
  assert.equal(
    isTelegramInitDataFresh(String(stale), undefined, undefined, NOW),
    false
  );
});

test("auth_date: عند حد الصلاحية تمامًا يبقى مقبولًا", () => {
  const atLimit = NOW - TELEGRAM_INIT_MAX_AGE_SEC;
  assert.equal(
    isTelegramInitDataFresh(String(atLimit), undefined, undefined, NOW),
    true
  );
});

test("auth_date: المستقبلي ضمن هامش انحراف الساعة مقبول", () => {
  const slightlyFuture = NOW + TELEGRAM_CLOCK_SKEW_SEC;
  assert.equal(
    isTelegramInitDataFresh(String(slightlyFuture), undefined, undefined, NOW),
    true
  );
});

test("auth_date: المستقبلي خارج هامش الانحراف مرفوض", () => {
  const beyondSkew = NOW + TELEGRAM_CLOCK_SKEW_SEC + 1;
  assert.equal(
    isTelegramInitDataFresh(String(beyondSkew), undefined, undefined, NOW),
    false
  );

  const farFuture = NOW + 3600;
  assert.equal(
    isTelegramInitDataFresh(String(farFuture), undefined, undefined, NOW),
    false
  );
});

test("auth_date: القيم غير الصالحة مرفوضة", () => {
  assert.equal(isTelegramInitDataFresh("abc", undefined, undefined, NOW), false);
  assert.equal(isTelegramInitDataFresh("", undefined, undefined, NOW), false);
});

// ---------------------------------------------------------------------------
// التوقيع (HMAC): متجه معروف مُحتسَب باستقلال عن كود المشروع.
// الصيغة حسب وثائق Telegram: secret_key = HMAC_SHA256(token, key="WebAppData")
//                            hash       = HMAC_SHA256(check_string, key=secret_key)
// حُسبت القيمتان عبر تنفيذين مستقلين (node:crypto و WebCrypto) وتطابقتا.
// ---------------------------------------------------------------------------

const FAKE_TOKEN = "123456:TEST-TOKEN-fake-abc";

const CHECK_STRING = [
  "auth_date=1800000000",
  "query_id=AAHdF6IQAAAAAN0XohDhrOrc",
  'user={"id":123456789,"first_name":"Test","last_name":"User","username":"testuser"}',
].join("\n");

const KNOWN_HASH =
  "be2e2a3383d924c8d4f4015c6a6998a116aea8ae50ee6562edf31075b8724392";

function buildInitData(hash: string): string {
  return [
    "auth_date=1800000000",
    "query_id=AAHdF6IQAAAAAN0XohDhrOrc",
    'user={"id":123456789,"first_name":"Test","last_name":"User","username":"testuser"}',
    `hash=${hash}`,
  ].join("&");
}

function reversedFormulaHash(token: string): string {
  // الصيغة المعكوسة (الخاطئة): key=token, data="WebAppData"
  const secret = crypto
    .createHmac("sha256", token)
    .update("WebAppData")
    .digest();
  return crypto
    .createHmac("sha256", secret)
    .update(CHECK_STRING)
    .digest("hex");
}

test("توقيع: بيانات صحيحة بتوقيع معروف تُقبل ويُستخرج المستخدم", () => {
  const result = validateTelegramInitData(buildInitData(KNOWN_HASH), FAKE_TOKEN);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.user.telegramId, 123456789);
    assert.equal(result.user.username, "testuser");
    assert.equal(result.authDate, "1800000000");
  }
});

test("توقيع: توقيع خاطئ يُرفض", () => {
  const result = validateTelegramInitData(
    buildInitData("0".repeat(64)),
    FAKE_TOKEN
  );
  assert.equal(result.ok, false);
});

test("توقيع: البيانات المعدّلة بعد التوقيع تُرفض", () => {
  const tampered = buildInitData(KNOWN_HASH).replace(
    '"id":123456789',
    '"id":999999999'
  );
  const result = validateTelegramInitData(tampered, FAKE_TOKEN);
  assert.equal(result.ok, false);
});

test("توقيع: توكن مختلف يُرفض", () => {
  const result = validateTelegramInitData(
    buildInitData(KNOWN_HASH),
    "999999:OTHER-fake-token"
  );
  assert.equal(result.ok, false);
});

test("توقيع: الصيغة المعكوسة (key=token) تُرفض — حارس ضد الانعكاس", () => {
  const result = validateTelegramInitData(
    buildInitData(reversedFormulaHash(FAKE_TOKEN)),
    FAKE_TOKEN
  );
  assert.equal(result.ok, false);
});
