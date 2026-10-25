-- =============================================================================
-- مُلَم — خطة ترحيل مقترحة (REVIEW ONLY) — لا تُنفّذ تلقائيًا
-- مسار: db/planned/0004_task_release_cancel.sql
-- الغرض: توفير دالتي سحب التكليف (release_task_assignment) وإلغاء المهمة (cancel_task)
--         لتنفيذ العمليات الإدارية المعقدة ذرّياً داخل قاعدة البيانات مع:
--         1. نمط أقفال متقدم (قفل استشاري pg_advisory_xact_lock ثم المهمة FOR UPDATE ثم السجلات).
--         2. تسجيل أحداث المهام في جدول task_events.
--         3. توثيق العمليات في سجل التدقيق العام audit_logs (باستخدام القيم release_task و cancel_task من 0003a).
--         4. حصر صلاحية التنفيذ بدور service_role فقط وسحبها من الأدوار العامة.
-- الحالة: مسودة مراجعة جاهزة للاختبار على بيئة PostgreSQL 15+ تجريبية منفصلة.
-- الإصدار المتوقع: PostgreSQL 15+ (Supabase).
--
-- متطلبات سابقة:
--   - تطبيق 0003a_task_audit_enum_values.sql أولاً (لقيم تعداد audit_action).
--   - تطبيق 0003b_tasks_assignments.sql (للمخطط والجداول task_assignments و task_events).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. فحص حارس: التحقق من وجود الجداول المطلوبة
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.tasks') IS NULL THEN
    RAISE EXCEPTION 'الجدول public.tasks غير موجود — أوقف الترحيل للمراجعة';
  END IF;

  IF to_regclass('public.task_assignments') IS NULL THEN
    RAISE EXCEPTION 'الجدول public.task_assignments غير موجود — أوقف الترحيل للمراجعة';
  END IF;

  IF to_regclass('public.task_events') IS NULL THEN
    RAISE EXCEPTION 'الجدول public.task_events غير موجود — أوقف الترحيل للمراجعة';
  END IF;

  IF to_regclass('public.audit_logs') IS NULL THEN
    RAISE EXCEPTION 'الجدول public.audit_logs غير موجود — أوقف الترحيل للمراجعة';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1. الدالة الأولى: release_task_assignment
--    سحب تكليف مهمة من عضو إدارياً لتعثره أو عدم إنجازه
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_task_assignment(
  p_assignment_id uuid,
  p_actor_id      text,
  p_reason        text
)
RETURNS public.task_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_clean_reason       text;
  v_task_id            uuid;
  v_task               public.tasks%ROWTYPE;
  v_assignment         public.task_assignments%ROWTYPE;
  v_result_assignment  public.task_assignments%ROWTYPE;
