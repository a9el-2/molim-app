-- =============================================================================
-- مُلَم — اختبار ذرّي متكامل لدوال سحب وإلغاء المهام (TEST & ROLLBACK ONLY)
-- مسار: db/planned/0004_test_rollback.sql
-- الغرض: تنفيذ سيناريوهات اختبار شاملة لدالتي release_task_assignment و cancel_task:
--         1. اختبار رفض الأسباب القصيرة (أقل من 10 أحرف) بكود REASON_REQUIRED.
--         2. اختبار رفض سحب الحالات غير المسموحة (مثل approved) بكود INVALID_STATUS.
--         3. اختبار نجاح سحب التكليف (تحويله إلى released وتدوين الأحداث والتدقيق).
--         4. اختبار إلغاء المهمة (تحويل السجلات غير المعتمدة إلى released وبقاء approved).
--         5. اختبار رفض إلغاء مهمة غير مفتوحة بكود INVALID_STATUS.
--         6. التراجع التلقائي الكامل (Rollback) عبر إثارة استثناء TEST_PASSED_ROLLBACK.
-- =============================================================================

DO $$
DECLARE
  v_actor_id           text;
  v_user_1             text;
  v_user_2             text;
  v_task_id            uuid;
  v_asgn_1_id          uuid;
  v_asgn_2_id          uuid;
  v_hours_log_id       uuid;
  v_rel_res            public.task_assignments%ROWTYPE;
  v_task_res           public.tasks%ROWTYPE;
  v_asgn_check_1       public.task_assignments%ROWTYPE;
  v_asgn_check_2       public.task_assignments%ROWTYPE;
  v_caught_expected    boolean;
