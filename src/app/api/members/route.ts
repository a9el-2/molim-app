import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../lib/supabase/server";
import { authenticateRequest, forbidden } from "../../lib/server-auth";
import { canManageMembers, canAssignRole } from "../../lib/access-control";
import {
  generateLinkCode,
  hashLinkCode,
  linkCodeExpiry,
} from "../../lib/link-code";
import {
  MEMBER_ID_MAX_ATTEMPTS,
  isValidMolimId,
  nextMolimIdFromIds,
} from "../../lib/member-id";
import {
  isForeignKeyViolation,
  isMemberIdConflict,
  isUndefinedFunction,
  isUniqueViolation,
} from "../../lib/db-errors";
import {
  buildMemberInsertPayload,
  DEFAULT_MEMBER_ROLE,
} from "../../lib/member-payload";
import { buildMemberCreateAuditPayload } from "../../lib/members-payload";


type SupabaseServer = NonNullable<ReturnType<typeof getSupabaseServerClient>>;

export type CreateMemberResult =
  | { ok: true; id: string }
  | { ok: false; status: number; error: string };

/**
 * توليد معرّف العضو.
 * الأسلوب الذرّي المعتمد: دالة قاعدة البيانات next_molim_id() المدعومة
 * بتسلسل (SEQUENCE) — تضمن عدم التكرار حتى مع الطلبات المتزامنة.
 *
 * نرجع لقراءة أعلى معرّف (max+1) **فقط** عندما تكون الدالة غير موجودة بعد
 * (قبل الترحيل، رمز 42883/PGRST202). أما أخطاء الصلاحيات أو الاتصال أو أي
 * خطأ غير متوقع فتُعاد كفشل صريح حتى لا تُخفى مشكلة إنتاجية.
 */
async function resolveNextMemberId(
  supabase: SupabaseServer
): Promise<{ ok: true; id: string } | { ok: false }> {
  const { data, error } = await supabase.rpc("next_molim_id");

  if (!error && isValidMolimId(data)) {
    return { ok: true, id: String(data) };
  }

  if (error && isUndefinedFunction(error)) {
    const { data: rows, error: readError } = await supabase
      .from("users")
      .select("id");

    if (readError) return { ok: false };

    return { ok: true, id: nextMolimIdFromIds((rows ?? []).map((row) => row.id)) };
  }

  // خطأ صلاحيات/اتصال/غير متوقع — لا نُخفي المشكلة بتراجع صامت.
  return { ok: false };
}

async function insertMemberWithRetry(
  supabase: SupabaseServer,
  payload: Record<string, unknown>
): Promise<CreateMemberResult> {
  for (let attempt = 0; attempt < MEMBER_ID_MAX_ATTEMPTS; attempt += 1) {
    const resolved = await resolveNextMemberId(supabase);
    if (!resolved.ok) {
      return { ok: false, status: 500, error: "تعذر إنشاء العضو." };
    }

    const { error } = await supabase
      .from("users")
      .insert({ ...payload, id: resolved.id });

    if (!error) {
      return { ok: true, id: resolved.id };
    }

    // تعارض معرّف (سباق محتمل): أعد المحاولة بمعرّف جديد فقط إذا كان الانتهاك
    // على عمود id تحديدًا. أما انتهاك 23505 على عمود آخر (بريد إلكتروني أو رقم
    // هاتف مكرر) فلا يُعالج كتعارض معرّف: لا نستهلك أرقام تسلسل ولا نُخفي السبب.
    if (isUniqueViolation(error)) {
      if (isMemberIdConflict(error)) {
        continue;
      }
      return {
        ok: false,
        status: 409,
        error: "بيانات مكررة: البريد الإلكتروني أو رقم الهاتف مستخدم مسبقًا.",
      };
    }

    if (isForeignKeyViolation(error)) {
      return { ok: false, status: 400, error: "القسم المحدد غير موجود." };
    }

    return { ok: false, status: 500, error: "تعذر إنشاء العضو." };
  }

  return {
    ok: false,
    status: 409,
    error: "تعذر توليد معرّف عضو فريد. حاول مرة أخرى.",
  };
}

/**
 * إضافة عضو جديد يدويًا من قبل الإدارة/الموارد البشرية.
 * يُقبل فقط معرف القسم (اختياري)، وتُحدد باقي القيم من الخادم (VOLUNTEER، نشط، غير مكتمل).
 * يُصدر الحساب مع رمز ربط لمرة واحدة (مُجزّأ وصالح 48 ساعة) ليكمل العضو بياناته بنفسه.
 */
export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  if (!canManageMembers(auth.user.role)) {
    return forbidden("إضافة الأعضاء متاحة للإدارة والموارد البشرية فقط.");
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "الخدمة غير متاحة مؤقتاً. حاول لاحقاً." },
      { status: 503 }
    );
  }

  let body: {
    departmentId?: string | null;
  } = {};

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const linkCode = generateLinkCode();
  const expiresAt = linkCodeExpiry();

  if (!canAssignRole(auth.user.role, DEFAULT_MEMBER_ROLE)) {
    return forbidden("لا يمكنك إسناد هذا الدور لهذا العضو.");
  }

  const insertPayload = buildMemberInsertPayload(body, {
    linkCodeHash: hashLinkCode(linkCode),
    expiresAt,
  });

  const created = await insertMemberWithRetry(supabase, insertPayload);
  if (!created.ok) {
    return NextResponse.json(
      { error: created.error },
      { status: created.status }
    );
  }

  // كتابة سجل التدقيق إجبارياً بعد نجاح الإدراج
  const auditPayload = buildMemberCreateAuditPayload({
    actorId: auth.user.id,
    memberId: created.id,
    departmentId: insertPayload.department_id,
    role: insertPayload.role,
    status: insertPayload.status,
    profileCompleted: insertPayload.profile_completed,
    details: "إضافة عضو جديد في المنصة",
  });

  const { error: auditError } = await supabase
    .from("audit_logs")
    .insert(auditPayload);

  if (auditError) {
    // التراجع بحذف العضو الذي أُنشئ للتو بشرط معرّفه فقط
    const { error: deleteError } = await supabase
      .from("users")
      .delete()
      .eq("id", created.id);

    if (deleteError) {
      console.error(
        "[POST /api/members] فشل حذف العضو بعد خطأ في سجل التدقيق:",
        created.id,
        deleteError
      );
      return NextResponse.json(
        {
          error:
            "تعذر توثيق العملية في سجل التدقيق وفشل التراجع عن إنشاء العضو. تواصل مع الإدارة.",
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

  return NextResponse.json({
    member: { id: created.id },
    linkCode,
    expiresAt,
  });
}

