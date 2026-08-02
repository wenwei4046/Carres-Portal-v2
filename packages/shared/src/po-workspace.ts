/**
 * po-workspace — the Supplier Workspace's ONE action source (Jess, 2026-08-02).
 *
 * ACTION-FLOW Law 7: the engine is the ONLY source of actions. The workspace
 * header's Current Action and the register's Current Action column both read
 * THIS function, so they structurally cannot disagree — and it asks the
 * engine's open calls FIRST; only a quiet PO falls back to its work-state
 * word. A page-local word table would have been a second action engine.
 *
 * The four work states are Jess's SUPPLIER PROGRESS vocabulary (2026-08-02):
 * how the operator finds work, never how the database stores it — DERIVED
 * from quantities + the engine, never a column.
 */
import { poReceivingProgress } from "./po-receiving";
import {
  purchasingSupplierCallsOf,
  type PurchasingOpenCall,
  type SupplierCallPo,
} from "./purchasing-supplier-calls";

export type PoWorkState =
  | "need_confirmation"
  | "waiting"
  | "ready"
  | "completed"
  | "cancelled";

export const PO_WORK_STATES: readonly PoWorkState[] = [
  "need_confirmation",
  "waiting",
  "ready",
  "completed",
  "cancelled",
];

/** The rail's words — states, not actions. */
export const PO_WORK_STATE_LABEL: Record<PoWorkState, string> = {
  need_confirmation: "Need Confirmation",
  waiting: "Waiting Goods",
  ready: "Ready to Receive",
  completed: "Completed",
  cancelled: "Cancelled",
};

/**
 * The state words a quiet PO's Current Action falls back to (Jess,
 * 2026-08-02): an ACTION says what to do — or says itself why there is
 * nothing to phone about today (`Waiting for Goods`, never "No Action
 * Today": today's nothing is tomorrow's something, so the name must not
 * freeze the emptiness). `Open Receiving` because the system is not a
 * person — no "Hand to".
 */
export const PO_STATE_ACTION_WORD = {
  need_confirmation: "Confirm Goods Arriving Date",
  waiting: "Waiting for Goods",
  ready: "Open Receiving",
} as const;

/**
 * The LISTING's short spellings (Jess, 2026-08-02): 19 rows repeating a
 * seven-word sentence becomes wallpaper — a column wants a scannable verb,
 * the workspace hero keeps the full wording. C1's own two-string discipline
 * (queue word vs row line), applied to the register. `Confirm Arrival`
 * rather than her other candidate `Confirm ETA` — the Business Date
 * Dictionary bans "ETA" outright.
 */
export const PO_STATE_ACTION_SHORT = {
  need_confirmation: "Confirm Arrival",
  waiting: "Waiting for Goods",
  ready: "Open Receiving",
} as const;

export function poWorkStateOf(
  po: Pick<SupplierCallPo, "status" | "etaDateIso" | "lines">,
  todayIso: string,
): PoWorkState {
  const p = poReceivingProgress(
    po.lines.map((l) => ({ qty: l.qty, received_qty: l.receivedQty })),
  );
  if (po.status === "cancelled") return "cancelled";
  if (po.status !== "open") return "completed";
  if (p.ordered > 0 && p.received >= p.ordered) return "completed";
  // Goods have arrived: something is checked in, or the promised day came.
  if (p.received > 0 || (po.etaDateIso && po.etaDateIso <= todayIso))
    return "ready";
  if (!po.etaDateIso) return "need_confirmation";
  return "waiting";
}

export type PoCurrentAction =
  | { kind: "call"; call: PurchasingOpenCall }
  | { kind: "state"; key: keyof typeof PO_STATE_ACTION_WORD; word: string };

/**
 * ONE Current Action per PO — or none (completed / cancelled carry no hero:
 * the work is over). Engine first, state word only when the engine is quiet.
 */
export function poCurrentActionOf(
  po: SupplierCallPo,
  opts: { todayIso: string },
): PoCurrentAction | null {
  const calls = purchasingSupplierCallsOf(po, opts);
  if (calls.length > 0) return { kind: "call", call: calls[0] };
  const state = poWorkStateOf(po, opts.todayIso);
  if (state === "completed" || state === "cancelled") return null;
  return { kind: "state", key: state, word: PO_STATE_ACTION_WORD[state] };
}
