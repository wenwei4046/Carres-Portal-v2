import type { ReactNode } from "react";

/** UI-KIT 2026-07-27: shared calendar surface. Event owners supply facts;
 * this component owns no status logic, quantities or navigation destination. */
export default function ScheduleCard({ header, children, footer, label, testId, variant = "standard" }: {
  header: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  label: string;
  testId?: string;
  /** A secondary event is distinguished by structure and ground, never status colour. */
  variant?: "standard" | "secondary";
}) {
  return (
    <article aria-label={label} data-testid={testId} data-kit="schedule-card"
      className={`min-h-11 min-w-0 rounded-card border border-kit-slate-5 text-body max-md:[&_button]:min-h-10 max-md:[&_button]:min-w-10 max-md:[&_a]:min-h-10 ${variant === "secondary" ? "border-l-4 border-l-kit-slate-9 bg-kit-slate-3" : "bg-white"}`}>
      <div className="flex flex-wrap items-start justify-between gap-1 px-2 py-1.5">{header}</div>
      <div className="flex min-w-0 flex-col gap-1 px-2 pb-2">{children}</div>
      <div className="border-t border-kit-slate-4 px-2 py-1.5">{footer}</div>
    </article>
  );
}
