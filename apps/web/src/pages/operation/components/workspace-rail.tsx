/**
 * The Purchasing Workspace's 200px navigation rail — extracted 2026-08-03.
 *
 * UI-KIT §6.1: the second occurrence is a full stop. `OperationPurchaseOrders`
 * drew this rail first; `OperationReceiving` copied it when Receiving moved
 * onto the same Workspace template, and the copies had already begun to
 * differ — one grew a danger tone and a tooltip the other never got.
 *
 * A page-level recipe, not a kit component: the kit has no rail, and a
 * navigation rail is a WORKSPACE shape rather than a general one. When the kit
 * grows one, this file is what it replaces.
 */
import { useCallback, useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import Icon from "@/components/kit/Icon";

export function RailGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center px-1.5">
        <span className="text-label font-semibold uppercase tracking-wide text-kit-slate-9">
          {title}
        </span>
      </div>
      <div className="mt-1 flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

export function RailItem({
  label,
  count,
  active,
  onClick,
  title,
  danger,
  testId,
}: {
  label: string;
  /** Omitted renders no number at all — an absent count and a zero are
   *  different facts, and a queue that has not been read yet must not print a
   *  reassuring `0`. */
  count?: number;
  active: boolean;
  onClick: () => void;
  title?: string;
  /** §8.4 — danger reads first inside a group, and only while unselected: a
   *  picked row is already carrying the selection's own colour. */
  danger?: boolean;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      data-testid={testId}
      className={[
        // Hover is GREY (01-design-tokens §2.3, ruled 2026-08-03). Blue is the
        // primary action and the SELECTED row only. Both inline copies of this
        // rail were written before that rule and still carry the blue tint;
        // extracting the recipe is what made the linter able to see it.
        "relative flex items-center gap-2 px-2 py-1.5 rounded-control text-left text-body w-full",
        active
          ? "bg-kit-blue-3 text-kit-slate-12 font-semibold"
          : "text-kit-slate-11 hover:bg-kit-slate-3",
      ].join(" ")}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1 bottom-1 w-0.5 bg-kit-blue-9"
        />
      )}
      <span
        className={`flex-1 truncate ${danger && !active ? "text-kit-red-11" : ""}`}
      >
        {label}
      </span>
      {count != null && (
        <span className="tabular-nums text-label text-kit-slate-9">{count}</span>
      )}
    </button>
  );
}

/**
 * ── THE READABLE FILTER RAIL — Card 02-C, owner ruling 2026-08-27 ────────────
 * (`docs/ui/MASTER.md` — LOCAL FILTER RAIL / READABLE SHELL).
 *
 * The successor grammar to the 200px pair above: 240px wide · 12px outer
 * padding · 8px heading → first row · 20px between groups · 36px minimum row —
 * and a governed label is NEVER truncated: it wraps onto a second line in the
 * same body font at its natural height, count still visible and right-aligned.
 * The rail is navigation, not batch selection — no row here ever grows a
 * checkbox.
 *
 * SO Batch Purchase drew it first; Manual Purchase imports the same shell
 * since Card 03 (2026-08-28). Pages still on `RailGroup`/`RailItem` migrate
 * in their own cards, not as a side effect of this one — which is why the
 * legacy pair survives above instead of being reshaped underneath its other
 * governed pages.
 */
