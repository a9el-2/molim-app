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

  let body: { field?: string; value?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const { field, value } = body;

  if (
    (field !== "status" && field !== "role") ||
    typeof value !== "string" ||
    !value.trim()
  ) {
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

  // نجلب دور العضو الحالي لحماية الحسابات الحساسة قبل اتخاذ القرار.
  const { data: target, error: targetError } = await supabase
    .from("users")
    .select("id, role")
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

  const decision = decideMemberUpdate({
    requesterRole: auth.user.role,
    requesterId: auth.user.id,
    targetId: id,
    targetRole: target.role as UserRole,
    field,
    newValue: value,
  });

  if (!decision.allowed) {
    const status =
      decision.reason === "invalid_role" || decision.reason === "invalid_status"
        ? 400
        : 403;
    return NextResponse.json({ error: decision.message }, { status });
  }

  const { error } = await supabase
    .from("users")
    .update({ [field]: value })
    .eq("id", id);

  if (error) {
    return NextResponse.json(
      { error: "تعذر تحديث المستخدم." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}