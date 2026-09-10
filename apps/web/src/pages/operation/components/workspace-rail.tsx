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
 *
 * `OperationPurchaseOrders` still holds its own copy. That is deliberate and
 * dated: PR 507 (the 4,047-conversion typography codemod) has that file open,
 * and hand-resolving codemod conflicts is how a codemod gets corrupted. The
 * next chat to open that page after 507 lands deletes its inline pair and
 * imports these — the shared home already exists, so it is one import, not a
 * decision.
 */
import type { ReactNode } from "react";
import { PanelLeftClose } from "lucide-react";

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
            <PanelLeftClose size={16} strokeWidth={1.75} aria-hidden />
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
          <PanelLeftClose size={16} strokeWidth={1.75} aria-hidden />
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
