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
