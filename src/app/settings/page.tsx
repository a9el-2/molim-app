"use client";

import Link from "next/link";
import { useState } from "react";
import RoleGuard from "../components/RoleGuard";

type SettingSection =
  | "المنصة"
  | "التسجيل"
  | "الدعوات"
  | "الاتفاقيات"
  | "الساعات"
  | "الشهادات"
  | "الإشعارات"
  | "الأمان";

const sections: {
  id: SettingSection;
  title: string;
  description: string;
  icon: string;
}[] = [
  {
    id: "المنصة",
    title: "معلومات المنصة",
    description: "إعدادات الاسم والوصف والمعلومات الأساسية.",
    icon: "🏢",
  },
  {
    id: "التسجيل",
    title: "التسجيل والانضمام",
    description: "التحكم في خطوات تسجيل المتطوعين.",
    icon: "📝",
  },
  {
    id: "الدعوات",
    title: "دعوات الانضمام",
    description: "إعدادات صلاحية واستخدام الدعوات.",
    icon: "🎟️",
  },
  {
    id: "الاتفاقيات",
    title: "اتفاقيات التطوع",
    description: "إعدادات مدة الاتفاقيات والتجديد.",
    icon: "📄",
  },
  {
    id: "الساعات",
    title: "الساعات التطوعية",
    description: "إعدادات تسجيل الساعات ومراجعتها.",
    icon: "⏱️",
  },
  {
    id: "الشهادات",
    title: "الشهادات",
    description: "إعدادات الشهادات وطلبات التوصيات.",
    icon: "🎓",
  },
  {
    id: "الإشعارات",
    title: "الإشعارات",
    description: "التحكم في أنواع التنبيهات.",
    icon: "🔔",
  },
  {
    id: "الأمان",
    title: "الأمان",
    description: "إعدادات الأمان والسجل ومراقبة الحسابات.",
    icon: "🔒",
  },
];

