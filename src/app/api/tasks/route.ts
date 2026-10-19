import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../lib/supabase/server";
import { authenticateRequest } from "../../lib/server-auth";
import { decideTaskCreation, isValidISODate, type TaskScope } from "../../lib/hours-policy";
import {
  buildTaskInsertPayload,
  buildTaskAuditLogPayload,
  resolveTaskScope,
  sanitizeDepartmentIds,
  canViewTask,
} from "../../lib/tasks-payload";
import type { UserRole } from "../../lib/roles";

/**
 * GET /api/tasks
 * جلب المهام التي يحق للمستخدم الحالي رؤيتها:
 * - المتطوع: مهام target_user_id = هو، أو مهام قسمه، أو مهام تحتوي قسمه في target_department_ids، أو all_departments، أو التي أنشأها.
 * - رئيس القسم: نفس ما سبق (قسمه) إضافة لما أنشأه.
 * - HR و ADMIN و SUPER_ADMIN: كل المهام.
 * يُصفّي كل صف عبر دالة canViewTask للتأكد القاطع.
 * يربط مع users عبر tasks_created_by_fkey ومع departments عبر tasks_department_id_fkey.
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

  // قراءة بيانات المستخدم الحالي من جدول users في الخادم لضمان الدقة
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

  const userRole = currentUser.role as UserRole;
  const userDeptId = currentUser.department_id as string | null;

  // جلب المهام مع المنشئ والقسم صراحةً لتجنب التباس العلاقات
  const { data: rows, error: fetchError } = await supabase
    .from("tasks")
    .select(`
      id,
      title,
      description,
      target_type,
      target_user_id,
      target_department_ids,
      department_id,
      status,
      requested_hours,
      due_date,
      created_by,
      assigned_to,
      reviewed_by,
      reviewed_at,
      review_decision,
      review_reason,
      created_at,
      updated_at,
      creator:users!tasks_created_by_fkey (
        id,
        first_name,
        father_name,
        last_name
      ),
      department:departments!tasks_department_id_fkey (
        id,
        name
      )
    `)
    .order("created_at", { ascending: false });

  if (fetchError) {
    return NextResponse.json(
      { error: "تعذر جلب قائمة المهام." },
      { status: 500 }
    );
  }

  // تصفية النتائج عبر canViewTask
  const visibleTasks = [];

  for (const row of rows ?? []) {
    const isVisible = canViewTask({
      userRole,
      userId: currentUser.id,
      userDepartmentId: userDeptId,
      task: {
        id: row.id,
        created_by: row.created_by,
        target_user_id: row.target_user_id,
        assigned_to: row.assigned_to,
        department_id: row.department_id,
        target_type: row.target_type,
        target_department_ids: row.target_department_ids,
      },
    });

    if (isVisible) {
      const creatorObj = Array.isArray(row.creator) ? row.creator[0] : row.creator;
      const deptObj = Array.isArray(row.department) ? row.department[0] : row.department;

      const creatorName = creatorObj
        ? [creatorObj.first_name, creatorObj.father_name, creatorObj.last_name]
            .filter(Boolean)
            .join(" ")
            .trim()
        : null;

      visibleTasks.push({
        id: row.id,
        title: row.title,
        description: row.description,
        target_type: row.target_type,
        target_user_id: row.target_user_id,
        target_department_ids: row.target_department_ids,
        department_id: row.department_id,
        department_name: deptObj?.name ?? null,
        status: row.status,
        requested_hours: row.requested_hours !== null ? Number(row.requested_hours) : null,
        due_date: row.due_date,
        created_by: row.created_by,
        creator_name: creatorName || row.created_by,
        creator_number: creatorObj?.id ?? row.created_by,
        assigned_to: row.assigned_to,
        review_decision: row.review_decision ?? null,
        review_reason: row.review_reason ?? null,
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
    }
  }

  return NextResponse.json({ ok: true, tasks: visibleTasks });
}

/**
 * POST /api/tasks
 * إنشاء مهمة جديدة.
 * الجسم: title, description (اختياري), scope, departmentIds (اختياري), requestedHours (اختياري), dueDate (اختياري).
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

  // التحقق من عنوان المهمة (إجباري، حتى 150 حرفاً)
  if (typeof rawTitle !== "string" || !rawTitle.trim()) {
    return NextResponse.json(
      { error: "عنوان المهمة مطلوب ولا يمكن أن يكون فارغاً." },
      { status: 400 }
    );
  }

  const title = rawTitle.trim();
  if (title.length > 150) {
    return NextResponse.json(
      { error: "عنوان المهمة طويل جداً (الحد الأقصى 150 حرفاً)." },
      { status: 400 }
    );
  }

  // التحقق من الوصف (اختياري، حتى 2000 حرف)
  let description: string | null = null;
  if (rawDescription !== undefined && rawDescription !== null && rawDescription !== "") {
    if (typeof rawDescription !== "string") {
      return NextResponse.json(
        { error: "وصف المهمة يجب أن يكون نصياً." },
        { status: 400 }
      );
    }
    const trimmedDesc = rawDescription.trim();
    if (trimmedDesc.length > 2000) {
      return NextResponse.json(
        { error: "وصف المهمة طويل جداً (الحد الأقصى 2000 حرف)." },
        { status: 400 }
      );
    }
    description = trimmedDesc || null;
  }

  // التحقق من النطاق scope
  const allowedScopes: TaskScope[] = ["self", "own_department", "departments", "all"];
  if (typeof rawScope !== "string" || !allowedScopes.includes(rawScope as TaskScope)) {
    return NextResponse.json(
      { error: "نطاق المهمة غير صالح. الخيارات المتاحة: self, own_department, departments, all." },
      { status: 400 }
    );
  }
  const scope = rawScope as TaskScope;

  // التحقق من تاريخ الاستحقاق dueDate (اختياري)
  let dueDate: string | null = null;
  if (rawDueDate !== undefined && rawDueDate !== null && rawDueDate !== "") {
    if (typeof rawDueDate !== "string" || !isValidISODate(rawDueDate.trim())) {
      return NextResponse.json(
        { error: "تاريخ الاستحقاق غير صالح (يجب أن يكون بصيغة YYYY-MM-DD وتاريخاً تقويمياً صحيحاً)." },
        { status: 400 }
      );
    }
    dueDate = rawDueDate.trim();
  }

  // التحقق من الساعات المطلوبة requestedHours (اختياري: موجب، مضاعف 0.25، حتى 1000)
  let requestedHours: number | null = null;
  if (rawRequestedHours !== undefined && rawRequestedHours !== null && rawRequestedHours !== "") {
    const parsed = typeof rawRequestedHours === "number" ? rawRequestedHours : Number(rawRequestedHours);
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

  // معالجة الأقسام وتنظيفها
  const cleanDepartmentIds = sanitizeDepartmentIds(rawDepartmentIds);

  // 3) التحقق من الصلاحيات عبر decideTaskCreation
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

  // فحص إضافي لنطاق own_department: يجب أن يكون للمنشئ قسم
  if (scope === "own_department" && !creatorDeptId) {
    return NextResponse.json(
      { error: "لا يمكن إنشاء مهمة لقسمك لأنك غير منتمٍ لأي قسم." },
      { status: 400 }
    );
  }

  // 4) إذا كان النطاق departments: التحقق من وجود كل الأقسام في القاعدة وأن حالتها active
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

  // 5) ربط النطاق بالحقول وبناء الحمولة
  const scopeResolved = resolveTaskScope({
    scope,
    creatorId: currentUser.id,
    creatorDepartmentId: creatorDeptId,
    departmentIds: cleanDepartmentIds,
  });

  const insertPayload = buildTaskInsertPayload(
    {
      title,
      description,
      requestedHours,
      dueDate,
    },
    {
      creatorId: currentUser.id,
      scopeResolved,
    }
  );

  // 6) الإدراج في جدول tasks
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

  // 7) كتابة سجل التدقيق audit_logs إجبارياً
  const auditPayload = buildTaskAuditLogPayload({
    actorId: currentUser.id,
    action: "create_task",
    taskId: String(insertedTask.id),
    departmentId: insertedTask.department_id,
    targetUserId: insertedTask.target_user_id,
    beforeData: null,
    afterData: insertedTask,
    details: `إنشاء مهمة جديدة: ${insertedTask.title} (النطاق: ${scope})`,
  });

  const { error: auditError } = await supabase
    .from("audit_logs")
    .insert(auditPayload);

  if (auditError) {
    // التراجع عن إنشاء المهمة بحذفها للحفاظ على سلامة التدقيق
    const { error: deleteError } = await supabase
      .from("tasks")
      .delete()
      .eq("id", insertedTask.id);

    if (deleteError) {
      console.error(
        "[POST /api/tasks] فشل حذف المهمة بعد خطأ في سجل التدقيق:",
        insertedTask.id,
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
