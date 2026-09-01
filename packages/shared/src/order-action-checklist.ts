/**
 * C6 · Every action opens its checklist (Jess 2026-07-27).
 *
 * C2 gave the drawer a list of every OPEN action. This module answers the next
 * question — **what closes this one** — and it answers it in the portal's own
 * words, from the portal's own signals.
 *
 * THE SHAPE, in one sentence:
 *
 *     a checklist is [the measured step before it, when there is one]
 *                  + [the outcome THIS action records].
 *
 * and each step is one of the portal's OWN actions, so the label is that
 * action's BUTTON word from the dictionary (`order-action-words`). No step
 * invents a verb, because no step is allowed to be anything but an action the
 * portal already has.
 *
 * WHY THE LAST STEP IS NEVER TICKED, and why that is not a fudge. The drawer
 * renders a checklist only for an action that is OPEN — so the outcome that
 * action records has, by definition, not been recorded. Deriving it a second
 * time here would be re-running the trigger, and the only thing a second
 * derivation can do is disagree with the first (the J3/C2 law: this layer
 * renders, it does not re-derive). The steps BEFORE it read real signals,
 * because those are facts about a different action.
 *
 * THE NO-DECORATIVE-CHECKBOX LAW (COPY-STANDARD) IS STRUCTURAL HERE. There is
 * no tick, no checkbox and no `done` input anywhere in this module or its
 * renderer: a step's state is READ from `OrderActionSignals`, the same object
 * the ladder reads, or it is the action's own completion. Nothing on screen can
 * record "I say I did it", because nothing on screen can write at all.
 *
 * TWO ACTIONS DELIBERATELY HAVE NO SUB-STEPS (the card's own ruling):
 *   · `deliver_today` — its sub-steps would be "goods loaded" and "driver
 *     departed", and nobody records either. They are not information we ask
 *     anyone for, so they stay unbuilt; the action keeps its own completion.
 *   · the two FACTS (`delivering`, `done`) are not actions at all.
 *
 * TASK OWNER (Law 2's sixth thing) is NOT a field on a step, and that is the
 * decision this card was asked to make: **the order's PIC
 * (`ops_order_control.assigned_staff`) is the task owner of every action of that
 * order.** It is true today, it needs no store, and the order already shows it —
 * printing the same name once per open action would spend height (UI-KIT §1.3)
 * to repeat what the owner chip beside the order already says.
 *
 * PURE — no clock, no I/O.
 */

import type { OrderActionSignals } from "./order-actions";
import type { OrderActionKey } from "./order-action-words";

/** `done` = the system has measured it · `open` = it has not happened yet.
 *  There is no third state, and there is no way for a human to set either. */
export type OrderActionStepState = "done" | "open";

export interface OrderActionStep {
  /** The action whose recorded outcome this step is. The label a surface prints
   *  is `orderActionButton(key)` — never a string stored here. */
  key: OrderActionKey;
  state: OrderActionStepState;
}

/** A step the system MEASURES, from the same signals the ladder reads. */
function measured(key: OrderActionKey, done: boolean): OrderActionStep {
  return { key, state: done ? "done" : "open" };
}

/** The step that closes the action being expanded — open by construction; see
 *  the header. */
function closes(key: OrderActionKey): OrderActionStep {
  return { key, state: "open" };
}

/**
 * The steps that close `key`, measured against this order.
 *
 * The ORDER OF EVENTS the card names (Issue PO → Call supplier →
 * Collect → Assign logistics → Call logistics → Deliver → Upload photo) is what
 * decides which step comes before which — it is **not** a gate chain and **not** the
 * display order. An action is never hidden until the one before it closes
 * (Law 1), and money still displays last (Law 4) whatever this file says.
 */
export function orderActionChecklist(
  key: OrderActionKey,
  s: OrderActionSignals,
): OrderActionStep[] {
  switch (key) {
    // Nothing has been ordered from anybody. There is no earlier step — this is
    // where the goods track starts, and issuing is the single act that secures
    // the goods (Loo, 2026-07-30 — the Purchasing clean restart).
    case "issue_po":
      return [closes("issue_po")];

    // The goods are on order and the supplier's date is what is outstanding.
    // The step before is `Issue PO`, because issuing is what makes a formal PO
    // exist, and `!goodsUnordered` is exactly "a PO covers these goods".
    case "confirm_ready_date":
      return [
        measured("issue_po", !s.goodsUnordered),
        closes("confirm_ready_date"),
      ];

    // C8 · STAGE 1. The T3 delay radar fired: the supplier's date overshoots
    // the promise. The date we already hold is what proves the overshoot, so
    // the supplier call is the measured step before it, and what closes this
    // action is the DECISION — not a call to anybody.
    case "delay_planning":
      return [
        measured("confirm_ready_date", s.stockEtaIso !== null),
        closes("delay_planning"),
      ];

    // C8 · STAGE 2, and the measured step before it is the GATE. This is the
    // one place the gate becomes visible to an operator: the logistics call
    // cannot be reached with an un-ticked `Record the delay decision` above it,
    // which is exactly §3's "stage 2 cannot open before the decision is
    // recorded". The step reads the same signals the engine used to open the
    // action, so the two can never disagree.
    case "arrange_new_delivery_date":
      return [
        measured("delay_planning", (s.delayDecision ?? null) !== null),
        closes("arrange_new_delivery_date"),
      ];

    // An internal decision with no earlier step of its own.
    case "assign_logistics":
      return [closes("assign_logistics")];

    // You cannot call a logistics company you have not picked — so the pick is
    // the measured step, and it is `done` on every order that reaches this
    // action through the normal path.
    case "confirm_delivery_date":
      return [
        measured("assign_logistics", s.hasLogistics),
        closes("confirm_delivery_date"),
      ];

    // C7 — the document is issued against the customer's confirmed booking, so
    // the booking is the measured step before it. The closing step is the
    // action's own outcome, un-ticked while the action is open, like every
    // other last step here.
    case "issue_delivery_order":
      return [
        measured("confirm_delivery_date", s.bookingConfirmed),
        closes("issue_delivery_order"),
      ];

    // Ruled: no sub-list. `Goods loaded` and `Driver departed` are recorded
    // nowhere and asked of nobody.
    case "deliver_today":
      return [];

    case "upload_delivery_photo":
      return [
        measured("deliver_today", s.completed),
        closes("upload_delivery_photo"),
      ];

    // Money is its own track and survives delivery — nothing on the goods or
    // delivery track is a step of collecting.
    case "collect":
      return [closes("collect")];

    // §0.1 Action Owner Engine row 1 (composed 2026-08-27) — a single act
    // with no earlier step: asking IS where the promise track starts.
    case "ask_delivery_date":
      return [closes("ask_delivery_date")];

    // Blueprint card §7 (2026-08-16) — two single-step acts. The loan comes
    // back on the trip (no earlier step: the delivery day IS the moment), and
    // only Finance can clear its exception (no operation step precedes a
    // Finance decision).
    case "collect_loan_item":
      return [closes("collect_loan_item")];
    case "resolve_payment_exception":
      return [closes("resolve_payment_exception")];

    // FACTS, never actions: there is nothing to close.
    case "delivering":
    case "done":
      return [];
  }
}
