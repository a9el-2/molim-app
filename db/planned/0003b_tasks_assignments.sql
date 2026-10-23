-- =============================================================================
-- مُلَم — خطة ترحيل مقترحة (REVIEW ONLY) — لا تُنفّذ تلقائيًا
-- مسار: db/planned/0003b_tasks_assignments.sql
-- الغرض: بناء المخطط الشامل لنظام تكليفات ومتابعة المهام الجديد:
--         1. ترقية جدول المهام القائم (tasks) بإضافة أعمدة دورة الحياة (lifecycle_status)،
--            والأولوية، والعدد المطلوب للمنفذين، وحقول الإلغاء، دون حذف أو تعديل أي عمود قائم.
--         2. إنشاء جدول تكليفات المهام (task_assignments) لتنظيم تسليم واستلام ومراجعة المهام
--            بين العضو والإدارة بدقة وذرّية كاملة.
--         3. إنشاء جدول أحداث المهام (task_events) كسجل تتبعي للأحداث (ملاحظة: منع التعديل والحذف UPDATE/DELETE غير مفعّل بعد).
--         4. تفعيل سياسات الأمان RLS وحصر الصلاحيات بالخادم (service_role).
--         5. توفير دالتي القبول (claim_task) والمراجعة (review_task_assignment) لتنفيذ
--            العمليات المعقدة ذرّياً داخل قاعدة البيانات مع تسجيل سجلات التدقيق (audit_logs).
-- الحالة: مسودة مراجعة جاهزة للاختبار على بيئة PostgreSQL 15+ تجريبية منفصلة.
-- الإصدار المتوقع: PostgreSQL 15+ (Supabase).
--
-- ملاحظة معمارية:
--   يعتمد هذا الملف على قيم التعداد audit_action المضافة في 0003a_task_audit_enum_values.sql.
--   يجب تطبيق 0003a أولاً قبل تشغيل هذا الملف.
-- =============================================================================

-- =============================================================================
-- 1) بدء المعاملة الذرية
-- =============================================================================
BEGIN;

-- -----------------------------------------------------------------------------
-- 1.1 فحص حارس: التحقق من وجود الجداول الأساسية
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.tasks') IS NULL THEN
    RAISE EXCEPTION 'الجدول public.tasks غير موجود — أوقف الترحيل للمراجعة';
  END IF;

  IF to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'الجدول public.users غير موجود — أوقف الترحيل للمراجعة';
  END IF;

  IF to_regclass('public.hours_logs') IS NULL THEN
    RAISE EXCEPTION 'الجدول public.hours_logs غير موجود — أوقف الترحيل للمراجعة';
  END IF;

  IF to_regclass('public.audit_logs') IS NULL THEN
    RAISE EXCEPTION 'الجدول public.audit_logs غير موجود — أوقف الترحيل للمراجعة';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1.2 ترقية جدول المهام (tasks) — إضافة الأعمدة الجديدة فقط (IF NOT EXISTS)
-- -----------------------------------------------------------------------------

-- عدد المنفذين المطلوبين للمهمة: NULL تعني بلا حد أقصى
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS required_assignees integer NULL;

-- أولوية المهمة: عادي (normal) أو عاجل (urgent)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal';

-- حالة دورة حياة المهمة الإدارية: مفتوحة (open)، مكتملة (completed)، ملغاة (cancelled)
-- استُخدم اسم lifecycle_status تحديداً حتى لا يتعارض مع عمود status القائم في الجدول
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'open';

-- سبب الإلغاء الإداري للمهمة
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS cancel_reason text NULL;

-- المسؤول الذي قام بإلغاء المهمة
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS cancelled_by text NULL;

-- تاريخ ووقت الإلغاء
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz NULL;

-- تاريخ ووقت إغلاق المهمة بعد اكتمالها
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS closed_at timestamptz NULL;

-- ربط مفتاح أجنبي cancelled_by بجدول users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tasks'::regclass
      AND conname = 'tasks_cancelled_by_fkey'
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_cancelled_by_fkey
      FOREIGN KEY (cancelled_by) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- تنبيه بخصوص حقل الموعد النهائي:
