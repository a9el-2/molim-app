-- =============================================================================
-- مُلَم — خطة ترحيل مقترحة (REVIEW ONLY) — لا تُنفّذ تلقائيًا
-- مسار: db/planned/0002c_audit_append_only_trigger.sql
-- الغرض:
--   حماية جدول سجل التدقيق (audit_logs) بجعله للإضافة فقط (Append-Only) عبر مشغّل (Trigger)
--   ودالة أمنية تمنع أي UPDATE أو DELETE أو TRUNCATE نهائيًا برسالة خطأ صريحة، حتى لو
--   استُخدم المفتاح الإداري (service_role).
-- الحالة: مسودة مراجعة جاهزة للاختبار على بيئة PostgreSQL 15+ تجريبية منفصلة.
--
-- ملاحظة معمارية وتوقيت التطبيق:
--   فُصل هذا المشغّل في ملف مستقل ليتم تطبيقه كآخر خطوة قبل الإطلاق الفعلي المباشر؛
--   وذلك لإتاحة المجال لتنظيف سجلات التجارب والاختبارات الأولية أثناء مرحلة التطوير.
--
-- تعليمات التراجع (Rollback):
--   في حال الرغبة في إزالة المشغّلات والسماح بتعديل أو تنظيف جدول audit_logs:
--
--   BEGIN;
--     DROP TRIGGER IF EXISTS audit_logs_prevent_tampering_stmt ON public.audit_logs;
--     DROP TRIGGER IF EXISTS audit_logs_prevent_tampering_row  ON public.audit_logs;
--     DROP FUNCTION IF EXISTS public.prevent_audit_logs_tampering();
--   COMMIT;
-- =============================================================================

-- =============================================================================
-- 1) بدء المعاملة الذرية
-- =============================================================================
BEGIN;

-- -----------------------------------------------------------------------------
-- 1.1 فحص حارس: التحقق من وجود جدول audit_logs
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.audit_logs') IS NULL THEN
    RAISE EXCEPTION 'الجدول public.audit_logs غير موجود — أوقف الترحيل للمراجعة';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1.2 دالة حماية سجل التدقيق audit_logs
--     تمنع UPDATE و DELETE و TRUNCATE وتوفر مسار بحث محكم وأمان SECURITY DEFINER
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_audit_logs_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'جدول سجل التدقيق (audit_logs) مخصص للإضافة فقط (Append-Only): يمنع تنفيذ عملية % نهائيًا لحفظ النزاهة والامتثال الأمني.', TG_OP
    USING ERRCODE = 'restrict_violation';
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.prevent_audit_logs_tampering() IS
  'حارس أمني لمنع أي تعديل أو حذف أو تفريغ لسجلات التدقيق في public.audit_logs.';

-- -----------------------------------------------------------------------------
-- 1.3 مشغّل على مستوى العبارة (Statement Level)
--     يعترض عمليات UPDATE, DELETE, TRUNCATE فورًا قبل فحص أو معالجة أي صف
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS audit_logs_prevent_tampering_stmt ON public.audit_logs;
CREATE TRIGGER audit_logs_prevent_tampering_stmt
BEFORE UPDATE OR DELETE OR TRUNCATE ON public.audit_logs
FOR EACH STATEMENT
EXECUTE FUNCTION public.prevent_audit_logs_tampering();

-- -----------------------------------------------------------------------------
-- 1.4 مشغّل على مستوى كل صف (Row Level)
--     طبقة حماية ثانية تمنع التعديل والحذف على مستوى الصفوف الفردية
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS audit_logs_prevent_tampering_row ON public.audit_logs;
CREATE TRIGGER audit_logs_prevent_tampering_row
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.prevent_audit_logs_tampering();

-- =============================================================================
-- إنهاء وتثبيت المعاملة الذرية
-- =============================================================================
COMMIT;

-- =============================================================================
-- 2) فحوصات ما بعد الترحيل (قراءة فقط — للتأكد من نجاح التطبيق)
-- =============================================================================
-- SELECT tgname, tgtype, tgenabled
-- FROM pg_trigger
-- WHERE tgrelid = 'public.audit_logs'::regclass
--   AND tgname IN ('audit_logs_prevent_tampering_stmt', 'audit_logs_prevent_tampering_row');
