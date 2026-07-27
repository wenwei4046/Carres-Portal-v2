import { Lock } from "lucide-react";

/**
 * C2 · The drawer's dynamic checklist — EVERY open action on this order, one
 * row each (Jess ruling 2026-07-27: "an order shows ALL open actions at once,
 * not one suggestion").
 *
 * THE LAW OF THIS FILE, and it is the same law `OrderJourneyHeader` lives by:
 * this module RENDERS, it does not derive. The list arrives computed by the
 * Orders list through the shared two-layer engine (`openActionsOf` →
 * `packages/shared/order-actions`), already in display order, so the drawer's
 * first row IS the row's pill. A second derivation here is the only way the two
 * surfaces could ever disagree, so there is not one.
 *
 * **Staff never add, reorder or tick.** There is no control in this component
 * on purpose: an action appears by itself when its trigger becomes true and
 * leaves by itself when the system measures its completion. A tick-box that
 * only records "I say I did it" is banned (COPY-STANDARD, the
 * no-decorative-checkbox law) — so the only way to close a row here is to do
 * the work in the panel that owns it.
 *
 * ZERO WRITES. ZERO fetches.
 */

export interface OrderActionRow {
  /** The engine's stable key — for react and for tests, never shown. */
  key: string;
  /** The row LINE, party named (`Call NETS — confirm delivery date`), built by
   *  the same shared helper the Orders list row uses. */
  line: string;
  tone: "danger" | "warning" | "info" | "success" | "neutral";
  /** Delivery is held on money — the 🔒 the ladder already shows. */
  locked?: boolean;
}

const TONE_DOT: Record<OrderActionRow["tone"], string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  // info actions are amber, not blue — blue is SELECTION only (UI-KIT §2).
  info: "bg-warning",
  success: "bg-success",
  neutral: "bg-base-300",
};

export default function OrderActionList({
  actions,
}: {
  actions: OrderActionRow[];
}) {
  return (
    <section
      data-testid="order-action-list"
      aria-label="Open actions"
      className="shrink-0 rounded-lg border border-base-200 bg-white px-3 py-2 flex flex-col gap-1"
    >
      <div className="flex items-start gap-2 min-w-0">
        <span className="t4-label shrink-0 w-[58px] pt-[2px]">Actions</span>
        {actions.length === 0 ? (
          <span data-testid="order-action-none" className="t4-secondary">
            Nothing to do on this order. A new action appears here by itself
            when something changes.
          </span>
        ) : (
          <div className="flex flex-col gap-[3px] min-w-0 w-full">
            {actions.map((a) => (
              <div
                key={a.key}
                data-testid="order-action"
                data-action={a.key}
                data-tone={a.tone}
                className="flex items-center gap-2 min-w-0 text-[13px] font-medium text-base-900"
              >
                <span
                  aria-hidden="true"
                  className={`h-[6px] w-[6px] shrink-0 rounded-full ${TONE_DOT[a.tone]}`}
                />
                {a.locked && (
                  <Lock
                    size={11}
                    strokeWidth={2.5}
                    className="shrink-0 text-danger"
                    aria-hidden="true"
                  />
                )}
                <span className="truncate min-w-0">{a.line}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