-- تم التحقق من الكود وقاعدة البيانات ووُجد أن حقل الموعد النهائي موجود مسبقاً في جدول tasks باسم `due_date` (نوعه date).
-- للحيطة البرمجية فقط نتحقق من وجوده:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'due_date'
  ) THEN
    ALTER TABLE public.tasks ADD COLUMN due_date date NULL;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1.3 قيود التحقق (CHECK Constraints) على جدول tasks
-- -----------------------------------------------------------------------------

-- قاعدة: عدد المنفذين المطلوبين إما فارغ (بلا حد) أو عدد صحيح موجب لا يقل عن 1
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_required_assignees_check;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_required_assignees_check
  CHECK (required_assignees IS NULL OR required_assignees >= 1);

-- قاعدة: أولوية المهمة محصورة بين normal و urgent
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_priority_check;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_priority_check
  CHECK (priority IN ('normal', 'urgent'));

-- قاعدة: حالة دورة حياة المهمة محصورة بين open و completed و cancelled
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_lifecycle_status_check;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_lifecycle_status_check
  CHECK (lifecycle_status IN ('open', 'completed', 'cancelled'));

-- قاعدة: عند إلغاء المهمة (lifecycle_status = 'cancelled') يجب توضيح سبب الإلغاء بطول لا يقل عن 10 أحرف بعد اقتطاع الفراغات
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_cancel_reason_check;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_cancel_reason_check
  CHECK (
    lifecycle_status <> 'cancelled'
    OR (cancel_reason IS NOT NULL AND length(btrim(cancel_reason)) >= 10)
  );

-- -----------------------------------------------------------------------------
-- 1.4 جدول تكليفات المهام الجديد: task_assignments
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.task_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.users(id),
  status text NOT NULL,
  offered_by text NULL REFERENCES public.users(id),
  accepted_at timestamptz NULL,
  submitted_at timestamptz NULL,
  reviewed_at timestamptz NULL,
  reviewed_by text NULL REFERENCES public.users(id),
  status_reason text NULL,
  review_notes text NULL,
  approved_hours numeric(4,2) NULL,
  hours_log_id uuid NULL REFERENCES public.hours_logs(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- تفرد التكليف: لا يمكن للعضو أن يملك أكثر من تكليف واحد على نفس المهمة
  CONSTRAINT task_assignments_task_user_unique UNIQUE (task_id, user_id),

  -- قاعدة: الحالات المسموحة لتكليف المهمة (9 حالات محددة بدقة)
  CONSTRAINT task_assignments_status_check CHECK (
    status IN (
      'offered',         -- مهمة موجهة لعضو بانتظار قبوله أو رفضه
      'in_progress',     -- قيد التنفيذ من قبل العضو
      'submitted',       -- تم تسليم الإنجاز وبانتظار مراجعة المسؤول
      'needs_revision',  -- تمت المراجعة وطُلب تعديل وإعادة تسليم
      'approved',        -- تم الاعتماد واحتساب الساعات
      'rejected_final',  -- رُفض التسليم نهائياً
      'declined',        -- اعتذر العضو عن المهمة الموجهة له
      'withdrawn',       -- انسحب العضو من المهمة بعد بدئها
      'released'         -- تم سحب المهمة من العضو إدارياً لتعثره
    )
  ),

  -- قاعدة: عند اتخاذ قرار سلبي (رفض، اعتذار، انسحاب، سحب، طلب تعديل) يجب توثيق السبب بطول لا يقل عن 10 أحرف
  CONSTRAINT task_assignments_status_reason_check CHECK (
    status NOT IN ('declined', 'withdrawn', 'released', 'needs_revision', 'rejected_final')
    OR (status_reason IS NOT NULL AND length(btrim(status_reason)) >= 10)
  ),

  -- قاعدة: عند اعتماد التكليف (approved) يجب تحديد الساعات المعتمدة وربط سجل ساعات التطوع المقابل (hours_log_id)
  CONSTRAINT task_assignments_approved_check CHECK (
    status <> 'approved'
    OR (approved_hours IS NOT NULL AND hours_log_id IS NOT NULL)
  ),

  -- قاعدة: الساعات المعتمدة للتكليف يجب أن تكون بين 0.25 و 24 وبخطوة مضاعفة لـ 0.25 (نفس قاعدة ساعات التطوع)
  CONSTRAINT task_assignments_approved_hours_range CHECK (
    approved_hours IS NULL
    OR (
      approved_hours >= 0.25
      AND approved_hours <= 24
      AND (approved_hours % 0.25 = 0)
    )
  )
);

