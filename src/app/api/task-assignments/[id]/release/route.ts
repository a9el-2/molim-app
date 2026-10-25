import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../lib/supabase/server";
import { authenticateRequest } from "../../../../lib/server-auth";
import {
  validateReason,
  decideReleasePermission,
  mapManageError,
} from "../../../../lib/task-assignments-policy";
import type { UserRole } from "../../../../lib/roles";

/**
 * POST /api/task-assignments/[id]/release
 * سحب تكليف المهمة من عضو إدارياً لتعثره وإعادة حالته إلى released.
 * الجسم: { reason: string }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;

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

  // 3) جلب التكليف والمهمة وصاحب التكليف
  const { data: assignment, error: fetchErr } = await supabase
    .from("task_assignments")
    .select(`
      id,
      task_id,
      user_id,
      status,
      user:users!task_assignments_user_id_fkey (
        id,
        department_id
      ),
      task:tasks (
        id,
        created_by,
        department_id
      )
    `)
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !assignment) {
    return NextResponse.json(
      { error: "سجل التكليف غير موجود." },
      { status: 404 }
    );
  }

  const taskObj = Array.isArray(assignment.task)
    ? assignment.task[0]
    : assignment.task;
  const ownerObj = Array.isArray(assignment.user)
    ? assignment.user[0]
    : assignment.user;

  if (!taskObj || !ownerObj) {
    return NextResponse.json(
      { error: "بيانات المهمة أو صاحب التكليف غير متوفرة." },
      { status: 404 }
    );
  }

  // 4) التحقق من الصلاحيات عبر دالة السياسة النقية
  const decision = decideReleasePermission(
    {
      id: currentUser.id,
      role: currentUser.role as UserRole,
      departmentId: currentUser.department_id as string | null,
      status: currentUser.status,
    },
    {
      id: String(taskObj.id),
      created_by: String(taskObj.created_by),
      department_id: (taskObj.department_id as string | null) ?? null,
    },
    {
      id: String(ownerObj.id),
      departmentId: (ownerObj.department_id as string | null) ?? null,
    }
  );

  if (!decision.allowed) {
    return NextResponse.json(
      { error: decision.message, reason: decision.reason },
      { status: decision.statusCode }
    );
  }

  // 5) استدعاء الدالة الذرية في قاعدة البيانات release_task_assignment
  const { data: resultAssignment, error: rpcError } = await supabase.rpc(
    "release_task_assignment",
    {
      p_assignment_id: id,
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

  return NextResponse.json({ ok: true, assignment: resultAssignment });
}
