import type { ReactNode } from "react";
import { LIFT_OPTIONS, type SoBatchOrderRow } from "@carres/shared";
import CompactModuleCard from "@/components/kit/CompactModuleCard";
import Button from "@/components/kit/Button";
import { useOperationOrders } from "@/lib/queries";
import { appTodayIso, fmtDate, fmtDateShort } from "@/lib/fmt-date";
import { salesLocationOf } from "../sales-order-columns";
import SalesOrderCardDocument from "../components/SalesOrderCardDocument";

/** Buying supplies its actions; the shared customer header reads Sales-owned facts. */
export default function SoBatchCompactView({ row, status, supplier, safetyDays, items, details, actions, onOpen, onClose }: {
  row: SoBatchOrderRow; status: string; supplier: string; safetyDays: string;
  items: ReactNode; details: ReactNode; actions?: ReactNode; onOpen: () => void; onClose?: () => void;
}) {
  const source = useOperationOrders({ search: row.so == null ? row.orderId : String(row.so) }, { retry: false });
  // Search is only a source lookup: a neighbouring SO never supplies this header.
  const order = source.isError || source.isPlaceholderData || !Array.isArray(source.data?.orders)
    ? undefined : source.data.orders.find(order => order.id === row.orderId);
  const loading = source.isPending || source.isPlaceholderData;
  const readFailed = !loading && !order;
  const unavailable = loading ? "Loading" : readFailed ? "Could not be loaded" : "Not recorded";
  return <div data-testid={`so-batch-card-${row.orderId}`}><CompactModuleCard
    name={row.customer ?? "Not recorded"} reference={row.so == null ? "Not recorded" : `SO-${row.so}`}
    phone={order?.customer_phone ?? unavailable}
    sales={{ orderDate: order?.placed_at ? fmtDate(order.placed_at) : unavailable,
      salesLocation: order ? salesLocationOf(order) || "Not recorded" : unavailable,
      salesperson: order?.salespersons?.name ?? unavailable }}
    address={{ area: [row.deliveryCity, row.deliveryState].filter(Boolean).join(", ") || "Not recorded",
      full: order?.customer_address ?? unavailable, facts: [
        { kind: "building", label: "Building type", value: order?.building_type || `Building type: ${unavailable}` },
        { kind: "building", label: "Floor", value: order?.delivery_floor == null ? `Floor: ${unavailable}` : `Floor ${order.delivery_floor}` },
        { kind: "access", label: "Lift", value: order?.delivery_has_lift == null ? `Lift: ${unavailable}` : LIFT_OPTIONS[order.delivery_has_lift ? 1 : 0] },
        { kind: "access", label: "Items needing stair carry", value: `Items needing stair carry: ${order?.delivery_stair_items ?? unavailable}` },
      ] }}
    target={row.requestedDeliveryDate ? { date: fmtDateShort(row.requestedDeliveryDate),
      badge: `${Math.round((Date.parse(row.requestedDeliveryDate.slice(0, 10)) - Date.parse(appTodayIso())) / 86400000)}d` } : undefined}
    document={row.so == null ? undefined : { label: `Sales Order SO-${row.so}`, preview: onClose => <SalesOrderCardDocument orderId={row.orderId} reference={`SO-${row.so}`} onClose={onClose} /> }}
    openLabel="Open full page" onOpen={onOpen} onClose={onClose} initialModule="buying"
    modules={[{ key: "buying", label: "SO Batch Purchase", communication: null,
      summary: [
        { key: "status", label: "PO Status", value: `PO ${status}` },
        { key: "supplier", label: "Supplier", value: supplier },
        { key: "proceed", label: "Proceed Date", value: row.proceededAt ? fmtDate(row.proceededAt) : "Not recorded" },
        ...(safetyDays ? [{ key: "safety", label: "PO Safety Days", value: safetyDays }] : []),
      ], items, details: <div className="flex flex-col gap-3">{readFailed && <Button size="sm" onClick={() => void source.refetch()}>Try again</Button>}{details}</div>,
    }]} />{actions && <div className="flex flex-wrap items-center justify-end gap-2 p-2">{actions}</div>}
  </div>;
}