COMMENT ON TABLE public.task_assignments IS
  'جدول تكليفات ومشاركات الأعضاء في المهام وحالة كل تكليف وساعاته المعتمدة.';

-- -----------------------------------------------------------------------------
-- 1.5 جدول سجل أحداث المهام: task_events (منع التعديل والحذف غير مفعّل بعد)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  assignment_id uuid NULL REFERENCES public.task_assignments(id) ON DELETE CASCADE,
  actor_id text NULL REFERENCES public.users(id),
  event_type text NOT NULL,
  reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.task_events IS
  'سجل أحداث زمني تاريخي لكل العمليات والتغييرات التي تطرأ على المهمة وتكليفاتها (منع التعديل والحذف غير مفعّل بعد).';

-- -----------------------------------------------------------------------------
-- 1.6 الفهارس (Indexes)
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS task_assignments_user_id_status_idx
  ON public.task_assignments (user_id, status);

CREATE INDEX IF NOT EXISTS task_assignments_task_id_status_idx
  ON public.task_assignments (task_id, status);

CREATE INDEX IF NOT EXISTS tasks_lifecycle_status_idx
  ON public.tasks (lifecycle_status);

CREATE INDEX IF NOT EXISTS task_events_task_id_idx
  ON public.task_events (task_id);

CREATE INDEX IF NOT EXISTS task_events_assignment_id_idx
  ON public.task_events (assignment_id);

-- -----------------------------------------------------------------------------
-- 1.7 سياسات الأمان وتحديد الصلاحيات (RLS & Grants)
-- -----------------------------------------------------------------------------
ALTER TABLE public.task_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_events ENABLE ROW LEVEL SECURITY;

-- سحب كافة الامتيازات من الأدوار العامة
REVOKE ALL ON TABLE public.task_assignments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.task_events FROM PUBLIC, anon, authenticated;

-- منح كامل الصلاحيات لدور خدمة الخادم service_role فقط (البوابة الوحيدة للنظام)
GRANT ALL ON TABLE public.task_assignments TO service_role;
GRANT ALL ON TABLE public.task_events TO service_role;

-- -----------------------------------------------------------------------------
-- 1.8 الدالة 1: claim_task(p_task_id, p_user_id)
--     قبول العضو للمهمة وبدء تنفيذها
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_task(
  p_task_id uuid,
  p_user_id text
)
RETURNS public.task_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  -- الحد الأقصى للمهام النشطة للعضو الواحد في نفس الوقت
  c_max_active_tasks CONSTANT integer := 3;

  v_task               public.tasks%ROWTYPE;
  v_user               public.users%ROWTYPE;
  v_assignment         public.task_assignments%ROWTYPE;
  v_result_assignment  public.task_assignments%ROWTYPE;
  v_task_active_count  integer;
  v_user_active_count  integer;
