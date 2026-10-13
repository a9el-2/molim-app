import crypto from "crypto";
import { timingSafeEqual } from "./timing-safe.ts";

export type TelegramUser = {
  telegramId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
};

export type TelegramAuthResult =
  | { ok: true; user: TelegramUser; authDate: string }
  | { ok: false; error: string };

function hmacSha256(data: crypto.BinaryLike, key: crypto.BinaryLike): Buffer {
  return crypto.createHmac("sha256", key).update(data).digest();
}

function hmacSha256Hex(data: string, key: crypto.BinaryLike): string {
  return crypto.createHmac("sha256", key).update(data).digest("hex");
}

export function validateTelegramInitData(
  initData: string,
  botToken: string
): TelegramAuthResult {
  const params = new URLSearchParams(initData);

  const hash = params.get("hash");
  if (!hash) {
    return { ok: false, error: "بيانات Telegram تفتقد hash" };
  }

  const authDate = params.get("auth_date");
  if (!authDate) {
    return { ok: false, error: "بيانات Telegram تفتقد auth_date" };
  }

  // وفق وثائق Telegram الرسمية:
  //   secret_key = HMAC_SHA256(<bot_token>, "WebAppData")
  // وبتفصيل الحجج: المفتاح (key) هو النص الثابت "WebAppData" والبيانات هي التوكن.
  const secretKey = hmacSha256(botToken, "WebAppData");

  // الصيغة الأولى: قيم مفكوكة (URLSearchParams)
  const decodedPairs = Array.from(params.entries())
    .filter(([key]) => key !== "hash")
    .map(([key, value]) => `${key}=${value}`)
    .sort();
  const decodedCheckString = decodedPairs.join("\n");

  // الصيغة الثانية: القيم كما وردت حرفيًا (قبل فك الترميز)
  const rawPairs = initData
    .split("&")
    .filter((part) => part && !part.startsWith("hash="))
    .sort();
  const rawCheckString = rawPairs.join("\n");

  const decodedHash = hmacSha256Hex(decodedCheckString, secretKey);
  const rawHash = hmacSha256Hex(rawCheckString, secretKey);

  if (!timingSafeEqual(decodedHash, hash) && !timingSafeEqual(rawHash, hash)) {
    return { ok: false, error: "تعذر التحقق من بيانات Telegram" };
  }

  const rawUser = params.get("user");
  if (!rawUser) {
    return { ok: false, error: "بيانات Telegram لا تحوي المستخدم" };
  }

  let parsedUser: { id: number; username?: string; first_name?: string; last_name?: string };
  try {
    parsedUser = JSON.parse(rawUser) as typeof parsedUser;
  } catch {
    return { ok: false, error: "بيانات Telegram غير صالحة" };
  }

  if (typeof parsedUser.id !== "number") {
    return { ok: false, error: "معرّف Telegram غير صالح" };
  }

  return {
    ok: true,
    user: {
      telegramId: parsedUser.id,
      username: parsedUser.username,
      firstName: parsedUser.first_name,
      lastName: parsedUser.last_name,
    },
    authDate,
  };
}

export const TELEGRAM_INIT_MAX_AGE_SEC = 86400;
export const TELEGRAM_CLOCK_SKEW_SEC = 30;

/**
 * التحقق من صلاحية auth_date.
 * - يرفض المنتهي الصلاحية (أقدم من maxAgeSec).
 * - يرفض التواريخ المستقبلية غير المقبولة (أبعد من هامش انحراف الساعة).
 * الحد الأقصى الحالي (24 ساعة) محفوظ كما هو.
 */
export function isTelegramInitDataFresh(
  authDate: string,
  maxAgeSec = TELEGRAM_INIT_MAX_AGE_SEC,
  futureToleranceSec = TELEGRAM_CLOCK_SKEW_SEC,
  nowSec = Math.floor(Date.now() / 1000)
): boolean {
  const authSeconds = Number(authDate);
  if (!Number.isFinite(authSeconds)) return false;

  const age = nowSec - authSeconds;

  if (age > maxAgeSec) return false;
  if (age < -futureToleranceSec) return false;

  return true;
}