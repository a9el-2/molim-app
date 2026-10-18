export type UserRole =
  | "VOLUNTEER"
  | "DEPARTMENT_HEAD"
  | "HR"
  | "ADMIN"
  | "SUPER_ADMIN";

export const ROLE_NAMES: Record<UserRole, string> = {
  VOLUNTEER: "متطوع",
  DEPARTMENT_HEAD: "رئيس قسم",
  HR: "الموارد البشرية",
  ADMIN: "الإدارة العليا",
  SUPER_ADMIN: "الرئيس العام",
};

export const PERMISSIONS = {
  VOLUNTEER: [
    "view_own_tasks",
    "add_task",
    "view_own_hours",
    "view_own_department",
    "view_notifications",
  ],

  DEPARTMENT_HEAD: [
    "view_own_tasks",
    "add_task",
    "view_own_hours",
    "view_own_department",
    "view_department_members",
    "view_department_tasks",
    "review_department_tasks",
    "edit_department_hours",
    "view_department_stats",
    "view_notifications",
  ],

  HR: [
    "view_all_volunteers",
    "view_all_departments",
    "view_all_tasks",
    "view_all_hours",
    "view_reports",
    "view_notifications",
  ],

  ADMIN: [
    "view_all_volunteers",
    "view_all_departments",
    "view_all_tasks",
    "view_all_hours",
    "view_pending_tasks",
    "view_task_reviewer",
    "view_department_stats",
    "view_reports",
    "view_notifications",
  ],

  SUPER_ADMIN: [
    "view_all_volunteers",
    "view_all_departments",
    "view_all_tasks",
    "view_all_hours",
    "view_pending_tasks",
    "view_task_reviewer",
    "view_department_stats",
    "view_reports",
    "manage_volunteers",
    "manage_departments",
    "manage_roles",
    "manage_hr",
    "view_audit_log",
    "manage_system",
    "view_notifications",
  ],
} as const;

export const DISABLED_ROUTES: readonly string[] = [
  "/dashboard",
  "/reports",
  "/agreements",
  "/announcements",
  "/certificate-requests",
  "/notifications",
  "/departments",
  "/department",
  "/certificates",
  "/agreement",
  "/settings",
  "/hr",
  "/task-review",
];

/**
 * قواعد صلاحيات المسارات والصفحات في المنصة:
 * تحدد الرتب المسموح لها بالدخول لكل مسار.
 */
export const ROUTE_ACCESS_RULES: Record<string, UserRole[]> = {
  // صفحات إدارة النظام العليا
  "/roles": ["SUPER_ADMIN"],
  "/audit-log": ["SUPER_ADMIN"],

  // صفحات الموارد البشرية وإدارة الأعضاء
  "/volunteers": ["HR", "ADMIN", "SUPER_ADMIN"],
  "/invitations": ["HR", "ADMIN", "SUPER_ADMIN"],

  // صفحات مراجعة الساعات والمهام
  "/hours-review": ["DEPARTMENT_HEAD", "HR", "ADMIN", "SUPER_ADMIN"],

  // صفحات مشتركة أو مخصصة
  "/add-task": ["VOLUNTEER", "DEPARTMENT_HEAD", "HR", "ADMIN", "SUPER_ADMIN"],
  "/tasks": ["VOLUNTEER", "DEPARTMENT_HEAD", "HR", "ADMIN", "SUPER_ADMIN"],
  "/hours": ["VOLUNTEER", "DEPARTMENT_HEAD", "HR", "ADMIN", "SUPER_ADMIN"],
  "/account": ["VOLUNTEER", "DEPARTMENT_HEAD", "HR", "ADMIN", "SUPER_ADMIN"],
  "/profile": ["VOLUNTEER", "DEPARTMENT_HEAD", "HR", "ADMIN", "SUPER_ADMIN"],
};

/**
 * المسارات العامة التي لا تحتاج تسجيل دخول أو تحقق دور.
 * أي مسار ليس هنا وليس في ROUTE_ACCESS_RULES يُرفض افتراضياً (Fail-Closed).
 */
export const PUBLIC_ROUTES: readonly string[] = [
  "/",
  "/link",
  "/join",
  "/complete-profile",
];

export function canAccessRoute(role: UserRole, pathname: string): boolean {
  // تطبيع المسار
  const cleanPath = pathname.split("?")[0].replace(/\/$/, "") || "/";

  // المسارات المعطلة تُرفض قطعياً لكافة الأدوار بما فيها SUPER_ADMIN
  if (DISABLED_ROUTES.includes(cleanPath)) {
    return false;
  }

  // الصفحات العامة المفتوحة للجميع
  if (PUBLIC_ROUTES.includes(cleanPath)) {
    return true;
  }

  const allowedRoles = ROUTE_ACCESS_RULES[cleanPath];
  if (!allowedRoles) {
    // Fail-Closed: أي مسار غير مسجّل يُرفض افتراضياً
    return false;
  }

  return allowedRoles.includes(role);
}

