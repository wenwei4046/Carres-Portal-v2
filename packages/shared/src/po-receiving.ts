/**
 * R1 · Receiving speaks Pending-delivery (receiving & claim execution queue,
 * Jess 2026-07-27).
 *
 * Receiving is an INSPECTION, not a checkbox. Every PO line therefore carries
 * four numbers, and this module is the ONE place that turns them into words:
 *
 *   Received qty · Pending delivery qty · Damaged qty · Wrong item qty
 *
 * **Vocabulary law (Jess, locked): the not-yet-arrived qty is `Pending
 * delivery` — NEVER "Missing".** The goods are not lost; the supplier simply
 * has not sent them yet. Nothing in this module, or in any surface reading it,
 * may say Missing / Short / Lost.
 *
 * The second half of the card is the PO row: a progress STATE instead of the
 * old binary "Receive → / Done".
 *
 *   In transit · Partially received (8/10) · Fully received · Receiving issue
 *
 * Precedence (order matters, and it is deliberate):
 *   1. `fully_received` — nothing is outstanding (received >= ordered). This
 *      wins even when the line carries historical damage, because the damaged
 *      units have since been replaced; the counters keep the history, the
 *      state describes TODAY. Without this rule a PO that was made good would
 *      stay red forever with no button to clear it.
 *   2. `receiving_issue` — something arrived damaged or as the wrong item and
 *      the supplier still owes us good units. This is the row a human must act
 *      on, so it outranks the merely-partial ones.
 *   3. `partially_received` — some good units in, some still coming.
 *   4. `in_transit` — nothing received yet.
 *
 * A damaged unit counts as PENDING DELIVERY, not as received: it physically
 * arrived, but the supplier still owes a good one, so the PO stays open with
 * its pending qty visible. That is also why `received_qty` never absorbs
 * damaged/wrong units — the stock ledger must only ever gain sellable goods.
 *
 * PURE — no I/O, no clock, no formatting beyond the row words. Both the API
 * (progress on the list payload) and the web (pill + column) read this module,
 * so the queue count and the row label can never drift apart.
 */

export type PoReceivingState =
  | "in_transit"
  | "partially_received"
  | "fully_received"
  | "receiving_issue";

/** The four numbers, as they come off `purchase_order_lines` (snake_case DB
 *  shape — nullable/absent tolerated so a pre-0283 payload degrades to zero
 *  issues rather than NaN). */
export interface PoReceivingLine {
  qty?: number | null;
  received_qty?: number | null;
  damaged_qty?: number | null;
  wrong_item_qty?: number | null;
}

export interface PoReceivingProgress {
  /** Units ordered across every line. */
  ordered: number;
  /** Good units booked into stock. */
  received: number;
  /** Ordered minus received — the supplier still owes these. NEVER "missing". */
  pendingDelivery: number;
  /** Units that arrived broken (cumulative across every DO on this PO). */
  damaged: number;
  /** Units that arrived as something other than what was ordered. */
  wrongItem: number;
  /** damaged + wrongItem — the "something is wrong" total. */
  issueQty: number;
  state: PoReceivingState;
  /** The row's pill word, e.g. `Partially received (8/10)`. */
  label: string;
  /** `2 units pending delivery`, or null when nothing is outstanding. The
   *  line Jess must be able to read off the list without opening anything. */
  pendingLabel: string | null;
  /** `2 damaged · 1 wrong item`, or null when the delivery was clean. */
  issueLabel: string | null;
}

function n(v: number | null | undefined): number {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function units(count: number): string {
  return `${count} unit${count === 1 ? "" : "s"}`;
}

/** Roll a PO's lines up into the one progress state its row shows. */
export function poReceivingProgress(
  lines: readonly PoReceivingLine[] | null | undefined,
): PoReceivingProgress {
  const rows = lines ?? [];
  let ordered = 0;
  let received = 0;
  let damaged = 0;
  let wrongItem = 0;
  let pendingDelivery = 0;

  for (const l of rows) {
    const q = Math.max(0, n(l.qty));
    // A stray over-receipt (data repair, legacy import) must never make the
    // total read as more than ordered, so clamp per line before summing.
    const r = Math.max(0, Math.min(q, n(l.received_qty)));
    ordered += q;
    received += r;
    pendingDelivery += q - r;
    damaged += Math.max(0, n(l.damaged_qty));
    wrongItem += Math.max(0, n(l.wrong_item_qty));
  }

  const issueQty = damaged + wrongItem;

  let state: PoReceivingState;
  if (ordered > 0 && received >= ordered) state = "fully_received";
  else if (issueQty > 0) state = "receiving_issue";
  else if (received > 0) state = "partially_received";
  else state = "in_transit";

  const label =
    state === "fully_received"
      ? "Fully received"
      : state === "receiving_issue"
        ? "Receiving issue"
        : state === "partially_received"
          ? `Partially received (${received}/${ordered})`
          : "In transit";

  const issueBits: string[] = [];
  if (damaged > 0) issueBits.push(`${damaged} damaged`);
  if (wrongItem > 0)
    issueBits.push(`${wrongItem} wrong item${wrongItem === 1 ? "" : "s"}`);

  return {
    ordered,
    received,
    pendingDelivery,
    damaged,
    wrongItem,
    issueQty,
    state,
    label,
    pendingLabel:
      pendingDelivery > 0 ? `${units(pendingDelivery)} pending delivery` : null,
    issueLabel: issueBits.length > 0 ? issueBits.join(" · ") : null,
  };
}

/**
 * What ONE line can still be reported on this delivery order.
 *
 * A DO may never account for more units than the line still owes: received now
 * + damaged now + wrong item now <= pending delivery. (The cumulative damaged
 * counter is deliberately NOT capped — a line ordered 10 can legitimately
 * record 10 damaged and later 10 received once the supplier replaces them.)
 */
export function poLineReportable(line: PoReceivingLine): number {
  const q = Math.max(0, n(line.qty));
  const r = Math.max(0, Math.min(q, n(line.received_qty)));
  return q - r;
}
