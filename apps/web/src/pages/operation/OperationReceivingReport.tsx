import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  receivingDisplayNo,
  receivingExtraQty,
  receivingSummaryOf,
  warehouseReceiptStatusLabel,
  warehouseReceiptTotals,
} from "@carres/shared";
import DataTable, { type Column } from "@/components/kit/DataTable";
import EmptyState from "@/components/kit/EmptyState";
import Select from "@/components/kit/Select";
import {
  useOperationPos,
  useOperationSuppliers,
  useOperationWarehouseReceipts,
  type WarehouseReceiptQueueRow,
  type operationPoListRow,
} from "@/lib/queries";
import { fmtDate, fmtMonth } from "@/lib/fmt-date";
import PurchasingTabs from "./PurchasingTabs";

/**
 * Reports → Receiving & Inbound (docs/stock/MASTER.md §11 — the central
 * receiving report, owner instruction 2026-09-04).
 *
 * The Purchasing Report's three rules apply here unchanged:
 *
 *  1. **It stores nothing.** One read of the same warehouse-receipt list the
 *     Receiving register reads, one read of the same PO list Purchase Orders
 *     reads. Every figure is computed at render time by the SHARED arithmetics
 *     (`warehouseReceiptTotals` · `receivingExtraQty` · `receivingSummaryOf`)
 *     — the exact functions the registers themselves print with, so this
 *     report and a register can never arrive at two answers (Law D).
 *  2. **Every row is a DOOR.** A receiving record opens its own session in the
 *     Receiving workspace; an owed PO opens that PO there. A number the reader
 *     cannot walk into is a number they cannot check.
 *  3. **The exclusion is stated on screen.** Draft sessions are counts still
 *     being typed — not receiving records — and the page says so rather than
 *     silently filtering.
 *
 * **NO MONEY.** Receiving counts goods; Finance counts money. The wire this
 * page reads carries no cost field, so it could not print one if it tried.
 *
 * The month filter is the page's ONLY state, defaulting to the newest month
 * that actually holds a record — a report opens on the period the operator is
 * living in, not on an empty "All time" it must be steered out of.
 */

// design-standard: not-a-list-page — this is a REPORT (computed figures over
// the receiving registers). It renders through the kit DataTable under the
// Purchasing module header, so §8.3's module-tab law gives it no title band.

const W = {
  month: "Month",
  tableLabel: "Receiving records",
  pendingLabel: "Still owed by suppliers",
  noGrnYet: "No GRN yet",
  sameAsDeliverTo: "Same as Deliver To",
  voided: "Cancelled",
  draftNote: "Draft sessions are not receiving records and are excluded.",
  emptyRegister: "No receiving activity yet.",
  emptyPending: "No supplier delivery is owed.",
  failed: "This report could not be opened",
  tryAgain: "Try again",
} as const;

/** The month a receiving record belongs to — its BUSINESS date (when the
 *  goods physically arrived), falling back to when it was filed. */
function monthOf(r: WarehouseReceiptQueueRow): string {
  return (r.goods_received_at ?? r.submitted_at ?? "").slice(0, 7);
}

/** `3 receiving records · 12 received · 1 damaged · 0 wrong item · 2 extra` —
 *  composed once, so the sentence and the test cannot drift apart. */
export function receivingReportTotalsLine(rows: readonly WarehouseReceiptQueueRow[]): string {
  let received = 0;
  let damaged = 0;
  let wrong = 0;
  let extra = 0;
  for (const r of rows) {
    const t = warehouseReceiptTotals(r.lines);
    received += t.received;
    damaged += t.damaged;
    wrong += t.wrongItem;
    extra += receivingExtraQty(r.extra_lines);
  }
  return `${rows.length} receiving record${rows.length === 1 ? "" : "s"} · ${received} received · ${damaged} damaged · ${wrong} wrong item · ${extra} extra`;
}

interface OwedPoRow {
  id: string;
  supplier: string;
  orderQty: number;
  receivedQty: number;
  pendingDeliveryQty: number;
}

