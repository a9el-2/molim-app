import { NextResponse } from "next/server";

/**
 * تم إلغاء التسجيل الذاتي عبر الدعوات.
 * تُضاف العضويات الآن من قِبل الإدارة عبر /api/members ثم يُربط الحساب برمز ربط.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "تم إلغاء التسجيل الذاتي. تُضاف العضويات عبر الإدارة ثم يُكمل العضو بياناته.",
    },
    { status: 410 }
  );
}
