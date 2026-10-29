import type { UserRole } from "../roles";

export type UserDTO = {
  id: string;
  name: string;
  firstName?: string | null;
  fatherName?: string | null;
  lastName?: string | null;
  role: UserRole;
  status: string;
  department: string;
  departmentId: string | null;
  email: string | null;
  phone: string | null;
  countryCode?: string | null;
  birthDate?: string | null;
  nationality?: string | null;
  residence?: string | null;
  joinedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  profileCompleted: boolean;
  skills?: string[];
  tools?: string[];
  agreement?: VolunteerAgreementDTO | null;
};

const STATUS_TO_ARABIC: Record<string, string> = {
  pending: "بانتظار الاعتماد",
  active: "نشط",
  inactive: "غير نشط",
  suspended: "موقوف",
  ended: "منتهي التطوع",
};

const ARABIC_TO_STATUS: Record<string, string> = {
  "بانتظار الاعتماد": "pending",
  "نشط": "active",
  "غير نشط": "inactive",
  "موقوف": "suspended",
  "منتهي التطوع": "ended",
};

export function statusToArabic(status: string | null | undefined): string {
  if (!status) return "—";
  return STATUS_TO_ARABIC[status] ?? status;
}

export function statusFromArabic(label: string): string {
  return ARABIC_TO_STATUS[label] ?? label;
}

export function formatDateShort(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}/${month}/${day}`;
}

export function formatJoinDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  const day = date.getDate();
  const month = date.toLocaleDateString("ar-EG", { month: "long" });
  const year = date.getFullYear();
  if (Number.isNaN(day)) return "—";
  return `${day} ${month} ${year}`;
}

export function formatBirthDate(value: string | null | undefined): string {
  if (!value) return "غير مسجل";
  const clean = value.split("T")[0];
  const parts = clean.split("-");
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const date = new Date(y, m, d);
    if (!Number.isNaN(date.getTime())) {
      const monthName = date.toLocaleDateString("ar-EG", { month: "long" });
      return `${d} ${monthName} ${y}`;
    }
    return `${y}/${parts[1]}/${parts[2]}`;
  }
  return value;
}

function telegramInitData(): string | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp?.initData || null;
}

function authHeaders(
  extra?: Record<string, string>
): Record<string, string> {
  const initData = telegramInitData();
  return {
    ...(initData ? { "X-Telegram-Init-Data": initData } : {}),
    ...(extra ?? {}),
  };
}

async function parseJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchUsers(
  department?: string
): Promise<UserDTO[] | null> {
  const params = new URLSearchParams();
  if (department) {
    params.set("department", department);
  }
  const query = params.toString();

  const response = await fetch(`/api/users${query ? `?${query}` : ""}`, {
    headers: authHeaders(),
  }).catch(() => null);

  if (!response || !response.ok) {
    return null;
  }

  const data = await parseJson<{ users?: UserDTO[] }>(response);
  return data?.users ?? null;
}

export async function fetchUser(id: string): Promise<UserDTO | null> {
  const response = await fetch(`/api/users/${encodeURIComponent(id)}`, {
    headers: authHeaders(),
  }).catch(() => null);

  if (!response || !response.ok) {
    return null;
  }

  const data = await parseJson<{ user?: UserDTO }>(response);
  return data?.user ?? null;
}

export type DepartmentDTO = {
  id: string;
  name: string;
};

export type UpdateUserFieldResult = {
  ok: boolean;
  status?: number;
  error?: string;
};

export async function updateUserField(
  id: string,
  field: "status" | "role",
  value: string
): Promise<UpdateUserFieldResult> {
  const response = await fetch(`/api/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ field, value }),
  }).catch(() => null);

  if (!response) {
    return { ok: false, error: "تعذر الاتصال بالخادم. حاول مرة أخرى." };
  }

  const data = await parseJson<{ ok?: boolean; error?: string }>(response);

  if (!response.ok || !data?.ok) {
    const fallback =
      response.status === 401
        ? "تعذر التحقق من الجلسة. أعد فتح التطبيق وحاول مجددًا."
        : response.status === 403
          ? "لا تملك صلاحية هذا التعديل."
          : response.status === 503
            ? "الخادم غير مهيأ. حاول لاحقًا."
            : "تعذر تحديث المستخدم.";
    return {
      ok: false,
      status: response.status,
      error: data?.error ?? fallback,
    };
  }

  return { ok: true, status: response.status };
};

export async function fetchDepartments(): Promise<DepartmentDTO[] | null> {
  const response = await fetch("/api/departments", {
    headers: authHeaders(),
  }).catch(() => null);

  if (!response || !response.ok) {
    return null;
  }

  const data = await parseJson<{ departments?: DepartmentDTO[] }>(response);
  return data?.departments ?? null;
}

