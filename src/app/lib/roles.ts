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

/**
 * قواعد صلاحيات المسارات والصفحات في المنصة:
 * تحدد الرتب المسموح لها بالدخول لكل مسار.
 */
export const ROUTE_ACCESS_RULES: Record<string, UserRole[]> = {
  // صفحات إدارة النظام العليا
  "/roles": ["SUPER_ADMIN"],
  "/settings": ["SUPER_ADMIN"],
  "/audit-log": ["SUPER_ADMIN"],

  // صفحات الإدارة العامة
  "/dashboard": ["ADMIN", "SUPER_ADMIN"],
  "/admin": ["ADMIN", "SUPER_ADMIN"],
  "/departments": ["ADMIN", "SUPER_ADMIN"],
  "/announcements": ["ADMIN", "SUPER_ADMIN"],

  // صفحات الموارد البشرية
  "/hr": ["HR", "SUPER_ADMIN"],
  "/volunteers": ["HR", "ADMIN", "SUPER_ADMIN"],
  "/agreements": ["HR", "ADMIN", "SUPER_ADMIN"],
  "/certificate-requests": ["HR", "SUPER_ADMIN"],
  "/invitations": ["HR", "ADMIN", "SUPER_ADMIN"],

  // صفحات مراجعة الساعات والمهام
  "/task-review": ["DEPARTMENT_HEAD", "HR", "ADMIN", "SUPER_ADMIN"],
  "/hours-review": ["DEPARTMENT_HEAD", "HR", "ADMIN", "SUPER_ADMIN"],

  // صفحات مشتركة أو مخصصة
  "/reports": ["HR", "ADMIN", "SUPER_ADMIN"],
  "/add-task": ["VOLUNTEER", "DEPARTMENT_HEAD", "HR", "ADMIN", "SUPER_ADMIN"],
  "/tasks": ["VOLUNTEER", "DEPARTMENT_HEAD", "HR", "ADMIN", "SUPER_ADMIN"],
  "/hours": ["VOLUNTEER", "DEPARTMENT_HEAD", "HR", "ADMIN", "SUPER_ADMIN"],
  "/department": ["VOLUNTEER", "DEPARTMENT_HEAD", "HR", "ADMIN", "SUPER_ADMIN"],
  "/certificates": ["VOLUNTEER", "DEPARTMENT_HEAD", "HR", "ADMIN", "SUPER_ADMIN"],
  "/agreement": ["VOLUNTEER", "DEPARTMENT_HEAD", "HR", "ADMIN", "SUPER_ADMIN"],
  "/account": ["VOLUNTEER", "DEPARTMENT_HEAD", "HR", "ADMIN", "SUPER_ADMIN"],
  "/notifications": ["VOLUNTEER", "DEPARTMENT_HEAD", "HR", "ADMIN", "SUPER_ADMIN"],
};

export function canAccessRoute(role: UserRole, pathname: string): boolean {
  // تطبيع المسار
  const cleanPath = pathname.split("?")[0].replace(/\/$/, "") || "/";

  // الصفحات العامة المفتوحة للجميع
  if (
    [
      "/",
      "/link",
      "/register",
      "/join",
      "/welcome",
      "/workflow",
      "/structure",
      "/suggestions",
      "/complete-profile",
    ].includes(cleanPath)
  ) {
    return true;
  }

  const allowedRoles = ROUTE_ACCESS_RULES[cleanPath];
  if (!allowedRoles) {
    // إذا لم يكن المسار مسجلاً في القيود، يكون متاحاً افتراضياً
    return true;
  }

  return allowedRoles.includes(role);
}

