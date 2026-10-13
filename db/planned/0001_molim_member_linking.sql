-- =============================================================================
-- مُلَم — خطة ترحيل مقترحة (REVIEW ONLY) — لا تُنفّذ تلقائيًا
-- مسار: db/planned/0001_molim_member_linking.sql
-- الغرض: تشغيل «إضافة الأعضاء» + «ربط تيليجرام» + «إكمال الملف الشخصي».
-- الحالة: مسودة مراجعة (v4). «غير مُثبت أنها صالحة للتنفيذ» — يجب اختبارها على
--         قاعدة PostgreSQL تجريبية منفصلة، مع نسخة احتياطية واستعادة مُختبرة.
-- الإصدار المتوقع: PostgreSQL 15+ (Supabase). كل الأوامر متوافقة:
--   pg_sequences (10+), indnkeyatts (11+), CREATE SEQUENCE AS bigint (10+),
--   has_sequence_privilege, to_regclass/to_regprocedure, DO/format.
-- الافتراضات المعلّمة بـ [VERIFY] يجب التحقق منها قراءةً قبل أي تنفيذ.
--
-- إصلاحات v4:
--   * تحقق جاهزية الفهارس (indisvalid/indisready/indislive/indnatts) وخصائصها.
--   * مطابقة شرط الفهرس الجزئي بشكل معياري دقيق لا تقريبي.
--   * تحقق profile_completed القائم: النوع + is_nullable + الافتراضي، دون تغيير بيانات.
--   * توثيق أن setval/nextval غير معامليّة (قد تترك فجوات حتى عند التراجع).
--   * توثيق متطلب صلاحية ALTER FUNCTION ... OWNER TO في Supabase.
--
-- إصلاحات v3:
--   * قراءة pg_sequences عبر متغير record + معالجة IF NOT FOUND.
--   * صياغة إنشاء التسلسل الصحيحة (NO CYCLE).
--   * حارس فعلي لنوع users.id (وقبل كل تعبيرات المطابقة النصية).
--   * تحقق فعلي من تفرد users.id ومن ملكية الدالة/التسلسل والامتيازات.
--   * توثيق الانتقال من مسار max+1 وعدم الاعتماد على القفل وحده.
--   * التحقق من خصائص الفهارس عبر الكتالوج لا بالبحث النصي.
-- =============================================================================
-- لا يحتوي هذا الملف إلا على SQL وتعليقات SQL. تقرير المراجعة الذاتية ليس هنا.
-- =============================================================================

-- =============================================================================
-- 0) فحوصات ما قبل الترحيل (قراءة فقط — لا تعدّل شيئًا ولا تستهلك تسلسلًا)
-- =============================================================================

-- 0.1 نوع العمود id (يجب نصي: text أو character varying).
-- [VERIFY]
-- SELECT data_type, udt_name
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'id';

-- 0.2 وجود الأعمدة المطلوبة وأنواعها.
-- [VERIFY]
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'users'
--   AND column_name IN (
--     'profile_completed', 'link_code', 'link_code_expires_at',
--     'link_code_used_at', 'telegram_id', 'telegram_username',
--     'department_id', 'birth_date', 'skills', 'tools',
--     'joined_at', 'created_at', 'updated_at'
--   )
-- ORDER BY column_name;

-- 0.3 نوع telegram_id (يجب عدد صحيح: bigint مثالي).
-- [VERIFY]
-- SELECT data_type FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='users' AND column_name='telegram_id';

-- 0.4 تكرار telegram_id (النتيجة يجب = 0).
-- [VERIFY]
-- SELECT telegram_id, count(*) AS duplicates
-- FROM public.users WHERE telegram_id IS NOT NULL
-- GROUP BY telegram_id HAVING count(*) > 1 ORDER BY duplicates DESC;

-- 0.5 صحة تنسيق أرقام الأعضاء (يجب أن تكون النتيجة صفر صفوف).
-- [VERIFY]
-- SELECT id, first_name, last_name FROM public.users WHERE id !~ '^MOL-?[0-9]+$';

