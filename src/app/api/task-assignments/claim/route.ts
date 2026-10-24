import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabase/server";
import { authenticateRequest } from "../../../lib/server-auth";
import { mapClaimError } from "../../../lib/task-assignments-policy";

/**
 * POST /api/task-assignments/claim
 * يستلم المستخدم الحالي مهمة مفتوحة.
 * الجسم: { taskId: string }
 * المستخدم دائماً من الجلسة، لا من الجسم أبداً.
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

  // قراءة جسم الطلب
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const taskId = body.taskId;

  // التحقق من أن taskId موجود وبصيغة UUID صالحة
  if (typeof taskId !== "string" || !taskId.trim()) {
    return NextResponse.json(
      { error: "معرّف المهمة (taskId) مطلوب." },
      { status: 400 }
    );
  }

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(taskId.trim())) {
    return NextResponse.json(
      { error: "معرّف المهمة (taskId) يجب أن يكون UUID صالحاً." },
      { status: 400 }
    );
  }

  const cleanTaskId = taskId.trim();

  // استدعاء دالة claim_task في قاعدة البيانات
  // المستخدم دائماً من الجلسة (auth.user.id)
  const { data, error } = await supabase.rpc("claim_task", {
    p_task_id: cleanTaskId,
    p_user_id: auth.user.id,
  });

  if (error) {
    const mapped = mapClaimError(error.message ?? "");
    return NextResponse.json(
      { error: mapped.message, code: mapped.code },
      { status: mapped.status }
    );
  }

  return NextResponse.json({ ok: true, assignment: data }, { status: 201 });
}
