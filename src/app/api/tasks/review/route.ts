import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabase/server";
import { authenticateRequest } from "../../../lib/server-auth";
import type { UserRole } from "../../../lib/roles";

/**
 * GET /api/tasks/review
 * جلب المهام المعلقة بانتظار المراجعة (status = 'in_review')
 * مع تفاصيل العضو المسلّم والقسم والملاحظات وساعات الإنجاز المطلوبة.
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

  // 1. قراءة بيانات المراجع الحقيقية من جدول users
  const { data: reviewerUser, error: reviewerError } = await supabase
    .from("users")
    .select("id, role, department_id")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (reviewerError || !reviewerUser) {
    return NextResponse.json(
      { error: "تعذر التحقق من بيانات المستخدم." },
      { status: 500 }
    );
  }

  const reviewerRole = reviewerUser.role as UserRole;
  const reviewerDeptId = reviewerUser.department_id as string | null;

  if (reviewerRole === "VOLUNTEER") {
    return NextResponse.json(
      { error: "المتطوع لا يملك صلاحية مراجعة المهام." },
      { status: 403 }
    );
  }

  // 2. بناء استعلام جلب المهام التي حالتها in_review
  let query = supabase
    .from("tasks")
    .select(`
      id,
      title,
      description,
      target_type,
      target_user_id,
      department_id,
      status,
      requested_hours,
      due_date,
      created_by,
      assigned_to,
      created_at,
      updated_at,
      creator:users!tasks_created_by_fkey (
        id,
        first_name,
        father_name,
        last_name
      ),
      assignee:users!tasks_assigned_to_fkey (
        id,
        first_name,
        father_name,
        last_name,
        department_id
      ),
      department:departments!tasks_department_id_fkey (
        id,
        name
      ),
      hours_logs (
        id,
        user_id,
        submitted_hours,
        approved_hours,
        date,
        description,
        status,
        created_at
      )
    `)
    .eq("status", "in_review")
    .order("updated_at", { ascending: false });

  // إذا كان رئيس قسم، يقتصر على قسمه
  if (reviewerRole === "DEPARTMENT_HEAD") {
    if (!reviewerDeptId) {
      return NextResponse.json({ ok: true, tasks: [] });
    }
    query = query.eq("department_id", reviewerDeptId);
  }

  const { data: rows, error: fetchError } = await query;

  if (fetchError) {
    return NextResponse.json(
      { error: "تعذر جلب قائمة المهام للمراجعة." },
      { status: 500 }
    );
  }

  const tasks = [];

  for (const row of rows ?? []) {
    // لا يراجع الشخص مهمة مسندة إليه شخصياً ما لم يكن سوبر أدمن
    if (reviewerRole !== "SUPER_ADMIN" && row.assigned_to === reviewerUser.id) {
      continue;
    }

    const creatorObj = Array.isArray(row.creator) ? row.creator[0] : row.creator;
    const assigneeObj = Array.isArray(row.assignee) ? row.assignee[0] : row.assignee;
    const deptObj = Array.isArray(row.department) ? row.department[0] : row.department;

    // سجل الساعات المرتبط بالمهمة
    const hoursLogs = Array.isArray(row.hours_logs) ? row.hours_logs : [];
    const latestHoursLog = hoursLogs.length > 0 ? hoursLogs[0] : null;

    const personObj = assigneeObj || creatorObj;
    const personName = personObj
      ? [personObj.first_name, personObj.father_name, personObj.last_name]
          .filter(Boolean)
          .join(" ")
          .trim()
      : "عضو في الفريق";

    tasks.push({
      id: row.id,
      title: row.title,
      description: row.description,
      department_id: row.department_id,
      department_name: deptObj?.name ?? "عام",
      volunteer_id: personObj?.id ?? row.assigned_to ?? row.created_by,
      volunteer_name: personName,
      volunteer_number: personObj?.id ?? "",
      submitted_hours: latestHoursLog?.submitted_hours ?? row.requested_hours ?? 1,
      submission_notes: latestHoursLog?.description ?? row.description ?? "",
      submission_date: latestHoursLog?.date ?? (row.updated_at ? row.updated_at.split("T")[0] : ""),
      hours_log_id: latestHoursLog?.id ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  }

  return NextResponse.json({ ok: true, tasks });
}