BEGIN
  -- قفل استشاري على مستوى المعاملة لحساب المستخدم لضمان سلامة حد الـ 3 مهام النشطة ومنع التزاحم والتسابق بين عمليتي قبول متزامنتين لنفس العضو على مهمتين مختلفتين
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id));

  -- 1. قفل صف المهمة في جدول tasks لمنع التسابق
  SELECT * INTO v_task
  FROM public.tasks
  WHERE id = p_task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TASK_NOT_FOUND: المهمة المطلوبة غير موجودة'
      USING ERRCODE = 'P0002';
  END IF;

  -- 2. التحقق من أن دورة حياة المهمة مفتوحة
  IF v_task.lifecycle_status <> 'open' THEN
    RAISE EXCEPTION 'TASK_NOT_OPEN: المهمة ليست مفتوحة للقبول (حالتها: %)', v_task.lifecycle_status
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. قراءة بيانات العضو
  SELECT * INTO v_user
  FROM public.users
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: المستخدم غير موجود'
      USING ERRCODE = 'P0002';
  END IF;

  -- 4. فحص السجل السابق للعضو في هذه المهمة مع القفل
  SELECT * INTO v_assignment
  FROM public.task_assignments
  WHERE task_id = p_task_id AND user_id = p_user_id
  FOR UPDATE;

  IF FOUND AND v_assignment.status <> 'offered' THEN
    RAISE EXCEPTION 'ALREADY_ASSIGNED: لدى العضو سجل سابق في هذه المهمة بحالة %', v_assignment.status
      USING ERRCODE = 'P0001';
  END IF;

  -- 5. فحص الأهلية والاستحقاق (Eligibility):
  -- إذا كان للعضو سجل عرض (offered) موجه له، فهو مؤهل مباشرة للقبول.
  IF v_assignment.id IS NULL THEN
    -- فحص المهمة الشخصية (self): محصورة بالمنشئ فقط
    IF v_task.target_type::text = 'self' AND v_task.created_by <> p_user_id AND coalesce(v_task.target_user_id, '') <> p_user_id THEN
      RAISE EXCEPTION 'NOT_ELIGIBLE: هذه المهمة شخصية وخاصة بعضو آخر'
        USING ERRCODE = 'P0001';
    END IF;

    -- فحص المهمة الموجهة لشخص بعينه (person)
    IF v_task.target_type::text = 'person' AND v_task.target_user_id IS NOT NULL AND v_task.target_user_id <> p_user_id THEN
      RAISE EXCEPTION 'NOT_ELIGIBLE: هذه المهمة موجهة لعضو محدد آخر'
        USING ERRCODE = 'P0001';
    END IF;

    -- فحص توافق القسم (حسب طريقة تخزين الأقسام المكتشفة في النظام):
    -- أ) مهمة موجهة لقسم واحد (department)
    IF v_task.target_type::text = 'department' THEN
      IF v_user.department_id IS NULL OR (
        (v_task.department_id IS NULL OR v_user.department_id <> v_task.department_id)
        AND NOT (v_task.target_department_ids IS NOT NULL AND v_task.target_department_ids @> to_jsonb(v_user.department_id::text))
      ) THEN
        RAISE EXCEPTION 'NOT_ELIGIBLE: العضو لا ينتمي لقسم هذه المهمة'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;

    -- ب) مهمة موجهة لعدة أقسام (multiple_departments)
    IF v_task.target_type::text = 'multiple_departments' THEN
      IF v_user.department_id IS NULL OR NOT (
        v_task.target_department_ids IS NOT NULL AND v_task.target_department_ids @> to_jsonb(v_user.department_id::text)
      ) THEN
        RAISE EXCEPTION 'NOT_ELIGIBLE: العضو لا ينتمي لأي من الأقسام المحددة لهذه المهمة'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;

    -- ج) مهمة عامة لجميع الأقسام (all_departments): متاحة لأي عضو نشط
    IF v_task.target_type::text = 'all_departments' THEN
      IF lower(coalesce(v_user.status, '')) <> 'active' THEN
        RAISE EXCEPTION 'NOT_ELIGIBLE: العضو غير نشط للمشاركة في المهام العامة'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;

    -- د) مهمة موجهة للإدارة العليا (upper_management): محصورة بأدوار الإدارة العليا النشطة (ADMIN و SUPER_ADMIN)
    IF v_task.target_type::text = 'upper_management' THEN
      IF v_user.role NOT IN ('ADMIN', 'SUPER_ADMIN') OR lower(coalesce(v_user.status, '')) <> 'active' THEN
        RAISE EXCEPTION 'NOT_ELIGIBLE: هذه المهمة موجهة للإدارة العليا فقط'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  -- 6. فحص اكتمال العدد المطلوب للمهمة (required_assignees)
  IF v_task.required_assignees IS NOT NULL THEN
    SELECT count(*) INTO v_task_active_count
    FROM public.task_assignments
    WHERE task_id = p_task_id
      AND status IN ('in_progress', 'submitted', 'needs_revision', 'approved');

    IF v_task_active_count >= v_task.required_assignees THEN
      RAISE EXCEPTION 'TASK_FULL: اكتمل العدد المطلوب للمهمة (الحد: %)', v_task.required_assignees
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 7. فحص الحد الأقصى للمهام النشطة للعضو (ACTIVE_LIMIT: 3 مهام)
  SELECT count(*) INTO v_user_active_count
  FROM public.task_assignments
  WHERE user_id = p_user_id
    AND status IN ('in_progress', 'needs_revision');

  IF v_user_active_count >= c_max_active_tasks THEN
    RAISE EXCEPTION 'ACTIVE_LIMIT: بلغ العضو الحد الأقصى للمهام النشطة (% مهام)', c_max_active_tasks
      USING ERRCODE = 'P0001';
  END IF;

  -- 8. تحديث سجل العرض القائم أو إنشاء سجل تكليف جديد
  IF v_assignment.id IS NOT NULL THEN
    UPDATE public.task_assignments
    SET status = 'in_progress',
        accepted_at = now(),
        status_reason = NULL,
        updated_at = now()
    WHERE id = v_assignment.id
    RETURNING * INTO v_result_assignment;
  ELSE
    INSERT INTO public.task_assignments (
      task_id,
      user_id,
      status,
      accepted_at,
      created_at,
      updated_at
    ) VALUES (
      p_task_id,
      p_user_id,
      'in_progress',
      now(),
      now(),
      now()
    )
    RETURNING * INTO v_result_assignment;
  END IF;

  -- 9. تدوين الحدث في task_events
  INSERT INTO public.task_events (
    task_id,
    assignment_id,
    actor_id,
    event_type,
    reason,
    created_at
  ) VALUES (
    p_task_id,
    v_result_assignment.id,
    p_user_id,
    'accept_task',
    'قبول المهمة وبدء التنفيذ',
    now()
  );

  -- 10. تدوين الحدث في سجل التدقيق العام audit_logs
  INSERT INTO public.audit_logs (
    actor_id,
    category,
    action,
    target_type,
    target_id,
    target_user_id,
    department_id,
    before_data,
    after_data,
    details,
    created_at
  ) VALUES (
    p_user_id,
    'tasks',
    'accept_task',
    'tasks',
    p_task_id::text,
    p_user_id,
    v_task.department_id,
    CASE
      WHEN v_assignment.id IS NOT NULL THEN
        jsonb_build_object('assignment_id', v_assignment.id, 'status', v_assignment.status)
      ELSE NULL
    END,
    jsonb_build_object(
      'assignment_id', v_result_assignment.id,
      'status', v_result_assignment.status,
      'accepted_at', v_result_assignment.accepted_at
    ),
    'قبول العضو للمهمة وبدء التنفيذ',
    now()
  );

  RETURN v_result_assignment;
