import { ExternalLink } from "lucide-react";

/**
 * J1 — the Documents panel (Order Journey execution queue).
 *
 * Every document this order HAS, one row each, clickable to open — and what is
 * MISSING, said out loud. Nothing here is stored: the whole list is DERIVED at
 * read time from records the drawer already loads (orders.invoice_no /
 * .do_number, the payment ledger, the linked purchase_orders, the T6 delivery-
 * photo ledger). There is no `documents` table and no manual linking.
 *
 * THE RULE that decides whether a row appears at all (three states, not two):
 *   - it exists            → render it with its number + an Open link
 *   - it cannot exist YET  → render NOTHING (an order with no PO has no
 *                            purchase-order row; silence is the honest answer
 *                            and a wall of "missing" is noise)
 *   - it SHOULD exist by now → render it as "missing"
 * "By now" is a real signal, never a guess: an order that has left the
 * warehouse must have an invoice and a delivery order (both auto-issued on the
 * dispatch transition by migration 0098); a delivered order must have a
 * delivery photo (T6, migration 0280); a received PO must have its supplier DO
 * file.
 *
 * The component is dumb + read-only. It renders rows and calls `onOpen`; the
 * drawer owns every open path, because those PDF/storage helpers already exist
 * there and a second copy would be a second thing to keep true.
 */

export type OrderDocKind =
  | "sales_order"
  | "invoice"
  | "receipt"
  | "purchase_order"
  | "supplier_do"
  | "delivery_order"
  | "delivery_photo";

export interface OrderDocRow {
  /** Stable react key — unique across the whole list. */
  id: string;
  kind: OrderDocKind;
  /** Left column: the document's plain name. */
  label: string;
  /** Right column: its number, or who it is with. Empty when missing. */
  detail: string;
  /** The order has passed the point where this document should exist. */
  missing: boolean;
  /** Open payloads — exactly one is set per openable row. */
  paymentId?: string;
  poId?: string;
  storagePath?: string;
  photoUrl?: string | null;
}

export interface OrderDocSignals {
  so: number;
  /** orders.invoice_no — auto-issued at dispatch (0098). */
  invoiceNo: string | null;
  /** orders.do_number — auto-assigned at dispatch (0098). */
  doNumber: string | null;
  /** The order has left the warehouse: invoice + delivery order are due. */
  dispatched: boolean;
  /** The order reached the customer: a delivery photo is due (T6). */
  delivered: boolean;
  /** One row per ledger payment. `paidOnLabel` is pre-formatted by the caller
   *  so this module carries no date dependency. */
  payments: { id: string; receiptNo: string | null; paidOnLabel: string }[];
  /** Purchase orders linked to this SO (own `so` or inside `so_refs`). */
  pos: {
    id: string;
    supplierName: string | null;
    /** purchase_orders.status === 'received' — the goods are in, so the
     *  supplier's signed DO should be on file. */
    received: boolean;
    /** purchase_orders.do_file_path — the `delivery-orders` bucket object. */
    doFilePath: string | null;
  }[];
  /** T6 ledger (ops_order_control.delivery_photos) + its signed view urls. */
  photos: { path: string; url: string | null }[];
}

/**
 * Build the document list for one order. Pure — same input, same rows, in
 * lifecycle order (sold → billed → paid → bought → received → delivered).
 */
