import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabase/server";
import { authenticateRequest } from "../../../lib/server-auth";
import type { UserRole } from "../../../lib/roles";

const ALLOWED_STATUSES = [
  "in_review",
  "pending_approval",
  "issued",
  "rejected",
] as const;

type CertificateStatus = (typeof ALLOWED_STATUSES)[number];

const STATUS_ARABIC_MAP: Record<string, CertificateStatus> = {
  "قيد المراجعة": "in_review",
  "بانتظار الاعتماد": "pending_approval",
  "صادرة": "issued",
  "مرفوضة": "rejected",
  in_review: "in_review",
  pending_approval: "pending_approval",
  issued: "issued",
  rejected: "rejected",
};

/**
 * PATCH /api/certificate-requests/[id]
 * مراجعة واعتماد أو رفض أو إصدار طلب شهادة / خطاب توصية.
 * محصور بمسؤولي الفريق (HR, ADMIN, SUPER_ADMIN).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const userRole = auth.user.role as UserRole;
  const isManager = ["HR", "ADMIN", "SUPER_ADMIN"].includes(userRole);

  if (!isManager) {
    return NextResponse.json(
      { error: "لا تملك صلاحية مراجعة واعتماد طلبات الشهادات." },
      { status: 403 }
    );
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { error: "معرّف الطلب غير محدد." },
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

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const rawStatus = String(body.status ?? "").trim();
  const normalizedStatus = STATUS_ARABIC_MAP[rawStatus];

  if (!normalizedStatus) {
    return NextResponse.json(
      { error: "حالة الطلب غير صالحة." },
      { status: 400 }
    );
  }

  // 1. التحقق من وجود الطلب
  const { data: existing, error: fetchError } = await supabase
    .from("certificate_requests")
    .select("id, status, user_id, type")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !existing) {
    return NextResponse.json(
      { error: "طلب الشهادة غير موجود." },
      { status: 404 }
    );
  }

  const updatePayload: Record<string, unknown> = {
    status: normalizedStatus,
    reviewed_by: auth.user.id,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (typeof body.notes === "string") {
    updatePayload.notes = body.notes.trim();
  }

  if (typeof body.evaluation === "string") {
    updatePayload.evaluation = body.evaluation.trim();
  }

  if (normalizedStatus === "issued") {
    updatePayload.issued_at = new Date().toISOString().slice(0, 10);
    if (typeof body.issueFileUrl === "string" && body.issueFileUrl.trim()) {
      updatePayload.issue_file_url = body.issueFileUrl.trim();
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from("certificate_requests")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json(
      { error: "تعذر تحديث حالة الطلب. حاول مرة أخرى." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    request: updated,
  });
}
