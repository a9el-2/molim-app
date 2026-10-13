/**
 * توليد معرّف العضو بصيغة MOL-XXXXX انطلاقًا من قائمة المعرّفات الموجودة.
 *
 * ملاحظة: هذه دالة نقية (قابلة للاختبار). الضمان الذري الكامل يحتاج إلى
 * تسلسل (SEQUENCE) أو دالة في قاعدة البيانات، وهذا موثّق في خطة الترحيل.
 * محليًا نستخدم هذه الدالة مع إعادة المحاولة عند تعارض القيد الفريد (23505).
 */

export const MOLIM_ID_PATTERN = /^MOL-(\d+)$/;

export function isValidMolimId(value: unknown): boolean {
  return MOLIM_ID_PATTERN.test(String(value ?? ""));
}

export function nextMolimIdFromIds(
  ids: Iterable<string | null | undefined>,
  padding = 5
): string {
  let max = 0;

  for (const id of ids) {
    const match = MOLIM_ID_PATTERN.exec(String(id ?? ""));
    if (!match) continue;
    const numeric = Number(match[1]);
    if (Number.isFinite(numeric) && numeric > max) {
      max = numeric;
    }
  }

  return `MOL-${String(max + 1).padStart(padding, "0")}`;
}

export const MEMBER_ID_MAX_ATTEMPTS = 5;
