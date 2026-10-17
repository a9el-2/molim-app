import type { ReactNode } from "react";

type PageTitleProps = {
  title: ReactNode;
  category?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export default function PageTitle({
  title,
  category,
  description,
  action,
  className = "",
}: PageTitleProps) {
  return (
    <section className={`mb-6 ${className}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {category && (
            <p className="text-xs sm:text-sm font-bold text-molim-orange mb-1">
              {category}
            </p>
          )}

          <h1 className="text-2xl sm:text-3xl font-black text-molim-foreground tracking-tight">
            {title}
          </h1>

          {description && (
            <p className="mt-2 max-w-2xl text-sm leading-6 sm:leading-7 text-molim-muted">
              {description}
            </p>
          )}
        </div>

        {action && <div className="shrink-0">{action}</div>}
      </div>
    </section>
  );
}