export type AddMemberInput = {
  departmentId?: string | null;
  firstName?: string;
  fatherName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  role?: UserRole;
  status?: string;
  telegramId?: number | string | null;
  telegramUsername?: string | null;
};

export async function addMember(
  payload: AddMemberInput
): Promise<{
  member?: { id: string };
  linkCode?: string;
  expiresAt?: string;
  error?: string;
}> {
  const response = await fetch("/api/members", {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  }).catch(() => null);

  if (!response) {
    return { error: "تعذر الاتصال بالخادم. حاول مرة أخرى." };
  }

  const data = await parseJson<{
    member?: { id: string };
    linkCode?: string;
    expiresAt?: string;
    error?: string;
  }>(response);

  if (!response.ok || !data?.member) {
    return { error: data?.error ?? "تعذر إنشاء العضو." };
  }

  return data;
}

export async function linkAccount(
  code: string
): Promise<{ ok: boolean; userId?: string; error?: string }> {
  const response = await fetch("/api/auth/link", {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ code }),
  }).catch(() => null);

  if (!response) {
    return { ok: false, error: "تعذر الاتصال بالخادم. حاول مرة أخرى." };
  }

  const data = await parseJson<{ userId?: string; error?: string }>(response);

  if (!response.ok || !data?.userId) {
    return { ok: false, error: data?.error ?? "تعذر ربط الحساب." };
  }

  return { ok: true, userId: data.userId };
}

export type CompleteProfileInput = {
  firstName: string;
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
};

export type VolunteerAgreementDTO = {
  id: string;
  user_id: string;
  duration_months: number;
  signed_at: string;
  expires_at: string;
  agreement_version: string;
  status: "active" | "expired" | "renewed";
  is_renewal: boolean;
  notes?: string | null;
  users?: {
    first_name?: string;
    father_name?: string;
    last_name?: string;
    department_id?: string | null;
  };
};

export async function signAgreement(payload: {
  durationMonths: number;
  renew?: boolean;
}): Promise<{ ok: boolean; id?: string; error?: string; code?: string }> {
  const response = await fetch("/api/agreements", {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  }).catch(() => null);

  if (!response) {
    return { ok: false, error: "تعذر الاتصال بالخادم. حاول مرة أخرى." };
  }

  const data = await parseJson<{
    ok?: boolean;
    id?: string;
    error?: string;
    code?: string;
  }>(response);

  if (!response.ok || !data?.ok) {
    return {
      ok: false,
      error: data?.error ?? "تعذر حفظ الاتفاقية.",
      code: data?.code,
    };
  }

  return { ok: true, id: data.id };
}

export async function fetchMyAgreement(): Promise<{
  ok: boolean;
  agreement: VolunteerAgreementDTO | null;
  hasActive: boolean;
  error?: string;
}> {
  const response = await fetch("/api/agreements/me", {
    headers: authHeaders(),
  }).catch(() => null);

  if (!response) {
    return {
      ok: false,
      agreement: null,
      hasActive: false,
      error: "تعذر الاتصال بالخادم.",
    };
  }

  const data = await parseJson<{
    ok?: boolean;
    agreement?: VolunteerAgreementDTO | null;
    hasActive?: boolean;
    error?: string;
  }>(response);

  if (!response.ok || !data?.ok) {
    return {
      ok: false,
      agreement: null,
      hasActive: false,
      error: data?.error ?? "تعذر جلب بيانات الاتفاقية.",
    };
  }

  return {
    ok: true,
    agreement: data.agreement ?? null,
    hasActive: Boolean(data.hasActive),
  };
}

export async function fetchAgreements(
  userId?: string
): Promise<{ ok: boolean; agreements?: VolunteerAgreementDTO[]; error?: string }> {
  const url = userId
    ? `/api/agreements?userId=${encodeURIComponent(userId)}`
    : "/api/agreements";

  const response = await fetch(url, {
    headers: authHeaders(),
  }).catch(() => null);

  if (!response) {
    return { ok: false, error: "تعذر الاتصال بالخادم." };
  }

  const data = await parseJson<{
    ok?: boolean;
    agreements?: VolunteerAgreementDTO[];
    error?: string;
  }>(response);

  if (!response.ok || !data?.ok) {
    return {
      ok: false,
      agreements: [],
      error: data?.error ?? "تعذر جلب الاتفاقيات.",
    };
  }

  return { ok: true, agreements: data.agreements ?? [] };
}

export async function completeProfile(
  payload: CompleteProfileInput
): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch("/api/profile/complete", {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  }).catch(() => null);

  if (!response) {
    return { ok: false, error: "تعذر الاتصال بالخادم. حاول مرة أخرى." };
  }

  const data = await parseJson<{ ok?: boolean; error?: string }>(response);

  if (!response.ok || !data?.ok) {
    return { ok: false, error: data?.error ?? "تعذر حفظ بياناتك." };
  }

  return { ok: true };
}

