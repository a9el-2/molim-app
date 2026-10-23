-- =============================================================================
-- مُلَم — استعلامات التحقق بعد ترحيل نظام المهام (REVIEW & VERIFY ONLY)
-- مسار: db/planned/0003_verify.sql
-- الغرض: استعلامات قراءة فقط للتحقق من نجاح تطبيق خطتي الترحيل 0003a و 0003b:
--         1. التحقق من وجود القيم الجديدة في تعداد audit_action.
--         2. التحقق من وجود الأعمدة الجديدة والقيود في جدول tasks.
--         3. التحقق من وجود الجدولين الجديدين (task_assignments و task_events).
--         4. التحقق من قيود التحقق (CHECK Constraints) ومطابقتها للقواعد.
--         5. التحقق من تفعيل أمان الصفوف (RLS) على الجداول الجديدة.
--         6. التحقق من حصر صلاحية تنفيذ الدوال بـ service_role وسحبها من anon و authenticated.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. فحص قيم تعداد audit_action المضافة في 0003a (يجب أن تظهر 7 قيم جديدة):
-- -----------------------------------------------------------------------------
SELECT
  e.enumlabel AS action_name,
  e.enumsortorder AS sort_order
FROM pg_enum e
JOIN pg_type t ON t.oid = e.enumtypid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
  AND t.typname = 'audit_action'
  AND e.enumlabel IN (
    'accept_task',
    'decline_task',
    'submit_task',
    'review_task',
    'withdraw_task',
    'cancel_task',
    'release_task'
  )
ORDER BY e.enumsortorder;

-- -----------------------------------------------------------------------------
-- 2. فحص الأعمدة المضافة لجدول tasks:
-- -----------------------------------------------------------------------------
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'tasks'
  AND column_name IN (
    'required_assignees',
    'priority',
    'lifecycle_status',
    'cancel_reason',
    'cancelled_by',
    'cancelled_at',
    'closed_at',
    'due_date'
  )
ORDER BY column_name;

-- -----------------------------------------------------------------------------
-- 3. فحص قيود التحقق (CHECK Constraints) على جدول tasks:
-- -----------------------------------------------------------------------------
SELECT
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.tasks'::regclass
  AND conname IN (
    'tasks_required_assignees_check',
    'tasks_priority_check',
    'tasks_lifecycle_status_check',
    'tasks_cancel_reason_check'
  )
ORDER BY conname;

-- -----------------------------------------------------------------------------
-- 4. فحص وجود الجدولين الجديدين task_assignments و task_events:
-- -----------------------------------------------------------------------------
SELECT
  table_name,
  table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('task_assignments', 'task_events')
ORDER BY table_name;

-- -----------------------------------------------------------------------------
-- 5. فحص قيود وفرضيات جدول task_assignments (تفرد، حالات، ساعات، وملاحظات):
-- -----------------------------------------------------------------------------
SELECT
  conname AS constraint_name,
  contype AS constraint_type,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.task_assignments'::regclass
ORDER BY conname;

-- -----------------------------------------------------------------------------
-- 6. فحص تفعيل أمان مستوى الصفوف (Row Level Security - RLS) على الجدولين:
-- (النتيجة يجب أن تكون true للجدولين)
-- -----------------------------------------------------------------------------
SELECT
  relname AS table_name,
  relrowsecurity AS rls_enabled,
  relforcerowsecurity AS rls_forced
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN ('task_assignments', 'task_events')
ORDER BY relname;

-- -----------------------------------------------------------------------------
-- 7. فحص الفهارس الأساسية على الجدولين وجدول المهام:
-- -----------------------------------------------------------------------------
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'task_assignments_user_id_status_idx',
    'task_assignments_task_id_status_idx',
    'tasks_lifecycle_status_idx',
    'task_events_task_id_idx',
    'task_events_assignment_id_idx'
  )
ORDER BY tablename, indexname;

-- -----------------------------------------------------------------------------
-- 8. فحص أمان وصلاحيات الدوال claim_task و review_task_assignment:
-- يجب أن يكون EXECUTE متاحاً لـ service_role فقط، ومسحوباً من PUBLIC و anon و authenticated.
-- -----------------------------------------------------------------------------
SELECT
  p.proname AS function_name,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_allowed,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_allowed,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_allowed
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN ('claim_task', 'review_task_assignment');