-- 0.6 أرقام قد لا تُحوَّل بأمان إلى bigint (تجاوز 18 خانة). النتيجة يجب = 0.
-- [VERIFY]
-- SELECT id FROM public.users
-- WHERE id ~ '^MOL-?[0-9]+$'
--   AND length(regexp_replace(id, '\D', '', 'g')) > 18;

-- 0.7 تفرد users.id (PK أو فهرس فريد بسيط على id).
-- [VERIFY]
-- SELECT i.indisunique, i.indnkeyatts, a.attname
-- FROM pg_index i
-- JOIN pg_class t ON t.oid=i.indrelid
-- JOIN pg_class ic ON ic.oid=i.indexrelid
-- JOIN pg_namespace n ON n.oid=t.relnamespace
-- LEFT JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=i.indkey[0]
-- WHERE n.nspname='public' AND t.relname='users' AND i.indisunique;

-- 0.8 دالة/تسلسل بالاسم نفسه؟ (الترحيل سيتوقف تلقائيًا عند وجودها.)
-- [VERIFY]
-- SELECT to_regprocedure('public.next_molim_id()') AS existing_function;
-- SELECT to_regclass('public.molim_id_seq')        AS existing_sequence;

-- 0.9 تعريف التسلسل القائم (إن وُجد).
-- [VERIFY]
-- SELECT * FROM pg_sequences
-- WHERE schemaname='public' AND sequencename='molim_id_seq';

-- 0.10 مالك الدالة/التسلسل ووجود service_role.
-- [VERIFY]
-- SELECT pg_get_userbyid(proowner) FROM pg_proc
--   WHERE oid = 'public.next_molim_id()'::regprocedure;   -- إن وُجدت
-- SELECT pg_get_userbyid(relowner) FROM pg_class
--   WHERE oid = 'public.molim_id_seq'::regclass;          -- إن وُجد
-- SELECT rolname FROM pg_roles WHERE rolname = 'service_role';

-- 0.11 RLS على users وسياساته (الخادم يستخدم service_role الذي يتجاوز RLS).
-- [VERIFY]
-- SELECT relrowsecurity FROM pg_class WHERE oid = 'public.users'::regclass;
-- SELECT policyname, cmd, roles, qual, with_check
-- FROM pg_policies WHERE schemaname='public' AND tablename='users';

-- =============================================================================
-- 1) الترحيل (معاملة واحدة — قصيرة)
-- =============================================================================
BEGIN;

-- 1.0 قفل الجدول: يمنع INSERT/UPDATE/LINK متزامنًا ويُحرَّر عند COMMIT.
--     ملاحظة مهمة (concurrency): القفل يمنع الكتابة أثناء النافذة لكنه لا يمنع
--     طلبًا كان قد قرأ max(id) قبل القفل من محاولة INSERT بعد COMMIT. لذلك
--     يعتمد هذا المخطط على قيد التفرد المفحوص في 1.1 (وسلوك إعادة المحاولة في
--     الكود عند 23505). يُنصح بنافذة صيانة/إفراغ الطلبات الجارية.
LOCK TABLE public.users IN SHARE ROW EXCLUSIVE MODE;

-- 1.1 حرّاس فعليون: نوع id/telegram_id، تفرد id، الأرقام غير القابلة للتحويل،
--     تكرار المعرّفات، تكرار telegram_id. أي فشل يُجهض المعاملة.
DO $$
DECLARE
  id_type    text;
  tg_type    text;
  attr_id    smallint;
  has_unique boolean;