export function FilterRail({
  children,
  testId,
  onHide,
  header,
  className,
  ariaLabel,
}: {
  children: ReactNode;
  testId?: string;
  className?: string;
  ariaLabel?: string;
  onHide?: () => void;
  /**
   * Owner correction 2026-09-06 (Delivery Monitor + Receiving — the two
   * corrections landed the same day and share this one slot): a FIXED region
   * above the scrolling filter groups — the rail's month calendar lives
   * here. It never scrolls away; the groups below scroll independently.
   * Absent = the rail renders byte-identically to before (one scroll area,
   * nothing added). The two regions carry `{testId}-fixed` / `{testId}-scroll`
   * so a page can assert the independence.
   */
  header?: ReactNode;
}) {
  if (header) {
    return (
      <aside
        data-testid={testId}
        aria-label={ariaLabel}
        className={`relative flex w-[240px] min-h-0 shrink-0 flex-col border-r border-kit-slate-5 bg-white ${className ?? ""}`}
      >
        {onHide && (
          <button
            type="button"
            onClick={onHide}
            aria-label="Hide filters"
            title="Hide filters"
            className="absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-control border border-kit-slate-6 bg-white text-kit-slate-11 hover:bg-kit-slate-3 hover:text-kit-slate-12"
          >
            <Icon name="panelToggle" panelOpen />
          </button>
        )}
        <div
          className="shrink-0 border-b border-kit-slate-5 p-3"
          data-testid={testId ? `${testId}-fixed` : undefined}
        >
          {header}
        </div>
        <div
          className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-3"
          data-testid={testId ? `${testId}-scroll` : undefined}
        >
          {children}
        </div>
      </aside>
    );
  }
  return (
    <aside
      data-testid={testId}
      aria-label={ariaLabel}
      /* The collapse toggle sits `top-2`, absolutely positioned over the
         first heading — unaffected by padding, so it stays put while a
         touch more top padding gives the first group's own row room to
         clear it (Jess, 2026-09-09: "terlalu rapat" between the two). Only
         when the toggle exists; without it there is nothing to clear. */
      className={`relative flex w-[240px] min-h-0 shrink-0 flex-col gap-5 overflow-y-auto border-r border-kit-slate-5 bg-white ${onHide ? "px-3 pb-3 pt-4" : "p-3"} ${className ?? ""}`}
    >
      {onHide && (
        <button
          type="button"
          onClick={onHide}
          aria-label="Hide filters"
          title="Hide filters"
          className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-control border border-kit-slate-6 bg-white text-kit-slate-11 hover:bg-kit-slate-3 hover:text-kit-slate-12"
        >
          <Icon name="panelToggle" panelOpen />
        </button>
      )}
      {children}
    </aside>
  );
}

export function FilterRailGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center px-1.5">
        <span className="text-label font-semibold uppercase tracking-wide text-kit-slate-9">
          {title}
        </span>
      </div>
      {/* 8px heading → first row (Card 02-C §9). */}
      <div className="mt-2 flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

export function FilterRailRow({
  label,
  supportingText,
  count,
  active,
  onClick,
  title,
  testId,
}: {
  label: string;
  supportingText?: string;
  /** Omitted renders no number (the section's `All …` rows). A live count is
   *  passed as-is — the fixed rows print zero rather than hiding it. */
  count?: number;
  active: boolean;
  onClick: () => void;
  title?: string;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      data-testid={testId}
      className={[
        /* 36px minimum: 18px text-body line + 9px above and below. A wrapped
           label simply adds its second 18px line — natural height, same font,
           never a tooltip. `items-start` keeps the count on the first line. */
        "relative flex min-h-[36px] w-full items-start gap-2 rounded-control px-2 py-[9px] text-left text-body",
        active
          ? "bg-kit-blue-3 text-kit-slate-12 font-semibold"
          : "text-kit-slate-11 hover:bg-kit-slate-3",
      ].join(" ")}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1 bottom-1 w-0.5 bg-kit-blue-9"
        />
      )}
      <span className="min-w-0 flex-1 break-words">
        {label}
        {supportingText && (
          <span className="block text-label font-normal leading-4 text-kit-slate-9">{supportingText}</span>
        )}
      </span>
      {count != null && (
        <span className="shrink-0 tabular-nums text-label leading-[18px] text-kit-slate-9">
          {count}
        </span>
      )}
    </button>
  );
}

