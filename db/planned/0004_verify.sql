-- =============================================================================
-- مُلَم — استعلامات التحقق من دوال سحب وإلغاء المهام (REVIEW & VERIFY ONLY)
-- مسار: db/planned/0004_verify.sql
-- الغرض: استعلامات قراءة فقط للتحقق من نجاح تطبيق خطة الترحيل 0004_task_release_cancel.sql:
--         1. التحقق من وجود دالتي release_task_assignment و cancel_task.
--         2. التحقق من تعريف الدوال (SECURITY DEFINER و search_path و المعاملات).
--         3. التحقق من حصر صلاحيات التنفيذ بـ service_role وسحبها من anon و authenticated و PUBLIC.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. فحص وجود الدالتين وخصائص الأمان (SECURITY DEFINER و search_path):
-- -----------------------------------------------------------------------------
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS return_type,
  p.prosecdef AS is_security_definer,
  p.proconfig AS configuration_settings
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('release_task_assignment', 'cancel_task')
ORDER BY p.proname;

-- -----------------------------------------------------------------------------
-- 2. فحص صلاحيات تنفيذ الدالتين:
-- المتوقع:
--   service_role_allowed: true
--   anon_allowed: false
--   authenticated_allowed: false
--   public_allowed: false
-- -----------------------------------------------------------------------------
SELECT
  p.proname AS function_name,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_allowed,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_allowed,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_allowed,
  has_function_privilege('public', p.oid, 'EXECUTE') AS public_allowed
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('release_task_assignment', 'cancel_task')
ORDER BY p.proname;

-- -----------------------------------------------------------------------------
-- 3. فحص تعليقات التوثيق على الدالتين:
-- -----------------------------------------------------------------------------
SELECT
  p.proname AS function_name,
  d.description AS function_comment
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
LEFT JOIN pg_description d ON d.objoid = p.oid
WHERE n.nspname = 'public'
  AND p.proname IN ('release_task_assignment', 'cancel_task')
ORDER BY p.proname;
