import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../../lib/supabase/server";
import { authenticateRequest } from "../../../../../lib/server-auth";
import {
  validateReason,
  decideCancelPermission,
  mapManageError,
} from "../../../../../lib/task-assignments-policy";
import type { UserRole } from "../../../../../lib/roles";

/**
 * POST /api/task-assignments/tasks/[taskId]/cancel
 * إلغاء المهمة إدارياً وإخلاء طرف السجلات النشطة المرتبطة بها.
 * الجسم: { reason: string }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const { taskId } = await params;

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "الخدمة غير متاحة مؤقتاً. حاول لاحقاً." },
      { status: 503 }
    );
  }

  // 1) قراءة بيانات المستخدم الحالي والتأكد من نشاطه
  const { data: currentUser, error: userError } = await supabase
    .from("users")
    .select("id, role, department_id, status")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (userError || !currentUser) {
    return NextResponse.json(
      { error: "تعذر التحقق من بيانات المستخدم." },
      { status: 500 }
    );
  }

  if (String(currentUser.status ?? "").toLowerCase() !== "active") {
    return NextResponse.json(
      { error: "حسابك غير نشط." },
      { status: 403 }
    );
  }

  // 2) قراءة جسم الطلب وفحص السبب
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const reasonValidation = validateReason(body.reason);
  if (!reasonValidation.valid) {
    return NextResponse.json(
      { error: reasonValidation.message },
      { status: 400 }
    );
  }

  // 3) جلب بيانات المهمة
  const { data: task, error: taskErr } = await supabase
    .from("tasks")
    .select("id, created_by, department_id, lifecycle_status, target_type")
    .eq("id", taskId)
    .maybeSingle();

  if (taskErr || !task) {
    return NextResponse.json(
      { error: "المهمة المطلوبة غير موجودة." },
      { status: 404 }
    );
  }

  // 4) التحقق من الصلاحيات عبر دالة السياسة النقية
  const decision = decideCancelPermission(
    {
      id: currentUser.id,
      role: currentUser.role as UserRole,
      departmentId: currentUser.department_id as string | null,
      status: currentUser.status,
    },
    {
      id: String(task.id),
      created_by: String(task.created_by),
      department_id: (task.department_id as string | null) ?? null,
      lifecycle_status: task.lifecycle_status as string | null,
      target_type: (task.target_type as string | null) ?? null,
    }
  );

  if (!decision.allowed) {
    return NextResponse.json(
      { error: decision.message, reason: decision.reason },
      { status: decision.statusCode }
    );
  }

  // 5) استدعاء الدالة الذرية في قاعدة البيانات cancel_task
  const { data: cancelledTask, error: rpcError } = await supabase.rpc(
    "cancel_task",
    {
      p_task_id: taskId,
      p_actor_id: currentUser.id,
      p_reason: reasonValidation.reason,
    }
  );

  if (rpcError) {
    const mapped = mapManageError(rpcError.message ?? "");
    return NextResponse.json(
      { error: mapped.message, code: mapped.code },
      { status: mapped.status }
    );
  }

  return NextResponse.json({ ok: true, task: cancelledTask });
}
