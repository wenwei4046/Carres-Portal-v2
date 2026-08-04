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

/** The rail's words — the GOODS lifecycle, never what a person is doing
 *  (Jess, 2026-08-02: "每个状态都在描述货物生命周期"). `Waiting Supplier
 *  Date` replaced `Need Confirmation` — what we wait for is the DATE. */
export const PO_WORK_STATE_LABEL: Record<PoWorkState, string> = {
  need_confirmation: "Waiting Supplier Date",
  waiting: "Waiting for Goods",
  ready: "Ready to Receive",
  completed: "Completed",
  cancelled: "Cancelled",
};

/**
 * The state word a quiet PO's Current Action falls back to.
 *
 * **THERE IS EXACTLY ONE, and that is Loo's ruling of 2026-08-04 (card Q8),
 * applying `PURCHASING-INFORMATION-MODEL.md` §12.3 — an ACTION and a STATUS
 * may never share a column.** Three of the four words this table used to hold
 * were not actions at all and they are gone rather than reworded:
 *
 *   `Waiting for Goods`  a STATUS wearing an action's column. It keeps its
 *                        real home, `PO_WORK_STATE_LABEL` — the rail — and
 *                        the column says `—`, which §12.3 rules a real answer
 *   `Open Receiving`     navigation, not work
 *   `Contact Supplier`   `Contact` was retired as a verb by Loo on
 *                        2026-07-28 (the portal has SIX and `Call` covers
 *                        it), AND it was a second word for a LATE version of
 *                        the one action below — see `poCurrentActionOf`
 */
export const PO_STATE_ACTION_WORD = {
  // `Goods Arrival`, never `Goods Arriving At` (Jess, 2026-08-03): `At` adds
  // no information, and the column beside it is `Customer Delivery` — the two
  // dates are the same kind of fact and now read as a pair. It is also the
  // word `ORDERS-WORKING-FLOW.md` already uses (`Waiting Goods Arrival`), so
  // Purchasing stops speaking its own dialect.
  need_confirmation: "Confirm Goods Arrival Date",
} as const;

/**
 * The LISTING's short spelling (Jess, 2026-08-02): 19 rows repeating a
 * seven-word sentence becomes wallpaper — a column wants a scannable verb,
 * the workspace hero keeps the full wording. C1's own two-string discipline
 * (queue word vs row line), applied to the register.
 *
 * **`Check Expected Arrival` — LOO'S OWN WORD, chosen after seeing the
 * preview (2026-08-04, card Q8).** It replaces `Confirm Arrival`, which
 * REVERSED the full string's tense: `Confirm Goods Arrival Date` asks the
 * factory *which day do the goods reach us* (FUTURE); `Confirm Arrival` reads
 * as *tick that it has arrived* (PAST). A short form may drop WORDS; it may
 * never drop the TENSE or the OBJECT (§12.3). His word also matches the
 * column beside it — `Expected Arrival`, §12.2 — so the eye does not change
 * track, and it is honest about the POs where there is no date to confirm.
 *
 * **REPORTED TO HIM AND OVERRULED — recorded so nobody "fixes" it back:**
 * `Check` is not one of the portal's six verbs, and `Check in` already means
 * the receiving act in this very module (Loo, 2026-07-28). The alternative
 * needing no new verb was `Confirm expected arrival`. He saw both and chose
 * this one; it is in `docs/COPY-STANDARD.md` under his name.
 */
export const PO_STATE_ACTION_SHORT = {
  need_confirmation: "Check Expected Arrival",
} as const;

/**
 * The delay-reason categories (Jess, 2026-08-02) — a locked DROPDOWN so the
 * ledger can be counted ("这年 Production Delay 几次?"); the real story goes
 * in the free-text Remarks beside it, never inside the category.
 */
export const PO_DELAY_REASONS = [
  "Production Delay",
  "Material Shortage",
  "Transport Delay",
  "Waiting Customer Confirmation",
  "Factory Closed",
  "Other",
] as const;

