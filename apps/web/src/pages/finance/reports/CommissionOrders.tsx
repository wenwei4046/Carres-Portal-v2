/**
 * Reports → Dealer commission → By order (dealer commission step 2, Chew
 * 2026-10-08; rules docs/finance/MASTER.md §3.2).
 *
 * The month's commission order by order, as Chew's statement workbook lays it
 * out: the new orders of the month, the balances collected in it, what was
 * taken back in it, and the orders still waiting for money. Every figure is
 * the shared `dealerCommissionOrders` (Law D) over the same read the By dealer
 * view uses, so the two always add up to the same totals.
 *
 * A row opens its order: how its commission is made up (what earns nothing is
 * paid first; nothing is earned before half the order is paid) and, for a
 * cancelled order, the switch that takes its commission back (0662), which
 * counts in the month Finance turns it on.
 */
import { useMemo, useState } from "react";
import {
  dealerCommissionOrders,
  type DcOrderGroup,
  type DcOrderMonth,
  type DcSource,
} from "@carres/shared/dealer-commission";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Button from "@/components/kit/Button";
import Modal from "@/components/kit/Modal";
import { FieldError } from "@/components/kit/FieldFrame";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { apiFetch } from "@/lib/api";
import { fmtDate, fmtMonth } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import { customerWord, noteWord, soWord } from "./commission-words";

const BASE = "/api/finance/dealer-commission";

type OrderRow = DcOrderMonth & { dealer: string };

// PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), dealer commission step 2).
export const ORDER_GROUPS: readonly { key: DcOrderGroup; label: string }[] = [
  { key: "new", label: "New orders this month" },
  { key: "balance", label: "Balances this month" },
  { key: "cancelled", label: "Cancelled this month" },
  { key: "taken_back", label: "Taken back this month" },
  { key: "waiting", label: "Still waiting for money" },
];

const soOf = (r: OrderRow) => soWord(r.order);
const customerOf = (r: OrderRow) => customerWord(r.order);

const sum = (rows: OrderRow[], f: (r: OrderRow) => number) => rm(rows.reduce((s, r) => s + f(r), 0));