BEGIN
  RAISE NOTICE 'بدء اختبارات دوال 0004 (سحب التكليف وإلغاء المهمة)...';

  -- ---------------------------------------------------------------------------
  -- 1. تجهيز المستخدمين التجريبيين (استخدام مستخدمين قائمين أو إنشاء مؤقتين)
  -- ---------------------------------------------------------------------------
  SELECT id INTO v_actor_id FROM public.users LIMIT 1;
  IF v_actor_id IS NULL THEN
    INSERT INTO public.users (id, role, status)
    VALUES ('MOL-TEST01', 'ADMIN', 'active')
    RETURNING id INTO v_actor_id;
  END IF;

  SELECT id INTO v_user_1 FROM public.users WHERE id <> v_actor_id LIMIT 1;
  IF v_user_1 IS NULL THEN
    INSERT INTO public.users (id, role, status)
    VALUES ('MOL-TEST02', 'VOLUNTEER', 'active')
    RETURNING id INTO v_user_1;
  END IF;

  SELECT id INTO v_user_2 FROM public.users WHERE id NOT IN (v_actor_id, v_user_1) LIMIT 1;
  IF v_user_2 IS NULL THEN
    INSERT INTO public.users (id, role, status)
    VALUES ('MOL-TEST03', 'VOLUNTEER', 'active')
    RETURNING id INTO v_user_2;
  END IF;

  -- ---------------------------------------------------------------------------
  -- 2. إنشاء مهمة اختبار تجريبية بحالة open
  -- ---------------------------------------------------------------------------
  INSERT INTO public.tasks (
    title,
    created_by,
    lifecycle_status,
    priority,
    target_type
  ) VALUES (
    'مهمة اختبارية لدوال السحب والإلغاء 0004',
    v_actor_id,
    'open',
    'normal',
    'all_departments'
  ) RETURNING id INTO v_task_id;

  -- ---------------------------------------------------------------------------
  -- 3. إنشاء سجلي تكليف للمهمة:
  --    - السجل 1: بحالة in_progress (لاختبار السحب والإخلاء).
  --    - السجل 2: بحالة approved مع ربط hours_log (لاختبار عدم مساس الإلغاء بالساعات المعتمدة).
  -- ---------------------------------------------------------------------------
  INSERT INTO public.task_assignments (
    task_id,
    user_id,
    status
  ) VALUES (
    v_task_id,
    v_user_1,
    'in_progress'
  ) RETURNING id INTO v_asgn_1_id;

  INSERT INTO public.hours_logs (
    user_id,
    submitted_hours,
    approved_hours,
    date,
    description,
    status
  ) VALUES (
    v_user_2,
    2.0,
    2.0,
    current_date,
    'ساعات تطوع معتمدة للمهمة الاختبارية',
    'approved'
  ) RETURNING id INTO v_hours_log_id;

  INSERT INTO public.task_assignments (
    task_id,
    user_id,
    status,
    approved_hours,
    hours_log_id
  ) VALUES (
    v_task_id,
    v_user_2,
    'approved',
    2.0,
    v_hours_log_id
  ) RETURNING id INTO v_asgn_2_id;

  -- ---------------------------------------------------------------------------
  -- 4. اختبارات الدالة 1: release_task_assignment
  -- ---------------------------------------------------------------------------

  -- 4.أ: رفض سبب السحب القصير (أقل من 10 أحرف) بكود REASON_REQUIRED
  v_caught_expected := false;
  BEGIN
    PERFORM public.release_task_assignment(v_asgn_1_id, v_actor_id, 'قصير');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%REASON_REQUIRED%' THEN
      v_caught_expected := true;
    ELSE
      RAISE EXCEPTION 'خطأ غير متوقع عند فحص سبب السحب القصير: %', SQLERRM;
    END IF;
  END;
  IF NOT v_caught_expected THEN
    RAISE EXCEPTION 'فشل الاختبار: كان يجب رفض السبب القصير بكود REASON_REQUIRED في release_task_assignment';
  END IF;

  -- 4.ب: رفض سحب تكليف بحالة غير قابلة للسحب (approved) بكود INVALID_STATUS
  v_caught_expected := false;
  BEGIN
    PERFORM public.release_task_assignment(v_asgn_2_id, v_actor_id, 'سبب سحب كافٍ يتجاوز عشرة أحرف');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%INVALID_STATUS%' THEN
      v_caught_expected := true;
    ELSE
      RAISE EXCEPTION 'خطأ غير متوقع عند فحص سحب تكليف معتمد: %', SQLERRM;
    END IF;
  END;
  IF NOT v_caught_expected THEN
    RAISE EXCEPTION 'فشل الاختبار: كان يجب رفض سحب تكليف معتمد (approved) بكود INVALID_STATUS';
  END IF;

  -- 4.ج: نجاح سحب التكليف (السجل 1) والتحقق من حالته وتدوين الحدث والتدقيق
  v_rel_res := public.release_task_assignment(v_asgn_1_id, v_actor_id, 'سبب سحب كافٍ ومبرر لتعثر المتطوع');
  IF v_rel_res.status <> 'released' OR v_rel_res.status_reason <> 'سبب سحب كافٍ ومبرر لتعثر المتطوع' THEN
    RAISE EXCEPTION 'فشل الاختبار: نتيجة التكليف المسحوب غير متطابقة';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.task_events
    WHERE assignment_id = v_asgn_1_id AND event_type = 'release_task'
  ) THEN
    RAISE EXCEPTION 'فشل الاختبار: لم يتم تدوين حدث release_task في task_events';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.audit_logs
    WHERE target_id = v_task_id::text AND action = 'release_task'
  ) THEN
    RAISE EXCEPTION 'فشل الاختبار: لم يتم تدوين سطر release_task في audit_logs';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 5. اختبارات الدالة 2: cancel_task
  -- ---------------------------------------------------------------------------

  -- إعادة السجل 1 إلى in_progress لاختبار إخلاء طرفه عند إلغاء المهمة
  UPDATE public.task_assignments
  SET status = 'in_progress', status_reason = NULL
  WHERE id = v_asgn_1_id;

  -- 5.أ: رفض سبب الإلغاء القصير (أقل من 10 أحرف) بكود REASON_REQUIRED
  v_caught_expected := false;
  BEGIN
    PERFORM public.cancel_task(v_task_id, v_actor_id, 'إلغاء');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%REASON_REQUIRED%' THEN
      v_caught_expected := true;
    ELSE
      RAISE EXCEPTION 'خطأ غير متوقع عند فحص سبب الإلغاء القصير: %', SQLERRM;
    END IF;
  END;
  IF NOT v_caught_expected THEN
    RAISE EXCEPTION 'فشل الاختبار: كان يجب رفض سبب الإلغاء القصير بكود REASON_REQUIRED في cancel_task';
  END IF;

  -- 5.ب: نجاح إلغاء المهمة
  v_task_res := public.cancel_task(v_task_id, v_actor_id, 'تم إلغاء المهمة لعدم توفر متطلبات التنفيذ حالياً');
  IF v_task_res.lifecycle_status <> 'cancelled'
     OR v_task_res.cancelled_by <> v_actor_id
     OR v_task_res.cancel_reason <> 'تم إلغاء المهمة لعدم توفر متطلبات التنفيذ حالياً' THEN
    RAISE EXCEPTION 'فشل الاختبار: بيانات المهمة الملغاة غير متطابقة';
  END IF;

  -- 5.ج: التحقق من تحول السجل 1 إلى released مع نفس سبب الإلغاء
  SELECT * INTO v_asgn_check_1 FROM public.task_assignments WHERE id = v_asgn_1_id;
  IF v_asgn_check_1.status <> 'released'
     OR v_asgn_check_1.status_reason <> 'تم إلغاء المهمة لعدم توفر متطلبات التنفيذ حالياً' THEN
    RAISE EXCEPTION 'فشل الاختبار: التكليف النشط لم يتحول إلى released عند إلغاء المهمة';
  END IF;

  -- 5.د: التحقق من بقاء السجل 2 بحالة approved دون أي تعديل على ساعاته أو حالته
  SELECT * INTO v_asgn_check_2 FROM public.task_assignments WHERE id = v_asgn_2_id;
  IF v_asgn_check_2.status <> 'approved' OR v_asgn_check_2.approved_hours <> 2.0 THEN
    RAISE EXCEPTION 'فشل الاختبار: التكليف المعتمد (approved) عُدّل وهذا يخالف قاعدة الحفاظ على الساعات';
  END IF;

  -- 5.هـ: التحقق من تدوين أحداث task_events لكل من السجل المتأثر والمهمة نفسها
  IF NOT EXISTS (
    SELECT 1 FROM public.task_events
    WHERE task_id = v_task_id AND assignment_id = v_asgn_1_id AND event_type = 'cancel_task'
  ) THEN
    RAISE EXCEPTION 'فشل الاختبار: لم يتم تدوين حدث cancel_task للتكليف في task_events';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.task_events
    WHERE task_id = v_task_id AND assignment_id IS NULL AND event_type = 'cancel_task'
  ) THEN
    RAISE EXCEPTION 'فشل الاختبار: لم يتم تدوين حدث cancel_task للمهمة نفسها في task_events';
  END IF;

  -- 5.و: التحقق من تدوين سطر تدقيق واحد في audit_logs للمهمة
  IF NOT EXISTS (
    SELECT 1 FROM public.audit_logs
    WHERE target_id = v_task_id::text
      AND action = 'cancel_task'
      AND (after_data->>'affected_assignments_count')::int = 1
  ) THEN
    RAISE EXCEPTION 'فشل الاختبار: لم يتم تدوين سطر cancel_task الصحيح في audit_logs';
  END IF;

  -- 5.ز: رفض إعادة إلغاء مهمة ملغاة بكود INVALID_STATUS
  v_caught_expected := false;
  BEGIN
    PERFORM public.cancel_task(v_task_id, v_actor_id, 'إلغاء ثانٍ لمهمة ملغاة مسبقاً');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%INVALID_STATUS%' THEN
      v_caught_expected := true;
    ELSE
      RAISE EXCEPTION 'خطأ غير متوقع عند فحص إلغاء مهمة غير مفتوحة: %', SQLERRM;
    END IF;
  END;
  IF NOT v_caught_expected THEN
    RAISE EXCEPTION 'فشل الاختبار: كان يجب رفض إلغاء مهمة ليست بحالة open بكود INVALID_STATUS';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 6. إنهاء الاختبارات والتراجع الكامل عن المعاملة
  -- ---------------------------------------------------------------------------
  RAISE EXCEPTION 'TEST_PASSED_ROLLBACK: تم اجتياز جميع اختبارات release_task_assignment و cancel_task بنجاح وتراجع المعاملة بالكامل';
END $$;
