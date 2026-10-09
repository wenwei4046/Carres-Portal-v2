/**
 * TableScroller — a table wider than its card scrolls INSIDE the card, and says so.
 *
 * The Sales Order `Items` table drew this first (the right-edge fade and the one
 * `›` / `‹` step button); the Purchase Order object needs the same grammar for
 * its Goods lines in the half-width pane, where macOS hides the scrollbar and a
 * cut column read as a missing one (owner, 2026-09-27: "fix"). One component,
 * so a second page never draws a second affordance.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import Button from "@/components/kit/Button";

export default function TableScroller({ label, children, testId }: {
  /** What the table is — `Goods lines`; spoken when the region is focusable. */
  label: string;
  children: ReactNode;
  testId?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState({ over: false, right: false });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    /* Set only when it changed — a new object every pass is a render loop. */
    const read = () => {
      const over = el.scrollWidth - el.clientWidth > 1;
      const right = over && el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setState((prev) => (prev.over === over && prev.right === right ? prev : { over, right }));
    };
    read();
    el.addEventListener("scroll", read, { passive: true });
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", read);
      ro.disconnect();
    };
  }, []);
  return (
    <div className="relative min-w-0 max-w-full" data-testid={testId}>
      <div
        ref={ref}
        className="overflow-x-auto"
        role="region"
        tabIndex={state.over ? 0 : undefined}
        aria-label={state.over ? `${label} — scroll sideways for more columns` : label}
      >
        {children}
      </div>
      {state.right ? (
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-c-head-line to-transparent" />
      ) : null}
      {state.over ? (
        <span className="absolute right-1 top-1 z-10">
          <Button
            size="sm"
            variant="neutral"
            aria-label={state.right ? `Show more ${label} columns` : `Back to the first ${label} columns`}
            onClick={() => {
              const el = ref.current;
              if (el) el.scrollBy({ left: (state.right ? 1 : -1) * Math.max(160, el.clientWidth * 0.7), behavior: "smooth" });
            }}
          >
            {state.right ? "›" : "‹"}
          </Button>
        </span>
      ) : null}
    </div>
  );
}
