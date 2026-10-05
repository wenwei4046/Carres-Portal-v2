/** Read-only SO tab adapter. The host owns its Header, tabs and all business actions. */
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { LIFT_OPTIONS } from "@carres/shared";
import CompactModuleCard from "@/components/kit/CompactModuleCard";
import DocumentTable from "@/components/kit/DocumentTable";
import Button from "@/components/kit/Button";
import { useOperationOrders, type operationOrderListRow } from "@/lib/queries";
import { apiFetch } from "@/lib/api";
import type { SalesOrderTemplateData } from "@/lib/pdf/types";
import { fmtDate } from "@/lib/fmt-date";
import { buildRegisterRow, salesLocationOf } from "../sales-order-columns";
import { originalRequestDays } from "./SalesOrderCompactView";
import SalesOrderCardDocument from "./SalesOrderCardDocument";

const amount = (value: number) => value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function EmbeddedSalesOrder({ order }: { order: operationOrderListRow }) {
  const navigate = useNavigate();
  const row = buildRegisterRow(order);
  const days = originalRequestDays(order.proceed_date, row.customerDelivery);
  const document = useQuery({ queryKey: ["orders", order.id, "sales-order-data"],
    queryFn: () => apiFetch<SalesOrderTemplateData>(`/api/orders/${encodeURIComponent(order.id)}/sales-order-data`), staleTime: 10_000 });
  const money = (fact: typeof row.total) => fact.kind === "amount" ? `RM ${amount(fact.value)}` : fact.kind === "settled" ? "Paid in full" : "No price yet";
  const data = document.data;
  const lines = data ? [...data.lines.map((line, index) => ({ key: `goods-${index}`, cells: {
    item: <><span>{line.description}</span><div className="text-meta text-kit-slate-11">{line.sku}</div></>, qty: line.qty,
    unit: amount(line.unit_price), discount: line.discount == null ? "" : amount(line.discount), amount: amount(line.line_total),
  } })), ...data.addons.map((line, index) => ({ key: `service-${index}`, cells: {
    item: <><span>{line.label}</span>{line.sku && <div className="text-meta text-kit-slate-11">{line.sku}</div>}</>, qty: line.qty,
    unit: amount(line.unit_price), discount: "", amount: amount(line.line_total),
  } }))] : [];
  return <CompactModuleCard presentation="embedded" name={row.customer} reference={`SO-${row.so}`} phone={row.phone}
    document={{ label: `Sales Order SO-${row.so}`, preview: onClose => <SalesOrderCardDocument orderId={row.id} reference={`SO-${row.so}`} onClose={onClose} /> }}
    onOpen={() => navigate(`/operation/orders/so/${row.id}`)} openLabel="Open full page"
    sales={{ orderDate: fmtDate(row.ordered), proceedDate: order.proceed_date ? fmtDate(order.proceed_date) : "Not recorded", salesLocation: salesLocationOf(order) || "Not recorded", salesperson: order.salespersons?.name ?? "Not recorded" }}
    address={{ area: "", hideArea: true, full: order.customer_address || "Not recorded", facts: [
      { kind: "building", label: "Building type", value: order.building_type || "Building type: Not recorded" },
      { kind: "building", label: "Floor", value: order.delivery_floor == null ? "Floor: Not recorded" : `Floor ${order.delivery_floor}` },
      { kind: "access", label: "Lift", value: order.delivery_has_lift == null ? "Lift: Not recorded" : LIFT_OPTIONS[order.delivery_has_lift ? 1 : 0] },
      ...(order.delivery_stair_items && order.delivery_stair_items > 0 ? [{ kind: "access" as const, label: "Stair carry", value: `Stair carry: ${order.delivery_stair_items} items` }] : []),
    ] }}
    target={{ date: row.customerDelivery ? fmtDate(row.customerDelivery) : "Not recorded", badge: days == null ? undefined : `${days}d`, label: "Customer’s original requested delivery", labelLines: ["Customer’s original", "requested delivery"] }}
    initialModule="sales" modules={[{ key: "sales", label: "Sales Order", summary: [
      { key: "total", label: "Total payable", value: money(row.total) }, { key: "paid", label: "Paid to date", value: money(row.paid) }, { key: "balance", label: "Balance due", value: money(row.balance) },
    ], items: document.isError ? <div role="alert">Could not be loaded <Button size="sm" onClick={() => void document.refetch()}>Try again</Button></div>
      : document.isPending ? <p role="status">Loading…</p> : <DocumentTable label={`Items · SO-${row.so}`} columns={[
        { key: "item", label: "Item" }, { key: "qty", label: "Qty", numeric: true }, { key: "unit", label: "Unit (RM)", numeric: true },
        { key: "discount", label: "Disc (RM)", numeric: true }, { key: "amount", label: "Amount (RM)", numeric: true },
      ]} rows={lines} /> }]} />;
}

export default function EmbeddedSalesOrders({ orderIds }: { orderIds: readonly string[] }) {
  const source = useOperationOrders();
  if (!orderIds.length) return <p className="text-body text-kit-slate-11">No Sales Orders</p>;
  if (source.isError) return <div role="alert">Could not be loaded <Button size="sm" onClick={() => void source.refetch()}>Try again</Button></div>;
  if (source.isPending || source.isPlaceholderData) return <p role="status">Loading…</p>;
  const orders = source.data?.orders ?? [];
  return <div className="flex min-w-0 flex-col gap-3">{[...new Set(orderIds)].map(id => {
    const order = orders.find(order => order.id === id);
    return order ? <EmbeddedSalesOrder key={id} order={order} /> : <p key={id} role="status">Could not be loaded</p>;
  })}</div>;
}
