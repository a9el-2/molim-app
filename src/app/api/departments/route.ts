import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../lib/supabase/server";
import { authenticateRequest, forbidden } from "../../lib/server-auth";
import { canReadMembers } from "../../lib/access-control";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  if (!canReadMembers(auth.user.role)) {
    return forbidden("قائمة الأقسام متاحة للإدارة والموارد البشرية فقط.");
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ demo: true }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("departments")
    .select("id, name")
    .order("name");

  if (error) {
    return NextResponse.json(
      { error: "تعذر جلب الأقسام." },
      { status: 500 }
    );
  }

  const departments = (data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? ""),
  }));

  return NextResponse.json({ departments });
}
