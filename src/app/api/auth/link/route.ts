import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabase/server";
import {
  validateTelegramInitData,
  isTelegramInitDataFresh,
} from "../../../lib/telegram";
import {
  hashLinkCode,
  isLinkCodeUsable,
  normalizeLinkCode,
} from "../../../lib/link-code";
import { isUniqueViolation } from "../../../lib/db-errors";
import { TELEGRAM_INIT_HEADER } from "../../../lib/server-auth";

/**
 * إقران حساب تيليجرام بعضو مُضاف مسبقًا عبر رمز ربط لمرة واحدة.
 * لا يمنح هذا المسار أي صلاحية إضافية: فقط يربط الهوية بالحساب.
 */
export async function POST(request: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error("TELEGRAM_BOT_TOKEN غير معرّف على الخادم.");
    return NextResponse.json(
      { error: "الخدمة غير متاحة مؤقتاً. حاول لاحقاً." },
      { status: 500 }
    );
  }

  const initData = request.headers.get(TELEGRAM_INIT_HEADER);
  if (!initData) {
    return NextResponse.json(
      { error: "مطلوب مصادقة تيليجرام." },
      { status: 401 }
    );
  }

  const validation = validateTelegramInitData(initData, botToken);
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.error },
      { status: 401 }
    );
  }

  if (!isTelegramInitDataFresh(validation.authDate)) {
    return NextResponse.json(
      { error: "انتهت صلاحية الجلسة، أعد فتح التطبيق." },
      { status: 401 }
    );
  }

  let body: { code?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const code = normalizeLinkCode(body.code ?? "");
  if (!code) {
    return NextResponse.json(
      { error: "فضلاً أدخل رمز الربط." },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "الخدمة غير متاحة مؤقتاً. حاول لاحقاً." },
      { status: 503 }
    );
  }

  const inputHash = hashLinkCode(code);

  const { data: member } = await supabase
    .from("users")
    .select("id, link_code, link_code_expires_at, link_code_used_at, telegram_id")
    .eq("link_code", inputHash)
    .maybeSingle();

  if (!isLinkCodeUsable(member, inputHash)) {
    return NextResponse.json(
      { error: "رمز الربط غير صالح أو مستخدم مسبقًا أو منتهي الصلاحية." },
      { status: 400 }
    );
  }

  const telegramId = validation.user.telegramId;

  const { data: conflict } = await supabase
    .from("users")
    .select("id")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (conflict && String(conflict.id) !== String(member!.id)) {
    return NextResponse.json(
      { error: "حساب تيليجرام هذا مرتبط بعضو آخر." },
      { status: 409 }
    );
  }

  // تحديث ذرّي: يُشترط أن يكون الرمز مطابقًا وغير مستخدم وغير مرتبط بعد،
  // وأن يكون ضمن صلاحيته وقت التنفيذ. هذا يمنع إعادة الاستخدام والطلبات
  // المتزامنة من النجاح معًا (compare-and-swap على مستوى قاعدة البيانات).
  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("users")
    .update({
      telegram_id: telegramId,
      telegram_username: validation.user.username ?? null,
      link_code_used_at: now,
    })
    .eq("id", member!.id)
    .eq("link_code", inputHash)
    .is("link_code_used_at", null)
    .is("telegram_id", null)
    .gt("link_code_expires_at", now)
    .select("id");

  if (error) {
    // تعارض الفهرس الفريد الجزئي على telegram_id: مُنع ربط نفس الحساب بعضوين.
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "حساب تيليجرام هذا مرتبط بعضو آخر." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "تعذر ربط الحساب. حاول مرة أخرى." },
      { status: 500 }
    );
  }

  if (!updated || updated.length === 0) {
    return NextResponse.json(
      { error: "رمز الربط غير صالح أو مستخدم مسبقًا أو منتهي الصلاحية." },
      { status: 409 }
    );
  }

  return NextResponse.json({
    userId: member!.id,
    hasLinkedUser: true,
  });
}
