import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabase/server";
import { authenticateRequest } from "../../../lib/server-auth";
import {
  decideTaskCreation,
  isValidISODate,
  type TaskScope,
} from "../../../lib/hours-policy";
import {
  resolveTaskScope,
  sanitizeDepartmentIds,
  buildTaskAuditLogPayload,
} from "../../../lib/tasks-payload";
import { validateNewTaskFields } from "../../../lib/task-assignments-policy";
import type { UserRole } from "../../../lib/roles";

/**
 * POST /api/task-assignments/tasks
 * إنشاء مهمة جديدة بالحقول الموسّعة (requiredAssignees, priority, lifecycle_status).
 *
 * للمهمة الموجهة لشخص بعينه (target_type='person'): أنشئ سجل task_assignments بحالة offered.
 * لمهمة self: أنشئ المهمة ثم استدعِ claim_task للمنشئ.
 * يكتب audit_logs بإجراء create_task ويتراجع بحذف المهمة إن فشل التدقيق.
 *
 * ملاحظة: المسار القديم POST /api/tasks يبقى كما هو بدون أي تعديل.
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

  // 1) قراءة بيانات المنشئ الحقيقية من جدول users
  const { data: currentUser, error: userError } = await supabase
    .from("users")
    .select("id, role, department_id")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (userError || !currentUser) {
    return NextResponse.json(
      { error: "تعذر التحقق من بيانات المستخدم." },
      { status: 500 }
    );
  }

  const creatorRole = currentUser.role as UserRole;
  const creatorDeptId = currentUser.department_id as string | null;

  // 2) قراءة جسم الطلب
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const rawTitle = body.title;
  const rawDescription = body.description;
  const rawScope = body.scope;
  const rawDepartmentIds = body.departmentIds ?? body.department_ids;
  const rawRequestedHours = body.requestedHours ?? body.requested_hours;
  const rawDueDate = body.dueDate ?? body.due_date;
  const rawRequiredAssignees = body.requiredAssignees ?? body.required_assignees;
  const rawPriority = body.priority;
  // للمهمة الموجهة لشخص بعينه
  const rawTargetUserId = body.targetUserId ?? body.target_user_id;

  // 3) التحقق من الحقول الجديدة عبر validateNewTaskFields
  const fieldValidation = validateNewTaskFields({
    title: rawTitle,
    description: rawDescription,
    requiredAssignees: rawRequiredAssignees,
    priority: rawPriority,
    dueDate: rawDueDate,
  });

  if (!fieldValidation.valid) {
    return NextResponse.json(
      { error: fieldValidation.message, field: fieldValidation.field },
      { status: 400 }
    );
  }

  const title = (rawTitle as string).trim();

  const description =
    typeof rawDescription === "string" && rawDescription.trim()
      ? rawDescription.trim()
      : null;

  // 4) التحقق من النطاق scope
  const allowedScopes: TaskScope[] = ["self", "own_department", "departments", "all"];
  if (typeof rawScope !== "string" || !allowedScopes.includes(rawScope as TaskScope)) {
    return NextResponse.json(
      { error: "نطاق المهمة غير صالح. الخيارات المتاحة: self, own_department, departments, all." },
      { status: 400 }
    );
  }
  const scope = rawScope as TaskScope;

  // 5) التحقق من الساعات المطلوبة requestedHours (اختياري)
  let requestedHours: number | null = null;
  if (rawRequestedHours !== undefined && rawRequestedHours !== null && rawRequestedHours !== "") {
    const parsed =
      typeof rawRequestedHours === "number" ? rawRequestedHours : Number(rawRequestedHours);
    if (
      Number.isNaN(parsed) ||
      !Number.isFinite(parsed) ||
      parsed <= 0 ||
      parsed > 1000 ||
      Math.abs(parsed * 4 - Math.round(parsed * 4)) > 1e-6
    ) {
      return NextResponse.json(
        { error: "الساعات المطلوبة يجب أن تكون رقماً موجباً من مضاعفات 0.25 وحتى 1000 ساعة." },
        { status: 400 }
      );
    }
    requestedHours = parsed;
  }

  // تاريخ الاستحقاق (تمت المعالجة في validateNewTaskFields، نستخرجه الآن)
  let dueDate: string | null = null;
  if (rawDueDate !== undefined && rawDueDate !== null && rawDueDate !== "") {
    if (typeof rawDueDate === "string" && isValidISODate(rawDueDate.trim())) {
      dueDate = rawDueDate.trim();
    }
  }

  // requiredAssignees
  let requiredAssignees: number | null = null;
  if (rawRequiredAssignees !== undefined && rawRequiredAssignees !== null) {
    requiredAssignees = Number(rawRequiredAssignees);
  }

  // priority
  const priority: "normal" | "urgent" =
    rawPriority === "urgent" ? "urgent" : "normal";

  // معالجة الأقسام
  const cleanDepartmentIds = sanitizeDepartmentIds(rawDepartmentIds);

  // 6) التحقق من الصلاحيات عبر decideTaskCreation
  const decision = decideTaskCreation({
    requesterRole: creatorRole,
    requesterDepartmentId: creatorDeptId,
    scope,
    departmentIds: scope === "departments" ? cleanDepartmentIds : undefined,
  });

  if (!decision.allowed) {
    return NextResponse.json(
      { error: decision.message, reason: decision.reason },
      { status: 403 }
    );
  }

  // فحص إضافي لنطاق own_department
  if (scope === "own_department" && !creatorDeptId) {
    return NextResponse.json(
      { error: "لا يمكن إنشاء مهمة لقسمك لأنك غير منتمٍ لأي قسم." },
      { status: 400 }
    );
  }

  // 7) التحقق من الأقسام في قاعدة البيانات إذا كان النطاق departments
  if (scope === "departments") {
    if (cleanDepartmentIds.length === 0) {
      return NextResponse.json(
        { error: "يجب تحديد قسم واحد على الأقل للمهمة." },
        { status: 400 }
      );
    }

    const { data: foundDepts, error: deptsError } = await supabase
      .from("departments")
      .select("id, status")
      .in("id", cleanDepartmentIds);

    if (deptsError) {
      return NextResponse.json(
        { error: "تعذر التحقق من بيانات الأقسام المستهدفة." },
        { status: 500 }
      );
    }

    const foundMap = new Map((foundDepts ?? []).map((d) => [String(d.id), d.status]));

    for (const dId of cleanDepartmentIds) {
      if (!foundMap.has(dId)) {
        return NextResponse.json(
          { error: `القسم المحدد (معرّف ${dId}) غير موجود في النظام.` },
          { status: 400 }
        );
      }
      if (foundMap.get(dId) !== "active") {
        return NextResponse.json(
          { error: `القسم المحدد (معرّف ${dId}) غير مفعّل أو موقوف حالياً.` },
          { status: 400 }
        );
      }
    }
  }

  // 8) تحديد target_type للمهمة الموجهة لشخص بعينه
  // إذا أُرسل targetUserId، نعامله كـ "person" بشرط أن يكون UUID صالحاً
  let isPersonTarget = false;
  let targetPersonId: string | null = null;

  if (typeof rawTargetUserId === "string" && rawTargetUserId.trim()) {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(rawTargetUserId.trim())) {
      return NextResponse.json(
        { error: "معرّف المستخدم المستهدف (targetUserId) يجب أن يكون UUID صالحاً." },
        { status: 400 }
      );
    }
    isPersonTarget = true;
    targetPersonId = rawTargetUserId.trim();
  }

  // 9) ربط النطاق بالحقول
  const scopeResolved = resolveTaskScope({
    scope,
    creatorId: currentUser.id,
    creatorDepartmentId: creatorDeptId,
    departmentIds: cleanDepartmentIds,
  });

  // بناء الحمولة مع الحقول الجديدة
  // نحدد target_type = "person" إذا كانت مهمة موجهة لشخص بعينه
  const insertPayload: Record<string, unknown> = {
    title,
    description,
    target_type: isPersonTarget ? "person" : scopeResolved.targetType,
    target_user_id: isPersonTarget ? targetPersonId : scopeResolved.targetUserId,
    target_department_ids: scopeResolved.targetDepartmentIds,
    department_id: scopeResolved.departmentId,
    lifecycle_status: "open",
    requested_hours: requestedHours,
    due_date: dueDate,
    created_by: currentUser.id,
    assigned_to: isPersonTarget ? null : scopeResolved.assignedTo,
    required_assignees: requiredAssignees,
    priority,
    reviewed_by: null,
    reviewed_at: null,
    review_decision: null,
    review_reason: null,
  };

  // 10) الإدراج في جدول tasks
  const { data: insertedTask, error: insertError } = await supabase
    .from("tasks")
    .insert(insertPayload)
    .select()
    .single();

  if (insertError || !insertedTask) {
    return NextResponse.json(
      { error: "تعذر إنشاء المهمة. حاول مرة أخرى." },
      { status: 500 }
    );
  }

  const taskId = String(insertedTask.id);

  // 11) إجراءات ما بعد الإنشاء بحسب نوع المهمة

  // أ) مهمة موجهة لشخص بعينه (person): أنشئ سجل task_assignments بحالة offered
  if (isPersonTarget && targetPersonId) {
    const { error: assignError } = await supabase
      .from("task_assignments")
      .insert({
        task_id: taskId,
        user_id: targetPersonId,
        status: "offered",
        offered_by: currentUser.id,
      });

    if (assignError) {
      // التراجع: حذف المهمة
      await supabase.from("tasks").delete().eq("id", taskId);
      return NextResponse.json(
        { error: "تعذر إنشاء سجل التكليف. أُلغيت العملية." },
        { status: 500 }
      );
    }
  }

  // ب) مهمة self: استدعاء claim_task للمنشئ
  if (scope === "self" && !isPersonTarget) {
    const { error: claimError } = await supabase.rpc("claim_task", {
      p_task_id: taskId,
      p_user_id: currentUser.id,
    });

    if (claimError) {
      // التراجع: حذف المهمة
      await supabase.from("tasks").delete().eq("id", taskId);
      return NextResponse.json(
        { error: "تعذر استلام المهمة الذاتية. أُلغيت العملية." },
        { status: 500 }
      );
    }
  }

  // 12) كتابة سجل التدقيق audit_logs
  const auditPayload = buildTaskAuditLogPayload({
    actorId: currentUser.id,
    action: "create_task",
    taskId,
    departmentId: insertedTask.department_id,
    targetUserId: isPersonTarget ? targetPersonId : (insertedTask.target_user_id ?? null),
    beforeData: null,
    afterData: insertedTask,
    details: `إنشاء مهمة جديدة: ${insertedTask.title} (النطاق: ${scope}, الأولوية: ${priority})`,
  });

  const { error: auditError } = await supabase
    .from("audit_logs")
    .insert(auditPayload);

  if (auditError) {
    // التراجع: حذف المهمة
    const { error: deleteError } = await supabase
      .from("tasks")
      .delete()
      .eq("id", taskId);

    if (deleteError) {
      console.error(
        "[POST /api/task-assignments/tasks] فشل حذف المهمة بعد خطأ في سجل التدقيق:",
        taskId,
        deleteError
      );
      return NextResponse.json(
        {
          error:
            "تعذر توثيق العملية في سجل التدقيق وفشل التراجع عن إنشاء المهمة. تواصل مع الإدارة.",
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

  return NextResponse.json({ ok: true, task: insertedTask }, { status: 201 });
}