export default function OperationReceivingReport() {
  const receiptsQ = useOperationWarehouseReceipts("all");
  const posQ = useOperationPos();
  // Supplier names resolve through the suppliers read — a stored id never
  // reaches the screen untranslated (COPY-STANDARD).
  const suppliersQ = useOperationSuppliers();

  /**
   * DRAFTS ARE EXCLUDED, AND THE PAGE SAYS SO. A draft is a count still being
   * typed — `warehouse-receipt.ts`'s own lifecycle doc: "being counted…
   * discarded if the operator walks away". Everything else — submitted,
   * returned, posted, voided — IS a receiving record and history never
   * deletes, so a voided session still appears, marked.
   */
  const records = useMemo(
    () =>
      (receiptsQ.data?.receipts ?? []).filter((r) => r.status !== "draft"),
    [receiptsQ.data],
  );

  /** The months that actually hold a record, newest first. */
  const months = useMemo(() => {
    const seen = new Set<string>();
    for (const r of records) {
      const m = monthOf(r);
      if (m) seen.add(m);
    }
    return [...seen].sort().reverse();
  }, [records]);

  /** The page's only state. `null` = "not chosen yet", which resolves to the
   *  newest month present — a report opens on the operator's current period. */
  const [monthSel, setMonthSel] = useState<string | null>(null);
  const month = monthSel != null && months.includes(monthSel) ? monthSel : months[0] ?? null;

  const rows = useMemo(
    () => (month == null ? records : records.filter((r) => monthOf(r) === month)),
    [records, month],
  );

  /** `Still owed by suppliers` — open POs whose lines still owe goods, the
   *  SHARED five-quantity arithmetic per PO, largest debt first. */
  const owed = useMemo<OwedPoRow[]>(() => {
    // A PO row carries only supplier_id; names resolve through the suppliers
    // read (with the receipt rows' resolved names as a shortcut) — a stored
    // id never reaches the screen untranslated.
    const supplierNameById = new Map(
      (suppliersQ.data?.suppliers ?? []).map((x) => [x.id, x.name ?? ""]),
    );
    const supplierByPo = new Map<string, string>();
    for (const r of receiptsQ.data?.receipts ?? []) {
      if (r.supplier_name) supplierByPo.set(r.po_id, r.supplier_name);
    }
    return (posQ.data?.pos ?? [])
      .filter((p: operationPoListRow) => p.status === "open")
      .map((p) => {
        const s = receivingSummaryOf(p.purchase_order_lines);
        return {
          id: p.id,
          supplier:
            supplierByPo.get(p.id) ??
            supplierNameById.get(p.supplier_id) ??
            "No supplier yet",
          orderQty: s.orderQty,
          receivedQty: s.receivedQty,
          pendingDeliveryQty: s.pendingDeliveryQty,
        };
      })
      .filter((p) => p.pendingDeliveryQty > 0)
      .sort((a, b) => b.pendingDeliveryQty - a.pendingDeliveryQty);
  }, [posQ.data, receiptsQ.data, suppliersQ.data]);

  /**
   * Content-hugging pixel columns + the kit's own `auto` filler
   * (`sizing="content"`), the module's ONE width mechanism — never a
   * percentage (P20.3's law). Each width covers its header word plus the
   * widest governed value it prints.
   */
  const columns: Column<WarehouseReceiptQueueRow>[] = [
    {
      key: "grn",
      label: "GRN No",
      width: "152px",
      cell: (r) => {
        // The formal number exists only once the session hit the books —
        // before posting the honest answer is that there is no GRN yet.
        const posted = r.status === "posted" || r.status === "voided";
        return (
          <span className={posted ? "tabular-nums" : "text-kit-slate-11"}>
            {posted ? receivingDisplayNo(r) : W.noGrnYet}
          </span>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      width: "150px",
      // `void_reason` present ⇒ the record is Voided, whatever its raw status
      // string says — the mark the reader must not miss.
      cell: (r) => (r.void_reason ? W.voided : warehouseReceiptStatusLabel(r.status)),
    },
    {
      key: "receivedAt",
      label: "Goods received on",
      width: "126px",
      // Never a bare ISO date — the portal's one date spelling.
      cell: (r) => fmtDate(r.goods_received_at),
    },
    {
      key: "po",
      label: "Source PO",
      width: "142px",
      // THE DOOR — the row opens its own session in the Receiving workspace.
      cell: (r) => (
        <Link
          to={`/operation?tab=receiving&session=${encodeURIComponent(r.id)}`}
          data-testid={`receiving-report-session-${r.id}`}
          className="tabular-nums text-kit-blue-11 hover:underline"
        >
          {r.po_id}
        </Link>
      ),
    },
    {
      key: "supplier",
      label: "Supplier",
      width: "140px",
      cell: (r) => (
        <span className="truncate">{r.supplier_name ?? "No supplier yet"}</span>
      ),
    },
    {
      key: "deliverTo",
      label: "Deliver To",
      width: "120px",
      cell: (r) => <span className="truncate">{r.warehouse_name ?? ""}</span>,
    },
    {
      key: "actualSite",
      label: "Goods arrived at",
      width: "140px",
      // NULL means the goods arrived where the PO said they would — said in
      // words, never left as a blank the reader must interpret.
      cell: (r) =>
        r.actual_site_name ? (
          <span className="truncate">{r.actual_site_name}</span>
        ) : (
          <span className="text-kit-slate-11">{W.sameAsDeliverTo}</span>
        ),
    },
    {
      key: "doNo",
      label: "Supplier DO No.",
      width: "116px",
      cell: (r) => <span className="truncate tabular-nums">{r.do_number}</span>,
    },
    {
      key: "received",
      label: "Received Qty",
      width: "94px",
      align: "right",
      numeric: true,
      cell: (r) => warehouseReceiptTotals(r.lines).received,
    },
    {
      key: "damaged",
      label: "Damaged Qty",
      width: "96px",
      align: "right",
      numeric: true,
      cell: (r) => warehouseReceiptTotals(r.lines).damaged,
    },
    {
      key: "wrongItem",
      label: "Wrong Item Qty",
      width: "108px",
      align: "right",
      numeric: true,
      cell: (r) => warehouseReceiptTotals(r.lines).wrongItem,
    },
    {
      key: "extra",
      label: "Extra Qty",
      width: "72px",
      align: "right",
      numeric: true,
      // Extra goods never enter Inventory and never alter ordered/pending
      // arithmetic — a separate fact, in its own column.
      cell: (r) => receivingExtraQty(r.extra_lines),
    },
    {
      key: "submittedBy",
      label: "Submitted By",
      width: "110px",
      cell: (r) => <span className="truncate">{r.submitted_by_name ?? ""}</span>,
    },
    {
      key: "postedBy",
      label: "Posted By",
      width: "110px",
      cell: (r) => <span className="truncate">{r.posted_by_name ?? ""}</span>,
    },
  ];

  const failed = receiptsQ.isError || posQ.isError;

  return (
    <div
      className="h-full min-h-0 flex flex-col bg-kit-canvas"
      data-testid="receiving-report-page"
    >
      {/* SHELL LAW: the shell draws the header, pages never do. */}
      <PurchasingTabs />

      {failed ? (
        /* A failure sentence is never the empty sentence (COPY-STANDARD
           2026-08-28): what broke, then the act that fixes it. */
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3">
          <p className="text-body text-kit-slate-12" data-testid="receiving-report-error">
            {W.failed}
          </p>
          <button
            type="button"
            className="rounded-control border border-kit-slate-5 bg-white px-3 py-1.5 text-meta font-medium text-kit-slate-12 hover:bg-kit-slate-3"
            onClick={() => {
              void receiptsQ.refetch();
              void posQ.refetch();
            }}
          >
            {W.tryAgain}
          </button>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col px-4 pt-3 pb-3 gap-3">
          <div className="flex items-end justify-between gap-3 shrink-0">
            <div className="w-[180px]">
              <Select
                id="receiving-report-month"
                label={W.month}
                value={month ?? undefined}
                onValueChange={(v) => setMonthSel(v)}
                options={months.map((m) => ({ value: m, label: fmtMonth(m) }))}
              />
            </div>
            {/* The totals line — every figure from the same shared arithmetic
                the rows below print with, so the sentence and the cells cannot
                disagree. */}
            <p
              className="text-meta text-kit-slate-11 pb-1"
              data-testid="receiving-report-totals"
            >
              {receivingReportTotalsLine(rows)}
            </p>
          </div>

          <div className="flex-1 min-h-0 flex flex-col">
            <DataTable<WarehouseReceiptQueueRow>
              rows={rows}
              columns={columns}
              sizing="content"
              rowId={(r) => r.id}
              rowTestId="receiving-report-row"
              label={W.tableLabel}
              loading={receiptsQ.isLoading}
              rowMuted={(r) => r.status === "voided" || r.void_reason != null}
              empty={<EmptyState title={W.emptyRegister} />}
            />
            {/* The exclusion, stated — a silent filter is how two people get
                two answers from one report. */}
            <p
              className="pt-2 text-meta text-kit-slate-11"
              data-testid="receiving-report-footer"
            >
              {W.draftNote}
            </p>
          </div>

          {/* ── Still owed by suppliers ────────────────────────────────────
              The inbound half: open POs whose lines still owe goods, largest
              debt first. Each is a door into the Receiving workspace at that
              PO. */}
          <section
            className="shrink-0 max-h-[240px] overflow-y-auto rounded-card border border-kit-slate-5 bg-white p-3"
            aria-label={W.pendingLabel}
            data-testid="receiving-report-pending"
          >
            <h2 className="text-label text-kit-slate-11 pb-2">{W.pendingLabel}</h2>
            {posQ.isLoading ? null : owed.length === 0 ? (
              <p className="text-body text-kit-slate-11">{W.emptyPending}</p>
            ) : (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3 px-2 text-meta text-kit-slate-11">
                  <span className="w-28 shrink-0">PO No.</span>
                  <span className="min-w-0 flex-1">Supplier</span>
                  <span className="w-24 shrink-0 text-right">Order Qty</span>
                  <span className="w-24 shrink-0 text-right">Received Qty</span>
                  <span className="w-36 shrink-0 text-right">Pending Delivery Qty</span>
                </div>
                {owed.map((p) => (
                  <Link
                    key={p.id}
                    to={`/operation?tab=receiving&po=${encodeURIComponent(p.id)}`}
                    data-testid={`receiving-report-owed-${p.id}`}
                    className="flex items-center gap-3 rounded-control px-2 py-1 text-body hover:bg-kit-slate-3"
                  >
                    <span className="w-28 shrink-0 tabular-nums">{p.id}</span>
                    <span className="min-w-0 flex-1 truncate">{p.supplier}</span>
                    <span className="w-24 shrink-0 text-right tabular-nums">{p.orderQty}</span>
                    <span className="w-24 shrink-0 text-right tabular-nums">{p.receivedQty}</span>
                    <span className="w-36 shrink-0 text-right tabular-nums">
                      {p.pendingDeliveryQty}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
