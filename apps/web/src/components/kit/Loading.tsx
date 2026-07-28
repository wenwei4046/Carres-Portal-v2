/**
 * Loading — UI-KIT §9, card D0.5a.
 *
 * TWO shapes, because they answer two different questions:
 *   spinner   — "this control is busy" (inside a button, beside a title)
 *   skeleton  — "this region is arriving" (a list, a card's body)
 *
 * The spinner inherits `currentColor`, so it is the right colour inside a blue
 * button and inside grey body text without anybody choosing one. The skeleton
 * is `slate-3` — the canvas step, so a loading block reads as absence, never as
 * a filled row.
 *
 * NO TIMING, NO STATE. This component does not know whether anything is
 * loading; the caller does. That is what keeps D0.5a "no behaviour".
 */
import { type IconSize } from "./tokens";

export default function Loading({
  variant = "spinner",
  size = 16,
  lines = 3,
  label,
}: {
  variant?: "spinner" | "skeleton";
  /** Spinner only — matches the icon sizes so it lines up beside one. */
  size?: IconSize;
  /** Skeleton only — how many bars to draw. */
  lines?: number;
  /** Screen-reader wording. Visible text belongs to the caller. */
  label?: string;
}) {
  if (variant === "skeleton") {
    return (
      <div className="flex flex-col gap-2" data-testid="kit-loading-skeleton" aria-busy="true" aria-live="polite">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            /* The last bar is short — a run of equal bars reads as a table,
             * which is the one thing a skeleton must not be mistaken for. */
            className={`h-4 rounded-pill bg-kit-slate-3 animate-pulse ${
              i === lines - 1 ? "w-3/5" : "w-full"
            }`}
          />
        ))}
        <span className="sr-only">{label ?? "Loading"}</span>
      </div>
    );
  }

  return (
    <span
      className="inline-flex items-center"
      data-testid="kit-loading-spinner"
      role="status"
      aria-live="polite"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className="animate-spin"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.25" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="sr-only">{label ?? "Loading"}</span>
    </span>
  );
}
