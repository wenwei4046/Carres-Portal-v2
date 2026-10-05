/**
 * The embedded `Sales Order` tab (UI MASTER §4.3, owner 2026-10-05) — read-only.
 *
 * A HOST (the PO full page, a PO working panel) owns its Header, its tabs and
 * every business action. Its `Sales Order` tab passes the linked order ids; each
 * one is drawn by the SAME kit card and the SAME SO builder as the Register's
 * quick view, in embedded presentation. The host shows the tab only when at
 * least one Sales Order is linked, so an empty list draws nothing.
 *
 * Reads only: the order row is the Operation list's one-order door
 * (`GET /api/operation/orders?orderId=`, the same row the Register reads) and
 * the items are the saved document's own lines (`/api/orders/:id/sales-order-data`,
 * the source of the SO PDF). Nothing here writes.
 */
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { fmtMoney } from "@carres/shared";
import CompactModuleCard from "@/components/kit/CompactModuleCard";
import DocumentTable, { type DocumentTableColumn, type DocumentTableRow } from "@/components/kit/DocumentTable";
import Button from "@/components/kit/Button";
import { apiFetch, ApiError } from "@/lib/api";
import type { operationOrdersListResponse } from "@/lib/queries";
import type { SalesOrderTemplateData } from "@/lib/pdf/types";
import { buildRegisterRow, salesLocationOf, type RegisterRow } from "../sales-order-columns";
import { configWords } from "../sales-order-change";
import { salesOrderCardHeader, salesOrderMoneySummary } from "./sales-order-card";

const ITEM_COLUMNS: DocumentTableColumn[] = [
  { key: "item", label: "Item" },
  { key: "qty", label: "Qty", numeric: true },
  { key: "unit", label: "Unit (RM)", numeric: true },
  { key: "discount", label: "Disc (RM)", numeric: true },
  { key: "amount", label: "Amount (RM)", numeric: true },
];
/** The full Sales Order page's digits: `2,499.00`, no currency prefix. */
const digits = (value: number) => fmtMoney(value).replace(/^RM\s*/, "");

/**
 * Goods, then services — the saved document's own lines, in its order. A line's
 * configuration prints under its name, as on the full page; `Disc (RM)` is zero
 * unless the line really carries a discount, as on the PDF.
 */
export function SalesOrderItemsTable({ reference, data }: { reference: string; data: Pick<SalesOrderTemplateData, "lines" | "addons"> }) {
  const item = (name: string, config: string) => (
    <div className="whitespace-normal">{name}{config ? <div className="text-meta text-kit-slate-11">{config}</div> : null}</div>
  );
  const rows: DocumentTableRow[] = [
    ...data.lines.map((line, index) => ({ key: `goods-${index}`, cells: {
      item: item(line.description, configWords(line.attrs)), qty: line.qty, unit: digits(line.unit_price),
      discount: digits(line.discount && line.discount > 0 ? line.discount : 0), amount: digits(line.line_total),
    } })),
    ...data.addons.map((line, index) => ({ key: `service-${index}`, cells: {
      item: item(line.label, configWords(line.attrs)), qty: line.qty, unit: digits(line.unit_price),
      discount: digits(0), amount: digits(line.line_total),
    } })),
  ];
  return <DocumentTable label={`Items · ${reference}`} columns={ITEM_COLUMNS} rows={rows} />;
}

const retryUnlessRefused = (count: number, error: unknown) => !(error instanceof ApiError && error.status === 403) && count < 2;

function ReadFailed({ onRetry }: { onRetry: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center gap-2 text-body text-kit-slate-11">
    <span>Could not be loaded</span>
    <Button size="sm" onClick={onRetry}>Try again</Button>
  </div>;
}

/** The saved document's lines, sharing the full SO page's cache entry. */
function SalesOrderItems({ orderId, reference }: { orderId: string; reference: string }) {
  const doc = useQuery({
    queryKey: ["orders", "sales-order-data", orderId],
    queryFn: () => apiFetch<SalesOrderTemplateData>(`/api/orders/${encodeURIComponent(orderId)}/sales-order-data`),
    staleTime: 10_000,
    retry: retryUnlessRefused,
  });
  if (doc.isPending) return <p role="status">Loading…</p>;
  if (doc.isError) return <ReadFailed onRetry={() => void doc.refetch()} />;
  return <SalesOrderItemsTable reference={reference} data={doc.data} />;
}

/** One Sales Order in embedded presentation; `items` is that order's item table. */
export function EmbeddedSalesOrderCard({ row, items, onOpen }: { row: RegisterRow; items: ReactNode; onOpen?: () => void }) {
  return <CompactModuleCard presentation="embedded" key={row.id} {...salesOrderCardHeader(row, salesLocationOf(row.o))}
    openLabel="Open full page" onOpen={onOpen}
    initialModule="info" modules={[{ key: "info", label: "Info", summary: salesOrderMoneySummary(row), items }]} />;
}

function EmbeddedSalesOrder({ orderId }: { orderId: string }) {
  const navigate = useNavigate();
  const order = useQuery({
    queryKey: ["operation", "orders", "row", orderId],
    queryFn: () => apiFetch<operationOrdersListResponse>(`/api/operation/orders?orderId=${encodeURIComponent(orderId)}`),
    staleTime: 30_000,
    retry: retryUnlessRefused,
  });
  const state = (text: string) => <p role="status" className="text-body text-kit-slate-11">{text}</p>;
  if (order.isPending) return state("Loading…");
  if (order.isError) {
    return order.error instanceof ApiError && order.error.status === 403
      ? state("You cannot view this record")
      : <ReadFailed onRetry={() => void order.refetch()} />;
  }
  /* The read answered without this order: it is outside the reader's Operation list. */
  const source = order.data.orders.find((o) => o.id === orderId);
  if (!source) return state("Order details unavailable");
  const row = buildRegisterRow(source);
  return <EmbeddedSalesOrderCard row={row} items={<SalesOrderItems orderId={row.id} reference={`SO-${row.so}`} />}
    onOpen={() => navigate(`/operation/orders/so/${row.id}`)} />;
}

/** One embedded block per linked Sales Order, each once, in the host's source order. */
export default function EmbeddedSalesOrders({ orderIds }: { orderIds: readonly string[] }) {
  const unique = [...new Set(orderIds.filter(Boolean))];
  if (!unique.length) return null;
  return <div className="flex min-w-0 flex-col gap-3" data-testid="embedded-sales-orders">
    {unique.map((id) => <div key={id} data-order-id={id}><EmbeddedSalesOrder orderId={id} /></div>)}
  </div>;
}

/** The Sales Order ids a host's governed sources link: unique, in source order. */
export function linkedSalesOrderIds(sources: ReadonlyArray<{ kind: string; orderId: string | null }>): string[] {
  return [...new Set(sources.flatMap((source) => source.kind === "sales_order" && source.orderId ? [source.orderId] : []))];
}
