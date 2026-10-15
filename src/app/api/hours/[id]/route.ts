import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabase/server";
import { authenticateRequest, forbidden } from "../../../lib/server-auth";
import {
  validateHoursSubmission,
  canEditOwnEntry,
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

  // جلب السجل القائم من القاعدة
  const { data: existingRecord, error: fetchError } = await supabase
    .from("hours_logs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !existingRecord) {
    return NextResponse.json(
      { error: "سجل الساعات غير موجود." },
      { status: 404 }
    );
  }

  // التحقق من الملكية
  const isOwner = existingRecord.user_id === auth.user.id;
  if (!isOwner) {
    return forbidden("لا يمكنك تعديل سجل ساعات لا يخصك.");
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
  const rawTaskId = body.taskId ?? body.task_id;

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

  const taskId =
    rawTaskId !== undefined
      ? (typeof rawTaskId === "string" && rawTaskId.trim()
          ? rawTaskId.trim()
          : null)
      : existingRecord.task_id;

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

  const { data: updatedRecord, error: updateError } = await supabase
    .from("hours_logs")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (updateError || !updatedRecord) {
    return NextResponse.json(
      { error: "تعذر تحديث السجل. حاول مرة أخرى." },
      { status: 500 }
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
    await supabase.from("hours_logs").update(existingRecord).eq("id", id);
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
