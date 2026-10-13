import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabase/server";
import {
  validateTelegramInitData,
  isTelegramInitDataFresh,
} from "../../../lib/telegram";

export async function POST(request: NextRequest) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json(
      { error: "TELEGRAM_BOT_TOKEN غير معرّف على الخادم" },
      { status: 500 }
    );
  }

  let body;
  try {
    body = (await request.json()) as { initData?: string };
  } catch {
    return NextResponse.json(
      { error: "الطلب غير صالح" },
      { status: 400 }
    );
  }

  if (!body.initData) {
    return NextResponse.json(
      { error: "مطلوب initData" },
      { status: 400 }
    );
  }

  const validation = validateTelegramInitData(body.initData, botToken);

  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 401 });
  }

  if (!isTelegramInitDataFresh(validation.authDate)) {
    return NextResponse.json(
      { error: "انتهت صلاحية الجلسة، أعد فتح التطبيق" },
      { status: 401 }
    );
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase غير مكوّن" },
      { status: 503 }
    );
  }

  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("telegram_id", validation.user.telegramId)
    .maybeSingle();

  if (!user) {
    return NextResponse.json(
      { error: "حساب Telegram غير مرتبط بأي عضو", hasLinkedUser: false },
      { status: 404 }
    );
  }

  return NextResponse.json({
    telegram: validation.user,
    hasLinkedUser: true,
    userId: user.id,
  });
}