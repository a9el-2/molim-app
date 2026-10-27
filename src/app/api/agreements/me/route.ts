import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabase/server";
import { authenticateRequest } from "../../../lib/server-auth";

/**
 * GET /api/agreements/me
 * جلب الاتفاقية النشطة الحالية للعضو المسجّل.
 * إذا لم توجد اتفاقية نشطة، يُعيد null مع ok: true.
 */
export async function GET(request: Request) {
  const auth = await authenticateRequest(request, { allowInactive: true });
  if (!auth.ok) return auth.response;

  if (auth.demo) {
    return NextResponse.json({
      ok: true,
      agreement: null,
      hasActive: false,
    });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "الخدمة غير متاحة مؤقتاً." },
      { status: 503 }
    );
  }

  const { data, error } = await supabase
    .from("volunteer_agreements")
    .select(
      "id, duration_months, signed_at, expires_at, agreement_version, status, is_renewal"
    )
    .eq("user_id", auth.user.id)
    .eq("status", "active")
    .order("signed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("fetch my agreement error:", error);
    return NextResponse.json(
      { error: "تعذر جلب بيانات الاتفاقية." },
      { status: 500 }
    );
  }

  const now = new Date();
  const isActuallyActive =
    data !== null && new Date(data.expires_at) > now;

  // إذا انتهت صلاحيتها، نحدّثها تلقائياً إلى expired
  if (data && !isActuallyActive) {
    await supabase
      .from("volunteer_agreements")
      .update({ status: "expired" })
      .eq("id", data.id);

    return NextResponse.json({ ok: true, agreement: null, hasActive: false });
  }

  return NextResponse.json({
    ok: true,
    agreement: data,
    hasActive: isActuallyActive,
  });
}