/**
 * How the goods' arrival stands against what we promised the CUSTOMER
 * (Jess, 2026-08-03).
 *
 * The register put `Customer Delivery` and `Goods Arrival` side by side and
 * left the subtraction to the operator's head. Measured on the live 19 POs:
 * EIGHT were already landing after the customer's date, two on the very day,
 * and the page said nothing — and most of those arrival dates are still our
 * own estimate, so we knew before we had even phoned.
 *
 * It rides the ARRIVAL date, never the customer's: the arrival is the number
 * a phone call can still move; the promise to the customer cannot. (The
 * customer's own cell keeps its separate red for a date that has already
 * PASSED — a different fact, and two reds on one row would blur both.)
 *
 * SILENCE MEANS FINE, so a gap with room to spare returns null. Only two
 * things speak: `late` (the goods land after the promise) and `tight` (the
 * same day — no room at all for one hiccup, which is not "fine").
 */
export type PoArrivalGap = {
  /** Calendar days the arrival falls AFTER the customer's date; 0 = same day. */
  days: number;
  tone: "late" | "tight";
  label: string;
};

export function poArrivalGapOf(
  customerDeliveryIso: string | null | undefined,
  arrivalIso: string | null | undefined,
): PoArrivalGap | null {
  if (!customerDeliveryIso || !arrivalIso) return null;
  const days = Math.round(
    (Date.parse(`${arrivalIso}T00:00:00Z`) -
      Date.parse(`${customerDeliveryIso}T00:00:00Z`)) /
      86_400_000,
  );
  if (days < 0) return null;
  if (days === 0) return { days: 0, tone: "tight", label: "same day" };
  return { days, tone: "late", label: `${days}d late` };
}

/**
 * RISK ORDER — which purchase order to touch FIRST (Loo, 2026-08-04).
 *
 * The register opened on `PO Issued`, oldest first, which sorts by how long
 * the DOCUMENT has waited rather than by how close the CUSTOMER is. Measured
 * on the live 21: `PO-2038`'s customer expected goods that same day, the
 * factory had never given a date, our own estimate landed a week after the
 * promise — and it sat at row 8 wearing the same words as fifteen other rows.
 *
 * **This settles a LAW CONFLICT rather than expressing a preference.**
 * `PURCHASING-WORKING-FLOW.md` §6 and `ACTION-FLOW-STANDARD.md` Law 5 both say
 * row order is *risk to the promise*; Jess's 2026-08-02 listing law said
 * `PO Issued` oldest first. Both were law. Loo ruled risk-first on 2026-08-04,
 * and **her rule is not deleted — it survives as the header sort and as the
 * tie-breaker below.**
 *
 * It lives here, beside `poCurrentActionOf` and `poArrivalGapOf`, because a
 * comparator written inside the page would be a SECOND priority: the row's
 * pill would say one thing and the row's position another.
 */
export interface PoRiskRow {
  /** `purchase_orders.id` — the last tie-break, so the order is TOTAL and two
   *  rows can never swap between renders. */
  poId: string;
  /** From `poWorkStateOf`. A finished or cancelled PO has no risk left. */
  state: PoWorkState;
  /** The engine's open calls (`purchasingSupplierCallsOf`) — `late` is its own. */
  calls: readonly { late: boolean }[];
  /** What we promised the customer (earliest across a merged PO's orders). */
  customerDeliveryIso: string | null;
  /** The arrival the register SHOWS — the supplier's own date, else our
   *  estimate. The same value the Goods Arrival cell prints, so the colour and
   *  the position can never disagree. */
  arrivalIso: string | null;
  /** `purchase_orders.placed_at` — Jess's rule, as the tie-breaker. */
  placedAtIso: string | null;
}

/** 1 is the most dangerous; 5 is everything with nothing to say. */
export type PoRiskRung = 1 | 2 | 3 | 4 | 5;

/** A PO with no promised date sorts LAST inside its rung, never first — an
 *  absent date is not an urgent one. */
const NO_CUSTOMER_DATE = "9999-12-31";

export function poRiskRungOf(row: PoRiskRow): PoRiskRung {
  // The work is over: its gap is history, not work — the same silence the
  // Goods Arrival cell already keeps for a finished PO.
  if (row.state === "completed" || row.state === "cancelled") return 5;
  if (row.calls.some((c) => c.late)) return 1;
  const gap = poArrivalGapOf(row.customerDeliveryIso, row.arrivalIso);
  if (gap?.tone === "late") return 2;
  if (gap?.tone === "tight") return 3;
  if (row.calls.length > 0) return 4;
  return 5;
}

