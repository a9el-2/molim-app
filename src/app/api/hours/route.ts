import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../lib/supabase/server";
import { authenticateRequest } from "../../lib/server-auth";
import {
  validateHoursSubmission,
  resolveInitialHoursStatus,
} from "../../lib/hours-policy";
import {
  buildHoursInsertPayload,
  buildAuditLogPayload,
} from "../../lib/hours-payload";

/**
 * GET /api/hours
 * يعرض سجلات ساعات التطوع للمستخدم الحالي فقط، مرتبة بالأحدث.
 */
export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase غير مكوّن." }, { status: 503 });
  }

  const { data: rows, error } = await supabase
    .from("hours_logs")
    .select("*")
    .eq("user_id", auth.user.id)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "تعذر جلب سجلات الساعات." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, hours: rows ?? [] });
}

/**
 * POST /api/hours
 * تقديم ساعات تطوعية جديدة.
 * تُحسم كافة الصلاحيات والقيم الحساسة من الخادم والجلسة دون ثقة بالعميل.
 */
export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase غير مكوّن." }, { status: 503 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const rawHours = body.hours ?? body.submittedHours ?? body.submitted_hours;
  const rawDate = body.date ?? body.workDate ?? body.work_date;
  const rawDescription =
    body.description ?? body.note ?? body.notes ?? body.task;

  const hours = typeof rawHours === "number" ? rawHours : Number(rawHours);
  const workDate = typeof rawDate === "string" ? rawDate.trim() : "";
  const description =
    typeof rawDescription === "string" ? rawDescription.trim() : "";

  // TODO: تفعيل taskId بعد ربط المهام — يجب التحقق من أن المهمة موجودة
  //       وأن المستخدم مخوَّل بها (ينتمي إلى نفس القسم أو مُسنَدة إليه مباشرةً).
  //       حتى ذلك الحين نتجاهل أي قيمة taskId قادمة من العميل تماماً.
  const taskId: string | null = null;

  // ── التحقق من صيغة التاريخ قبل أي استعلام لقاعدة البيانات ──────────────
  // يجب أن يكون بصيغة YYYY-MM-DD وتاريخاً تقويمياً صالحاً.
  const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (!ISO_DATE_RE.test(workDate)) {
    return NextResponse.json({ error: "تاريخ غير صالح." }, { status: 400 });
  }
  // نتحقق من أنه تاريخ تقويمي حقيقي (مثلاً 2026-02-30 غير صالح)
  const parsedDate = new Date(workDate + "T00:00:00Z");
  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== workDate
  ) {
    return NextResponse.json({ error: "تاريخ غير صالح." }, { status: 400 });
  }
  // ────────────────────────────────────────────────────────────────────────

  // جلب قسم المستخدم من جدول users في القاعدة لضمان الدقة
  const { data: userRow, error: userError } = await supabase
    .from("users")
    .select("department_id")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (userError) {
    return NextResponse.json(
      { error: "تعذر التحقق من بيانات المستخدم." },
      { status: 500 }
    );
  }

  const departmentId = userRow?.department_id ?? null;

  // حساب ساعات اليوم السابقة لنفس العضو من القاعدة (عدا المرفوضة)
  const { data: sameDayLogs, error: logsError } = await supabase
    .from("hours_logs")
    .select("submitted_hours, status")
    .eq("user_id", auth.user.id)
    .eq("date", workDate);

  if (logsError) {
    return NextResponse.json(
      { error: "تعذر التحقق من الساعات السابقة لهذا اليوم." },
      { status: 500 }
    );
  }

  const otherHoursSameDay = (sameDayLogs ?? [])
    .filter((log) => log.status !== "rejected")
    .reduce((sum, log) => sum + Number(log.submitted_hours || 0), 0);

  // التحقق وفق سياسة الساعات (0.25-24 مضاعفات 0.25، غير مستقبلي، اشتراط ملاحظة فوق 12 ساعة)
  const validation = validateHoursSubmission({
    hours,
    workDate,
    otherHoursSameDay,
    note: description,
  });

  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.message, reason: validation.reason },
      { status: 400 }
    );
  }

  // فحص ما إذا كان هناك سوبر أدمن آخر نشط إذا كان المستخدم SUPER_ADMIN
  let hasOtherActiveSuperAdmin = false;
  if (auth.user.role === "SUPER_ADMIN") {
    const { data: otherAdmins, error: adminError } = await supabase
      .from("users")
      .select("id")
      .eq("role", "SUPER_ADMIN")
      .eq("status", "active")
      .neq("id", auth.user.id);

    if (adminError) {
      return NextResponse.json(
        { error: "تعذر التحقق من حالة الإدارة العليا." },
        { status: 500 }
      );
    }

    hasOtherActiveSuperAdmin = (otherAdmins?.length ?? 0) > 0;
  }

  const initial = resolveInitialHoursStatus({
    ownerRole: auth.user.role,
    hasOtherActiveSuperAdmin,
  });

  const isSelfApproved = Boolean(initial.autoApproved);
  const status = isSelfApproved ? "approved" : "in_review";
  const approvedHours = isSelfApproved ? hours : null;
  const auditAction = isSelfApproved ? "self_approve_hours" : "submit_hours";

  const insertPayload = buildHoursInsertPayload(
    {
      hours,
      workDate,
      description,
      taskId,
    },
    {
      userId: auth.user.id,
      departmentId,
      status,
      approvedHours,
      isSelfApproved,
    }
  );

  const { data: insertedRecord, error: insertError } = await supabase
    .from("hours_logs")
    .insert(insertPayload)
    .select()
    .single();

  if (insertError || !insertedRecord) {
    return NextResponse.json(
      { error: "تعذر حفظ ساعاتك. حاول مرة أخرى." },
      { status: 500 }
    );
  }

  // كتابة سجل التدقيق: إذا فشلت كتابته، نحذف السجل المنشأ لضمان عدم وجود أثر جزئي
  const auditPayload = buildAuditLogPayload({
    actorId: auth.user.id,
    action: auditAction,
    targetId: String(insertedRecord.id),
    targetUserId: auth.user.id,
    departmentId,
    beforeData: null,
    afterData: insertedRecord,
    details: isSelfApproved
      ? "اعتماد ذاتي تلقائي لساعات الرئيس العام لعدم وجود رئيس عام آخر"
      : "تقديم ساعات تطوعية جديدة",
  });

  const { error: auditError } = await supabase
    .from("audit_logs")
    .insert(auditPayload);

  if (auditError) {
    await supabase.from("hours_logs").delete().eq("id", insertedRecord.id);
    return NextResponse.json(
      {
        error:
          "تعذر توثيق العملية في سجل التدقيق. أُلغيت العملية للحفاظ على النزاهة.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { ok: true, hour: insertedRecord },
    { status: 201 }
  );
}
