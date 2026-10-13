import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../lib/supabase/server";
import { authenticateRequest, forbidden } from "../../lib/server-auth";
import { canReadMembers } from "../../lib/access-control";

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

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  if (!canReadMembers(auth.user.role)) {
    return forbidden("قائمة الأعضاء متاحة للإدارة والموارد البشرية فقط.");
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { demo: true },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const departmentName = url.searchParams.get("department")?.trim() || null;

  const { data: rows, error } = await supabase.from("users").select("*");

  if (error) {
    return NextResponse.json(
      { error: "تعذر جلب المستخدمين." },
      { status: 500 }
    );
  }

  const { data: departments } = await supabase
    .from("departments")
    .select("id, name");

  const departmentMap = new Map<
    string,
    string
  >();

  for (const dept of departments ?? []) {
    departmentMap.set(String(dept.id), String(dept.name ?? ""));
  }

  const users = (rows ?? [])
    .map((row) => {
      const record = row as Record<string, unknown>;
      const departmentId = record.department_id
        ? String(record.department_id)
        : null;
      const department = departmentId
        ? departmentMap.get(departmentId) ?? "غير محدد"
        : "غير محدد";

      return {
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
      };
    })
    .filter((user) =>
      departmentName ? user.department === departmentName : true
    );

  return NextResponse.json({ users });
}