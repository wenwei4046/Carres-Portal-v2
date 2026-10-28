/**
 * THE FILES OF A TASK — the documents the Files tab lists, each rendered on
 * demand through its owning module's EXISTING print door (`record-print.ts`
 * uses the same two reads and the same governed renderers).
 *
 * READ-ONLY. Looking at a Purchase Order here is not `PO sent to supplier`;
 * nothing is recorded by a view or a download.
 */
import { apiFetch } from "@/lib/api";
import { renderPoPdf, renderSalesOrderPdf } from "@/lib/pdf/render";
import type { PoTemplateData, SalesOrderTemplateData } from "@/lib/pdf/types";
import type { TaskOrder } from "./TaskRoute";
import { TASK_VIEW_WORDS as W, type TaskFile, type TaskFileStage } from "./task-view";

const fileName = (label: string) => `${label.replace(/[^a-zA-Z0-9._-]/g, "_")}.pdf`;

/** The Sales Order document, as its own `Print` draws it. */
export function salesOrderFile(order: TaskOrder): TaskFile {
  return {
    key: `so-${order.orderId}`,
    name: fileName(order.label),
    detail: W.salesOrderFile,
    load: async () => renderSalesOrderPdf(await apiFetch<SalesOrderTemplateData>(`/api/orders/${order.orderId}/sales-order-data`)),
  };
}

/** The official Purchase Order at its current version. */
export function purchaseOrderFile(po: { id: string; label: string; document?: PoTemplateData | null }): TaskFile {
  return {
    key: `po-${po.id}`,
    name: fileName(po.label),
    detail: W.purchaseOrderFile,
    load: async () => renderPoPdf(po.document ?? await apiFetch<PoTemplateData>(`/api/operation/pos/${encodeURIComponent(po.id)}/print-data`)),
  };
}

/**
 * The stages of a Purchasing task, in the route's order: the Sales Orders it
 * serves, then its Purchase Orders. A stage with nothing says so.
 */
export function purchasingFileStages(orders: readonly TaskOrder[], pos: ReadonlyArray<{ id: string; label: string; document?: PoTemplateData | null }>): TaskFileStage[] {
  return [
    {
      key: "sales-order", title: W.stage.salesOrder,
      sub: orders.length > 1 ? W.salesOrders(orders.length) : null,
      files: orders.map(salesOrderFile),
    },
    {
      key: "purchase-order", title: W.stage.purchaseOrder,
      sub: pos.length > 1 ? W.purchaseOrders(pos.length) : null,
      files: pos.map(purchaseOrderFile),
    },
  ];
}