export default function SettingsPage() {
  const [selectedSection, setSelectedSection] =
    useState<SettingSection | null>(null);

  const [platformName, setPlatformName] =
    useState("مُلم");

  const [platformDescription, setPlatformDescription] =
    useState(
      "منصة إدارة العمل التطوعي لفريق مُلم."
    );

  const [registrationEnabled, setRegistrationEnabled] =
    useState(true);

  const [requireInvite, setRequireInvite] =
    useState(true);

  const [agreementDuration, setAgreementDuration] =
    useState("3");

  const [automaticRenewal, setAutomaticRenewal] =
    useState(false);

  const [hoursRequireReview, setHoursRequireReview] =
    useState(true);

  const [allowVolunteerEditHours, setAllowVolunteerEditHours] =
    useState(false);

  const [certificate40Hours, setCertificate40Hours] =
    useState(true);

  const [experience300Hours, setExperience300Hours] =
    useState(true);

  const [notificationsEnabled, setNotificationsEnabled] =
    useState(true);

  const [taskNotifications, setTaskNotifications] =
    useState(true);

  const [hoursNotifications, setHoursNotifications] =
    useState(true);

  const [certificateNotifications, setCertificateNotifications] =
    useState(true);

  const [loginAlerts, setLoginAlerts] =
    useState(true);

  const [auditEnabled, setAuditEnabled] =
    useState(true);

  const [saved, setSaved] = useState(false);

  function openSection(section: SettingSection) {
    setSelectedSection(section);
    setSaved(false);
  }

  function saveSettings() {
    setSaved(true);

    setTimeout(() => {
      setSaved(false);
    }, 2500);
  }

  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN"]}>
      <main
        dir="rtl"
        className="min-h-screen bg-molim px-4 py-5 text-molim-foreground"
      >
      <div className="mx-auto max-w-5xl">

        {/* Breadcrumb */}
        <div className="mb-5 text-sm text-molim-muted">
          <span>الرئيسية</span>
          <span className="mx-2">←</span>
          <span>الإدارة</span>
          <span className="mx-2">←</span>
          <span className="font-semibold text-molim-foreground">
            إعدادات النظام
          </span>
        </div>

        {/* Header */}
        <section className="mb-6">
          <h1 className="text-2xl font-bold">
            إعدادات النظام
          </h1>

          <p className="mt-2 text-sm leading-6 text-molim-muted">
            التحكم في إعدادات منصة مُلم والعمليات الأساسية
            المرتبطة بإدارة الفريق.
          </p>
        </section>

        {/* System Status */}
        <section className="mb-5 border border-molim bg-molim-surface p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

            <div>
              <p className="font-semibold">
                حالة النظام
              </p>

              <p className="mt-1 text-xs text-molim-muted">
                جميع إعدادات النظام تعمل حاليًا.
              </p>
            </div>

            <div className="border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">
              ● النظام يعمل
            </div>

          </div>
        </section>

        {/* Settings Sections */}
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2">

          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => openSection(section.id)}
              className="block w-full cursor-pointer border border-molim bg-molim-surface p-5 text-right transition hover:border-[#ed542f] hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">

                <div>
                  <div className="flex items-center gap-3">

                    <div className="bg-molim-soft px-3 py-2 text-lg">
                      {section.icon}
                    </div>

                    <div>
                      <h2 className="font-bold">
                        {section.title}
                      </h2>

                      <p className="mt-1 text-xs leading-5 text-molim-muted">
                        {section.description}
                      </p>
                    </div>

                  </div>
                </div>

                <span className="text-[#ed542f]">
                  ←
                </span>

              </div>
            </button>
          ))}

        </section>

        {/* Security Notice */}
        <section className="mt-5 border border-molim bg-molim-soft p-4">

          <p className="text-sm font-semibold">
            🔒 ملاحظة أمنية
          </p>

          <p className="mt-2 text-xs leading-6 text-molim-muted">
            إعدادات النظام الحساسة يجب أن تكون قابلة للتعديل
            من الحسابات المخولة فقط، ويجب تسجيل التغييرات في
            سجل العمليات.
          </p>

        </section>
      </div>

      {/* Settings Modal */}
      {selectedSection && (

        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedSection(null);
            }
          }}
        >

          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto border border-molim bg-molim-surface p-5 shadow-2xl">

            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4">

              <div>
                <p className="text-sm text-molim-muted">
                  إعدادات النظام
                </p>

                <h2 className="mt-1 text-xl font-bold">
                  {selectedSection}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setSelectedSection(null)}
                className="cursor-pointer bg-molim-soft px-3 py-2 hover:bg-molim-soft"
              >
                ✕
              </button>

            </div>

            <div className="mt-5 space-y-5">

              {/* Platform */}
              {selectedSection === "المنصة" && (
                <>
                  <InputField
                    label="اسم المنصة"
                    value={platformName}
                    onChange={setPlatformName}
                  />

                  <TextareaField
                    label="وصف المنصة"
                    value={platformDescription}
                    onChange={setPlatformDescription}
                  />
                </>
              )}

              {/* Registration */}
              {selectedSection === "التسجيل" && (
                <>
                  <ToggleRow
                    title="السماح بالتسجيل"
                    description="السماح ببدء عملية تسجيل المتطوعين."
                    checked={registrationEnabled}
                    onChange={setRegistrationEnabled}
                  />

                  <ToggleRow
                    title="اشتراط دعوة للانضمام"
                    description="لا يمكن بدء التسجيل الرسمي بدون دعوة صالحة."
                    checked={requireInvite}
                    onChange={setRequireInvite}
                  />
                </>
              )}

              {/* Invitations */}
              {selectedSection === "الدعوات" && (
                <>
                  <div className="border border-molim bg-molim-soft p-4">
                    <p className="text-sm font-semibold">
                      قاعدة الدعوات
                    </p>

                    <p className="mt-2 text-xs leading-5 text-molim-muted">
                      كل دعوة تستخدم مرة واحدة فقط، ويجب
                      إلغاؤها أو انتهاء صلاحيتها بعد المدة المحددة.
                    </p>
                  </div>
                </>
              )}

              {/* Agreements */}
              {selectedSection === "الاتفاقيات" && (
                <>
                  <div>
                    <label className="mb-2 block text-sm font-semibold">
                      المدة الافتراضية للاتفاقية
                    </label>

                    <select
                      value={agreementDuration}
                      onChange={(event) =>
                        setAgreementDuration(
                          event.target.value
                        )
                      }
                      className="h-12 w-full border border-molim bg-molim-soft px-4 outline-none focus:border-[#ed542f]"
                    >
                      <option value="1">
                        شهر واحد
                      </option>

                      <option value="2">
                        شهرين
                      </option>

                      <option value="3">
                        ثلاثة أشهر
                      </option>
                    </select>
                  </div>

                  <ToggleRow
                    title="التجديد التلقائي"
                    description="تجديد الاتفاقية تلقائيًا عند انتهائها."
                    checked={automaticRenewal}
                    onChange={setAutomaticRenewal}
                  />

                  <div className="border border-yellow-200 bg-yellow-50 p-4">
                    <p className="text-sm font-semibold text-yellow-800">
                      تنبيه
                    </p>

                    <p className="mt-1 text-xs leading-5 text-yellow-700">
                      الحد الأعلى المعتمد لمدة الاتفاقية هو
                      ثلاثة أشهر.
                    </p>
                  </div>

                  <Link
                    href="/agreements"
                    className="block h-12 bg-[#ed542f] text-center text-sm font-bold leading-[48px] text-white transition hover:bg-[#d94725]"
                  >
                    📄 إدارة الاتفاقيات ←
                  </Link>
                </>
              )}

              {/* Hours */}
              {selectedSection === "الساعات" && (
                <>
                  <ToggleRow
                    title="مراجعة الساعات قبل الاعتماد"
                    description="تظل الساعات قيد المراجعة حتى يعتمدها الشخص المخول."
                    checked={hoursRequireReview}
                    onChange={setHoursRequireReview}
                  />

                  <ToggleRow
                    title="السماح للمتطوع بتعديل الساعات"
                    description="يسمح للمتطوع بتعديل الساعات بعد إرسالها."
                    checked={allowVolunteerEditHours}
                    onChange={setAllowVolunteerEditHours}
                  />

                  <div className="border border-molim bg-molim-soft p-4">
                    <p className="text-sm font-semibold">
                      حالات الساعات
                    </p>

                    <div className="mt-3 space-y-2 text-sm">
                      <StatusLine text="قيد المراجعة" />
                      <StatusLine text="معتمدة" />
                      <StatusLine text="مرفوضة" />
                    </div>
                  </div>
                </>
              )}

              {/* Certificates */}
              {selectedSection === "الشهادات" && (
                <>
                  <ToggleRow
                    title="شهادة التطوع بعد 40 ساعة"
                    description="إتاحة الاستحقاق بعد الوصول إلى 40 ساعة معتمدة."
                    checked={certificate40Hours}
                    onChange={setCertificate40Hours}
                  />

                  <ToggleRow
                    title="شهادة الخبرة بعد 300 ساعة"
                    description="إتاحة الاستحقاق بعد الوصول إلى 300 ساعة معتمدة."
                    checked={experience300Hours}
                    onChange={setExperience300Hours}
                  />

                  <div className="border border-molim bg-molim-soft p-4">
                    <p className="text-sm font-semibold">
                      خطاب التوصية
                    </p>

                    <p className="mt-2 text-xs leading-6 text-molim-muted">
                      لا يعتمد على عدد ساعات ثابت، بل يراجع
                      بناءً على مدة التطوع والأداء والمهام والساعات
                      وتقييم رئيس القسم وعدم وجود مشكلات إدارية مؤثرة.
                    </p>
                  </div>
                </>
              )}

              {/* Notifications */}
              {selectedSection === "الإشعارات" && (
                <>
                  <ToggleRow
                    title="الإشعارات"
                    description="تفعيل نظام الإشعارات داخل المنصة."
                    checked={notificationsEnabled}
                    onChange={setNotificationsEnabled}
                  />

                  <ToggleRow
                    title="إشعارات المهام"
                    description="تنبيهات المهام والمراجعات."
                    checked={taskNotifications}
                    onChange={setTaskNotifications}
                  />

                  <ToggleRow
                    title="إشعارات الساعات"
                    description="تنبيهات اعتماد أو رفض الساعات."
                    checked={hoursNotifications}
                    onChange={setHoursNotifications}
                  />

                  <ToggleRow
                    title="إشعارات الشهادات"
                    description="تنبيهات طلبات وإصدار الشهادات."
                    checked={certificateNotifications}
                    onChange={setCertificateNotifications}
                  />
                </>
              )}

              {/* Security */}
              {selectedSection === "الأمان" && (
                <>
                  <ToggleRow
                    title="تنبيهات تسجيل الدخول"
                    description="تسجيل ومتابعة عمليات الدخول المهمة."
                    checked={loginAlerts}
                    onChange={setLoginAlerts}
                  />

                  <ToggleRow
                    title="سجل العمليات"
                    description="تسجيل العمليات الإدارية الحساسة."
                    checked={auditEnabled}
                    onChange={setAuditEnabled}
                  />

                  <div className="border border-red-200 bg-red-50 p-4">
                    <p className="text-sm font-semibold text-red-800">
                      إعدادات حساسة
                    </p>

                    <p className="mt-2 text-xs leading-6 text-red-700">
                      لا يتم تخزين مفاتيح API أو Bot Token أو أي
                      أسرار حساسة داخل هذه الصفحة أو داخل المتصفح.
                      تبقى هذه البيانات في بيئة الخادم فقط.
                    </p>
                  </div>
                </>
              )}

              {/* Save */}
              <button
                type="button"
                onClick={saveSettings}
                className="h-12 w-full cursor-pointer bg-[#ed542f] font-semibold text-white hover:bg-[#d94725]"
              >
                حفظ الإعدادات
              </button>

              {saved && (
                <div className="border border-green-200 bg-green-50 p-3 text-center text-sm font-semibold text-green-700">
                  ✅ تم حفظ الإعدادات
                </div>
              )}

              <button
                type="button"
                onClick={() => setSelectedSection(null)}
                className="h-12 w-full cursor-pointer border border-molim bg-molim-surface font-semibold text-molim-foreground hover:bg-molim-soft"
              >
                إغلاق
              </button>

            </div>
          </div>
        </div>
      )}
      </main>
    </RoleGuard>
  );
}

function InputField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold">
        {label}
      </label>

      <input
        type={type}
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="h-12 w-full border border-molim bg-molim-soft px-4 outline-none focus:border-[#ed542f]"
      />
    </div>
  );
}

function TextareaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold">
        {label}
      </label>

      <textarea
        rows={4}
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="w-full resize-none border border-molim bg-molim-soft p-4 outline-none focus:border-[#ed542f]"
      />
    </div>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border border-molim bg-molim-surface p-4">

      <div>
        <p className="text-sm font-semibold">
          {title}
        </p>

        <p className="mt-1 text-xs leading-5 text-molim-muted">
          {description}
        </p>
      </div>

      <button
        type="button"
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
        className={`relative h-7 w-12 shrink-0 cursor-pointer border transition ${
          checked
            ? "border-[#ed542f] bg-[#ed542f]"
            : "border-molim bg-molim-soft"
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 bg-molim-surface transition ${
            checked ? "right-1" : "left-1"
          }`}
        />
      </button>

    </div>
  );
}

function StatusLine({
  text,
}: {
  text: string;
}) {
  return (
    <div className="border border-molim bg-molim-surface px-3 py-2">
      {text}
    </div>
  );
}