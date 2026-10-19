import { useMemo } from "react";
import { Link } from "react-router-dom";
import { appTodayIso } from "@/lib/fmt-date";
import { daysBetween, documentDisplayNumber, poExpectedArrivalsOf, purchaseOrderRegisterFacts } from "@carres/shared";
import type { operationPoListRow, SupplierRow } from "@/lib/queries";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { REGISTER_FIELD_WIDTH as W } from "@/components/register/register-field-widths";
import Button from "@/components/kit/Button";
import TwoLineCell from "@/components/register/TwoLineCell";
import { fmtDate } from "@/lib/fmt-date";

export interface NotReceivedRow {
  id: string; supplier: string; items: string; due: string | null;
  ordered: number; received: number; pending: number;
}

/** Read the same sent-version, accepted quantity, cancellation and arrival authorities as Purchasing. */
export function notReceivedRows(pos: operationPoListRow[], suppliers: Map<string, SupplierRow>, today: string) {
  let unknown = 0;
  const rows: NotReceivedRow[] = [];
  for (const po of pos) {
    if (po.status !== "open") continue;
    const supplier = suppliers.get(po.supplier_id)?.name ?? "Not recorded";
    const lines = po.purchase_order_lines;
    const facts = purchaseOrderRegisterFacts({ id: po.id, supplierName: supplier, status: po.status, version: po.version ?? 1,
      lines: Array.isArray(lines) ? lines.map(line => ({ qty: line.qty ?? null, receivedQty: line.received_qty ?? null, cancelledQty: line.cancelled_qty })) : null,
      sends: (po.sends ?? []).map(send => ({ kind: send.kind, channel: send.channel, poVersion: send.po_version,
        sentAt: send.sent_at, recipient: send.recipient })),
    }, today);
    if (!facts.quantitiesKnown) { unknown += 1; continue; }
    if (facts.group !== "issued" || facts.quantities.open <= 0) continue;
    const arrivals = poExpectedArrivalsOf({ version: po.version ?? 1, officialDeliveryDate: po.official_delivery_date ?? null,
      etaDate: po.eta_date, promises: po.promises ?? [], lines: lines.map(line => ({ id: line.id, qty: line.qty,
        receivedQty: line.received_qty, cancelledQty: line.cancelled_qty })) });
    rows.push({ id: po.id, supplier, items: lines.map(line => [line.model_name ?? line.sku, line.size].filter(Boolean).join(" · ")).join("; "),
      due: arrivals.map(arrival => arrival.arrival).sort()[0] ?? null,
      ordered: facts.quantities.ordered, received: facts.quantities.received, pending: facts.quantities.open });
  }
  rows.sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.id.localeCompare(b.id));
  return { rows, unknown };
}

export default function NotReceivedRegister({ pos, suppliers, loading, error, retry, onReceive, sessionKey, canReceive }: {
  pos: operationPoListRow[]; suppliers: Map<string, SupplierRow>; loading: boolean; error: boolean;
  retry: () => void; onReceive: (id: string) => void; sessionKey: string; canReceive: boolean;
}) {
  const today = appTodayIso();
  const { rows, unknown } = useMemo(() => notReceivedRows(pos, suppliers, today), [pos, suppliers, today]);
  const columns = useMemo<DataGridColumn<NotReceivedRow>[]>(() => [
    { key: "po", label: "PO No", width: Math.max(180, W.documentNo), minWidth: 180, sortable: true,
      sortFn: (a, b) => a.id.localeCompare(b.id), accessor: row => <Link className="text-kit-blue-11 hover:underline" to={`/operation/procurement?po=${encodeURIComponent(row.id)}`}>{documentDisplayNumber(row.id)}</Link>, searchValue: row => `${row.id} ${documentDisplayNumber(row.id)}` },
    { key: "supplier", label: "Supplier", width: W.supplier, accessor: row => row.supplier, searchValue: row => row.supplier },
    { key: "items", label: "Items", width: W.items, accessor: row => <span className="whitespace-normal break-words">{row.items}</span>, searchValue: row => row.items },
    { key: "due", label: "Due", width: W.date, sortable: true, sortFn: (a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"),
      accessor: row => <TwoLineCell top={row.due ? fmtDate(row.due) : "Not recorded"}
        warn={!!row.due && row.due < today} sub={row.due && row.due < today ? `Late ${daysBetween(row.due, today)}d` : undefined} /> },
    { key: "received", label: "Received", width: W.qty * 2, accessor: row => <span className="tabular-nums" title={`Pending Delivery Qty ${row.pending}`}>{row.received}/{row.ordered}</span> },
    { key: "receive", label: "Check in", width: W.date, sortable: false, filterable: false,
      accessor: row => <Button disabled={!canReceive} onClick={() => onReceive(row.id)}>Check in</Button> },
  ], [onReceive, today, canReceive]);
  if (loading) return <p role="status">Loading…</p>;
  if (error) return <div role="alert"><p>Receiving could not be opened</p><Button onClick={retry}>Try again</Button></div>;
  return <>
    {unknown > 0 && <div role="alert"><p>Some information could not be loaded.</p><Button onClick={retry}>Try again</Button></div>}
    <DataGrid appearance="reference" rows={rows} columns={columns} rowKey={row => row.id}
      sessionKey={sessionKey} storageKey="carres.receiving.not-received.v1" searchPlaceholder="Search"
      sortDefault={{ key: "due", dir: "asc" }} emptyMessage={unknown ? "Some information could not be loaded." : "No supplier delivery is ready to receive."} />
  </>;
}
