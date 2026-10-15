import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabase/server";
import { accountInactive, authenticateRequest } from "../../../lib/server-auth";
import { isUniqueViolation } from "../../../lib/db-errors";

/**
 * إكمال العضو لبياناته الشخصية بعد الربط.
 * يقتصر على الملف الشخصي فقط: لا يتيح تغيير الدور أو الحالة أو القسم.
 */
export async function POST(request: Request) {
  const auth = await authenticateRequest(request, { allowInactive: true });
  if (!auth.ok) return auth.response;

  // يُسمح فقط للعضو النشط أو «بانتظار الاعتماد» بإكمال ملفه الشخصي.
  // المواقوف/المنتهي/غير النشط لا يُكمِل ملفه.
  if (auth.user.status !== "active" && auth.user.status !== "pending") {
    return accountInactive();
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase غير مكوّن." }, { status: 503 });
  }

  let body: {
    firstName?: string;
    fatherName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    countryCode?: string;
    birthDate?: string;
    nationality?: string;
    residence?: string;
    skills?: string[];
    tools?: string[];
  } = {};

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const firstName = (body.firstName ?? "").trim();
  if (!firstName) {
    return NextResponse.json(
      { error: "الاسم الأول مطلوب." },
      { status: 400 }
    );
  }

  const email = (body.email ?? "").trim();
  if (email && !/^[^@\s]+@[^@\s]+$/.test(email)) {
    return NextResponse.json(
      { error: "صيغة البريد الإلكتروني غير صحيحة." },
      { status: 400 }
    );
  }

  const updatePayload: Record<string, unknown> = {
    first_name: firstName,
    father_name: (body.fatherName ?? "").trim() || null,
    last_name: (body.lastName ?? "").trim() || null,
    email: email || null,
    phone: (body.phone ?? "").trim() || null,
    country_code: (body.countryCode ?? "").trim() || null,
    birth_date: body.birthDate || null,
    nationality: (body.nationality ?? "").trim() || null,
    residence: (body.residence ?? "").trim() || null,
    skills: Array.isArray(body.skills) && body.skills.length ? body.skills : [],
    tools: Array.isArray(body.tools) && body.tools.length ? body.tools : [],
    profile_completed: true,
  };

  const { error } = await supabase
    .from("users")
    .update(updatePayload)
    .eq("id", auth.user.id);

  if (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "البريد الإلكتروني أو رقم الهاتف مستخدم مسبقاً من قِبل عضو آخر." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "تعذر حفظ بياناتك. حاول مرة أخرى." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, id: auth.user.id });
}
