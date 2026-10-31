-- انسخ هذا الـ SQL وشغّله في Supabase Dashboard → SQL Editor
-- الرابط: https://supabase.com/dashboard/project/ajewxqpdwzvitffgmcxs/sql/new

CREATE TABLE IF NOT EXISTS public.volunteer_notion_history (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  access_code  text        NOT NULL UNIQUE,
  name         text        NOT NULL,
  email        text        NULL,
  total_hours  numeric     NOT NULL DEFAULT 0,
  tasks        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  claimed_by   text        NULL REFERENCES public.users(id) ON DELETE SET NULL,
  claimed_at   timestamptz NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS volunteer_notion_history_access_code_idx
  ON public.volunteer_notion_history (access_code);

CREATE INDEX IF NOT EXISTS volunteer_notion_history_claimed_by_idx
  ON public.volunteer_notion_history (claimed_by)
  WHERE claimed_by IS NOT NULL;

ALTER TABLE public.volunteer_notion_history ENABLE ROW LEVEL SECURITY;
