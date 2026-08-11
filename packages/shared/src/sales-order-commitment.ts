/**
 * CARD 1 — CUSTOMER OBLIGATION TRUTH · the one resolver.
 *
 * `resolveCurrentCustomerCommitment(bundle)` answers, for any Sales Order:
 *
 *   1. What is the customer's CURRENT committed order?
 *   2. How did the current commitment become this?
 *
 * The bundle comes from `sales_order_commitment_bundle` (migration 0340),
 * which reads ONLY `orders` + `order_lines` + `order_addons` (via
 * `sales_order_snapshot`, the one snapshot arithmetic — Law D), the immutable
 * `sales_order_revisions` ledger and `order_change_requests`.
 *
 * WHAT THIS RESOLVER MAY NEVER READ (Card 1 §1 — the permanent boundary):
 * purchase orders · unit/stock allocation · receiving status ·
 * line_stock_status · booking state · operation_stage · drawer
 * PipelineStatus · orders.status='delivered' · Done pills · Issue Tracker.
 * Customer commitment flows DOWN to purchasing and fulfilment; it is never
 * inferred backwards from them. The types below simply do not carry those
 * fields, and the negative-control test (CASE 7) pins the invariant.
 *
 * This resolver answers COMMITMENT only. It deliberately cannot answer
 * "how much is physically fulfilled" — that truth arrives with Card 2
 * (unit/stock) and Card 5 (delivery attempts).
 */

/** One committed line, as the customer agreed it. */
export interface CommitmentLine {
  id?: string | null;
  sku: string;
  qty: number;
  unit_price: number | string;
  attrs?: unknown;
  source_po?: string | null;
  /** Resolved at mint time — the name the customer saw. */
  description?: string | null;
}

export interface CommitmentAddon {
  addon_key: string;
  qty: number;
  unit_price: number | string;
}

/** The snapshot shape `sales_order_snapshot` (0327) emits. */
export interface CommitmentSnapshot {
  header: Record<string, unknown>;
  lines: CommitmentLine[];
  addons: CommitmentAddon[];
}

export type CommitmentChangeType = "staff_correction" | "customer_change";

/** The words the operator reads — one place, so a queue and a panel cannot
 *  spell one cause two ways. */
export const COMMITMENT_CHANGE_WORDS: Record<CommitmentChangeType, string> = {
  staff_correction: "Staff correction",
  customer_change: "Customer change",
};

export interface CommitmentRevision {
  revision: number;
  created_at: string;
  created_by: string | null;
  change_type: CommitmentChangeType | null;
  note: string | null;
  snapshot: CommitmentSnapshot;
}

export interface CommitmentRequest {
  id: string;
  kind: string;
  status: string;
  requested_at: string;
  requested_by: string | null;
  decided_at: string | null;
  decided_by: string | null;
  applied_at: string | null;
  payload: unknown;
}

export interface CommitmentBundle {
  order_id: string;
  current: CommitmentSnapshot;
  revisions: CommitmentRevision[];
  requests: CommitmentRequest[];
}

/** One field-level movement between two revisions: previous → new. */
export interface CommitmentChange {
  kind: "header" | "line_added" | "line_removed" | "line_changed";
  /** header key, or the line's word (description || sku). */
  field: string;
  from: string | null;
  to: string | null;
}

export interface CommitmentLineageEntry {
  revision: number;
  at: string;
  by: string | null;
  /** null on Rev 1 (the original) and on pre-0340 revisions. */
  changeType: CommitmentChangeType | null;
  note: string | null;
  changes: CommitmentChange[];
}

export interface CurrentCustomerCommitment {
  orderId: string;
  /** The current committed goods — live `order_lines`, via the snapshot. */
  lines: CommitmentLine[];
  addons: CommitmentAddon[];
  /** The current promise made to the customer. */
  promise: { date: string | null; tbd: boolean };
  customer: { name: string | null; phone: string | null; address: string | null };
  /** Rev-by-rev lineage, oldest first. Empty when never edited: the current
   *  commitment IS the original. */
  lineage: CommitmentLineageEntry[];
  /** Asks that have not (yet) moved the commitment: pending / approved-but-
   *  unapplied change requests. NEVER part of the current commitment. */
  openRequests: CommitmentRequest[];
}

