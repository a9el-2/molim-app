import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabase/server";
import { authenticateRequest } from "../../../lib/server-auth";
import {
  validateHoursSubmission,
  canEditOwnEntry,
  isValidISODate,
} from "../../../lib/hours-policy";
import {
  buildHoursUpdatePayload,
  buildAuditLogPayload,
} from "../../../lib/hours-payload";

/**
 * PATCH /api/hours/[id]
 * تعديل سجل ساعات من قبل صاحبه وإعادة إرساله للمراجعة.
 * لا يسمح بالتعديل إلا إذا كان السجل قيد المراجعة (in_review) أو مرفوضاً (rejected).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase غير مكوّن." }, { status: 503 });
  }

  // جلب السجل القائم من القاعدة مع التحقق من الملكية في نفس الاستعلام
  const { data: existingRecord, error: fetchError } = await supabase
    .from("hours_logs")
    .select("*")
    .eq("id", id)
    .eq("user_id", auth.user.id) // [5] السجل غير الموجود أو غير المملوك → 404 بنفس الرسالة
    .maybeSingle();

  if (fetchError || !existingRecord) {
    // [5] نُرجع 404 في كلتا الحالتين دون الكشف عن وجود السجل لمستخدم آخر
    return NextResponse.json(
      { error: "سجل الساعات غير موجود." },
      { status: 404 }
    );
  }

  // مطابقة الحالة مع سياسة النظام (قيد المراجعة أو مرفوض فقط)
  const policyStatus =
    existingRecord.status === "in_review" ? "pending" : existingRecord.status;

  if (!canEditOwnEntry({ status: policyStatus, isOwner: true })) {
    return NextResponse.json(
      {
        error:
          "لا يمكن تعديل هذا السجل؛ فقط السجلات قيد المراجعة أو المرفوضة قابلة للتعديل.",
      },
      { status: 400 }
    );
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

  const hours =
    rawHours !== undefined
      ? (typeof rawHours === "number" ? rawHours : Number(rawHours))
      : Number(existingRecord.submitted_hours);

  const workDate =
    typeof rawDate === "string" && rawDate.trim()
      ? rawDate.trim()
      : String(existingRecord.date);

  const description =
    typeof rawDescription === "string"
      ? rawDescription.trim()
      : String(existingRecord.description ?? "");

  // [3] تجاهل taskId القادم من العميل تماماً — نبقي القيمة الموجودة في القاعدة.
  // TODO: تفعيل taskId بعد ربط المهام — يجب التحقق من أن المهمة موجودة
  //       وأن المستخدم مخوَّل بها (ينتمي إلى نفس القسم أو مُسنَدة إليه مباشرةً).
  //       حتى ذلك الحين نحافظ على existingRecord.task_id دون أي تغيير من العميل.
  const taskId = existingRecord.task_id as string | null;

  // [4] التحقق من صيغة التاريخ قبل أي استعلام لقاعدة البيانات
  if (!isValidISODate(workDate)) {
    return NextResponse.json({ error: "تاريخ غير صالح." }, { status: 400 });
  }

  // احتساب ساعات اليوم السابقة من القاعدة (باستثناء هذا السجل والسجلات المرفوضة)
  const { data: sameDayLogs, error: logsError } = await supabase
    .from("hours_logs")
    .select("id, submitted_hours, status")
    .eq("user_id", auth.user.id)
    .eq("date", workDate);

  if (logsError) {
    return NextResponse.json(
      { error: "تعذر التحقق من الساعات السابقة لهذا اليوم." },
      { status: 500 }
    );
  }

  const otherHoursSameDay = (sameDayLogs ?? [])
    .filter(
      (log) =>
        String(log.id) !== String(existingRecord.id) &&
        log.status !== "rejected"
    )
    .reduce((sum, log) => sum + Number(log.submitted_hours || 0), 0);

  // التحقق وفق سياسة الساعات
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

  // بناء حمولة التعديل: تعود الحالة تلقائياً إلى in_review وتفرغ نتائج المراجعة السابقة
  const updatePayload = buildHoursUpdatePayload(
    {
      hours,
      workDate,
      description,
      taskId,
    },
    {
      submitted_hours: Number(existingRecord.submitted_hours),
      date: String(existingRecord.date),
      description: String(existingRecord.description ?? ""),
      task_id: existingRecord.task_id,
    }
  );

  // [1] نُضيف .eq("user_id") و .in("status") لمنع الكتابة فوق سجل اعتُمد في نفس اللحظة
  const { data: updatedRecord, error: updateError } = await supabase
    .from("hours_logs")
    .update(updatePayload)
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .in("status", ["in_review", "rejected"])
    .select()
    .maybeSingle();

  // [1] إذا لم يُرجع التحديث أي صف: السجل تغيّر حالته (اعتُمد للتو)
  if (updateError || !updatedRecord) {
    // نُفرّق بين خطأ حقيقي من Supabase (500) وعدم تطابق الشرط (409)
    if (updateError) {
      return NextResponse.json(
        { error: "تعذر تحديث السجل. حاول مرة أخرى." },
        { status: 500 }
      );
    }
    // updatedRecord فارغ → الشروط لم تتحقق → السجل اعتُمد أثناء التعديل
    return NextResponse.json(
      {
        error:
          "تغيّرت حالة السجل أثناء التعديل (ربما اعتُمد للتو). حدّث الصفحة.",
      },
      { status: 409 }
    );
  }

  // كتابة سجل التدقيق: إذا فشلت كتابته، نتراجع عن التعديل لضمان عدم وجود أثر جزئي
  const auditPayload = buildAuditLogPayload({
    actorId: auth.user.id,
    action: "edit_hours",
    targetId: String(id),
    targetUserId: auth.user.id,
    departmentId: existingRecord.department_id,
    beforeData: existingRecord,
    afterData: updatedRecord,
    details: "تعديل ساعات مسجلة وإعادتها للمراجعة",
  });

  const { error: auditError } = await supabase
    .from("audit_logs")
    .insert(auditPayload);

  if (auditError) {
    // [2] التراجع مع قيد إضافي: لا نكتب فوق السجل إذا تغيّرت حالته في الأثناء
    const { error: rollbackError } = await supabase
      .from("hours_logs")
      .update(existingRecord)
      .eq("id", id)
      .eq("status", "in_review"); // [2] لا نكتب فوق سجل تغيّرت حالته

    if (rollbackError) {
      // التراجع نفسه فشل — نسجّل الخطأ ونُرجع رسالة واضحة
      console.error(
        "[PATCH /api/hours/%s] فشل التراجع عن التعديل بعد خطأ في سجل التدقيق:",
        id,
        rollbackError
      );
      return NextResponse.json(
        {
          error:
            "تعذر توثيق العملية وتعذر التراجع عن التعديل. تواصل مع الإدارة.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        error:
          "تعذر توثيق العملية في سجل التدقيق. أُلغيت العملية للحفاظ على النزاهة.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, hour: updatedRecord });
}
