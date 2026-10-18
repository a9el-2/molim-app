import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "./supabase/server";
import { validateTelegramInitData, isTelegramInitDataFresh } from "./telegram";
import { isProfileComplete, isActiveMember } from "./access-control";
import { isDemoBypassAllowed } from "./demo-mode";
import type { UserRole } from "./roles";

export { isDemoBypassAllowed };

export const TELEGRAM_INIT_HEADER = "x-telegram-init-data";

export type ServerUser = {
  id: string;
  role: UserRole;
  status: string;
  profileCompleted: boolean;
  telegramId: number | null;
};

export type AuthOutcome =
  | { ok: true; user: ServerUser; demo: boolean }
  | { ok: false; response: NextResponse };

function isDemoBypassEnabled(): boolean {
  return isDemoBypassAllowed();
}

function demoUser(): ServerUser {
  return {
    id: "MOL-00001",
    role: "SUPER_ADMIN",
    status: "active",
    profileCompleted: true,
    telegramId: null,
  };
}

function normalizeRole(role: unknown): UserRole {
  const value = String(role ?? "VOLUNTEER");
  const allowed: UserRole[] = [
    "VOLUNTEER",
    "DEPARTMENT_HEAD",
    "HR",
    "ADMIN",
    "SUPER_ADMIN",
  ];
  return allowed.includes(value as UserRole) ? (value as UserRole) : "VOLUNTEER";
}

export function unauthorized(message = "غير مصرح بالوصول."): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbidden(message = "لا تملك الصلاحية لهذا الإجراء."): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function notLinked(message = "حساب تيليجرام غير مرتبط بأي عضو."): NextResponse {
  return NextResponse.json(
    { error: message, hasLinkedUser: false },
    { status: 404 }
  );
}

export function accountInactive(
  message = "حسابك غير مفعّل حاليًا. تواصل مع الإدارة لإعادة تفعيله."
): NextResponse {
  return NextResponse.json(
    { error: message, accountInactive: true },
    { status: 403 }
  );
}

export type AuthenticateOptions = {
  /**
   * السماح للحسابات غير النشطة بالمرور.
   * يُستخدم لمسار قراءة الحساب الذاتي، ولإكمال العضو ملفه الشخصي
   * (الذي يتحقق بعدها من الحالة: active/pending فقط) — لا للعمليات الحساسة.
   * الافتراضي: false — أي أن أي حساب غير نشط يُرفض.
   */
  allowInactive?: boolean;
};

/**
 * التحقق من هوية الطالب عبر توقيع Telegram initData.
 * لا تُقبل أي نتيجة من العميل دون تحقق توقيع صالح على الخادم.
 * افتراضيًا: تُرفض الحسابات غير النشطة (status !== "active").
 */
export async function authenticateRequest(
  request: Request,
  options: AuthenticateOptions = {}
): Promise<AuthOutcome> {
  const initData = request.headers.get(TELEGRAM_INIT_HEADER);

  if (!initData) {
    if (isDemoBypassEnabled()) {
      return { ok: true, user: demoUser(), demo: true };
    }
    return { ok: false, response: unauthorized("مطلوب مصادقة تيليجرام.") };
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error("TELEGRAM_BOT_TOKEN غير معرّف على الخادم.");
    return {
      ok: false,
      response: NextResponse.json(
        { error: "الخدمة غير متاحة مؤقتاً. حاول لاحقاً." },
        { status: 500 }
      ),
    };
  }

  const validation = validateTelegramInitData(initData, botToken);
  if (!validation.ok) {
    return { ok: false, response: unauthorized(validation.error) };
  }

  if (!isTelegramInitDataFresh(validation.authDate)) {
    return {
      ok: false,
      response: unauthorized("انتهت صلاحية الجلسة، أعد فتح التطبيق."),
    };
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    if (isDemoBypassEnabled()) {
      return { ok: true, user: demoUser(), demo: true };
    }
    return {
      ok: false,
      response: NextResponse.json(
        { error: "الخدمة غير متاحة مؤقتاً. حاول لاحقاً." },
        { status: 503 }
      ),
    };
  }

  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("telegram_id", validation.user.telegramId)
    .maybeSingle();

  if (!user) {
    return { ok: false, response: notLinked() };
  }

  const serverUser: ServerUser = {
    id: String(user.id),
    role: normalizeRole(user.role),
    status: String(user.status ?? "pending"),
    profileCompleted: isProfileComplete(user),
    telegramId:
      typeof user.telegram_id === "number" ? user.telegram_id : null,
  };

  if (!options.allowInactive && !isActiveMember(serverUser.status)) {
    return { ok: false, response: accountInactive() };
  }

  return {
    ok: true,
    user: serverUser,
    demo: false,
  };
}