BEGIN
  -- نوع users.id قبل أي تعبير مطابقة نصية.
  SELECT data_type INTO id_type
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='users' AND column_name='id';

  IF id_type IS NULL THEN
    RAISE EXCEPTION 'عمود users.id غير موجود — أوقف الترحيل للمراجعة';
  ELSIF id_type NOT IN ('text', 'character varying') THEN
    RAISE EXCEPTION 'نوع users.id = % (ليس نصًا متغيّرًا) — صيغة MOL- غير آمنة هنا. أوقف الترحيل للمراجعة',
      id_type;
  END IF;

  -- نوع telegram_id (عدد صحيح).
  SELECT data_type INTO tg_type
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='users' AND column_name='telegram_id';

  IF tg_type IS NULL THEN
    RAISE EXCEPTION 'عمود users.telegram_id غير موجود — أوقف الترحيل للمراجعة';
  ELSIF tg_type NOT IN ('bigint', 'integer', 'smallint') THEN
    RAISE EXCEPTION 'نوع users.telegram_id = % (ليس عددًا صحيحًا) — أوقف الترحيل للمراجعة',
      tg_type;
  END IF;

  -- تفرد id: PK أو فهرس فريد بسيط على id تحديدًا.
  SELECT a.attnum INTO attr_id
  FROM pg_attribute a
  WHERE a.attrelid = 'public.users'::regclass AND a.attname='id' AND NOT a.attisdropped;

  SELECT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class tc ON tc.oid = i.indrelid
    JOIN pg_namespace ns ON ns.oid = tc.relnamespace
    WHERE ns.nspname='public' AND tc.relname='users'
      AND i.indisunique AND i.indnkeyatts = 1 AND i.indkey[0] = attr_id
  ) INTO has_unique;

  IF NOT has_unique THEN
    RAISE EXCEPTION 'لا يوجد قيد تفرد/PK على users.id — لا يمكن ضمان عدم تكرار المعرّفات. أوقف الترحيل للمراجعة';
  END IF;

  -- أرقام لا تُحوَّل بأمان (>18 خانة).
  IF EXISTS (
    SELECT 1 FROM public.users
    WHERE id ~ '^MOL-?[0-9]+$'
      AND length(regexp_replace(id, '\D', '', 'g')) > 18
  ) THEN
    RAISE EXCEPTION 'توجد معرّفات تتجاوز 18 رقمًا ولا تُحوَّل بأمان إلى bigint — أوقف الترحيل للمراجعة';
  END IF;

  -- تكرار المعرّفات.
  IF EXISTS (SELECT 1 FROM public.users GROUP BY id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'توجد معرّفات أعضاء مكرّرة — أوقف الترحيل للمراجعة';
  END IF;

  -- تكرار telegram_id غير الفارغ.
  IF EXISTS (
    SELECT 1 FROM public.users
    WHERE telegram_id IS NOT NULL
    GROUP BY telegram_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'توجد معرّفات telegram_id مكرّرة — أوقف الترحيل للمراجعة';
  END IF;
END $$;

-- 1.2 الأعمدة: أنشئ فقط إن كانت مفقودة، وارفض إن اختلف التعريف.
DO $$
DECLARE
  expected record;
  actual_type text;
  prof_nullable text;
  prof_default  text;
BEGIN
  FOR expected IN
    SELECT * FROM (VALUES
      ('link_code',            'text'),
      ('link_code_expires_at', 'timestamp with time zone'),
      ('link_code_used_at',    'timestamp with time zone')
    ) AS t(col, typ)
  LOOP
    SELECT data_type INTO actual_type
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users' AND column_name = expected.col;

    IF actual_type IS NULL THEN
      EXECUTE format('ALTER TABLE public.users ADD COLUMN %I %s', expected.col, expected.typ);
    ELSIF actual_type <> expected.typ THEN
      RAISE EXCEPTION 'تعارض في users.% : الموجود % والمتوقع % — أوقف الترحيل للمراجعة',
        expected.col, actual_type, expected.typ;
    END IF;
  END LOOP;

  SELECT data_type INTO actual_type
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='users' AND column_name='profile_completed';

  IF actual_type IS NULL THEN
    -- إضافة عمودية إضافية فقط: تملأ الصفوف القائمة بـ true (مقصود ومُوثّق)،
    -- ولا تُغيّر أي عمود قائم. لا تعديل تلقائي لبيانات موجودة في أعمدة أخرى.
    EXECUTE 'ALTER TABLE public.users ADD COLUMN profile_completed boolean NOT NULL DEFAULT true';
  ELSIF actual_type <> 'boolean' THEN
    RAISE EXCEPTION 'تعارض في users.profile_completed : الموجود % والمتوقع boolean — أوقف الترحيل للمراجعة',
      actual_type;
  ELSE
    -- موجود مسبقًا: نتحقق (النوع أعلاه + قابلية NULL + الافتراضي) دون تغيير أي قيمة.
    SELECT is_nullable, column_default INTO prof_nullable, prof_default
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users' AND column_name='profile_completed';

    IF prof_nullable IS DISTINCT FROM 'NO' THEN
      RAISE EXCEPTION 'users.profile_completed يقبل NULL (is_nullable=%) — أوقف الترحيل لمراجعة السياسة',
        prof_nullable;
    END IF;

    IF prof_default IS NULL OR lower(btrim(prof_default)) <> 'true' THEN
      RAISE EXCEPTION 'users.profile_completed له افتراضي غير متوقع (%) — أوقف الترحيل للمراجعة',
        prof_default;
    END IF;
  END IF;
END $$;

-- 1.3 التسلسل: تحقّق من التعريف القائم، وأنشئه فقط عند غيابه، وارفض الاختلاف.
DO $$
DECLARE
  seq record;
BEGIN
  IF to_regclass('public.molim_id_seq') IS NULL THEN
    EXECUTE 'CREATE SEQUENCE public.molim_id_seq AS bigint INCREMENT BY 1 MINVALUE 1 NO CYCLE CACHE 1';
  ELSE
    SELECT data_type, start_value, min_value, increment_by, cycle, cache_size
      INTO seq
    FROM pg_sequences
    WHERE schemaname='public' AND sequencename='molim_id_seq';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'التسلسل public.molim_id_seq موجود لكن غير قابل للقراءة من pg_sequences — أوقف الترحيل للمراجعة';
    END IF;

    -- pg_sequences.data_type نوعه regtype (لا text)، لذا المقارنة مع 'bigint'::regtype
    -- صحيحة ومطابقة للنوع الفعلي. تسلسل أُنشئ بـ AS bigint يُرجع 'bigint' هنا.
    IF seq.data_type    IS DISTINCT FROM 'bigint'::regtype
       OR seq.start_value IS DISTINCT FROM 1
       OR seq.min_value   IS DISTINCT FROM 1
       OR seq.increment_by IS DISTINCT FROM 1
       OR seq.cycle       IS DISTINCT FROM false
       OR seq.cache_size  IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION
        'تعارض في تعريف التسلسل public.molim_id_seq (type=%, start=%, min=%, inc=%, cycle=%, cache=%) — أوقف الترحيل للمراجعة',
        seq.data_type, seq.start_value, seq.min_value, seq.increment_by, seq.cycle, seq.cache_size;
    END IF;
  END IF;
END $$;

-- 1.4 بذرة التسلسل: لا تُرجع القيمة للخلف أبدًا، وآمنة عند إعادة التشغيل.
--     تقرأ last_value/is_called دون استهلاك، وتُعيّن فقط عند الحاجة.
--     الانتقال من max+1: بعد COMMIT يصبح مسار max+1 غير مستخدَم (الدالة موجودة).
--     أي طلب جارٍ كان قد حسب max+1 قد يتعارض، ويُعالج بإعادة المحاولة على قيد
--     التفرد (المفحوص في 1.1). لا يعتمد هذا على القفل وحده.
--     ⚠ setval/nextval عمليّتان غير معامليّتين (non-transactional): لا يعيدهما
--     ROLLBACK. لذا قد يبقى التسلسل متقدّمًا (تظهر «فجوات» في أرقام MOL-) حتى لو
--     فشلت هذه المعاملة أو تراجعت. الفجوات غير ضارّة (المطلوب التفرّد لا التسلسل
--     الرقمي)، لكنها متوقّعة ويجب عدم الاعتماد على التسلسل المتّصل.
DO $$
DECLARE
  max_num bigint;
  cur     bigint;
  called  boolean;
BEGIN
  SELECT MAX(substring(id from '^MOL-?([0-9]+)$')::bigint)
    INTO max_num
  FROM public.users
  WHERE id ~ '^MOL-?[0-9]{1,18}$';

  SELECT last_value, is_called INTO cur, called
  FROM public.molim_id_seq;

  IF max_num IS NULL THEN
    RETURN; -- لا أعضاء: اترك التسلسل على حاله.
  END IF;

  IF called THEN
    IF max_num > cur THEN
      PERFORM setval('public.molim_id_seq', max_num, true);
    END IF;
  ELSE
    IF max_num >= cur THEN
      PERFORM setval('public.molim_id_seq', max_num, true);
    END IF;
  END IF;
END $$;

-- 1.5 الدالة: توقف إن وُجدت مسبقًا (ممنوع الاستبدال التلقائي).
DO $$
BEGIN
  IF to_regprocedure('public.next_molim_id()') IS NOT NULL THEN
    RAISE EXCEPTION 'الدالة public.next_molim_id() موجودة مسبقًا — أوقف الترحيل لمراجعة تعريفها';
  END IF;
END $$;

-- 1.6 إنشاء الدالة (بلا OR REPLACE).
CREATE FUNCTION public.next_molim_id()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT 'MOL-' || CASE
           WHEN length(v::text) >= 5 THEN v::text
           ELSE lpad(v::text, 5, '0')
         END
  FROM ( SELECT nextval('public.molim_id_seq') AS v ) AS s;
$$;

COMMENT ON FUNCTION public.next_molim_id() IS
  'يولّد MOL-NNNNN ذرّيًا عبر التسلسل. لا يقتطع الأرقام >= 5 خانات. يستهلك رقمًا عند كل استدعاء.';

-- 1.7 الصلاحيات: أقل ما يلزم.
REVOKE ALL ON FUNCTION public.next_molim_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_molim_id() TO service_role;
REVOKE ALL ON SEQUENCE public.molim_id_seq FROM PUBLIC;

-- 1.8 تحقق فعلي: وجود service_role، ووحدة مالك الدالة/التسلسل، والامتيازات.
--     SECURITY DEFINER يعمل بصلاحيات المالك، لذا يجب أن يملك مالك الدالة التسلسل.
--     ⚠ ALTER FUNCTION ... OWNER TO يتطلب أن يكون دور الترحيل (current_user) عضوًا
--     في seq_owner أو superuser، وأن يملك seq_owner صلاحية CREATE على المخطط public.
--     في Supabase: تُشغَّل الترحيلات عادةً بدور postgres (ليس superuser دائمًا)،
--     فقد يفشل ALTER OWNER إذا كان التسلسل مملوكًا لدور لا ينتمي إليه postgres
--     (مثل supabase_admin). عمليًا: التسلسل يُنشأ في هذه المعاملة نفسها فيتساوى
--     المالك ولا يُنفّذ ALTER. عند اختلاف المالك قد يفشل الأمر بخطأ صلاحية يجُهض
--     المعاملة (آمن لكن برسالة أقل وضوحًا). [VERIFY] قبل التنفيذ.
DO $$
DECLARE
  fn_owner  text;
  seq_owner text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    RAISE EXCEPTION 'الدور service_role غير موجود — أوقف الترحيل للمراجعة';
  END IF;

  SELECT pg_get_userbyid(proowner) INTO fn_owner
  FROM pg_proc WHERE oid = 'public.next_molim_id()'::regprocedure;
  SELECT pg_get_userbyid(relowner) INTO seq_owner
  FROM pg_class WHERE oid = 'public.molim_id_seq'::regclass;

  IF fn_owner <> seq_owner THEN
    EXECUTE format('ALTER FUNCTION public.next_molim_id() OWNER TO %I', seq_owner);
    SELECT pg_get_userbyid(proowner) INTO fn_owner
    FROM pg_proc WHERE oid = 'public.next_molim_id()'::regprocedure;
    IF fn_owner <> seq_owner THEN
      RAISE EXCEPTION 'تعذّر توحيد مالك الدالة % مع مالك التسلسل % — أوقف الترحيل للمراجعة',
        fn_owner, seq_owner;
    END IF;
  END IF;

  IF NOT has_function_privilege('service_role', 'public.next_molim_id()'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role لا يملك EXECUTE على الدالة — أوقف الترحيل للمراجعة';
  END IF;

  IF NOT has_sequence_privilege(seq_owner, 'public.molim_id_seq'::regclass, 'USAGE') THEN
    RAISE EXCEPTION 'مالك التسلسل % لا يملك USAGE على التسلسل — أوقف الترحيل للمراجعة', seq_owner;
  END IF;
END $$;

-- 1.9 الفهارس: تحقّق كامل من الخصائص والجاهزية عبر الكتالوج.
--     يشمل: indisvalid/indisready/indislive (الجاهزية)، indnatts/indnkeyatts (عمود
--     واحد بلا أعمدة مُضمّنة INCLUDE)، indisunique، amname=btree، والعمود المفتاحي،
--     وشرط الفهرس الجزئي بمطابقة معيارية دقيقة (تطبيع المسافات وحالة الأحرف، ثم
--     مطابقة نمط صارم يسمح فقط بوجود/غياب قوسين خارجيين — لا بحث LIKE تقريبي).
DO $$
DECLARE
  idx      record;
  col_name text;
BEGIN
  -- فهرس link_code: صالح وجاهز، عادي، غير جزئي، عمود واحد، btree.
  SELECT i.indisunique, i.indisvalid, i.indisready, i.indislive,
         i.indpred IS NOT NULL AS is_partial,
         i.indnatts, i.indnkeyatts, i.indkey[0] AS key0, i.indrelid, am.amname
    INTO idx
  FROM pg_index i
  JOIN pg_class ic ON ic.oid = i.indexrelid
  JOIN pg_class tc ON tc.oid = i.indrelid
  JOIN pg_namespace ns ON ns.oid = tc.relnamespace
  JOIN pg_am am ON am.oid = ic.relam
  WHERE ns.nspname='public' AND tc.relname='users' AND ic.relname='users_link_code_idx';

  IF NOT FOUND THEN
    EXECUTE 'CREATE INDEX users_link_code_idx ON public.users (link_code)';
  ELSE
    SELECT attname INTO col_name
    FROM pg_attribute WHERE attrelid=idx.indrelid AND attnum=idx.key0;
    IF NOT idx.indisvalid OR NOT idx.indisready OR NOT idx.indislive
       OR idx.indisunique OR idx.is_partial
       OR idx.indnatts <> 1 OR idx.indnkeyatts <> 1
       OR col_name IS DISTINCT FROM 'link_code' OR idx.amname <> 'btree' THEN
      RAISE EXCEPTION
        'تعارض/عدم جاهزية في users_link_code_idx (valid=%, ready=%, live=%, unique=%, partial=%, atts=%, keys=%, col=%, am=%) — أوقف الترحيل للمراجعة',
        idx.indisvalid, idx.indisready, idx.indislive, idx.indisunique, idx.is_partial,
        idx.indnatts, idx.indnkeyatts, col_name, idx.amname;
    END IF;
  END IF;

  -- فهرس telegram_id: صالح وجاهز، فريد، جزئي، عمود واحد، btree، والشرط مطابق.
  SELECT i.indisunique, i.indisvalid, i.indisready, i.indislive,
         i.indpred IS NOT NULL AS is_partial,
         i.indnatts, i.indnkeyatts, i.indkey[0] AS key0, i.indrelid, am.amname,
         regexp_replace(lower(coalesce(pg_get_expr(i.indpred, i.indrelid), '')), '\s+', '', 'g') AS prednorm
    INTO idx
  FROM pg_index i
  JOIN pg_class ic ON ic.oid = i.indexrelid
  JOIN pg_class tc ON tc.oid = i.indrelid
  JOIN pg_namespace ns ON ns.oid = tc.relnamespace
  JOIN pg_am am ON am.oid = ic.relam
  WHERE ns.nspname='public' AND tc.relname='users' AND ic.relname='users_telegram_id_key';

  IF NOT FOUND THEN
    EXECUTE 'CREATE UNIQUE INDEX users_telegram_id_key ON public.users (telegram_id) WHERE telegram_id IS NOT NULL';
  ELSE
    SELECT attname INTO col_name
    FROM pg_attribute WHERE attrelid=idx.indrelid AND attnum=idx.key0;
    IF NOT idx.indisvalid OR NOT idx.indisready OR NOT idx.indislive
       OR NOT idx.indisunique OR NOT idx.is_partial
       OR idx.indnatts <> 1 OR idx.indnkeyatts <> 1
       OR col_name IS DISTINCT FROM 'telegram_id' OR idx.amname <> 'btree'
       OR idx.prednorm !~ '^\(?telegram_idisnotnull\)?$' THEN
      RAISE EXCEPTION
        'تعارض/عدم جاهزية في users_telegram_id_key (valid=%, ready=%, live=%, unique=%, partial=%, atts=%, keys=%, col=%, am=%, pred=%) — أوقف الترحيل للمراجعة',
        idx.indisvalid, idx.indisready, idx.indislive, idx.indisunique, idx.is_partial,
        idx.indnatts, idx.indnkeyatts, col_name, idx.amname, idx.prednorm;
    END IF;
  END IF;
END $$;

COMMIT;
-- يُحرَّر القفل هنا.

-- =============================================================================
-- 2) تحقق بعد الترحيل (قراءة فقط — لا يستهلك تسلسلًا)
-- =============================================================================
-- SELECT indexname, indexdef FROM pg_indexes
--   WHERE schemaname='public' AND tablename='users'
--     AND indexname IN ('users_link_code_idx','users_telegram_id_key');
-- SELECT profile_completed, count(*) FROM public.users GROUP BY 1;
-- SELECT pg_get_userbyid(proowner) FROM pg_proc
--   WHERE oid = 'public.next_molim_id()'::regprocedure;

-- =============================================================================
-- 2.b) تحقق «مُستهلك» (اختياري) — تحذير: يستهلك رقمًا من التسلسل
-- =============================================================================
-- لا تضع هذا ضمن فحوصات القراءة. كل استدعاء يقدّم العداد رقمًا.
--   -- SELECT public.next_molim_id();   -- ⚠ يستهلك رقمًا

-- =============================================================================
-- 3) التراجع (Rollback) — لا يحذف أي بيانات أو أعمدة
-- =============================================================================
-- لا تُسقِط: profile_completed / link_code / link_code_expires_at /
-- link_code_used_at (قد تحتوي بيانات جديدة)، ولا التسلسل (أرقام مستهلكة).
-- ⚠ setval/nextval غير معامليّة: التراجع لا يُرجع قيمة التسلسل للخلف، وقد تبقى
-- فجوات في أرقام MOL- (حتى لو فشلت المعاملة قبل COMMIT). هذا سلوك متوقّع ومقبول
-- لأن المطلوب تفرّد المعرّفات لا اتصالها، ولا يجوز افتراض تسلسل متّصل.
-- التراجع الآمن الوحيد:
--   BEGIN;
--     DROP FUNCTION IF EXISTS public.next_molim_id();
--     DROP INDEX IF EXISTS public.users_telegram_id_key;
--     DROP INDEX IF EXISTS public.users_link_code_idx;
--     -- اترك الأعمدة والتسلسل كما هي.
--   COMMIT;
-- إسقاط الأعمدة لاحقًا (غير مطلوب الآن): خطة منفصلة + نسخة احتياطية مُختبرة.
