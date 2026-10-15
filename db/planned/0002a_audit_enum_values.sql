-- =============================================================================
-- مُلَم — خطة ترحيل مقترحة (REVIEW ONLY) — لا تُنفّذ تلقائيًا
-- مسار: db/planned/0002a_audit_enum_values.sql
-- الغرض: إضافة قيم جديدة لنوع التعداد audit_action لتغطية كافة أحداث الساعات والمهام والأعضاء.
-- الحالة: مسودة مراجعة جاهزة للاختبار على بيئة تجريبية منفصلة.
-- الإصدار المتوقع: PostgreSQL 15+ (Supabase).
--
-- ملاحظة معمارية هامة (لماذا هذا الملف منفصل وبلا BEGIN/COMMIT؟):
-- في محرك PostgreSQL، لا يمكن استخدام أي قيمة تعداد (enum) جديدة أُضيفت عبر ALTER TYPE ADD VALUE
-- داخل نفس المعاملة (transaction) التي أُضيفت فيها. كما أن بعض إصدارات وأدوات PostgreSQL تمنع
-- تنفيذ ADD VALUE داخل كتل BEGIN/COMMIT المتعددة الأوامر.
-- لذلك يتم تنفيذ هذا الملف أولاً وبشكل منفصل، لضمان تسجيل القيم في الكتالوج قبل تطبيق قيود
-- الجداول والسياسات اللاحقة.
--
-- القيم الجديدة المضافة (7 قيم):
--   1. submit_hours       : تسجيل ساعات جديدة من المتطوع.
--   2. edit_hours         : تعديل ساعات مسجلة سابقًا (قيد المراجعة أو مرفوضة).
--   3. self_approve_hours : اعتماد ذاتي تلقائي لساعات الرئيس العام عند غياب رئيس عام آخر.
--   4. create_task        : إنشاء مهمة جديدة.
--   5. update_task        : تعديل مهمة قائمة.
--   6. create_member      : إنشاء عضو جديد في المنصة.
--   7. link_account       : ربط حساب تيليجرام بالعضو عبر كود الربط.
--
-- قابلية إعادة التشغيل (Idempotence):
--   يستخدم كل أمر IF NOT EXISTS، وبالتالي فإن إعادة تشغيل الملف آمنة تمامًا ولن تسبب أي أخطاء.
--
-- التراجع (Rollback):
--   في PostgreSQL، لا يوجد أمر مباشر لحذف قيمة من نوع التعداد (لا يوجد ALTER TYPE DROP VALUE).
--   القيم المضافة لا تضر بقاءها ولا تؤثر على سلامة البيانات أو الأداء إذا لم تُستخدم.
--   إذا كان التراجع الصارم إجباريًا، يتطلب ذلك إعادة إنشاء النوع من جديد بخطوات:
--     1) CREATE TYPE audit_action_old AS ENUM (...القيم الأصلية فقط...);
--     2) تحويل الأعمدة المستخدمة للنوع المؤقت.
--     3) DROP TYPE audit_action;
--     4) ALTER TYPE audit_action_old RENAME TO audit_action;
-- =============================================================================

-- إضافة القيم الجديدة إلى تعداد audit_action بأمان:
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'submit_hours';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'edit_hours';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'self_approve_hours';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'create_task';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'update_task';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'create_member';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'link_account';

-- =============================================================================
-- استعلام تحقق بعد التنفيذ (قراءة فقط — لا يعدّل شيئًا):
-- =============================================================================
-- SELECT e.enumlabel, e.enumsortorder
-- FROM pg_enum e
-- JOIN pg_type t ON t.oid = e.enumtypid
-- JOIN pg_namespace n ON n.oid = t.typnamespace
-- WHERE n.nspname = 'public' AND t.typname = 'audit_action'
-- ORDER BY e.enumsortorder;
