import { NextResponse } from "next/server";

/**
 * تم إلغاء نظام الدعوات. التحقق من الانضمام يتم عبر رمز ربط الحساب.
 */
export async function POST() {
  return NextResponse.json(
    { valid: false, error: "تم إلغاء نظام الدعوات." },
    { status: 410 }
  );
}
