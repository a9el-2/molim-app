-- =============================================================================
-- مُلَم — خطة ترحيل مقترحة (REVIEW ONLY) — لا تُنفّذ تلقائيًا
-- مسار: db/planned/0002b_hours_tasks_audit_rules.sql
-- الغرض:
--   1. إضافة عمود الاعتماد الذاتي (is_self_approved) لجدول ساعات التطوع (hours_logs).
--   2. استبدال قيدي الساعات القائمين (hours_logs_submitted_hours_check و
--      hours_logs_approved_hours_check) اللذين كانا بتعريفين ضعيفين (submitted_hours > 0 و
--      approved_hours IS NULL OR approved_hours >= 0)، واستبدالهما بقيدين صارمين يفرضان
--      النطاق (0.25-24 و 0-24) ومضاعفات الربع ساعة (0.25).
--   3. إضافة قيد التحقق من ملاحظات المراجعة (hours_logs_review_notes_check) الذي يلزم بـ:
--      - أن تكون approved_hours غير NULL عند اعتماد الساعات (status = 'approved').
--      - وجود ملاحظات مراجعة غير فارغة عند اختلاف الساعات المعتمدة عن المقدمة.
--      - وجود ملاحظات مراجعة غير فارغة عند رفض الطلب (status = 'rejected').
--   4. بناء الفهارس الأساسية لتحسين أداء الاستعلامات على جداول hours_logs و tasks و audit_logs.
-- الحالة: مسودة مراجعة جاهزة للاختبار على بيئة PostgreSQL 15+ تجريبية منفصلة.
--
-- ملاحظة معمارية:
--   مشغّل حماية جدول سجل التدقيق (Append-Only Trigger) تم فصله في الملف التالي:
--   0002c_audit_append_only_trigger.sql لتطبيقه قبل الإطلاق المباشر مباشرة.
--
-- قواعد وسياسات التصميم:
--   - استبدال القيود يتم عبر ALTER TABLE ... DROP CONSTRAINT IF EXISTS متبوعاً بـ ADD CONSTRAINT،
--     وهو إجراء آمن تماماً لأن الجدول فارغ، ويضمن تحديث التعريفات حتى لو كان الاسم مستخدماً سابقاً.
--   - كل العمليات قابلة لإعادة التشغيل بأمان (Idempotent).
--   - قيد "التاريخ ليس مستقبلياً" لم يُضمّن عمداً في قاعدة البيانات؛ ليعتمد على توقيت الخادم
--     ومنطقة زمنية التطبيق في الكود البرمجي (src/app/lib/hours-policy.ts).
--   - لا تعديل على RLS ولا إضافة سياسات أمنية (تبقى مفعلة بدون سياسات كما هي).
--   - المعاملة بالكامل محاطة بـ BEGIN و COMMIT لضمان الذرية.
--
-- تعليمات التراجع (Rollback):
--   في حال الرغبة في التراجع واستعادة الحالة السابقة وقيدي الساعات القديمين:
--
--   BEGIN;
--     -- 1. إسقاط الفهارس المنشأة
--     DROP INDEX IF EXISTS public.hours_logs_user_id_date_idx;
--     DROP INDEX IF EXISTS public.hours_logs_department_id_status_idx;
--     DROP INDEX IF EXISTS public.hours_logs_status_idx;
--     DROP INDEX IF EXISTS public.tasks_department_id_status_idx;
--     DROP INDEX IF EXISTS public.tasks_created_by_idx;
--     DROP INDEX IF EXISTS public.audit_logs_created_at_desc_idx;
--     DROP INDEX IF EXISTS public.audit_logs_target_user_id_idx;
--
--     -- 2. إسقاط القيود الجديدة
--     ALTER TABLE public.hours_logs DROP CONSTRAINT IF EXISTS hours_logs_review_notes_check;
--     ALTER TABLE public.hours_logs DROP CONSTRAINT IF EXISTS hours_logs_submitted_hours_check;
--     ALTER TABLE public.hours_logs DROP CONSTRAINT IF EXISTS hours_logs_approved_hours_check;
--
--     -- 3. إعادة القيدين القديمين بتعريفاتهما السابقة
--     ALTER TABLE public.hours_logs
--       ADD CONSTRAINT hours_logs_submitted_hours_check
--       CHECK (submitted_hours > 0);
--
--     ALTER TABLE public.hours_logs
--       ADD CONSTRAINT hours_logs_approved_hours_check
--       CHECK (approved_hours IS NULL OR approved_hours >= 0);
--
--     -- 4. إسقاط عمود is_self_approved (إن لم تكن هناك بيانات جديدة تعتمد عليه)
--     ALTER TABLE public.hours_logs DROP COLUMN IF EXISTS is_self_approved;
--   COMMIT;
-- =============================================================================

