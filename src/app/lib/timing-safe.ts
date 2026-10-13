import crypto from "crypto";

/**
 * مقارنة نصّية ثابتة الزمن (timing-safe) للتواقيع ورموز التحقق.
 *
 * تُستخدم حيث لا تكون القيمة قابلة للكشف من خلال زمن تنفيذ الرد (مثل تجزئة
 * HMAC أو تجزئة رمز الربط). ملاحظة: اختلاف الطول يُرفض فورًا لأن طول التجزئة
 * (64 حرفًا) معلوم ومعلن، ولا يمثّل سرًّا.
 */
export function timingSafeEqual(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;

  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");

  if (bufferA.length !== bufferB.length) return false;

  return crypto.timingSafeEqual(bufferA, bufferB);
}