BEGIN
  -- ملاحظة معمارية: لا يتم التحقق من صلاحية الفاعل (p_actor_id) داخل هذه الدالة؛
  -- فالتحقق من صلاحية الفاعل وقواعد الأدوار والسياسات الإدارية يتم في طبقة الخادم (Server Layer / Policy)
  -- قبل استدعاء هذه الدالة، وهو سلوك مقصود ومطابق لمعمارية النظام.

  -- 1. التحقق من سبب السحب الإداري (إجباري ولا يقل عن 10 أحرف بعد اقتطاع الفراغات)
  v_clean_reason := btrim(coalesce(p_reason, ''));
  IF length(v_clean_reason) < 10 THEN
    RAISE EXCEPTION 'REASON_REQUIRED: سبب سحب المهمة مطلوب ولا يقل عن 10 أحرف'
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. استعلام معرّف المهمة المرتبطة بالتكليف أولاً لتحديد المهمة المراد قفلها
  SELECT task_id INTO v_task_id
  FROM public.task_assignments
  WHERE id = p_assignment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSIGNMENT_NOT_FOUND: سجل التكليف غير موجود'
      USING ERRCODE = 'P0002';
  END IF;

  -- 3. قفل استشاري على مستوى المعاملة للمهمة لضمان الترتيب ومنع التسابق
  PERFORM pg_advisory_xact_lock(hashtext(v_task_id::text));

  -- 4. قفل صف المهمة في جدول tasks أولاً (FOR UPDATE)
  SELECT * INTO v_task
  FROM public.tasks
  WHERE id = v_task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TASK_NOT_FOUND: المهمة المرتبطة بسجل التكليف غير موجودة'
      USING ERRCODE = 'P0002';
  END IF;

  -- 5. قفل سجل التكليف في جدول task_assignments ثانياً (FOR UPDATE)
  SELECT * INTO v_assignment
  FROM public.task_assignments
  WHERE id = p_assignment_id
  FOR UPDATE;

  IF NOT FOUND OR v_assignment.task_id IS DISTINCT FROM v_task_id THEN
    RAISE EXCEPTION 'ASSIGNMENT_NOT_FOUND: سجل التكليف غير موجود أو تغيّر أثناء المعالجة'
      USING ERRCODE = 'P0002';
  END IF;

  -- 6. التحقق من حالة التكليف: السحب متاح فقط للحالات القابلة للسحب (offered, in_progress, needs_revision)
  IF v_assignment.status NOT IN ('offered', 'in_progress', 'needs_revision') THEN
    RAISE EXCEPTION 'INVALID_STATUS: لا يمكن سحب التكليف في حالته الحالية (%). السحب متاح فقط للحالات: offered، in_progress، needs_revision', v_assignment.status
      USING ERRCODE = 'P0001';
  END IF;

  -- 7. تحديث سجل التكليف إلى released مع تسجيل السبب وتاريخ التحديث دون المساس بالساعات
  UPDATE public.task_assignments
  SET status = 'released',
      status_reason = v_clean_reason,
      updated_at = now()
  WHERE id = p_assignment_id
  RETURNING * INTO v_result_assignment;

  -- 8. تدوين الحدث في جدول task_events
  INSERT INTO public.task_events (
    task_id,
    assignment_id,
    actor_id,
    event_type,
    reason,
    created_at
  ) VALUES (
    v_task.id,
    p_assignment_id,
    p_actor_id,
    'release_task',
    v_clean_reason,
    now()
  );

  -- 9. تدوين الحدث في جدول التدقيق العام audit_logs
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
    p_actor_id,
    'tasks',
    'release_task',
    'tasks',
    v_task.id::text,
    v_assignment.user_id,
    v_task.department_id,
    jsonb_build_object(
      'assignment_id', v_assignment.id,
      'status', v_assignment.status,
      'status_reason', v_assignment.status_reason
    ),
    jsonb_build_object(
      'assignment_id', v_result_assignment.id,
      'status', v_result_assignment.status,
      'status_reason', v_result_assignment.status_reason
    ),
    'سحب تكليف المهمة إدارياً',
    now()
  );

  RETURN v_result_assignment;
END;
$$;

COMMENT ON FUNCTION public.release_task_assignment(uuid, text, text) IS
  'دالة سحب تكليف المهمة من العضو إدارياً لتعثره وتحديث حالته إلى released وتوثيق الحدث وسجل التدقيق.';

-- -----------------------------------------------------------------------------
-- 2. الدالة الثانية: cancel_task
--    إلغاء المهمة إدارياً كلياً وإخلاء طرف السجلات النشطة المرتبطة بها
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_task(
  p_task_id   uuid,
  p_actor_id  text,
  p_reason    text
)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_clean_reason       text;
  v_task               public.tasks%ROWTYPE;
  v_result_task        public.tasks%ROWTYPE;
  v_assignment         public.task_assignments%ROWTYPE;
  v_affected_count     integer := 0;