export async function telegramAuth(
  initData: string
): Promise<{
  hasLinkedUser: boolean;
  userId?: string;
  error?: string;
  notLinked?: boolean;
}> {
  const response = await fetch("/api/auth/telegram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData }),
  }).catch(() => null);

  if (!response) {
    return { hasLinkedUser: false, error: "تعذر الاتصال بخادم التطبيق." };
  }

  const data = await parseJson<{
    hasLinkedUser?: boolean;
    userId?: string;
    error?: string;
  }>(response);

  if (response.status === 503) {
    return { hasLinkedUser: false };
  }

  // 404 = هوية Telegram موثقة لكنها غير مرتبطة بأي عضو بعد.
  if (response.status === 404) {
    return { hasLinkedUser: false, notLinked: true };
  }

  if (!response.ok || !data?.hasLinkedUser || !data.userId) {
    return { hasLinkedUser: false, error: data?.error ?? "غير مرتبط" };
  }

  return { hasLinkedUser: true, userId: data.userId };
}

export type HoursLogDTO = {
  id: string | number;
  user_id: string;
  task_id: string | null;
  department_id: string | null;
  submitted_hours: number;
  approved_hours: number | null;
  date: string;
  description: string;
  status: "in_review" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  is_self_approved: boolean;
  created_at?: string;
  updated_at?: string;
};

export type SubmitHoursInput = {
  hours: number;
  date: string;
  description?: string;
  taskId?: string | null;
};

export type UpdateHoursInput = {
  hours?: number;
  date?: string;
  description?: string;
  taskId?: string | null;
};

export async function fetchMyHours(): Promise<{
  ok: boolean;
  hours: HoursLogDTO[];
  error?: string;
}> {
  const response = await fetch("/api/hours", {
    headers: authHeaders(),
  }).catch(() => null);

  if (!response) {
    return {
      ok: false,
      hours: [],
      error: "تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.",
    };
  }

  const data = await parseJson<{
    ok?: boolean;
    hours?: HoursLogDTO[];
    error?: string;
  }>(response);

  if (!response.ok || !data?.ok) {
    return {
      ok: false,
      hours: [],
      error: data?.error ?? "تعذر جلب سجل الساعات.",
    };
  }

  return { ok: true, hours: data.hours ?? [] };
}

export async function submitHours(
  payload: SubmitHoursInput
): Promise<{ ok: boolean; hour?: HoursLogDTO; error?: string }> {
  const response = await fetch("/api/hours", {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  }).catch(() => null);

  if (!response) {
    return {
      ok: false,
      error: "تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.",
    };
  }

  const data = await parseJson<{
    ok?: boolean;
    hour?: HoursLogDTO;
    error?: string;
  }>(response);

  if (!response.ok || !data?.ok) {
    return { ok: false, error: data?.error ?? "تعذر تسجيل الساعات." };
  }

  return { ok: true, hour: data.hour };
}

export async function updateHours(
  id: string | number,
  payload: UpdateHoursInput
): Promise<{ ok: boolean; hour?: HoursLogDTO; error?: string }> {
  const response = await fetch(`/api/hours/${encodeURIComponent(String(id))}`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  }).catch(() => null);

  if (!response) {
    return {
      ok: false,
      error: "تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.",
    };
  }

  const data = await parseJson<{
    ok?: boolean;
    hour?: HoursLogDTO;
    error?: string;
  }>(response);

  if (!response.ok || !data?.ok) {
    return { ok: false, error: data?.error ?? "تعذر تعديل السجل." };
  }

  return { ok: true, hour: data.hour };
}

export type CertificateRequestType =
  | "volunteer"
  | "participation"
  | "expertise"
  | "recommendation_letter";

export type CertificateRequestStatus =
  | "in_review"
  | "pending_approval"
  | "issued"
  | "rejected";

export const CERTIFICATE_TYPE_TO_ARABIC: Record<string, string> = {
  volunteer: "شهادة التطوع",
  participation: "شهادة المشاركة",
  expertise: "شهادة الخبرة",
  recommendation_letter: "خطاب توصية",
};

export const CERTIFICATE_TYPE_FROM_ARABIC: Record<string, CertificateRequestType> = {
  "شهادة التطوع": "volunteer",
  "شهادة المشاركة": "participation",
  "شهادة الخبرة": "expertise",
  "خطاب توصية": "recommendation_letter",
};