END;
$$;

COMMENT ON FUNCTION public.claim_task(uuid, text) IS
  'دالة قبول العضو للمهمة المفتوحة أو الموجهة له مع الفحوصات الصارمة للسعة والحدود وقفل التسابق.';

-- -----------------------------------------------------------------------------
-- 1.9 الدالة 2: review_task_assignment(p_assignment_id, p_reviewer_id, p_decision, p_notes, p_approved_hours, p_allow_self)
--     مراجعة تسليم المهمة (اعتماد / طلب تعديل / رفض نهائي)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_task_assignment(
  p_assignment_id  uuid,
  p_reviewer_id    text,
  p_decision       text,
  p_notes          text DEFAULT NULL,
  p_approved_hours numeric DEFAULT NULL,
  p_allow_self     boolean DEFAULT false
)
RETURNS public.task_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_assignment         public.task_assignments%ROWTYPE;
  v_task               public.tasks%ROWTYPE;
  v_result_assignment  public.task_assignments%ROWTYPE;
  v_hours_log_id       uuid;
  v_approved_count     integer;
  v_clean_notes        text;
  v_event_type         text;
  v_effective_dept_id  uuid;
BEGIN
  -- تنظيف الملاحظات
  v_clean_notes := nullif(btrim(coalesce(p_notes, '')), '');

  -- 1. قفل سجل التكليف FOR UPDATE
  SELECT * INTO v_assignment
  FROM public.task_assignments
  WHERE id = p_assignment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSIGNMENT_NOT_FOUND: سجل التكليف غير موجود'
      USING ERRCODE = 'P0002';
  END IF;

  -- 2. قفل صف المهمة FOR UPDATE
  SELECT * INTO v_task
  FROM public.tasks
  WHERE id = v_assignment.task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TASK_NOT_FOUND: المهمة المرتبطة بالسجل غير موجودة'
      USING ERRCODE = 'P0002';
  END IF;

  -- 3. التحقق من أن حالة السجل هي submitted فقط
  IF v_assignment.status <> 'submitted' THEN
    RAISE EXCEPTION 'NOT_SUBMITTED: سجل التكليف ليس بحالة التسليم (الحالة الحالية: %)', v_assignment.status
      USING ERRCODE = 'P0001';
  END IF;

  -- 4. التحقق من صلاحية القرار المطلوب
  IF p_decision NOT IN ('approve', 'revise', 'reject_final') THEN
    RAISE EXCEPTION 'INVALID_DECISION: القرار غير صالح (يجب أن يكون approve أو revise أو reject_final)'
      USING ERRCODE = 'P0001';
  END IF;

  -- 5. منع المراجعة الذاتية إلا إذا صُرّح بها للمدير العام المنفرد (SELF_REVIEW)
  IF p_reviewer_id = v_assignment.user_id AND NOT coalesce(p_allow_self, false) THEN
    RAISE EXCEPTION 'SELF_REVIEW: لا يجوز مراجعة مهمتك بنفسك'
      USING ERRCODE = 'P0001';
  END IF;

  -- 6. معالجة القرارات السلبية: revise (طلب تعديل) و reject_final (رفض نهائي)
  IF p_decision IN ('revise', 'reject_final') THEN
    -- الملاحظات إجبارية ولا تقل عن 10 أحرف
    IF v_clean_notes IS NULL OR length(v_clean_notes) < 10 THEN
      RAISE EXCEPTION 'NOTES_REQUIRED: الملاحظات مطلوبة ولا تقل عن 10 أحرف عند طلب التعديل أو الرفض النهائي'
        USING ERRCODE = 'P0001';
    END IF;

    IF p_decision = 'revise' THEN
      v_event_type := 'needs_revision';
      UPDATE public.task_assignments
      SET status = 'needs_revision',
          status_reason = v_clean_notes,
          review_notes = v_clean_notes,
          reviewed_by = p_reviewer_id,
          reviewed_at = now(),
          updated_at = now()
      WHERE id = p_assignment_id
      RETURNING * INTO v_result_assignment;
    ELSE
      v_event_type := 'reject_final';
      UPDATE public.task_assignments
      SET status = 'rejected_final',
          status_reason = v_clean_notes,
          review_notes = v_clean_notes,
          reviewed_by = p_reviewer_id,
          reviewed_at = now(),
          updated_at = now()
      WHERE id = p_assignment_id
      RETURNING * INTO v_result_assignment;
    END IF;

  -- 7. معالجة قرار الاعتماد (approve)
  ELSIF p_decision = 'approve' THEN
    -- فحص قيمة الساعات المعتمدة
    IF p_approved_hours IS NULL OR p_approved_hours < 0.25 OR p_approved_hours > 24 OR (p_approved_hours % 0.25 <> 0) THEN
      RAISE EXCEPTION 'INVALID_HOURS: الساعات المعتمدة يجب أن تكون بين 0.25 و 24 ومضاعف دقيق لـ 0.25'
        USING ERRCODE = 'P0001';
    END IF;

    -- تحديد القسم المناسب لسجل الساعات
    SELECT coalesce(v_task.department_id, u.department_id) INTO v_effective_dept_id
    FROM public.users u
    WHERE u.id = v_assignment.user_id;

    -- إدخال صف جديد في جدول ساعات التطوع hours_logs بحالة معتمدة مباشرة
    INSERT INTO public.hours_logs (
      user_id,
      department_id,
      task_id,
      submitted_hours,
      approved_hours,
      date,
      description,
      status,
      is_self_approved,
      reviewed_by,
      reviewed_at,
      review_notes,
      created_at,
      updated_at
    ) VALUES (
      v_assignment.user_id,
      v_effective_dept_id,
      v_assignment.task_id,
      p_approved_hours,
      p_approved_hours,
      coalesce((v_assignment.submitted_at AT TIME ZONE 'Asia/Riyadh')::date, (now() AT TIME ZONE 'Asia/Riyadh')::date),
      '[إنجاز مهمة: ' || v_task.title || '] معتمدة',
      'approved',
      (p_reviewer_id = v_assignment.user_id AND coalesce(p_allow_self, false)),
      p_reviewer_id,
      now(),
      v_clean_notes,
      now(),
      now()
    )
    RETURNING id INTO v_hours_log_id;

    -- تحديث سجل التكليف بالاعتماد وربط معرّف الساعات
    UPDATE public.task_assignments
    SET status = 'approved',
        approved_hours = p_approved_hours,
        hours_log_id = v_hours_log_id,
        reviewed_by = p_reviewer_id,
        reviewed_at = now(),
        review_notes = v_clean_notes,
        status_reason = NULL,
        updated_at = now()
    WHERE id = p_assignment_id
    RETURNING * INTO v_result_assignment;

    -- فحص اكتمال المهمة: إذا كان required_assignees محدداً وبلغ عدد المعتمدين حده
    IF v_task.required_assignees IS NOT NULL THEN
      SELECT count(*) INTO v_approved_count
      FROM public.task_assignments
      WHERE task_id = v_assignment.task_id
        AND status = 'approved';

      IF v_approved_count >= v_task.required_assignees THEN
        UPDATE public.tasks
        SET lifecycle_status = 'completed',
            closed_at = now(),
            updated_at = now()
        WHERE id = v_assignment.task_id;
      END IF;
    END IF;

    v_event_type := 'approve_assignment';
  END IF;

  -- 8. تدوين الحدث في task_events
  INSERT INTO public.task_events (
    task_id,
    assignment_id,
    actor_id,
    event_type,
    reason,
    created_at
  ) VALUES (
    v_assignment.task_id,
    p_assignment_id,
    p_reviewer_id,
    v_event_type,
    v_clean_notes,
    now()
  );

  -- 9. تدوين الحدث في audit_logs
  INSERT INTO public.audit_logs (
    actor_id,
    category,
    action,
    target_type,
    target_id,
    target_user_id,
    department_id,
    before_data,
    after_data,
    details,
    created_at
  ) VALUES (
    p_reviewer_id,
    'tasks',
    'review_task',
    'tasks',
    v_assignment.task_id::text,
    v_assignment.user_id,
    v_task.department_id,
    jsonb_build_object(
      'assignment_id', v_assignment.id,
      'status', v_assignment.status
    ),
    jsonb_build_object(
      'assignment_id', v_result_assignment.id,
      'status', v_result_assignment.status,
      'decision', p_decision,
      'approved_hours', v_result_assignment.approved_hours,
      'hours_log_id', v_result_assignment.hours_log_id
    ),
    'مراجعة تكليف المهمة: ' || p_decision,
    now()
  );

  RETURN v_result_assignment;
END;
$$;

COMMENT ON FUNCTION public.review_task_assignment(uuid, text, text, text, numeric, boolean) IS
  'دالة مراجعة تكليف المهمة واعتماد ساعاتها وتوليد سجل ساعات التطوع تلقائياً وذرّياً.';

-- -----------------------------------------------------------------------------
-- 1.10 صلاحيات الدوال: حصر التنفيذ بـ service_role فقط وسحبها من anon و authenticated
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.claim_task(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_task(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.review_task_assignment(uuid, text, text, text, numeric, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_task_assignment(uuid, text, text, text, numeric, boolean) TO service_role;

-- سحب الصلاحيات التلقائية التي يمنحها Supabase للدورين anon و authenticated
DO $$
DECLARE
  r text;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.claim_task(uuid, text) FROM %I', r);
    EXECUTE format('REVOKE ALL ON FUNCTION public.review_task_assignment(uuid, text, text, text, numeric, boolean) FROM %I', r);
  END LOOP;
END $$;

-- =============================================================================
-- إنهاء وتثبيت المعاملة الذرية
-- =============================================================================
COMMIT;
