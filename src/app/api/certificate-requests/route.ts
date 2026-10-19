import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../lib/supabase/server";
import { authenticateRequest } from "../../lib/server-auth";
import type { UserRole } from "../../lib/roles";

const VALID_TYPES = [
  "volunteer",
  "participation",
  "expertise",
  "recommendation_letter",
] as const;

type CertificateType = (typeof VALID_TYPES)[number];

function calculateVolunteerPeriod(joinedAt: string | null): string {
  if (!joinedAt) return "غير محدد";
  const start = new Date(joinedAt);
  if (Number.isNaN(start.getTime())) return "غير محدد";

  const now = new Date();
  const diffMonths =
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth());

  if (diffMonths <= 0) return "أقل من شهر";
  if (diffMonths === 1) return "شهر واحد";
  if (diffMonths === 2) return "شهران";
  if (diffMonths >= 3 && diffMonths <= 10) return `${diffMonths} أشهر`;
  if (diffMonths === 11 || diffMonths === 12) return "سنة واحدة";
  if (diffMonths > 12) {
    const years = Math.floor(diffMonths / 12);
    const rem = diffMonths % 12;
    return rem > 0 ? `${years} سنة و ${rem} شهر` : `${years} سنة`;
  }
  return `${diffMonths} شهر`;
}

/**
 * GET /api/certificate-requests
 * يعرض طلبات الشهادات:
 * - للمتطوع ورئيس القسم: يعرض طلباته الخاصة فقط (أو إذا طُلب ?mine=true).
 * - لـ HR و ADMIN و SUPER_ADMIN: يعرض جميع الطلبات ما لم يُطلب ?mine=true.
 */
export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "الخدمة غير متاحة مؤقتاً. حاول لاحقاً." },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const mineOnly = searchParams.get("mine") === "true";
  const userRole = auth.user.role as UserRole;
  const isManager = ["HR", "ADMIN", "SUPER_ADMIN"].includes(userRole);

  const shouldFetchMineOnly = mineOnly || !isManager;

  let query = supabase
    .from("certificate_requests")
    .select(`
      id,
      user_id,
      type,
      status,
      hours,
      volunteer_period,
      evaluation,
      notes,
      request_date,
      reviewed_at,
      issued_at,
      issue_file_url,
      created_at,
      user:users!user_id (
        id,
        first_name,
        last_name,
        department_id
      ),
      department:departments!department_id (
        id,
        name
      ),
      reviewer:users!reviewed_by (
        id,
        first_name,
        last_name
      )
    `)
    .order("created_at", { ascending: false });

  if (shouldFetchMineOnly) {
    query = query.eq("user_id", auth.user.id);
  }

  const { data: rows, error } = await query;

  if (error) {
    // محاولة جلب بديلة دون علاقات خارجية في حال حدوث خطأ في أسماء القيود
    const fallbackQuery = supabase
      .from("certificate_requests")
      .select("*")
      .order("created_at", { ascending: false });

    const finalFallback = shouldFetchMineOnly
      ? fallbackQuery.eq("user_id", auth.user.id)
      : fallbackQuery;

    const { data: fallbackRows, error: fallbackError } = await finalFallback;

    if (fallbackError) {
      return NextResponse.json(
        { error: "تعذر جلب طلبات الشهادات." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, requests: fallbackRows ?? [] });
  }

  return NextResponse.json({ ok: true, requests: rows ?? [] });
}

/**
 * POST /api/certificate-requests
 * تقديم طلب شهادة أو خطاب توصية جديد.
 */
export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "الخدمة غير متاحة مؤقتاً. حاول لاحقاً." },
      { status: 503 }
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const rawType = String(body.type ?? "").trim();
  if (!VALID_TYPES.includes(rawType as CertificateType)) {
    return NextResponse.json(
      { error: "نوع الطلب غير صالح." },
      { status: 400 }
    );
  }

  const certType = rawType as CertificateType;

  // 1. جلب بيانات المستخدم الفعلية من القاعدة
  const { data: userRow, error: userError } = await supabase
    .from("users")
    .select("id, status, department_id, joined_at")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (userError || !userRow) {
    return NextResponse.json(
      { error: "تعذر التحقق من بيانات المستخدم." },
      { status: 404 }
    );
  }

  if (userRow.status !== "active") {
    return NextResponse.json(
      { error: "حسابك غير نشط، لا يمكنك تقديم طلبات شهادات حالياً." },
      { status: 403 }
    );
  }

  // 2. التحقق من عدم وجود طلب معلق من نفس النوع
  const { data: pendingRequest } = await supabase
    .from("certificate_requests")
    .select("id, status")
    .eq("user_id", auth.user.id)
    .eq("type", certType)
    .in("status", ["in_review", "pending_approval"])
    .maybeSingle();

  if (pendingRequest) {
    return NextResponse.json(
      { error: "لديك طلب معلق مسبقاً لهذا النوع وهو قيد المتابعة." },
      { status: 409 }
    );
  }

  // 3. احتساب الساعات المعتمدة للمستخدم
  const { data: hoursRows } = await supabase
    .from("hours_logs")
    .select("approved_hours, submitted_hours")
    .eq("user_id", auth.user.id)
    .eq("status", "approved");

  const totalApprovedHours = (hoursRows ?? []).reduce(
    (sum, row) => sum + (Number(row.approved_hours ?? row.submitted_hours) || 0),
    0
  );

  // 4. التحقق من أهلية الطلب حسب شروط الاستحقاق
  if (certType === "volunteer" && totalApprovedHours < 40) {
    return NextResponse.json(
      {
        error: `شهادة التطوع تتطلب إكمال 40 ساعة معتمدة كحد أدنى. ساعاتك الحالية: ${totalApprovedHours} ساعة.`,
      },
      { status: 400 }
    );
  }

  if (certType === "expertise" && totalApprovedHours < 300) {
    return NextResponse.json(
      {
        error: `شهادة الخبرة تتطلب إكمال 300 ساعة معتمدة كحد أدنى. ساعاتك الحالية: ${totalApprovedHours} ساعة.`,
      },
      { status: 400 }
    );
  }

  // 5. حساب مدة التطوع
  const volunteerPeriod = calculateVolunteerPeriod(userRow.joined_at);

  const notes =
    typeof body.notes === "string" && body.notes.trim().length > 0
      ? body.notes.trim()
      : null;

  const evaluation =
    typeof body.evaluation === "string" && body.evaluation.trim().length > 0
      ? body.evaluation.trim()
      : null;

  const insertPayload = {
    user_id: auth.user.id,
    type: certType,
    status: "in_review",
    hours: totalApprovedHours,
    volunteer_period: volunteerPeriod,
    department_id: userRow.department_id ?? null,
    notes: notes,
    evaluation: evaluation,
    request_date: new Date().toISOString().slice(0, 10),
  };

  const { data: inserted, error: insertError } = await supabase
    .from("certificate_requests")
    .insert(insertPayload)
    .select()
    .single();

  if (insertError) {
    return NextResponse.json(
      { error: "تعذر حفظ طلب الشهادة. حاول مرة أخرى." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { ok: true, request: inserted },
    { status: 201 }
  );
}
