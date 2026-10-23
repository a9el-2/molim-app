-- =============================================================================
-- مُلَم — خطة ترحيل مقترحة (REVIEW ONLY) — لا تُنفّذ تلقائيًا
-- مسار: db/planned/0003a_task_audit_enum_values.sql
-- الغرض: إضافة قيم جديدة لنوع التعداد audit_action لتغطية دورة حياة المهام الجديدة
--         (قبول، اعتذار، تسليم، مراجعة، انسحاب، إلغاء، سحب).
-- الحالة: مسودة مراجعة جاهزة للاختبار على بيئة PostgreSQL 15+ تجريبية منفصلة.
--
-- ملاحظة معمارية هامة (لماذا هذا الملف منفصل وبلا BEGIN/COMMIT؟):
-- في محرك PostgreSQL، لا يمكن استخدام أي قيمة تعداد (enum) جديدة أُضيفت عبر
-- ALTER TYPE ADD VALUE داخل نفس المعاملة (transaction) التي أُضيفت فيها. كما أن
-- تنفيذ ADD VALUE داخل كتل BEGIN/COMMIT المتعددة الأوامر غير مسموح به في بعض
-- أدوات وإصدارات PostgreSQL (كما حدث وفصلنا في 0002a).
-- لذلك يتم تنفيذ هذا الملف أولاً وبشكل منفصل لضمان تسجيل القيم في الكتالوج قبل
-- تشغيل دوال ومخطط المهام في 0003b.
--
-- القيم الجديدة المضافة (7 قيم):
--   1. accept_task   : قبول العضو للمهمة وبدء تنفيذها (تحويلها إلى in_progress).
--   2. decline_task  : اعتذار العضو عن مهمة موجهة إليه (offered -> declined).
--   3. submit_task   : تسليم العضو للمهمة المكتملة وطلب المراجعة (submitted).
--   4. review_task   : مراجعة المسؤول للتسليم (اعتماد approve، طلب تعديل revise، أو رفض نهائي reject_final).
--   5. withdraw_task : انسحاب العضو من المهمة بعد بدئها بعذر واضح (withdrawn).
--   6. cancel_task   : إلغاء المهمة كلياً من قبل الإدارة لسبب إداري واضح (cancelled).
--   7. release_task  : سحب المهمة من العضو لتعثره أو عدم إنجازه وإعادتها للقسم (released).
--
-- قابلية إعادة التشغيل (Idempotence):
--   يستخدم كل أمر IF NOT EXISTS، وبالتالي فإن إعادة تشغيل الملف آمنة تماماً ولن تسبب أي أخطاء.
-- =============================================================================

-- إضافة القيم السبع الجديدة إلى تعداد audit_action بأمان:
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'accept_task';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'decline_task';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'submit_task';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'review_task';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'withdraw_task';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'cancel_task';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'release_task';

-- =============================================================================
-- استعلام تحقق بعد التنفيذ (قراءة فقط — لا يعدّل شيئًا):
-- =============================================================================
-- SELECT e.enumlabel, e.enumsortorder
-- FROM pg_enum e
-- JOIN pg_type t ON t.oid = e.enumtypid
-- JOIN pg_namespace n ON n.oid = t.typnamespace
-- WHERE n.nspname = 'public' AND t.typname = 'audit_action'
-- ORDER BY e.enumsortorder;
