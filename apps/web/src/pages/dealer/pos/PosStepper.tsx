const STEPS = [
  { n: 1, label: "Catalog" },
  { n: 2, label: "Customer" },
  { n: 3, label: "Confirm" },
] as const;

/**
 * Top-bar progress stepper — 01 CATALOG · 02 CUSTOMER · 03 CONFIRM. Completed
 * steps are clickable to go back; the current step is flame-filled; forward
 * steps are inert (advancing is gated by the footer Continue button).
 */
export default function PosStepper({
  step,
  onStepClick,
}: {
  step: number;
  onStepClick: (n: number) => void;
}) {
  return (
    <ol className="flex items-center gap-1.5">
      {STEPS.map((s, i) => {
        const done = s.n < step;
        const active = s.n === step;
        const clickable = s.n < step;
        return (
          <li key={s.n} className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => clickable && onStepClick(s.n)}
              disabled={!clickable}
              aria-current={active ? "step" : undefined}
              data-testid={`pos-step-${s.n}`}
              className={`flex items-center gap-2 rounded-full pl-1 pr-3 py-1 transition-colors ${
                clickable ? "cursor-pointer hover:bg-base-100" : "cursor-default"
              }`}
            >
              <span
                className={`grid place-items-center w-6 h-6 rounded-full font-mono text-[11px] font-bold ${
                  active
                    ? "bg-primary text-white"
                    : done
                      ? "bg-base-900 text-white"
                      : "bg-base-200 text-base-500"
                }`}
              >
                {done ? "✓" : String(s.n).padStart(2, "0")}
              </span>
              <span
                className={`t-micro ${
                  active ? "text-base-900" : done ? "text-base-700" : "text-base-400"
                }`}
              >
                {s.label}
              </span>
            </button>
            {i < STEPS.length - 1 && (
              <span className={`w-6 h-px ${done ? "bg-base-900" : "bg-base-200"}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
