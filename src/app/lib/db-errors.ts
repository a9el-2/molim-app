/**
 * مساعدات لتصنيف أخطاء PostgreSQL القادمة من Supabase/PostgREST
 * دون الاعتماد على حقل الرسالة النصية.
 */

export type DbErrorLike =
  | { code?: string | number | null; message?: string | null; details?: string | null }
  | null
  | undefined;

/** انتهاك قيد فريد (unique / unique partial index) — رمز Postgres 23505. */
export function isUniqueViolation(error: DbErrorLike): boolean {
  return Boolean(error) && String(error?.code) === "23505";
}

/**
 * هل انتهاك 23505 وقع على عمود id تحديدًا (تعارض في معرّف العضو)؟
 * يعتمد على النص القياسي القادم من PostgREST/Postgres:
 *   just:   details: "Key (id)=(MOL-00020) already exists."
 *   أو      message: 'duplicate key value violates unique constraint "users_pkey"'
 * أي 23505 غير واقع على id (بريد إلكتروني/هاتف/رمز ربط مكرر) يُعتبر
 * تكرار بيانات حقيقيًا وليس سباق معرّفات، فلا يُعاد توليد معرّف جديد.
 */
export function isMemberIdConflict(error: DbErrorLike): boolean {
  if (!error || String(error.code) !== "23505") return false;

  const details = String(error.details ?? "").toLowerCase();
  if (details.includes("key (id)=")) return true;

  const message = String(error.message ?? "").toLowerCase();
  return (
    message.includes('constraint "users_pkey"') ||
    message.includes('constraint "users_id_key"') ||
    message.includes('"users_pkey"') ||
    message.includes('"users_id_key"')
  );
}

/** انتهاك مفتاح أجنبي (foreign key) — رمز Postgres 23503. */
export function isForeignKeyViolation(error: DbErrorLike): boolean {
  return Boolean(error) && String(error?.code) === "23503";
}

/** انتهاك قيد NOT NULL — رمز Postgres 23502. */
export function isNotNullViolation(error: DbErrorLike): boolean {
  return Boolean(error) && String(error?.code) === "23502";
}

/**
 * الدالة (RPC) غير موجودة في المخطط — رمز Postgres 42883 أو رمز PostgREST
 * PGRST202. يُستخدم للتمييز بين حالة «قبل الترحيل» وبين أخطاء الصلاحيات
 * أو الاتصال أو الأخطاء غير المتوقعة.
 */
export function isUndefinedFunction(error: DbErrorLike): boolean {
  if (!error) return false;
  const code = String(error.code ?? "");
  if (code === "42883" || code === "PGRST202") return true;

  const message = String(error.message ?? "").toLowerCase();
  return (
    message.includes("could not find the function") ||
    message.includes("does not exist")
  );
}

