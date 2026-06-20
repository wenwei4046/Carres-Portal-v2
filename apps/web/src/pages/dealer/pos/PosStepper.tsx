const STEPS = [
  { n: 1, label: "Catalog" },
  { n: 2, label: "Customer" },
  { n: 3, label: "Confirm" },
] as const;

/**
 * Top-bar progress stepper — 01 CATALOG · 02 CUSTOMER · 03 CONFIRM. Completed
 * steps are clickable to go back; the current step is flame-bordered; forward
 * steps are inert (advancing is gated by the footer Continue button).
 *
 * Uses the `.pos-step-pill` / `.is-active` / `.is-done` utilities from
 * `index.css` (Task 1 foundation).
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
              disabled={!clickable && !active}
              aria-current={active ? "step" : undefined}
              data-testid={`pos-step-${s.n}`}
              className={[
                "pos-step-pill",
                active ? "is-active" : "",
                done ? "is-done" : "",
                clickable ? "cursor-pointer rounded-full px-2 py-1 hover:bg-base-100 transition-colors" : "cursor-default",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span className="num">{String(s.n).padStart(2, "0")}</span>
              {s.label.toUpperCase()}
            </button>
            {i < STEPS.length - 1 && (
              <span className={`w-6 h-px ${done ? "bg-base-400" : "bg-base-200"}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