/**
 * The header keys that belong to the CUSTOMER's agreement or identity.
 * Execution facts that also live on the orders row (do_number, stages,
 * invoice_no …) are not in the snapshot at all — 0327 chose what to carry.
 */
const HEADER_KEYS: ReadonlyArray<string> = [
  "customer_name",
  "customer_phone",
  "customer_email",
  "customer_address",
  "customer_address_line1",
  "customer_address_line2",
  "customer_address_city",
  "customer_address_state",
  "customer_address_postcode",
  "customer_emergency",
  "customer_billing",
  "delivery_date",
  "delivery_date_tbd",
  "proceed_date",
  "delivery_floor",
  "delivery_has_lift",
  "salesperson_name",
  "outlet_name",
  "dealer_name",
];

function asWord(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

function lineWord(l: CommitmentLine): string {
  return (l.description ?? "").trim() || l.sku;
}

/**
 * Field-level diff between two snapshots — ONE arithmetic for "what moved",
 * shared by the API answer and any UI that words it.
 */
export function diffCommitmentSnapshots(
  prev: CommitmentSnapshot,
  next: CommitmentSnapshot,
): CommitmentChange[] {
  const out: CommitmentChange[] = [];
  for (const key of HEADER_KEYS) {
    const a = prev.header?.[key] ?? null;
    const b = next.header?.[key] ?? null;
    if ((a ?? null) === (b ?? null)) continue;
    out.push({ kind: "header", field: key, from: asWord(a), to: asWord(b) });
  }
  const prevById = new Map((prev.lines ?? []).map((l) => [l.id ?? l.sku, l]));
  const nextById = new Map((next.lines ?? []).map((l) => [l.id ?? l.sku, l]));
  for (const [id, b] of nextById) {
    const a = prevById.get(id);
    if (!a) {
      out.push({ kind: "line_added", field: lineWord(b), from: null, to: `×${b.qty}` });
      continue;
    }
    if (a.sku !== b.sku)
      out.push({ kind: "line_changed", field: lineWord(b), from: lineWord(a), to: lineWord(b) });
    if (Number(a.qty) !== Number(b.qty))
      out.push({ kind: "line_changed", field: lineWord(b), from: `×${a.qty}`, to: `×${b.qty}` });
    if (Number(a.unit_price) !== Number(b.unit_price))
      out.push({
        kind: "line_changed",
        field: lineWord(b),
        from: `RM ${Number(a.unit_price)}`,
        to: `RM ${Number(b.unit_price)}`,
      });
  }
  for (const [id, a] of prevById) {
    if (!nextById.has(id))
      out.push({ kind: "line_removed", field: lineWord(a), from: `×${a.qty}`, to: null });
  }
  return out;
}

const OPEN_REQUEST_STATUSES: ReadonlySet<string> = new Set(["pending", "approved"]);

/**
 * THE resolver. Pure — everything it knows is in the bundle, and the bundle
 * carries nothing from purchasing, units, receiving or legacy stages.
 */
export function resolveCurrentCustomerCommitment(
  bundle: CommitmentBundle,
): CurrentCustomerCommitment {
  const cur = bundle.current;
  const header = cur.header ?? {};

  const revisions = [...(bundle.revisions ?? [])].sort((a, b) => a.revision - b.revision);
  const lineage: CommitmentLineageEntry[] = revisions.map((r, i) => ({
    revision: r.revision,
    at: r.created_at,
    by: r.created_by,
    changeType: r.change_type,
    note: r.note,
    changes:
      i === 0 ? [] : diffCommitmentSnapshots(revisions[i - 1]!.snapshot, r.snapshot),
  }));

  const openRequests = (bundle.requests ?? []).filter(
    (q) => OPEN_REQUEST_STATUSES.has(q.status) && q.applied_at == null,
  );

  return {
    orderId: bundle.order_id,
    lines: cur.lines ?? [],
    addons: cur.addons ?? [],
    promise: {
      date: (header["delivery_date"] as string | null) ?? null,
      tbd: Boolean(header["delivery_date_tbd"]),
    },
    customer: {
      name: (header["customer_name"] as string | null) ?? null,
      phone: (header["customer_phone"] as string | null) ?? null,
      address: (header["customer_address"] as string | null) ?? null,
    },
    lineage,
    openRequests,
  };
}