-- =============================================================================
-- 0) فحوصات ما قبل الترحيل (قراءة فقط — للتأكد اليدوي قبل التنفيذ)
-- =============================================================================
-- SELECT table_name, column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name IN ('hours_logs', 'tasks', 'audit_logs')
-- ORDER BY table_name, ordinal_position;

-- =============================================================================
-- 1) بدء المعاملة الذرية
-- =============================================================================
BEGIN;

-- -----------------------------------------------------------------------------
-- 1.1 فحص حارس: التحقق من وجود الجداول المستهدفة قبل الشروع في التعديل
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.hours_logs') IS NULL THEN
    RAISE EXCEPTION 'الجدول public.hours_logs غير موجود — أوقف الترحيل للمراجعة';
  END IF;

  IF to_regclass('public.tasks') IS NULL THEN
    RAISE EXCEPTION 'الجدول public.tasks غير موجود — أوقف الترحيل للمراجعة';
  END IF;

  IF to_regclass('public.audit_logs') IS NULL THEN
    RAISE EXCEPTION 'الجدول public.audit_logs غير موجود — أوقف الترحيل للمراجعة';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1.2 إضافة عمود is_self_approved إلى جدول hours_logs
--     يشير إلى ما إذا كان السجل قد اعتُمد تلقائياً للرئيس العام لعدم وجود رئيس عام آخر.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'hours_logs'
      AND column_name = 'is_self_approved'
  ) THEN
    ALTER TABLE public.hours_logs
      ADD COLUMN is_self_approved boolean NOT NULL DEFAULT false;

    COMMENT ON COLUMN public.hours_logs.is_self_approved IS
      'علامة تفيد باعتماد الساعات ذاتياً وتلقائياً لحساب الرئيس العام عند عدم وجود رئيس عام آخر نشط.';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1.3 استبدال قيد CHECK: الساعات المقدمة (submitted_hours)
--     - إسقاط القيد القديم الضعيف (submitted_hours > 0) إن وُجد.
--     - إضافة القيد الجديد الصارم:
--         * إجبارية القيمة (NOT NULL).
--         * القيمة محصورة بين 0.25 و 24 ساعة.
--         * القيمة مضاعف دقيق للرقم 0.25 (خطوات ربع ساعة: % 0.25 = 0).
-- -----------------------------------------------------------------------------
ALTER TABLE public.hours_logs
  DROP CONSTRAINT IF EXISTS hours_logs_submitted_hours_check;

ALTER TABLE public.hours_logs
  ADD CONSTRAINT hours_logs_submitted_hours_check
  CHECK (
    submitted_hours IS NOT NULL
    AND submitted_hours >= 0.25
    AND submitted_hours <= 24
    AND (submitted_hours % 0.25 = 0)
  );

-- -----------------------------------------------------------------------------
-- 1.4 استبدال قيد CHECK: الساعات المعتمدة (approved_hours)
--     - إسقاط القيد القديم الضعيف (approved_hours IS NULL OR approved_hours >= 0) إن وُجد.
--     - إضافة القيد الجديد الصارم:
--         * تقبل NULL في حال كان السجل قيد المراجعة (in_review).
--         * إذا حُددت قيمة (ليست NULL): يجب أن تكون بين 0 و 24 ومضاعف دقيق لـ 0.25.
-- -----------------------------------------------------------------------------
ALTER TABLE public.hours_logs
  DROP CONSTRAINT IF EXISTS hours_logs_approved_hours_check;

ALTER TABLE public.hours_logs
  ADD CONSTRAINT hours_logs_approved_hours_check
  CHECK (
    approved_hours IS NULL
    OR (
      approved_hours >= 0
      AND approved_hours <= 24
      AND (approved_hours % 0.25 = 0)
    )
  );