export function comparePoRisk(a: PoRiskRow, b: PoRiskRow): number {
  const ra = poRiskRungOf(a);
  const rb = poRiskRungOf(b);
  if (ra !== rb) return ra - rb;
  const ca = a.customerDeliveryIso ?? NO_CUSTOMER_DATE;
  const cb = b.customerDeliveryIso ?? NO_CUSTOMER_DATE;
  if (ca !== cb) return ca < cb ? -1 : 1;
  const pa = a.placedAtIso ?? "";
  const pb = b.placedAtIso ?? "";
  if (pa !== pb) return pa < pb ? -1 : 1;
  return a.poId.localeCompare(b.poId);
}

export function poWorkStateOf(
  po: Pick<SupplierCallPo, "status" | "etaDateIso" | "lines">,
  // Kept for signature stability (poOverdueDays and every caller pass it);
  // the state itself stopped reading the clock when READY became "goods
  // arrived" rather than "the date came" (Jess's machine, 2026-08-02).
  _todayIso: string,
): PoWorkState {
  const p = poReceivingProgress(
    po.lines.map((l) => ({ qty: l.qty, received_qty: l.receivedQty })),
  );
  if (po.status === "cancelled") return "cancelled";
  if (po.status !== "open") return "completed";
  if (p.ordered > 0 && p.received >= p.ordered) return "completed";
  // Ready = goods ARRIVED (something checked in). A date merely PASSING is
  // NOT arrival — that is Overdue, a sub-state of waiting (Jess's state
  // machine, 2026-08-02, which corrected the earlier date-based rule).
  if (p.received > 0) return "ready";
  if (!po.etaDateIso) return "need_confirmation";
  return "waiting";
}

/**
 * Overdue — the supplier's date PASSED and nothing arrived. A sub-state of
 * `waiting`, never its own progress bucket (Jess: progress is the goods'
 * stage; contacting the supplier is an ACTION). Returns the day count
 * (>= 1) or null.
 */
export function poOverdueDays(
  po: Pick<SupplierCallPo, "status" | "etaDateIso" | "lines">,
  todayIso: string,
): number | null {
  if (poWorkStateOf(po, todayIso) !== "waiting") return null;
  const eta = po.etaDateIso;
  if (!eta || eta >= todayIso) return null;
  const ms = Date.parse(`${todayIso}T00:00:00Z`) - Date.parse(`${eta}T00:00:00Z`);
  const days = Math.round(ms / 86_400_000);
  return days >= 1 ? days : null;
}

export type PoCurrentAction =
  | { kind: "call"; call: PurchasingOpenCall }
  | { kind: "state"; key: keyof typeof PO_STATE_ACTION_WORD; word: string };

/**
 * ONE Current Action per PO — or none. Engine first, the one state word only
 * when the engine is quiet.
 *
 * **NULL IS A REAL ANSWER, not a gap** (§12.3: *may it be empty — yes*).
 * `completed` and `cancelled` carry none because the work is over;
 * `waiting` and `ready` carry none because what they had to say was a STATUS
 * and a navigation, and neither is work. The register prints `—`.
 *
 * **OVERDUE IS THE SAME ACTION, MERELY LATE (Loo, 2026-08-04 · Q8).** The
 * supplier's date passed and nothing came, so the date we hold is worthless
 * and the operator's job is the one this column already names: find out when
 * the goods actually arrive. It therefore returns the SAME key and the SAME
 * word — never a second key, which would also split the column's filter into
 * two rows carrying one identical label. Its PRECEDENCE is untouched: it
 * still outranks the engine's calls exactly as it did when the word was
 * `Contact Supplier`.
 */
export function poCurrentActionOf(
  po: SupplierCallPo,
  opts: { todayIso: string },
): PoCurrentAction | null {
  const state = poWorkStateOf(po, opts.todayIso);
  if (state === "completed" || state === "cancelled") return null;
  if (poOverdueDays(po, opts.todayIso) != null) {
    return {
      kind: "state",
      key: "need_confirmation",
      word: PO_STATE_ACTION_WORD.need_confirmation,
    };
  }
  const calls = purchasingSupplierCallsOf(po, opts);
  if (calls.length > 0) return { kind: "call", call: calls[0] };
  if (state === "need_confirmation") {
    return { kind: "state", key: state, word: PO_STATE_ACTION_WORD[state] };
  }
  return null;
}

