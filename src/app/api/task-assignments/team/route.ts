import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabase/server";
import { authenticateRequest } from "../../../lib/server-auth";
import {
  canViewTaskAssignments,
  type ViewerInfo,
} from "../../../lib/task-assignments-policy";
import type { UserRole } from "../../../lib/roles";

/**
 * GET /api/task-assignments/team
 * لوحة متابعة تكليفات الفريق (للأدوار غير المتطوع فقط).
 * يرجع لكل عضو يحق للمشاهد رؤيته حسب canViewTaskAssignments:
 * - عدد التكليفات النشطة (in_progress و needs_revision).
 * - عدد التكليفات المتأخرة (due_date قبل اليوم بتوقيت Asia/Riyadh والحالة نشطة).
 * - عدد التكليفات المعتمدة (approved).
 * - اسم العضو وبياناته.
 *
 * المنظومة تعمل باستعلامين فقط دون أي N+1:
 * 1. استعلام جلب الأعضاء المسموحين.
 * 2. استعلام مجمّع لجلب تكليفاتهم النشطة والمعتمدة بحسابات الذاكرة.
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

  // 1) قراءة بيانات المستخدم الحالي والتأكد من نشاطه وصلاحيته
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

  const viewerRole = currentUser.role as UserRole;
  if (viewerRole === "VOLUNTEER") {
    return NextResponse.json(
      { error: "المتطوع لا يملك صلاحية عرض لوحة الفريق." },
      { status: 403 }
    );
  }

  // 2) معالجة معامل القسم الاختياري
  const { searchParams } = new URL(request.url);
  const departmentFilter = searchParams.get("department")?.trim() || null;

  const viewerDeptId = currentUser.department_id as string | null;

  // رئيس القسم محصور بقسمه دائماً
  if (viewerRole === "DEPARTMENT_HEAD") {
    if (!viewerDeptId) {
      return NextResponse.json({ ok: true, members: [] });
    }
    if (departmentFilter !== null && departmentFilter !== viewerDeptId) {
      return NextResponse.json({ ok: true, members: [] });
    }
  }

  // 3) الاستعلام 1: جلب الأعضاء المستهدفين (النشطين فقط)
  let usersQuery = supabase
    .from("users")
    .select("id, first_name, father_name, last_name, role, department_id, status")
    .eq("status", "active");

  if (viewerRole === "DEPARTMENT_HEAD") {
    usersQuery = usersQuery.eq("department_id", viewerDeptId);
  } else if (departmentFilter) {
    usersQuery = usersQuery.eq("department_id", departmentFilter);
  }

  const { data: rawUsers, error: usersErr } = await usersQuery.order("id");

  if (usersErr) {
    return NextResponse.json(
      { error: "تعذر جلب بيانات أعضاء الفريق." },
      { status: 500 }
    );
  }

  // تصفية أمان إضافية بالاعتماد على دالة السياسة canViewTaskAssignments
  const viewer: ViewerInfo = {
    id: currentUser.id,
    role: viewerRole,
    departmentId: viewerDeptId,
  };

  const visibleUsers = (rawUsers ?? []).filter((u) =>
    canViewTaskAssignments(viewer, {
      id: u.id,
      departmentId: u.department_id as string | null,
    })
  );

  if (visibleUsers.length === 0) {
    return NextResponse.json({ ok: true, members: [] });
  }

  // 4) الاستعلام 2: جلب تكليفات جميع الأعضاء المحددين في استعلام واحد (منع N+1)
  const userIds = visibleUsers.map((u) => u.id);

  const { data: assignments, error: asgnErr } = await supabase
    .from("task_assignments")
    .select(`
      id,
      user_id,
      status,
      task:tasks (
        id,
        due_date,
        target_type
      )
    `)
    .in("user_id", userIds)
    .in("status", ["in_progress", "needs_revision", "approved"]);

  if (asgnErr) {
    return NextResponse.json(
      { error: "تعذر جلب تكليفات الفريق." },
      { status: 500 }
    );
  }

  // 5) حساب الإحصائيات في الذاكرة بتوقيت Asia/Riyadh
  const todayRiyadh = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Riyadh",
  });

  const statsMap = new Map<
    string,
    { active: number; overdue: number; approved: number }
  >();

  for (const row of assignments ?? []) {
    const uid = String(row.user_id);
    const taskObj = Array.isArray(row.task) ? row.task[0] : row.task;

    // استثناء المهام الشخصية (target_type='self') لكل الأعضاء عدا المشاهد نفسه
    if (uid !== currentUser.id && taskObj?.target_type === "self") {
      continue;
    }

    if (!statsMap.has(uid)) {
      statsMap.set(uid, { active: 0, overdue: 0, approved: 0 });
    }
    const userStats = statsMap.get(uid)!;

    if (row.status === "approved") {
      userStats.approved += 1;
    } else if (row.status === "in_progress" || row.status === "needs_revision") {
      userStats.active += 1;

      const dueDate = taskObj?.due_date;
      if (typeof dueDate === "string" && dueDate.trim()) {
        if (dueDate.trim() < todayRiyadh) {
          userStats.overdue += 1;
        }
      }
    }
  }

  // 6) تجميع النتائج لكل عضو
  const members = visibleUsers.map((u) => {
    const st = statsMap.get(u.id) ?? { active: 0, overdue: 0, approved: 0 };
    const fullName = [u.first_name, u.father_name, u.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || u.id;

    return {
      id: u.id,
      name: fullName,
      role: u.role,
      department_id: u.department_id,
      active_tasks_count: st.active,
      overdue_tasks_count: st.overdue,
      approved_tasks_count: st.approved,
    };
  });

  return NextResponse.json({ ok: true, members });
}
