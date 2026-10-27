-- =============================================================================
-- مُلَم — اتفاقيات التطوع
-- مسار: db/planned/0005_volunteer_agreements.sql
-- الغرض: إنشاء جدول volunteer_agreements لحفظ اتفاقيات المتطوعين مع دعم التجديد.
-- التطبيق: نفّذ هذا الملف في Supabase SQL Editor.
-- =============================================================================

-- 1. إنشاء جدول الاتفاقيات
CREATE TABLE IF NOT EXISTS public.volunteer_agreements (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          text        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  duration_months  integer     NOT NULL CHECK (duration_months IN (1, 2, 3)),
  signed_at        timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  agreement_version text       NOT NULL DEFAULT 'v1.0',
  status           text        NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'expired', 'renewed')),
  is_renewal       boolean     NOT NULL DEFAULT false,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- 2. الفهارس
-- فهرس للبحث السريع باسم المستخدم
CREATE INDEX IF NOT EXISTS idx_volunteer_agreements_user_id
  ON public.volunteer_agreements (user_id);

-- فهرس لجلب الاتفاقيات النشطة بسرعة
CREATE INDEX IF NOT EXISTS idx_volunteer_agreements_status
  ON public.volunteer_agreements (status)
  WHERE status = 'active';

-- فهرس مركّب للاتفاقية النشطة الحالية لكل مستخدم
CREATE INDEX IF NOT EXISTS idx_volunteer_agreements_user_active
  ON public.volunteer_agreements (user_id, status, expires_at DESC);

-- 3. منع وجود أكثر من اتفاقية نشطة واحدة لكل مستخدم في نفس الوقت
-- (نفّذ هذا بعد التأكد من أن البيانات الحالية لا تحتوي على تعارض)
CREATE UNIQUE INDEX IF NOT EXISTS idx_volunteer_agreements_one_active_per_user
  ON public.volunteer_agreements (user_id)
  WHERE status = 'active';

-- 4. دالة لتجديد الاتفاقية: تُحدّث القديمة إلى "renewed" وتُنشئ سجلاً جديداً
CREATE OR REPLACE FUNCTION public.renew_volunteer_agreement(
  p_user_id          text,
  p_duration_months  integer,
  p_version          text DEFAULT 'v1.0'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_id uuid;
BEGIN
  -- تحديث الاتفاقيات النشطة القديمة إلى "renewed"
  UPDATE public.volunteer_agreements
  SET status = 'renewed'
  WHERE user_id = p_user_id
    AND status = 'active';

  -- إنشاء الاتفاقية الجديدة
  INSERT INTO public.volunteer_agreements
    (user_id, duration_months, expires_at, agreement_version, is_renewal)
  VALUES (
    p_user_id,
    p_duration_months,
    now() + (p_duration_months || ' months')::interval,
    p_version,
    true
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- 5. سحب الصلاحيات العامة من الدالة ومنحها لـ service_role فقط
REVOKE ALL ON FUNCTION public.renew_volunteer_agreement FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renew_volunteer_agreement TO service_role;

-- 6. Row Level Security (RLS)
ALTER TABLE public.volunteer_agreements ENABLE ROW LEVEL SECURITY;

-- service_role يتمتع بوصول كامل (يتجاوز RLS تلقائياً في Supabase)
-- لا حاجة لسياسة خاصة به.

-- للتحقق بعد التطبيق:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'volunteer_agreements'
-- ORDER BY ordinal_position;

-- SELECT * FROM public.volunteer_agreements LIMIT 5;