/**
 * The supplier's date HISTORY, numbered (Jess, 2026-08-02 — "1st, 2nd, 3rd").
 *
 * The international shape is not four columns (2990s' `_2 _3 _4` runs out at
 * the fifth answer). It is SAP's pair: the ORIGINAL promise beside the current
 * one, plus how far it has slipped — those two numbers are what judge a
 * supplier. Our append-only ledger already holds every answer, so this is
 * pure reading: oldest first, numbered, with the slip measured from the FIRST
 * date the supplier ever gave (never from the engine's estimate — an estimate
 * is our guess, not their promise).
 */
export interface PoDatePromise {
  kind: string;
  answer: string;
  about_date: string | null;
  previous_date: string | null;
  new_date: string | null;
  reason: string | null;
  remarks?: string | null;
  recorded_at: string;
}

export interface PoDateHistoryEntry {
  /** 1-based: `1st`, `2nd`, `3rd` … */
  ordinal: number;
  /** The date the supplier named at that point. */
  date: string;
  reason: string | null;
  remarks: string | null;
  recordedAt: string;
}

export interface PoDateHistory {
  /** `Expected Arrival` — when the goods are expected to reach us. */
  entries: PoDateHistoryEntry[];
  /**
   * `Supplier Ready Date` — when the factory says it has FINISHED making it
   * (Q5). Its own list, never merged into `entries`: the two are different
   * FACTS (§12.2's date dictionary), every supplier here carries transit days,
   * and one numbered run mixing them would count `2nd` across two questions
   * and measure a slip between a ready date and an arrival date.
   *
   * Before Q5 this ledger kind was FILTERED OUT, so the first ready date an
   * operator recorded would have been swallowed by the history that sits
   * beside the field.
   */
  readyEntries: PoDateHistoryEntry[];
  /** The first date the supplier ever gave, or null if they never have. */
  firstDate: string | null;
  /** The date they stand on now. */
  currentDate: string | null;
  /** Calendar days between the first promise and the current one; 0 when
   *  they have never moved. Null when there is nothing to compare. */
  slipDays: number | null;
  /** The ready date they stand on now, or null if they never gave one. */
  readyCurrentDate: string | null;
  /** The same slip measurement, for the ready date's own run. */
  readySlipDays: number | null;
}

/** Oldest first, numbered, one kind at a time. */
function dateEntriesOf(
  promises: readonly PoDatePromise[],
  kind: "tomorrow_delivery" | "ready_date",
): PoDateHistoryEntry[] {
  const rows = promises
    .filter((p) => p.kind === kind)
    .slice()
    .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  const entries: PoDateHistoryEntry[] = [];
  for (const r of rows) {
    // A ready date IS the answer, so it always names its new date. On the
    // arrival kind a delay names the NEW date and a confirmation names the
    // date it was about.
    const date =
      kind === "ready_date"
        ? r.new_date
        : r.answer === "delayed"
          ? r.new_date
          : r.about_date;
    if (!date) continue;
    // A repeated confirmation of the SAME date is not a new date — it is the
    // same promise restated, so it never earns an ordinal.
    if (entries.length > 0 && entries[entries.length - 1].date === date) continue;
    entries.push({
      ordinal: entries.length + 1,
      date,
      reason: r.reason ?? null,
      remarks: r.remarks ?? null,
      recordedAt: r.recorded_at,
    });
  }
  return entries;
}

const slipOf = (entries: readonly PoDateHistoryEntry[]): number | null => {
  const first = entries[0]?.date ?? null;
  const current = entries[entries.length - 1]?.date ?? null;
  return first && current
    ? Math.round(
        (Date.parse(`${current}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) /
          86_400_000,
      )
    : null;
};

export function poDateHistoryOf(
  promises: readonly PoDatePromise[] | null | undefined,
): PoDateHistory {
  const all = promises ?? [];
  const entries = dateEntriesOf(all, "tomorrow_delivery");
  const readyEntries = dateEntriesOf(all, "ready_date");
  return {
    entries,
    readyEntries,
    firstDate: entries[0]?.date ?? null,
    currentDate: entries[entries.length - 1]?.date ?? null,
    slipDays: slipOf(entries),
    readyCurrentDate: readyEntries[readyEntries.length - 1]?.date ?? null,
    readySlipDays: slipOf(readyEntries),
  };
}

/** `1st` · `2nd` · `3rd` · `4th` … */
export function ordinalLabel(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
