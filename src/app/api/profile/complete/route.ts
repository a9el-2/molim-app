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
    if (auth.demo) {
      return NextResponse.json({ ok: true, id: auth.user.id });
    }
    return NextResponse.json(
      { error: "الخدمة غير متاحة مؤقتاً. حاول لاحقاً." },
      { status: 503 }
    );
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
    agreementDuration?: number;
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

  const fatherName = (body.fatherName ?? "").trim();
  if (!fatherName) {
    return NextResponse.json(
      { error: "اسم الأب مطلوب." },
      { status: 400 }
    );
  }

  const lastName = (body.lastName ?? "").trim();
  if (!lastName) {
    return NextResponse.json(
      { error: "اسم العائلة مطلوب." },
      { status: 400 }
    );
  }

  const email = (body.email ?? "").trim();
  if (!email) {
    return NextResponse.json(
      { error: "البريد الإلكتروني مطلوب." },
      { status: 400 }
    );
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json(
      { error: "صيغة البريد الإلكتروني غير صحيحة." },
      { status: 400 }
    );
  }

  const countryCode = (body.countryCode ?? "").trim();
  if (!countryCode) {
    return NextResponse.json(
      { error: "رمز الدولة مطلوب." },
      { status: 400 }
    );
  }

  const phone = (body.phone ?? "").trim();
  if (!phone) {
    return NextResponse.json(
      { error: "رقم الهاتف مطلوب." },
      { status: 400 }
    );
  }

  const birthDate = (body.birthDate ?? "").trim();
  if (!birthDate) {
    return NextResponse.json(
      { error: "تاريخ الميلاد مطلوب." },
      { status: 400 }
    );
  }

  const nationality = (body.nationality ?? "").trim();
  if (!nationality) {
    return NextResponse.json(
      { error: "الجنسية مطلوبة." },
      { status: 400 }
    );
  }

  const residence = (body.residence ?? "").trim();
  if (!residence) {
    return NextResponse.json(
      { error: "بلد الإقامة مطلوب." },
      { status: 400 }
    );
  }

  const skills = Array.isArray(body.skills) ? body.skills.filter(Boolean) : [];
  if (skills.length === 0) {
    return NextResponse.json(
      { error: "يرجى تحديد مهارة واحدة على الأقل." },
      { status: 400 }
    );
  }

  const tools = Array.isArray(body.tools) ? body.tools.filter(Boolean) : [];
  if (tools.length === 0) {
    return NextResponse.json(
      { error: "يرجى تحديد أداة أو برنامج واحد على الأقل." },
      { status: 400 }
    );
  }

  const updatePayload: Record<string, unknown> = {
    first_name: firstName,
    father_name: fatherName,
    last_name: lastName,
    email: email,
    phone: phone,
    country_code: countryCode,
    birth_date: birthDate,
    nationality: nationality,
    residence: residence,
    skills: skills,
    tools: tools,
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

  // إذا تم اختيار مدة الاتفاقية، نسجّل الاتفاقية في جدول volunteer_agreements
  const durationMonths = Number(body.agreementDuration);
  if ([1, 2, 3].includes(durationMonths)) {
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + durationMonths);

    const { error: agError } = await supabase
      .from("volunteer_agreements")
      .insert({
        user_id: auth.user.id,
        duration_months: durationMonths,
        expires_at: expiresAt.toISOString(),
        agreement_version: "v1.0",
        is_renewal: false,
      });

    if (agError) {
      console.warn("Could not insert volunteer_agreement on complete profile:", agError.message);
    }
  }

  return NextResponse.json({ ok: true, id: auth.user.id });
}
