"use client";

import { useState } from "react";
import Link from "next/link";

const durations = [
  {
    value: "1",
    title: "شهر واحد",
    description: "اتفاقية تطوع لمدة شهر واحد",
  },
  {
    value: "2",
    title: "شهران",
    description: "اتفاقية تطوع لمدة شهرين",
  },
  {
    value: "3",
    title: "ثلاثة أشهر",
    description: "الحد الأقصى لمدة الاتفاقية",
  },
];

export default function AgreementPage() {
  const [duration, setDuration] = useState("");
  const [agreed, setAgreed] = useState(false);

  const canContinue = duration !== "" && agreed;

  return (
    <main
      dir="rtl"
      className="relative min-h-screen overflow-hidden bg-molim-soft text-molim-foreground"
    >
      {/* الخلفية الهندسية */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-16 top-16 h-48 w-48 rotate-12 border-2 border-[#ed542f]/10" />

        <div className="absolute -left-10 top-80 h-32 w-32 -rotate-12 border border-[#202124]/10" />

        <div
          className="absolute right-8 top-44 h-24 w-24 border border-[#ed542f]/10"
          style={{
            clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)",
          }}
        />

        <div className="absolute bottom-24 left-0 h-px w-52 rotate-[18deg] bg-[#202124]/10" />
      </div>

      <div className="relative mx-auto max-w-md px-5 pb-14 pt-7">
        {/* الهيدر */}
        <header className="flex items-center justify-between border-b border-[#202124]/10 pb-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center bg-[#ed542f] text-xl font-black text-white">
              م
            </div>

            <div>
              <p className="text-[11px] text-molim-muted">
                منصة الفريق
              </p>

              <h1 className="text-lg font-black text-molim-foreground">
                مُلم
              </h1>
            </div>
          </Link>

          <span className="text-xs text-molim-muted">
            الخطوة الأخيرة
          </span>
        </header>

        {/* العنوان */}
        <section className="mt-9">
          <p className="text-sm font-bold text-[#ed542f]">
            اتفاقية التطوع
          </p>

          <h2 className="mt-2 text-3xl font-black leading-tight text-molim-foreground">
            مرحبًا بك في فريق مُلم
          </h2>

          <p className="mt-3 text-sm leading-7 text-molim-muted">
            قبل إكمال انضمامك، يرجى قراءة الاتفاقية بعناية واختيار
            مدة التطوع المناسبة لك، ثم تأكيد موافقتك إلكترونيًا.
          </p>
        </section>

        {/* بيانات الوثيقة */}
        <section className="mt-7 grid grid-cols-2 gap-2">
          <div className="border border-molim bg-molim-soft p-4">
            <p className="text-[11px] text-molim-muted">
              الوثيقة
            </p>

            <p className="mt-1 text-sm font-black text-molim-foreground">
              اتفاقية التطوع
            </p>
          </div>

          <div className="border border-molim bg-molim-soft p-4">
            <p className="text-[11px] text-molim-muted">
              الجهة
            </p>

            <p className="mt-1 text-sm font-black text-molim-foreground">
              فريق مُلم
            </p>
          </div>
        </section>

        {/* الاتفاقية */}
        <section className="mt-4 border border-molim bg-molim-soft">
          <div className="border-b border-molim px-5 py-4">
            <p className="text-xs text-molim-muted">
              نص الاتفاقية
            </p>

            <h3 className="mt-1 text-lg font-black text-molim-foreground">
              اتفاقية التطوع — فريق مُلم
            </h3>
          </div>

          <article className="max-h-[560px] overflow-y-auto px-5 py-5">
            <div className="space-y-6 text-sm leading-8 text-molim-muted">
              {/* التمهيد */}
              <section>
                <h4 className="font-black text-molim-foreground">
                  أولًا: التمهيد والإقرار
                </h4>

                <p className="mt-2">
                  بناءً على رغبة الطرف الثاني في الانضمام إلى فريق
                  مُلم والمساهمة في تحقيق أهدافه من خلال العمل
                  التطوعي، فقد تم الاتفاق بين:
                </p>

                <div className="mt-3 border-r-2 border-[#ed542f] pr-4">
                  <p>
                    <strong className="text-molim-foreground">
                      الطرف الأول:
                    </strong>{" "}
                    فريق مُلم، ويشار إليه لاحقًا بـ
                    <strong className="text-molim-foreground">
                      {" "}«الفريق» أو «الإدارة»
                    </strong>
                    .
                  </p>

                  <p className="mt-2">
                    <strong className="text-molim-foreground">
                      الطرف الثاني:
                    </strong>{" "}
                    المتطوع/ة.
                  </p>
                </div>

                <p className="mt-3">
                  يقر الطرف الثاني بأنه اطلع على هذه الوثيقة وفهم
                  جميع بنودها، ويتعهد بالالتزام الكامل بسياسات فريق
                  مُلم ولوائحه الداخلية، وأداء المهام الموكلة إليه
                  بأمانة ومسؤولية وبأفضل ما يستطيع.
                </p>
              </section>

              {/* التزامات المتطوع */}
              <section>
                <h4 className="font-black text-molim-foreground">
                  ثانيًا: التزامات وواجبات المتطوع
                </h4>

                <p className="mt-2">
                  يقر المتطوع بأن مشاركته في فريق مُلم مشاركة
                  تطوعية بالكامل وغير مدفوعة الأجر، ولا يترتب عليها
                  أي التزام مالي أو علاقة وظيفية من قبل الفريق.
                </p>

                <p className="mt-3">
                  كما يلتزم بإنجاز المهام المسندة إليه ضمن المواعيد
                  المحددة في نظام المهام، وفي حال تعذر إتمام أي
                  مهمة في موعدها، يتوجب عليه إبلاغ المسؤول أو
                  الإدارة في أقرب وقت ممكن مع توضيح سبب التأخير.
                </p>

                <p className="mt-3">
                  ويحق لإدارة فريق مُلم اتخاذ الإجراءات المناسبة عند
                  تكرار عدم إنجاز المهام أو مخالفة الأنظمة والسياسات
                  المعتمدة، بما في ذلك إنهاء العضوية وفق الإجراءات
                  المطبقة.
                </p>

                <p className="mt-3">
                  ويلتزم المتطوع كذلك بالمحافظة على سرية جميع
                  المعلومات والملفات والوثائق وبيانات الأعضاء
                  والمواد الداخلية الخاصة بالفريق، وعدم مشاركتها أو
                  استخدامها خارج النطاق الرسمي دون موافقة الجهة
                  المخولة.
                </p>

                <p className="mt-3">
                  كما يلتزم بالعمل بروح الفريق الواحد واحترام جميع
                  الأعضاء والقيادات والتقيد بآداب الحوار والتواصل
                  والتعاون داخل القنوات الرسمية للفريق.
                </p>
              </section>

              {/* حقوق المتطوع */}
              <section>
                <h4 className="font-black text-molim-foreground">
                  ثالثًا: حقوق المتطوع والتزامات فريق مُلم
                </h4>

                <p className="mt-2">
                  يلتزم فريق مُلم بتوفير بيئة عمل تطوعية قائمة على
                  الاحترام والتعاون والدعم المتبادل، وتمكين المتطوع
                  من أداء المهام الموكلة إليه بوضوح وفق الإمكانات
                  المتاحة.
                </p>

                <p className="mt-3">
                  كما يلتزم الفريق بالمحافظة على بيانات المتطوع
                  واستخدامها في حدود إدارة العمل التطوعي، وعدم
                  إتاحتها إلا للجهات المخولة داخل الفريق أو وفق ما
                  تسمح به الأنظمة والسياسات المعتمدة.
                </p>

                <p className="mt-3">
                  ويحق للمتطوع الاستفادة من الخبرات التي اكتسبها
                  خلال فترة تطوعه، وذكر مساهماته وأعماله المنجزة مع
                  فريق مُلم ضمن سيرته الذاتية أو معرض أعماله
                  الشخصي، مع مراعاة المحافظة على سرية المعلومات
                  والمواد الداخلية الخاصة بالفريق.
                </p>
              </section>

              {/* المهام والساعات */}
              <section>
                <h4 className="font-black text-molim-foreground">
                  رابعًا: المهام والساعات التطوعية
                </h4>

                <p className="mt-2">
                  يتم إسناد المهام إلى المتطوع من خلال القنوات
                  الرسمية المعتمدة، ويتم تسجيل المهام والساعات من
                  خلال منصة مُلم.
                </p>

                <p className="mt-3">
                  ولا تُعتبر الساعات ساعات تطوعية معتمدة إلا بعد
                  مراجعتها واعتمادها من الجهة المخولة بذلك وفق
                  إجراءات الفريق.
                </p>
              </section>

              {/* المدة والتجديد */}
              <section>
                <h4 className="font-black text-molim-foreground">
                  خامسًا: مدة الاتفاقية وتجديدها
                </h4>

                <p className="mt-2">
                  تبدأ الاتفاقية من تاريخ تسجيلها في منصة مُلم،
                  وتكون مدتها حسب الاختيار المعتمد عند التسجيل:
                  شهرًا واحدًا، أو شهرين، أو ثلاثة أشهر.
                </p>

                <p className="mt-3">
                  تنتهي الاتفاقية بانتهاء مدتها ما لم يتم تجديدها
                  وفق الإجراءات المعتمدة.
                </p>

                <p className="mt-3">
                  يمكن للمتطوع تجديد اتفاقية التطوع من خلال منصة
                  مُلم نفسها عند قرب انتهاء الاتفاقية أو بعد
                  انتهائها وفق آلية التجديد المعتمدة.
                </p>

                <p className="mt-3">
                  عند التجديد، يطلع المتطوع على الاتفاقية السارية
                  ويختار مدة جديدة ويؤكد موافقته إلكترونيًا، ويتم
                  تسجيل الاتفاقية الجديدة بشكل مستقل مع الاحتفاظ
                  بسجل الاتفاقيات السابقة.
                </p>
              </section>

              {/* إنهاء التطوع */}
              <section>
                <h4 className="font-black text-molim-foreground">
                  سادسًا: إنهاء التطوع
                </h4>

                <p className="mt-2">
                  في حال رغبة المتطوع في إنهاء تطوعه، يتوجب عليه
                  إشعار الإدارة مسبقًا وفق الإجراءات المعتمدة، بما
                  يتيح ترتيب وتسليم المهام أو الأعمال المعلقة
                  وضمان استمرارية العمل.
                </p>

                <p className="mt-3">
                  كما يجوز للفريق إنهاء العلاقة التطوعية وفق
                  السياسات واللوائح المعتمدة والإجراءات المناسبة
                  للحالة.
                </p>
              </section>

              {/* الإقرار */}
              <section>
                <h4 className="font-black text-molim-foreground">
                  سابعًا: الإقرار الإلكتروني
                </h4>

                <p className="mt-2">
                  يقر المتطوع عند الموافقة الإلكترونية بأنه قرأ هذه
                  الاتفاقية وفهم جميع بنودها، واختار مدة التطوع
                  المحددة في سجل الاتفاقية، ويوافق على الالتزام
                  بالسياسات واللوائح المعتمدة في فريق مُلم.
                </p>
              </section>
            </div>
          </article>
        </section>

        {/* اختيار المدة */}
        <section className="mt-8">
          <h3 className="text-base font-black text-molim-foreground">
            اختر مدة الاتفاقية
          </h3>

          <p className="mt-1 text-xs leading-5 text-molim-muted">
            يمكنك اختيار مدة من شهر واحد وحتى ثلاثة أشهر، ويمكنك
            تجديد الاتفاقية لاحقًا من خلال منصة مُلم.
          </p>

          <div className="mt-4 space-y-2">
            {durations.map((item) => {
              const selected = duration === item.value;

              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setDuration(item.value)}
                  className={`flex w-full items-center gap-3 border p-4 text-right transition ${
                    selected
                      ? "border-[#ed542f] bg-[#ed542f]/5"
                      : "border-molim bg-molim-soft"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                      selected
                        ? "border-[#ed542f]"
                        : "border-molim"
                    }`}
                  >
                    {selected && (
                      <span className="h-2.5 w-2.5 rounded-full bg-[#ed542f]" />
                    )}
                  </span>

                  <span className="flex-1">
                    <span className="block text-sm font-black text-molim-foreground">
                      {item.title}
                    </span>

                    <span className="mt-1 block text-xs text-molim-muted">
                      {item.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 border border-[#ed542f]/20 bg-[#ed542f]/5 p-4">
            <p className="text-xs font-black text-molim-foreground">
              🔄 التجديد
            </p>

            <p className="mt-1 text-xs leading-6 text-molim-muted">
              عند اقتراب انتهاء اتفاقيتك، سيظهر لك تنبيه داخل منصة
              مُلم يتيح لك تجديد الاتفاقية بسهولة، مع الاحتفاظ
              بسجل الاتفاقية السابقة وبدء اتفاقية جديدة للمدة التي
              تختارها.
            </p>
          </div>
        </section>

        {/* الموافقة */}
        <section className="mt-7 border border-molim bg-molim-soft p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) =>
                setAgreed(event.target.checked)
              }
              className="mt-1 h-4 w-4 accent-[#ed542f]"
            />

            <span className="text-xs leading-6 text-molim-muted">
              أقر بأنني قرأت اتفاقية التطوع كاملة، وفهمت جميع
              بنودها، واخترت مدة الاتفاقية، وأوافق على الالتزام
              بها وبسياسات ولوائح فريق مُلم.
            </span>
          </label>
        </section>

        {/* الزر */}
        <button
          type="button"
          disabled={!canContinue}
          onClick={() => {
            alert(
              `تمت الموافقة على اتفاقية التطوع لمدة ${
                duration === "1"
                  ? "شهر واحد"
                  : duration === "2"
                    ? "شهرين"
                    : "ثلاثة أشهر"
              }. الربط والحفظ الفعلي سيضاف لاحقًا.`
            );
          }}
          className={`mt-6 h-14 w-full text-sm font-black transition ${
            canContinue
              ? "bg-[#ed542f] text-white hover:opacity-90"
              : "cursor-not-allowed bg-molim-soft text-molim-muted"
          }`}
        >
          أوافق وأكمل الانضمام
        </button>

        {/* ملاحظة التوثيق */}
        <div className="mt-5 border border-molim bg-molim-soft p-4">
          <p className="text-xs font-black text-molim-foreground">
            🔐 التوثيق الإلكتروني
          </p>

          <p className="mt-1 text-xs leading-6 text-molim-muted">
            عند إكمال الانضمام، سيتم حفظ مدة الاتفاقية وتاريخ
            ووقت الموافقة ونسخة الاتفاقية في سجل اتفاقيات التطوع
            الخاص بك.
          </p>
        </div>

        <footer className="mt-10 border-t border-molim pt-6 text-center">
          <p className="text-[11px] text-molim-muted">
            مُلم — إدارة فريقك بشكل أبسط وآمن وسلس
          </p>
        </footer>
      </div>
    </main>
  );
}