export const CERTIFICATE_STATUS_TO_ARABIC: Record<string, string> = {
  in_review: "قيد المراجعة",
  pending_approval: "بانتظار الاعتماد",
  issued: "صادرة",
  rejected: "مرفوضة",
};

export const CERTIFICATE_STATUS_FROM_ARABIC: Record<string, CertificateRequestStatus> = {
  "قيد المراجعة": "in_review",
  "بانتظار الاعتماد": "pending_approval",
  "صادرة": "issued",
  "مرفوضة": "rejected",
};

export type CertificateRequestDTO = {
  id: string;
  user_id: string;
  type: CertificateRequestType;
  status: CertificateRequestStatus;
  hours: number;
  volunteer_period: string;
  department_id?: string | null;
  department_head_id?: string | null;
  evaluation?: string | null;
  notes?: string | null;
  request_date: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  issued_at?: string | null;
  issue_file_url?: string | null;
  created_at: string;
  user?: {
    id: string;
    first_name: string;
    last_name: string | null;
    department_id?: string | null;
  } | null;
  department?: {
    id: string;
    name: string;
  } | null;
  reviewer?: {
    id: string;
    first_name: string;
    last_name: string | null;
  } | null;
};

export async function fetchCertificateRequests(options?: {
  mine?: boolean;
}): Promise<{ ok: boolean; requests: CertificateRequestDTO[]; error?: string }> {
  const query = options?.mine ? "?mine=true" : "";
  const response = await fetch(`/api/certificate-requests${query}`, {
    headers: authHeaders(),
  }).catch(() => null);

  if (!response) {
    return {
      ok: false,
      requests: [],
      error: "تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.",
    };
  }

  const data = await parseJson<{
    ok?: boolean;
    requests?: CertificateRequestDTO[];
    error?: string;
  }>(response);

  if (!response.ok || !data?.ok) {
    return {
      ok: false,
      requests: [],
      error: data?.error ?? "تعذر جلب طلبات الشهادات.",
    };
  }

  return { ok: true, requests: data.requests ?? [] };
}

export async function submitCertificateRequest(payload: {
  type: CertificateRequestType | string;
  notes?: string;
  evaluation?: string;
}): Promise<{ ok: boolean; request?: CertificateRequestDTO; error?: string }> {
  const backendType =
    CERTIFICATE_TYPE_FROM_ARABIC[payload.type] ?? payload.type;

  const response = await fetch("/api/certificate-requests", {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ ...payload, type: backendType }),
  }).catch(() => null);

  if (!response) {
    return {
      ok: false,
      error: "تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.",
    };
  }

  const data = await parseJson<{
    ok?: boolean;
    request?: CertificateRequestDTO;
    error?: string;
  }>(response);

  if (!response.ok || !data?.ok) {
    return {
      ok: false,
      error: data?.error ?? "تعذر إرسال الطلب.",
    };
  }

  return { ok: true, request: data.request };
}

export async function updateCertificateRequest(
  id: string,
  payload: {
    status: CertificateRequestStatus | string;
    notes?: string;
    evaluation?: string;
    issueFileUrl?: string;
  }
): Promise<{ ok: boolean; request?: CertificateRequestDTO; error?: string }> {
  const backendStatus =
    CERTIFICATE_STATUS_FROM_ARABIC[payload.status] ?? payload.status;

  const response = await fetch(
    `/api/certificate-requests/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ ...payload, status: backendStatus }),
    }
  ).catch(() => null);

  if (!response) {
    return {
      ok: false,
      error: "تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.",
    };
  }

  const data = await parseJson<{
    ok?: boolean;
    request?: CertificateRequestDTO;
    error?: string;
  }>(response);

  if (!response.ok || !data?.ok) {
    return {
      ok: false,
      error: data?.error ?? "تعذر تحديث حالة الطلب.",
    };
  }

  return { ok: true, request: data.request };
}

export type TaskDTO = {
  id: string | number;
  title: string;
  description: string | null;
  status: string;
  target_type: string;
  target_user_id: string | null;
  assigned_to: string | null;
  created_by: string;
  department_id: string | null;
  requested_hours: number | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
};

export async function fetchTasks(): Promise<{
  ok: boolean;
  tasks: TaskDTO[];
  error?: string;
}> {
  const response = await fetch("/api/tasks", {
    headers: authHeaders(),
  }).catch(() => null);

  if (!response) {
    return {
      ok: false,
      tasks: [],
      error: "تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.",
    };
  }

  const data = await parseJson<{
    ok?: boolean;
    tasks?: TaskDTO[];
    error?: string;
  }>(response);

  if (!response.ok || !data?.ok) {
    return {
      ok: false,
      tasks: [],
      error: data?.error ?? "تعذر جلب قائمة المهام.",
    };
  }

  return { ok: true, tasks: data.tasks ?? [] };
}