-- -----------------------------------------------------------------------------
-- 1.5 قيد CHECK: اشتراط الساعات المعتمدة وملاحظات المراجعة (review_notes)
--     - إسقاط أي قيد سابق بالاسم نفسه لضمان التحديث.
--     - إذا كانت الحالة approved فيجب أن تكون approved_hours غير NULL.
--     - إذا كانت الحالة approved واختلف approved_hours عن submitted_hours:
--       يلزم تقديم review_notes غير فارغ.
--     - إذا كانت الحالة rejected: يلزم تقديم review_notes غير فارغ.
-- -----------------------------------------------------------------------------
ALTER TABLE public.hours_logs
  DROP CONSTRAINT IF EXISTS hours_logs_review_notes_check;

ALTER TABLE public.hours_logs
  ADD CONSTRAINT hours_logs_review_notes_check
  CHECK (
    -- 1) إذا كانت الحالة approved، فيجب تحديد الساعات المعتمدة (ليست NULL)
    (
      status::text <> 'approved'
      OR approved_hours IS NOT NULL
    )
    AND
    -- 2) إذا اختلفت الساعات المعتمدة عن المقدمة عند الاعتماد، فيجب كتابة سبب
    (
      status::text <> 'approved'
      OR approved_hours IS NOT DISTINCT FROM submitted_hours
      OR (review_notes IS NOT NULL AND btrim(review_notes) <> '')
    )
    AND
    -- 3) إذا رُفض الطلب، فيجب كتابة سبب الرفض
    (
      status::text <> 'rejected'
      OR (review_notes IS NOT NULL AND btrim(review_notes) <> '')
    )
  );

-- -----------------------------------------------------------------------------
-- 1.6 الفهارس (Indexes): تسريع الاستعلامات والتصفية الأكثر تكراراً
-- -----------------------------------------------------------------------------

-- ساعات المتطوع وتواريخها (حساب مجموع ساعات اليوم وعرض التاريخ الشخصي)
CREATE INDEX IF NOT EXISTS hours_logs_user_id_date_idx
  ON public.hours_logs (user_id, date);

-- مراجعة ساعات القسم بحسب الحالة (شاشة رئيس القسم والاعتمادات)
CREATE INDEX IF NOT EXISTS hours_logs_department_id_status_idx
  ON public.hours_logs (department_id, status);

-- تصفية كافة الساعات بحسب الحالة عامةً (لوحة مسؤولي HR و Super Admin)
CREATE INDEX IF NOT EXISTS hours_logs_status_idx
  ON public.hours_logs (status);

-- مهام الأقسام وحالتها (عرض المهام النشطة أو المكتملة لكل قسم)
CREATE INDEX IF NOT EXISTS tasks_department_id_status_idx
  ON public.tasks (department_id, status);

-- المهام المنشأة بواسطة عضو محدد (متابعة المهام الخاصة)
CREATE INDEX IF NOT EXISTS tasks_created_by_idx
  ON public.tasks (created_by);

-- الترتيب الزمني لسجل التدقيق من الأحدث إلى الأقدم (لوحة التدقيق العامة)
CREATE INDEX IF NOT EXISTS audit_logs_created_at_desc_idx
  ON public.audit_logs (created_at DESC);

-- تتبع كافة العمليات والأنشطة المرتبطة بعضو مستهدف محدد
CREATE INDEX IF NOT EXISTS audit_logs_target_user_id_idx
  ON public.audit_logs (target_user_id);

-- =============================================================================
-- إنهاء وتثبيت المعاملة الذرية
-- =============================================================================
COMMIT;

-- =============================================================================
-- 2) فحوصات ما بعد الترحيل (قراءة فقط — للتأكد من نجاح التطبيق)
-- =============================================================================
-- -- 2.1 التحقق من العمود الجديد:
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'hours_logs' AND column_name = 'is_self_approved';
--
-- -- 2.2 التحقق من القيود المضافة:
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.hours_logs'::regclass
--   AND conname IN (
--     'hours_logs_submitted_hours_check',
--     'hours_logs_approved_hours_check',
--     'hours_logs_review_notes_check'
--   );
--
-- -- 2.3 التحقق من الفهارس:
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public'
--   AND indexname IN (
--     'hours_logs_user_id_date_idx',
--     'hours_logs_department_id_status_idx',
--     'hours_logs_status_idx',
--     'tasks_department_id_status_idx',
--     'tasks_created_by_idx',
--     'audit_logs_created_at_desc_idx',
--     'audit_logs_target_user_id_idx'
--   );