export function deriveOrderDocuments(sig: OrderDocSignals): OrderDocRow[] {
  const rows: OrderDocRow[] = [];

  // 1. Sales order — every order has one, from the moment it exists.
  rows.push({
    id: "sales_order",
    kind: "sales_order",
    label: "Sales order",
    detail: `SO-${sig.so}`,
    missing: false,
  });

  // 2. Invoice — issued on the dispatch transition (0098).
  if (sig.invoiceNo) {
    rows.push({
      id: "invoice",
      kind: "invoice",
      label: "Invoice",
      detail: sig.invoiceNo,
      missing: false,
    });
  } else if (sig.dispatched) {
    rows.push({
      id: "invoice",
      kind: "invoice",
      label: "Invoice",
      detail: "",
      missing: true,
    });
  }

  // 3. Receipts — one per payment the ledger holds. No payment yet means no
  //    receipt can exist, so nothing renders (never "missing").
  for (const p of sig.payments) {
    rows.push({
      id: `receipt:${p.id}`,
      kind: "receipt",
      label: "Receipt",
      detail: p.receiptNo ?? p.paidOnLabel,
      missing: false,
      paymentId: p.id,
    });
  }

  // 4. Purchase orders — one per linked PO. An order bought from stock has
  //    none, which is not a gap.
  for (const po of sig.pos) {
    rows.push({
      id: `po:${po.id}`,
      kind: "purchase_order",
      label: "Purchase order",
      detail: po.supplierName ? `${po.id} · ${po.supplierName}` : po.id,
      missing: false,
      poId: po.id,
    });
  }

  // 5. Supplier DO — the signed paper that came with the goods. Due once the
  //    PO reads received; before that the supplier has not delivered.
  for (const po of sig.pos) {
    if (po.doFilePath) {
      rows.push({
        id: `sdo:${po.id}`,
        kind: "supplier_do",
        label: "Supplier DO",
        detail: po.supplierName ? `${po.id} · ${po.supplierName}` : po.id,
        missing: false,
        storagePath: po.doFilePath,
      });
    } else if (po.received) {
      rows.push({
        id: `sdo:${po.id}`,
        kind: "supplier_do",
        label: "Supplier DO",
        detail: po.id,
        missing: true,
      });
    }
  }

  // 6. Delivery order — our own paper to the customer, numbered at dispatch.
  if (sig.doNumber) {
    rows.push({
      id: "delivery_order",
      kind: "delivery_order",
      label: "Delivery order",
      detail: sig.doNumber,
      missing: false,
    });
  } else if (sig.dispatched) {
    rows.push({
      id: "delivery_order",
      kind: "delivery_order",
      label: "Delivery order",
      detail: "",
      missing: true,
    });
  }

  // 7. Delivery photo (T6) — proof the goods arrived. Only a delivered order
  //    can be missing one; upload stays in the Delivery card, this is a view.
  if (sig.delivered) {
    if (sig.photos.length === 0) {
      rows.push({
        id: "delivery_photo",
        kind: "delivery_photo",
        label: "Delivery photo",
        detail: "",
        missing: true,
      });
    } else {
      sig.photos.forEach((p, i) => {
        rows.push({
          id: `photo:${p.path}`,
          kind: "delivery_photo",
          label: "Delivery photo",
          detail: `Photo ${i + 1}`,
          missing: false,
          photoUrl: p.url,
        });
      });
    }
  }

  return rows;
}

/** How many documents this order actually holds — the tab's count badge. */
export function countDocumentsOnFile(rows: OrderDocRow[]): number {
  return rows.filter((r) => !r.missing).length;
}

/** How many are overdue — the tab's amber dot. */
export function countDocumentsMissing(rows: OrderDocRow[]): number {
  return rows.filter((r) => r.missing).length;
}

/**
 * Document kinds whose absence the ACTION ENGINE already raises as work.
 *
 * `delivery_photo` → `Upload delivery photo` is a real action in
 * `docs/ORDERS-WORKING-FLOW.md` §3, with its own trigger (delivered, no photo),
 * its own due (1 working day after the delivery) and its own owner.
 *
 * Every other kind here is stamped by the database, not done by a person:
 * `invoice` and `delivery_order` are auto-issued at dispatch (0098), so nobody
 * can "do" a missing one — it is a fact and, if it really should exist, a
 * defect to report. That is the other half of Law 7's split, and it is why this
 * list is deliberately short rather than "everything that could be missing".
 */
const DOC_KINDS_RAISED_BY_AN_ACTION: readonly OrderDocKind[] = ["delivery_photo"];

/**
 * The missing documents that may be STATED as something wrong.
 *
 * `docs/ACTION-FLOW-STANDARD.md` Law 7 (Loo, 2026-07-28): the action engine is
 * the only source of actions, and two computations may not describe the same
 * fixable gap — if the engine already raises it, the record states nothing.
 * `Delivery photo missing` was that duplicate: a document check saying, in the
 * voice of a problem, the exact thing `Upload delivery photo` already says with
 * a due date and an owner attached.
 *
 * The Documents list itself is unaffected and still shows the missing photo
 * row — a records surface may say what it lacks. What it may not do is phrase
 * that lack as a second piece of work.
 */
export function documentsMissingToState(rows: OrderDocRow[]): OrderDocRow[] {
  return rows.filter(
    (r) => r.missing && !DOC_KINDS_RAISED_BY_AN_ACTION.includes(r.kind),
  );
}

export default function OrderDocuments({
  rows,
  onOpen,
}: {
  rows: OrderDocRow[];
  onOpen: (row: OrderDocRow) => void;
}) {
  return (
    <div>
      {rows.map((r) => (
        <div
          key={r.id}
          data-testid="document-row"
          data-kind={r.kind}
          data-missing={r.missing ? "1" : "0"}
          className="px-3 py-1.5 border-b border-base-100 last:border-b-0 flex items-center justify-between gap-x-3 gap-y-1 flex-wrap min-h-9"
        >
          <span className="text-label font-semibold uppercase tracking-[0.03em] text-base-500 shrink-0">
            {r.label}
          </span>
          <span className="min-w-0 text-right flex items-center gap-2.5 justify-end flex-wrap">
            {r.missing ? (
              <span className="text-meta font-medium text-warning">
                missing
              </span>
            ) : (
              <>
                <span className="text-body font-medium text-base-900 truncate">
                  {r.detail}
                </span>
                <button
                  type="button"
                  onClick={() => onOpen(r)}
                  className="inline-flex items-center gap-1 text-meta text-info hover:underline shrink-0"
                >
                  Open
                  <ExternalLink size={12} aria-hidden />
                </button>
              </>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