export default function CommissionOrders({
  src,
  loading,
  month,
  filter,
  toolbarStart,
}: {
  src: DcSource | undefined;
  loading: boolean;
  month: string;
  filter: { dealerId?: string; outletId?: string };
  toolbarStart: React.ReactNode;
}) {
  const rows = useMemo<OrderRow[]>(() => (src ? dealerCommissionOrders(src, month, filter) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [src, month, filter.dealerId, filter.outletId]);
  const [open, setOpen] = useState<OrderRow | null>(null);

  const columns = useMemo<DataGridColumn<OrderRow>[]>(() => [
    { key: "so", label: "SO", width: 110, accessor: soOf, searchValue: soOf },
    { key: "dealer", label: "Dealer", width: 200, accessor: (r) => r.dealer, searchValue: (r) => r.dealer },
    { key: "customer", label: "Customer", width: 200, accessor: customerOf, searchValue: customerOf },
    { key: "ordered", label: "Order day", width: 120, accessor: (r) => (r.order.orderedOn ? fmtDate(r.order.orderedOn) : "Day not recorded"),
      exportValue: (r) => r.order.orderedOn ?? "" },
    { key: "total", label: "Order total", width: 140, align: "right", accessor: (r) => rm(r.terms.total),
      numberValue: (r) => r.terms.total, exportValue: (r) => r.terms.total },
    { key: "full", label: "Commission in full", width: 160, align: "right", accessor: (r) => rm(r.terms.full),
      numberValue: (r) => r.terms.full, exportValue: (r) => Math.round(r.terms.full * 100) / 100 },
    { key: "kept", label: "Paid by month end", width: 160, align: "right", accessor: (r) => rm(r.keptToMonthEnd),
      numberValue: (r) => r.keptToMonthEnd, exportValue: (r) => r.keptToMonthEnd },
    { key: "earned", label: "Commission this month", width: 190, align: "right", accessor: (r) => rm(r.earned),
      numberValue: (r) => r.earned, exportValue: (r) => r.earned, footerTotal: (rs) => sum(rs, (r) => r.earned) },
    { key: "still", label: "Still to earn", width: 140, align: "right", accessor: (r) => rm(r.stillToEarn),
      numberValue: (r) => r.stillToEarn, exportValue: (r) => r.stillToEarn, footerTotal: (rs) => sum(rs, (r) => r.stillToEarn) },
    { key: "note", label: "Note", width: 200, filterType: "enum", accessor: noteWord },
  ], []);

  return (
    <ListPageShell register>
      <DataGrid
        rows={rows}
        columns={columns}
        rowKey={(r) => r.order.orderId}
        storageKey="carres.finance.dealer-commission-orders.v1"
        appearance="reference"
        exportName={`Dealer commission by order ${month}`}
        groupBanner={false}
        allowColumnGrouping={false}
        stickyIdentity
        fixedGroups={{ groups: ORDER_GROUPS.map((g) => ({ key: g.key, label: g.label })), groupOf: (r) => r.group ?? "waiting", revealMatches: true }}
        isLoading={loading}
        wrapToolbar
        toolbarStart={toolbarStart}
        onRowClick={(r) => setOpen(r)}
        statusSummary={(visible) => (
          <span data-testid="commission-orders-summary">
            {visible.length} of {rows.length} orders · What earns nothing is paid first. Nothing is earned before half the order is paid.
          </span>
        )}
      />
      {open && <OrderWindow key={open.order.orderId} row={open} month={month} onClose={() => setOpen(null)} />}
    </ListPageShell>
  );
}

function OrderWindow({ row, month, onClose }: { row: OrderRow; month: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [refusal, setRefusal] = useState<string | null>(null);
  const takeBack = useMutation({
    mutationFn: (on: boolean) => apiFetch(`${BASE}/orders/${row.order.orderId}/take-back`, {
      method: "PUT", body: JSON.stringify({ takeBack: on }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance", "dealer-commission"] }),
  });
  const o = row.order;
  const taken = !!o.takeBackOn;
  const monthWord = fmtMonth(month);
  const send = (on: boolean) => {
    setRefusal(null);
    takeBack.mutate(on, { onSuccess: onClose, onError: (e) => setRefusal(e.message) });
  };
  return (
    <Modal
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      // PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), dealer commission step 2).
      title={soOf(row)}
      description={`${customerOf(row)} · ${row.dealer}`}
      footer={
        o.cancelledOn ? (
          <>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" loading={takeBack.isPending} onClick={() => send(!taken)}>
              {taken ? "Keep commission" : "Take commission back"}
            </Button>
          </>
        ) : (
          <Button variant="neutral" onClick={onClose}>Close</Button>
        )
      }
    >
      <div className="flex flex-col gap-1.5 text-body" data-testid="commission-order-detail">
        <p>Order day: {o.orderedOn ? fmtDate(o.orderedOn) : "Day not recorded"}</p>
        <p>Order total: {rm(row.terms.total)}</p>
        <p>Earns nothing, paid first: {rm(row.terms.noEarn)}</p>
        <p>Earns commission: {rm(row.terms.base)}</p>
        <p>Commission in full: {rm(row.terms.full)}</p>
        <p>Half paid on: {row.halfReachedOn ? fmtDate(row.halfReachedOn) : "Not yet"}</p>
        <p>Paid by the end of {monthWord}: {rm(row.keptToMonthEnd)}</p>
        <p>Commission by the end of {monthWord}: {rm(row.earnedToMonthEnd)}</p>
        <p className="font-semibold">Commission this month: {rm(row.earned)}</p>
        <p>Still to earn: {rm(row.stillToEarn)}</p>
        {o.cancelledOn && <p>Cancelled on: {fmtDate(o.cancelledOn)}</p>}
        {taken && <p>Commission taken back on: {fmtDate(o.takeBackOn!)}</p>}
        {o.cancelledOn && (
          <p className="text-kit-slate-11">
            {taken
              ? "Keeping it gives the commission back in the month you do it."
              : "What it earned on money Carres kept stays. Taking it back counts in the month you do it."}
          </p>
        )}
        {refusal && <FieldError>{refusal}</FieldError>}
      </div>
    </Modal>
  );
}