BEGIN
  -- ملاحظة معمارية: لا يتم التحقق من صلاحية الفاعل (p_actor_id) داخل هذه الدالة؛
  -- فالتحقق من صلاحية الفاعل وقواعد الأدوار والسياسات الإدارية يتم في طبقة الخادم (Server Layer / Policy)
  -- قبل استدعاء هذه الدالة، وهو سلوك مقصود ومطابق لمعمارية النظام.

  -- 1. التحقق من سبب إلغاء المهمة الإداري (إجباري ولا يقل عن 10 أحرف بعد اقتطاع الفراغات)
  v_clean_reason := btrim(coalesce(p_reason, ''));
  IF length(v_clean_reason) < 10 THEN
    RAISE EXCEPTION 'REASON_REQUIRED: سبب إلغاء المهمة مطلوب ولا يقل عن 10 أحرف'
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. قفل استشاري على مستوى المعاملة للمهمة لضمان الترتيب ومنع التسابق
  PERFORM pg_advisory_xact_lock(hashtext(p_task_id::text));

  -- 3. قفل صف المهمة في جدول tasks (FOR UPDATE)
  SELECT * INTO v_task
  FROM public.tasks
  WHERE id = p_task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TASK_NOT_FOUND: المهمة المطلوبة غير موجودة'
      USING ERRCODE = 'P0002';
  END IF;

  -- 4. التحقق من أن دورة حياة المهمة مفتوحة (open)
  IF v_task.lifecycle_status <> 'open' THEN
    RAISE EXCEPTION 'INVALID_STATUS: لا يمكن إلغاء المهمة لأن دورة حياتها ليست مفتوحة (الحالة الحالية: %)', v_task.lifecycle_status
      USING ERRCODE = 'P0001';
  END IF;

  -- 5. تحديث جدول tasks إلى ملغاة (cancelled) مع بيانات الإلغاء
  UPDATE public.tasks
  SET lifecycle_status = 'cancelled',
      cancel_reason = v_clean_reason,
      cancelled_by = p_actor_id,
      cancelled_at = now(),
      closed_at = now(),
      updated_at = now()
  WHERE id = p_task_id
  RETURNING * INTO v_result_task;

  -- 6. قفل وتحديث كافة سجلات التكليف غير المكتملة المرتبطة بالمهمة
  --    الحالات المعنية بالإخلاء: offered, in_progress, needs_revision, submitted
  --    السجلات بحالة approved تبقى كما هي ولا تُلمس لأن ساعاتها اعتُمدت.
  FOR v_assignment IN
    SELECT *
    FROM public.task_assignments
    WHERE task_id = p_task_id
      AND status IN ('offered', 'in_progress', 'needs_revision', 'submitted')
    FOR UPDATE
  LOOP
    UPDATE public.task_assignments
    SET status = 'released',
        status_reason = v_clean_reason,
        updated_at = now()
    WHERE id = v_assignment.id;

    -- تدوين حدث في task_events لكل سجل تكليف متأثر
    INSERT INTO public.task_events (
      task_id,
      assignment_id,
      actor_id,
      event_type,
      reason,
      created_at
    ) VALUES (
      p_task_id,
      v_assignment.id,
      p_actor_id,
      'cancel_task',
      v_clean_reason,
      now()
    );

    v_affected_count := v_affected_count + 1;
  END LOOP;

  -- 7. تدوين حدث إلغاء المهمة نفسها في task_events (مع assignment_id = NULL)
  INSERT INTO public.task_events (
    task_id,
    assignment_id,
    actor_id,
    event_type,
    reason,
    created_at
  ) VALUES (
    p_task_id,
    NULL,
    p_actor_id,
    'cancel_task',
    v_clean_reason,
    now()
  );

  -- 8. تدوين سطر تدقيق واحد في audit_logs للمهمة متضمناً عدد السجلات المتأثرة
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
    p_actor_id,
    'tasks',
    'cancel_task',
    'tasks',
    p_task_id::text,
    NULL,
    v_task.department_id,
    jsonb_build_object(
      'lifecycle_status', v_task.lifecycle_status
    ),
    jsonb_build_object(
      'lifecycle_status', v_result_task.lifecycle_status,
      'cancelled_by', v_result_task.cancelled_by,
      'cancelled_at', v_result_task.cancelled_at,
      'cancel_reason', v_result_task.cancel_reason,
      'affected_assignments_count', v_affected_count
    ),
    'إلغاء المهمة إدارياً وإخلاء طرف السجلات النشطة المرتبطة بها',
    now()
  );

  RETURN v_result_task;
END;
$$;

COMMENT ON FUNCTION public.cancel_task(uuid, text, text) IS
  'دالة إلغاء المهمة إدارياً وتحويل التكليفات النشطة المرتبطة بها إلى released مع توثيق الأحداث والتدقيق.';

-- -----------------------------------------------------------------------------
-- 3. صلاحيات الدوال: حصر التنفيذ بـ service_role وسحبها من العامة
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.release_task_assignment(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_task_assignment(uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.cancel_task(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_task(uuid, text, text) TO service_role;

DO $$
DECLARE
  r text;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.release_task_assignment(uuid, text, text) FROM %I', r);
    EXECUTE format('REVOKE ALL ON FUNCTION public.cancel_task(uuid, text, text) FROM %I', r);
  END LOOP;
END $$;

COMMIT;
