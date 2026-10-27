import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../lib/supabase/server";
import {
  authenticateRequest,
  accountInactive,
  forbidden,
} from "../../lib/server-auth";
import { isUniqueViolation } from "../../lib/db-errors";

const AGREEMENT_VERSION = "v1.0";

/**
 * POST /api/agreements
 * توقيع اتفاقية تطوع جديدة أو تجديد اتفاقية قائمة.
 * Body: { durationMonths: 1 | 2 | 3, renew?: boolean }
 */
export async function POST(request: Request) {
  // نسمح للحساب في حالة pending بالتوقيع (بعد إكمال ملفه)
  const auth = await authenticateRequest(request, { allowInactive: true });
  if (!auth.ok) return auth.response;

  if (
    auth.user.status !== "active" &&
    auth.user.status !== "pending"
  ) {
    return accountInactive();
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    if (auth.demo) {
      return NextResponse.json({ ok: true, id: "demo-agreement-id" });
    }
    return NextResponse.json(
      { error: "الخدمة غير متاحة مؤقتاً. حاول لاحقاً." },
      { status: 503 }
    );
  }

  let body: { durationMonths?: unknown; renew?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const durationMonths = Number(body.durationMonths);
  if (![1, 2, 3].includes(durationMonths)) {
    return NextResponse.json(
      { error: "مدة الاتفاقية يجب أن تكون 1 أو 2 أو 3 أشهر." },
      { status: 400 }
    );
  }

  const isRenewal = body.renew === true;

  if (isRenewal) {
    // استخدام الدالة المخزّنة للتجديد الآمن (atomic)
    const { data, error } = await supabase.rpc("renew_volunteer_agreement", {
      p_user_id: auth.user.id,
      p_duration_months: durationMonths,
      p_version: AGREEMENT_VERSION,
    });

    if (error) {
      console.error("renew_volunteer_agreement error:", error);
      return NextResponse.json(
        { error: "تعذر تجديد الاتفاقية. حاول مرة أخرى." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, id: data });
  }

  // توقيع اتفاقية جديدة (أول مرة)
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + durationMonths);

  const { data, error } = await supabase
    .from("volunteer_agreements")
    .insert({
      user_id: auth.user.id,
      duration_months: durationMonths,
      expires_at: expiresAt.toISOString(),
      agreement_version: AGREEMENT_VERSION,
      is_renewal: false,
    })
    .select("id")
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        {
          error:
            "لديك اتفاقية نشطة بالفعل. استخدم خيار التجديد لتجديد الاتفاقية.",
          code: "already_active",
        },
        { status: 409 }
      );
    }

    console.error("insert volunteer_agreement error:", error);
    return NextResponse.json(
      { error: "تعذر حفظ الاتفاقية. حاول مرة أخرى." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, id: data.id });
}

/**
 * GET /api/agreements
 * جلب جميع الاتفاقيات (للإدارة والموارد البشرية).
 * يدعم query: ?userId=MOL-00001 لفلترة اتفاقيات عضو معيّن.
 */
export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const allowedRoles = ["HR", "ADMIN", "SUPER_ADMIN"];
  if (!allowedRoles.includes(auth.user.role)) {
    return forbidden("عرض الاتفاقيات متاح للإدارة والموارد البشرية فقط.");
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "الخدمة غير متاحة مؤقتاً." },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");

  let query = supabase
    .from("volunteer_agreements")
    .select(
      `id, user_id, duration_months, signed_at, expires_at,
       agreement_version, status, is_renewal, notes,
       users!inner(first_name, father_name, last_name, department_id)`
    )
    .order("signed_at", { ascending: false });

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("fetch agreements error:", error);
    return NextResponse.json(
      { error: "تعذر جلب الاتفاقيات." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, agreements: data ?? [] });
}
