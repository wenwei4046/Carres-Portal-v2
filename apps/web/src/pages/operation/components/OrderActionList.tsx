import { Check, ChevronDown, ChevronUp, Lock } from "lucide-react";
import { useState } from "react";

/**
 * C2 · The drawer's dynamic checklist — EVERY open action on this order, one
 * row each (Jess ruling 2026-07-27: "an order shows ALL open actions at once,
 * not one suggestion").
 *
 * C6 · and every action opens its own checklist: the steps that close it, each
 * one either MEASURED from a stored signal or the outcome this action itself
 * records. The steps arrive pre-built (`orderActionChecklist` +
 * `orderActionButton`, packages/shared) for the same reason the lines do — see
 * the law below.
 *
 * THE LAW OF THIS FILE, and it is the same law `OrderJourneyHeader` lives by:
 * this module RENDERS, it does not derive. The list arrives computed by the
 * Orders list through the shared two-layer engine (`openActionsOf` →
 * `packages/shared/order-actions`), already in display order, so the drawer's
 * first row IS the row's pill. A second derivation here is the only way the two
 * surfaces could ever disagree, so there is not one.
 *
 * **Staff never add, reorder or tick.** The only control in this component is a
 * DISCLOSURE — it opens a step list and writes nothing. An action appears by
 * itself when its trigger becomes true and leaves by itself when the system
 * measures its completion. A tick-box that only records "I say I did it" is
 * banned (COPY-STANDARD, the no-decorative-checkbox law), which is why a step
 * has no control of its own: the only way to close one is to do the work in the
 * panel that owns it, and where a FORM already collects the inputs that form IS
 * the checklist.
 *
 * ZERO WRITES. ZERO fetches.
 */

/** One step of an action's checklist, already worded by the shared dictionary
 *  (`orderActionButton`) — this file never spells a verb. */
export interface OrderActionStepRow {
  /** The step's own action key — for react and for tests, never shown. */
  key: string;
  /** The BUTTON word that records this step (`Record ready date`). */
  label: string;
  /** The system has measured it. Nothing on screen can set this. */
  done: boolean;
}

export interface OrderActionRow {
  /** The engine's stable key — for react and for tests, never shown. */
  key: string;
  /** The row LINE, party named (`Call NETS — confirm delivery date`), built by
   *  the same shared helper the Orders list row uses. */
  line: string;
  tone: "danger" | "warning" | "info" | "success" | "neutral";
  /** Delivery is held on money — the 🔒 the ladder already shows. */
  locked?: boolean;
  /** C6 — the steps that close this action. Empty or absent = there are none,
   *  which is a real answer for `Deliver today` (nobody records "goods loaded"
   *  or "driver departed") and the row then carries no disclosure at all. */
  steps?: OrderActionStepRow[];
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
  // Collapsed by default: §1.3 is a height budget, and the row's line already
  // says what to do. The click is the affordance the card asks for.
  const [open, setOpen] = useState<Record<string, boolean>>({});
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
            {actions.map((a) => {
              const steps = a.steps ?? [];
              const expanded = steps.length > 0 && open[a.key] === true;
              const head = (
                <>
                  <span
                    aria-hidden="true"
                    className={`h-[6px] w-[6px] shrink-0 rounded-full ${TONE_DOT[a.tone]}`}
                  />
                  {a.locked && (
                    <Lock
                      size={14}
                      strokeWidth={2.5}
                      className="shrink-0 text-danger"
                      aria-hidden="true"
                    />
                  )}
                  <span className="truncate min-w-0">{a.line}</span>
                </>
              );
              return (
                <div
                  key={a.key}
                  data-testid="order-action"
                  data-action={a.key}
                  data-tone={a.tone}
                  className="flex flex-col min-w-0"
                >
                  {steps.length === 0 ? (
                    <div className="flex items-center gap-2 min-w-0 text-[13px] font-medium text-base-900">
                      {head}
                    </div>
                  ) : (
                    <button
                      type="button"
                      data-testid="order-action-toggle"
                      aria-expanded={expanded}
                      onClick={() =>
                        setOpen((o) => ({ ...o, [a.key]: !o[a.key] }))
                      }
                      className="flex items-center gap-2 min-w-0 w-full text-left text-[13px] font-medium text-base-900 rounded-[4px] -mx-1 px-1 hover:bg-hovertint"
                    >
                      {head}
                      {expanded ? (
                        <ChevronUp
                          size={14}
                          className="shrink-0 ml-auto text-base-500"
                          aria-hidden="true"
                        />
                      ) : (
                        <ChevronDown
                          size={14}
                          className="shrink-0 ml-auto text-base-500"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  )}
                  {expanded && (
                    <ul
                      data-testid="order-action-steps"
                      className="flex flex-col gap-[2px] pl-4 pt-[2px]"
                    >
                      {steps.map((st) => (
                        <li
                          key={st.key}
                          data-testid="order-action-step"
                          data-step={st.key}
                          data-state={st.done ? "done" : "open"}
                          className={`flex items-center gap-2 min-w-0 text-[12px] ${
                            st.done
                              ? "font-normal text-base-500"
                              : "font-medium text-base-900"
                          }`}
                        >
                          {st.done ? (
                            <Check
                              size={14}
                              strokeWidth={3}
                              className="shrink-0 text-base-500"
                              aria-hidden="true"
                            />
                          ) : (
                            <span
                              aria-hidden="true"
                              className="h-[10px] w-[10px] shrink-0 rounded-full border border-base-300"
                            />
                          )}
                          <span className="truncate min-w-0">{st.label}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
