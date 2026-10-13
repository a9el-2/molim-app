import { NextResponse } from "next/server";

/*
 * مسار قديم (legacy) غير مستخدم داخل المشروع.
 *
 * - لا يوجد أي مستهلك له في التطبيق؛ المصادقة الفعلية تتم عبر
 *   `/api/auth/telegram` و`/api/auth/link`.
 * - يفشل مغلقًا (fail-closed): يشترط وجود `INTERNAL_API_TOKEN` في البيئة
 *   ورأس `Authorization: Bearer <token>` مطابقًا. غياب المتغير يعني رد 401
 *   دائمًا، لذا لا يكشف أي بيانات.
 * - أُبقي عليه عن قصد لتفادي كسر أي عميل خارجي غير موثّق داخل هذا المستودع.
 *   لا تغيّر سلوكه ولا تحذفه دون التأكد من عدم وجود مستهلكين خارجيين.
 */
export async function GET(request: Request) {
  const internalToken = process.env.INTERNAL_API_TOKEN;

  if (
    !internalToken ||
    request.headers.get("authorization") !==
      `Bearer ${internalToken}`
  ) {
    return NextResponse.json(
      { error: "غير مصرح بالوصول" },
      { status: 401 }
    );
  }

  return NextResponse.json({ ok: true });
}