/**
 * ── THE COMPACT FACT DROPDOWN — owner ruling 2026-09-11 ─────────────────────
 *
 * A rail SECTION whose facts are a long, open-ended list collapses into one
 * control instead of printing every value as a row.
 *
 * ⭐ WHY ONLY SOME SECTIONS. `WORK TO DO` and `ORDER TIMING` are the same
 * five and three rows every day, they are what an operator scans first thing
 * in the morning, and their counts are the point — those stay visible rows.
 * `PRODUCT`, `SUPPLIER` and Manual Purchase's `PURCHASE PURPOSE` are FACT
 * lists: the supplier list grows with the business, and on a rail 240px wide
 * a dozen supplier names push the timing rows — the ones that say what to do
 * today — below the fold. A fact list answers *narrow to this one*, which a
 * select answers in one control and one line.
 *
 * ⛔ WHAT IT IS NOT. It is not a second filter model: it writes the same
 * single-slot section value the rows wrote, so sections still combine with
 * AND and the `All …` option still clears only its own section. It is not a
 * multi-select, and it never grows a checkbox — the rail is navigation, not
 * batch selection.
 *
 * The ACTIVE treatment is the rail's own: a chosen value keeps the blue
 * left-edge marker and the blue field, so a narrowed section is as visible
 * as a selected row was. A count rides in the option text (`Ohana · 4`),
 * because the reason the counts existed — knowing a name is worth clicking
 * before you click it — does not go away just because the rows became
 * options.
 */
export function FilterRailSelect({
  label,
  value,
  options,
  onChange,
  testId,
  allLabel,
}: {
  /** The accessible name — the section heading is visual, not programmatic. */
  label: string;
  /** `null` = the section is not narrowed (the `All …` option). */
  value: string | null;
  options: ReadonlyArray<{ value: string; label: string; count?: number }>;
  onChange: (next: string | null) => void;
  testId: string;
  /** `All suppliers` — the section's own clearing word, never invented here. */
  allLabel: string;
}) {
  const active = value != null;
  return (
    <div className="relative">
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1 bottom-1 z-10 w-0.5 bg-kit-blue-9"
        />
      )}
      <select
        aria-label={label}
        data-testid={testId}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        className={[
          /* The rail row's own geometry: 36px minimum, the same rounded
             control, the same body type — so a section that collapsed does
             not change the rail's rhythm. */
          "min-h-[36px] w-full rounded-control border px-2 py-[9px] text-body",
          active
            ? "border-kit-blue-9 bg-kit-blue-3 font-semibold text-kit-slate-12"
            : "border-kit-slate-6 bg-white text-kit-slate-11 hover:bg-kit-slate-3",
        ].join(" ")}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.count == null ? o.label : `${o.label} · ${o.count}`}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Below this canvas width the 240px rail floats over the Register (the
 *  shared purchasing responsive pattern) — and, since S3, starts hidden. */
export const FILTER_RAIL_FLOAT_BELOW_PX = 896;

/**
 * ⭐ S3 · THE RAIL'S OPEN STATE, REMEMBERED PER BROWSER (owner follow-up
 * 2026-09-16, SO Batch Purchase + Manual Purchase).
 *
 * On a canvas narrower than 896px the rail floats OVER the list, so opening
 * it by default covered the very rows the operator came to read (measured at
 * 390px: ~38px of list left). It therefore starts hidden there — unless this
 * browser opened it before, which is a choice the page keeps.
 *
 *   stored "1"  the operator opened it       → open at any width
 *   stored "0"  the operator hid it          → hidden at any width
 *   nothing     never chosen                 → open on a wide canvas,
 *                                              hidden below 896px
 *
 * Storage failures never break the page: the live state still works for the
 * visit, and a blocked read counts as "never chosen".
 */
export function useFilterRailOpen(
  storageKey: string,
  canvasRef: RefObject<HTMLElement | null>,
): [boolean, (open: boolean) => void] {
  const [stored] = useState<string | null>(() => {
    try {
      return localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  });
  const [open, setOpen] = useState(stored !== "0");
  useLayoutEffect(() => {
    if (stored != null) return;
    const width = canvasRef.current?.clientWidth ?? 0;
    if (width > 0 && width < FILTER_RAIL_FLOAT_BELOW_PX) setOpen(false);
    // Measured once, at mount: a later resize never overrides what is on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setVisible = useCallback(
    (next: boolean) => {
      setOpen(next);
      try {
        localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        // Storage may be unavailable in a locked-down browser.
      }
    },
    [storageKey],
  );
  return [open, setVisible];
}
