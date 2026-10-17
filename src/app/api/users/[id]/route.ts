import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabase/server";
import { authenticateRequest, forbidden, accountInactive } from "../../../lib/server-auth";
import {
  canReadUser,
  decideMemberUpdate,
  isActiveMember,
  isSelf,
} from "../../../lib/access-control";
import type { UserRole } from "../../../lib/roles";
import {
  buildMemberRoleAuditPayload,
  buildMemberStatusAuditPayload,
  type MemberAuditLogInsertPayload,
} from "../../../lib/members-payload";

function pickName(row: Record<string, unknown>): string {
  if (typeof row.name === "string" && row.name) return row.name;
  if (typeof row.full_name === "string" && row.full_name) return row.full_name;
  const first =
    typeof row.first_name === "string" ? (row.first_name as string) : "";
  const last =
    typeof row.last_name === "string" ? (row.last_name as string) : "";
  if (first || last) return [first, last].filter(Boolean).join(" ");
  return String(row.id ?? "");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(_request, { allowInactive: true });
  if (!auth.ok) return auth.response;

  const { id } = await params;

  if (!canReadUser(auth.user.role, auth.user.id, id)) {
    return forbidden("لا تملك صلاحية عرض هذا الحساب.");
  }

  // الحساب غير النشط يستطيع قراءة بياناته الذاتية فقط، ولا يطّلع على غيره.
  if (!isActiveMember(auth.user.status) && !isSelf(auth.user.id, id)) {
    return accountInactive();
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { demo: true },
      { status: 503 }
    );
  }

  const { data: row, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json(
      { error: "تعذر جلب المستخدم." },
      { status: 404 }
    );
  }

  const record = row as Record<string, unknown>;
  const departmentId = record.department_id
    ? String(record.department_id)
    : null;

  let department = "غير محدد";
  if (departmentId) {
    const { data: dept } = await supabase
      .from("departments")
      .select("name")
      .eq("id", departmentId)
      .maybeSingle();
    department = dept?.name ? String(dept.name) : "غير محدد";
  }

  return NextResponse.json({
    user: {
      id: String(record.id ?? ""),
      name: pickName(record),
      role: String(record.role ?? "VOLUNTEER"),
      status: String(record.status ?? "pending"),
      department,
      departmentId,
      email: typeof record.email === "string" ? record.email : null,
      phone: typeof record.phone === "string" ? record.phone : null,
      joinedAt: typeof record.joined_at === "string" ? record.joined_at : null,
      createdAt: typeof record.created_at === "string" ? record.created_at : null,
      updatedAt: typeof record.updated_at === "string" ? record.updated_at : null,
      profileCompleted: record.profile_completed !== false,
    },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  let requestedRole: string | undefined;
  let requestedStatus: string | undefined;

  if (body.field === "role" && typeof body.value === "string") {
    requestedRole = body.value.trim();
  } else if (body.field === "status" && typeof body.value === "string") {
    requestedStatus = body.value.trim();
  }

  if (typeof body.role === "string" && body.role.trim()) {
    requestedRole = body.role.trim();
  }
  if (typeof body.status === "string" && body.status.trim()) {
    requestedStatus = body.status.trim();
  }

  if (!requestedRole && !requestedStatus) {
    return NextResponse.json(
      { error: "بيانات غير صالحة." },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { demo: true },
      { status: 503 }
    );
  }

  // نجلب دور وحالة وقسم العضو الحالي لحماية الحسابات الحساسة وبناء التدقيق بدقة.
  const { data: target, error: targetError } = await supabase
    .from("users")
    .select("id, role, status, department_id")
    .eq("id", id)
    .maybeSingle();

  if (targetError) {
    return NextResponse.json(
      { error: "تعذر تحديث المستخدم." },
      { status: 500 }
    );
  }

  if (!target) {
    return NextResponse.json({ error: "العضو غير موجود." }, { status: 404 });
  }

  // فحص الصلاحيات لكل حقل مطلوب تعديله
  if (requestedRole) {
    const roleDecision = decideMemberUpdate({
      requesterRole: auth.user.role,
      requesterId: auth.user.id,
      targetId: id,
      targetRole: target.role as UserRole,
      field: "role",
      newValue: requestedRole,
    });

    if (!roleDecision.allowed) {
      const status =
        roleDecision.reason === "invalid_role" ||
        roleDecision.reason === "invalid_status"
          ? 400
          : 403;
      return NextResponse.json({ error: roleDecision.message }, { status });
    }
  }

  if (requestedStatus) {
    const statusDecision = decideMemberUpdate({
      requesterRole: auth.user.role,
      requesterId: auth.user.id,
      targetId: id,
      targetRole: target.role as UserRole,
      field: "status",
      newValue: requestedStatus,
    });

    if (!statusDecision.allowed) {
      const status =
        statusDecision.reason === "invalid_role" ||
        statusDecision.reason === "invalid_status"
          ? 400
          : 403;
      return NextResponse.json({ error: statusDecision.message }, { status });
    }
  }

  const updatePayload: Record<string, string> = {};
  if (requestedRole !== undefined) {
    updatePayload.role = requestedRole;
  }
  if (requestedStatus !== undefined) {
    updatePayload.status = requestedStatus;
  }

  // التحديث المشروط بأن القيمة القديمة ما زالت كما قُرأت (منع تعارض التعديلات المتزامنة)
  let updateQuery = supabase
    .from("users")
    .update(updatePayload)
    .eq("id", id);

  if (updatePayload.role !== undefined) {
    updateQuery = updateQuery.eq("role", target.role);
  }
  if (updatePayload.status !== undefined) {
    updateQuery = updateQuery.eq("status", target.status);
  }

  const { data: updatedRecord, error: updateError } = await updateQuery
    .select("id, role, status, department_id")
    .maybeSingle();

  if (updateError || !updatedRecord) {
    if (updateError) {
      return NextResponse.json(
        { error: "تعذر تحديث المستخدم." },
        { status: 500 }
      );
    }
    // لم يطابق شرط القيمة السابقة (تغيّرت من قبل مستخدم آخر في الأثناء) -> 409 بدون تدقيق
    return NextResponse.json(
      {
        error:
          "تعذر تحديث بيانات العضو؛ تم تعديلها من قِبل مستخدم آخر. حدّث الصفحة وحاول مرة أخرى.",
      },
      { status: 409 }
    );
  }

  // بناء سجلات التدقيق: سجل لكل حقل متغيّر
  const auditPayloads: MemberAuditLogInsertPayload[] = [];
  const deptId = target.department_id ? String(target.department_id) : null;
  const roleChanged =
    updatePayload.role !== undefined && updatePayload.role !== target.role;
  const statusChanged =
    updatePayload.status !== undefined && updatePayload.status !== target.status;

  if (roleChanged || (updatePayload.role !== undefined && !statusChanged)) {
    auditPayloads.push(
      buildMemberRoleAuditPayload({
        actorId: auth.user.id,
        memberId: String(id),
        departmentId: deptId,
        oldRole: String(target.role),
        newRole: updatePayload.role,
      })
    );
  }

  if (statusChanged || (updatePayload.status !== undefined && !roleChanged)) {
    auditPayloads.push(
      buildMemberStatusAuditPayload({
        actorId: auth.user.id,
        memberId: String(id),
        departmentId: deptId,
        oldStatus: String(target.status),
        newStatus: updatePayload.status,
      })
    );
  }

  const { error: auditError } = await supabase
    .from("audit_logs")
    .insert(auditPayloads);

  if (auditError) {
    // التراجع عن التعديل بشرط أن القيمة ما زالت الجديدة
    const rollbackPayload: Record<string, string> = {};
    if (updatePayload.role !== undefined) {
      rollbackPayload.role = String(target.role);
    }
    if (updatePayload.status !== undefined) {
      rollbackPayload.status = String(target.status);
    }

    let rollbackQuery = supabase
      .from("users")
      .update(rollbackPayload)
      .eq("id", id);

    if (updatePayload.role !== undefined) {
      rollbackQuery = rollbackQuery.eq("role", updatePayload.role);
    }
    if (updatePayload.status !== undefined) {
      rollbackQuery = rollbackQuery.eq("status", updatePayload.status);
    }

    const { data: rolledBack, error: rollbackError } = await rollbackQuery
      .select("id")
      .maybeSingle();

    if (rollbackError || !rolledBack) {
      console.error(
        "[PATCH /api/users/%s] فشل التراجع عن التعديل بعد خطأ في سجل التدقيق:",
        id,
        rollbackError || "البيانات تغيّرت قبل التراجع"
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

  return NextResponse.json({ ok: true });
}