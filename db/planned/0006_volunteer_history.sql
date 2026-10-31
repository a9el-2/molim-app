-- =============================================================================
-- مُلَم — ترحيل: جدول سجل التطوع السابق (volunteer_notion_history)
-- المسار: db/planned/0006_volunteer_history.sql
-- الغرض:
--   تخزين بيانات المتطوعين المستوردة من Notion مع access_code الخاص بكل عضو،
--   ليتمكّن كل متطوع لاحقاً من "استعادة" سجله التاريخي عبر إدخال access_code حقه.
-- =============================================================================

BEGIN;

-- الجدول الرئيسي لسجل التطوع السابق
CREATE TABLE IF NOT EXISTS public.volunteer_notion_history (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  access_code  text        NOT NULL UNIQUE,        -- كود Notion الفريد لكل متطوع
  name         text        NOT NULL,
  email        text        NULL,
  total_hours  numeric     NOT NULL DEFAULT 0,
  -- قائمة المهام كـ JSONB: [{title, hours, date, description, department}]
  tasks        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  -- حقول الاستعادة
  claimed_by   text        NULL REFERENCES public.users(id) ON DELETE SET NULL,
  claimed_at   timestamptz NULL,
  -- تدقيق
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- فهرس للبحث السريع بـ access_code
CREATE INDEX IF NOT EXISTS volunteer_notion_history_access_code_idx
  ON public.volunteer_notion_history (access_code);

-- فهرس للبحث بمن استعاد البيانات
CREATE INDEX IF NOT EXISTS volunteer_notion_history_claimed_by_idx
  ON public.volunteer_notion_history (claimed_by)
  WHERE claimed_by IS NOT NULL;

-- RLS: تفعيل أمان الصفوف
ALTER TABLE public.volunteer_notion_history ENABLE ROW LEVEL SECURITY;

-- Service role فقط يقرأ ويكتب (الـ API route يستخدم service_role)
-- لا نسمح لأي مستخدم مباشر بالقراءة من العميل
CREATE POLICY "service_role_only" ON public.volunteer_notion_history
  AS RESTRICTIVE
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
