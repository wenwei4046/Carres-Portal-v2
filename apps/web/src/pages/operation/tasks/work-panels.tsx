/**
 * WHAT A TASK OPENS — each module's own working panel, in the Tasks area.
 *
 * The host never draws a module's work itself: a row opens that module's
 * panel through the module's EXISTING doors (owner directive 2026-10-06 —
 * the Purchasing flow only; no new engine, no new Work rule).
 *
 *   po_window        Purchasing's `BatchPanel`: Issue PO through the approved
 *                    50/50 review (`issue-batch`), Download PDFs (`print-data`),
 *                    `PO sent to supplier` (`confirm-sent` · `supplier-email`).
 *   purchase_order   PO Duty's own PO host, branched on the rule the feed
 *                    emitted: `purchasing.supplier_date_passed` opens
 *                    `SupplierAnswerTaskPanel`; every other purchasing PO row
 *                    (`purchasing.confirm_tomorrows_delivery`) opens
 *                    `PoDutyTaskPanel` with the Work page's own
 *                    `Record supplier answer` form.
 *   everything else  the Work act card (`WorkActionPanel`): `Open {object}`
 *                    goes to the module destination exactly as the Work page
 *                    does today. Delivery, Receiving and Payment panels are
 *                    not part of this slice.
 */
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { parsePoWindowKey, poLineReportable } from "@carres/shared";
import CompactModuleCard from "@/components/kit/CompactModuleCard";
import Button from "@/components/kit/Button";
import DocumentTable from "@/components/kit/DocumentTable";
import Icon from "@/components/kit/Icon";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { useOperationSuppliers, type operationPosListResponse, type SupplierRow } from "@/lib/queries";
import type { WorkRow } from "../use-open-work";
import EmbeddedSalesOrders, { linkedSalesOrderIds } from "../components/EmbeddedSalesOrders";
import { SupplierAnswerForm } from "../work/WorkActForms";
import WorkActionPanel from "../work/WorkActionPanel";
import { BatchPanel } from "../so-batch/BatchPanel";
import SupplierAnswerTaskPanel, { SUPPLIER_ANSWER_RULES } from "../purchase-orders/SupplierAnswerTaskPanel";
import type { WorkPanelHost } from "./tasks-host";

export type WorkPanelRenderer = (item: WorkRow, host: WorkPanelHost) => ReactNode;

/** Panels keyed by the Work item's object kind. A batch with a window key
 *  opens Purchasing's BatchPanel; a key that does not parse keeps the act card. */
export const WORK_PANELS: Partial<Record<string, WorkPanelRenderer>> = {
  po_window: (item, host) => parsePoWindowKey(item.source.object.id)
    ? <BatchPanel key={item.id} item={item} windowKey={item.source.object.id} host={host} />
    : <GenericTaskPanel key={item.id} item={item} host={host} />,
};

/** The panel a task opens: the registry by object kind, then the module's
 *  own door by rule, else the act card. */
export function panelFor(item: WorkRow, host: WorkPanelHost): ReactNode {
  const byKind = WORK_PANELS[item.source.object.kind];
  if (byKind) return byKind(item, host);
  /* Purchasing PO rows branch on the rule the feed emitted — never on a shape. */
  if (item.module === "purchasing" && SUPPLIER_ANSWER_RULES.has(item.ruleKey)) {
    return <SupplierAnswerTaskPanel key={item.id} item={item} host={host} />;
  }
  if (item.module === "purchasing" && item.source.object.kind === "purchase_order") {
    return <PoDutyTaskPanel key={item.id} item={item} host={host} />;
  }
  return <GenericTaskPanel key={item.id} item={item} host={host} />;
}

function PanelState({ text, alert = false }: { text: string; alert?: boolean }) {
  return <p role={alert ? "alert" : "status"} className="p-3.5 text-body text-kit-slate-11">{text}</p>;
}

/** `Missed` in the card's status slot, only for the exceptional state. */
const missedWord = (item: WorkRow) => (item.timingBucket === "overdue" ? "Missed" : undefined);

/* ── PO Duty — the exact PO, with the Work page's own `Record supplier answer`
   (Purchasing §2.4). Receiving is never asked to chase. ─────────────────── */

function PoDutyTaskPanel({ item, host }: { item: WorkRow; host: WorkPanelHost }) {
  const navigate = useNavigate();
  const poId = item.source.object.id;
  const poQ = useQuery({
    queryKey: ["operation", "pos", "one", poId],
    queryFn: () => apiFetch<operationPosListResponse>(`/api/operation/pos?status=all&poId=${encodeURIComponent(poId)}`),
    staleTime: 10_000,
  });
  const suppliersQ = useOperationSuppliers();
  const [recording, setRecording] = useState(false);
  const po = poQ.data?.pos.find((p) => p.id === poId) ?? null;
  if (poQ.isPending) return <PanelState text="Loading…" />;
  if (poQ.isError || !po) return <PanelState text="This purchase order could not be opened" alert />;
  const supplier = (suppliersQ.data?.suppliers ?? []).find((s) => s.id === po.supplier_id) as
    | (SupplierRow & { whatsapp_group_url?: string | null })
    | undefined;
  const supplierName = supplier?.name ?? "the supplier";
  const lines = po.purchase_order_lines ?? [];
  const orderIds = linkedSalesOrderIds((po.sources ?? []).map((s) => ({ kind: s.kind, orderId: s.order_id ?? null })));
  const poDate = po.official_delivery_date ?? po.eta_date;
  return (
    <div className="p-3" data-testid="task-panel-po-duty">
      <CompactModuleCard
        name={supplierName}
        reference={`${item.source.object.label} · ${item.problem}`}
        referenceStatus={missedWord(item)}
        openLabel={`Open ${po.id}`}
        onOpen={() => navigate(`/operation/procurement?po=${encodeURIComponent(po.id)}`)}
        closeLabel="Close panel"
        onClose={host.close}
        modulesLabel="Purchase Order"
        initialModule="po"
        modules={[
          {
            key: "info", label: "Info", communication: null,
            summary: [{ key: "date", label: "PO Delivery Date", value: poDate ? fmtDate(poDate) : "Not recorded" }],
          },
          {
            key: "po", label: "Purchase Order", communication: null,
            content: (
              <div className="flex flex-col gap-3 p-3" data-testid="task-po-duty">
                <p className="text-body font-semibold text-kit-slate-12">{item.line}</p>
                <DocumentTable
                  label={`Goods · ${item.source.object.label}`}
                  columns={[
                    { key: "item", label: "Item" },
                    { key: "order", label: "Order Qty", numeric: true },
                    { key: "received", label: "Received Qty", numeric: true },
                    { key: "pending", label: "Pending Delivery Qty", numeric: true },
                  ]}
                  rows={lines.map((l) => ({
                    key: l.id,
                    cells: {
                      item: <div className="whitespace-normal">{[l.model_name, l.size].filter(Boolean).join(" ") || l.sku}<div className="text-meta text-kit-slate-11">{l.sku}</div></div>,
                      order: Number(l.qty ?? 0),
                      received: Number(l.received_qty ?? 0),
                      pending: poLineReportable(l),
                    },
                  }))}
                />
                {recording ? (
                  <SupplierAnswerForm
                    poId={po.id}
                    supplierName={supplierName}
                    onCancel={() => setRecording(false)}
                    onDone={() => host.result(`Supplier answer recorded · ${item.source.object.label}`)}
                  />
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {supplier?.whatsapp_group_url ? (
                      <a href={supplier.whatsapp_group_url} target="_blank" rel="noreferrer"
                        className="inline-flex h-8 items-center gap-1.5 rounded-control border border-kit-slate-5 bg-white px-3 text-body text-kit-slate-12 hover:bg-kit-slate-3">
                        <Icon name="message" size={14} />Open WhatsApp group
                      </a>
                    ) : null}
                    <Button variant="primary" size="sm" onClick={() => setRecording(true)} data-testid="task-record-supplier-answer">Record supplier answer</Button>
                  </div>
                )}
              </div>
            ),
          },
          ...(orderIds.length ? [{ key: "sales", label: "Sales Order", communication: null, content: <EmbeddedSalesOrders orderIds={orderIds} /> }] : []),
        ]}
      />
    </div>
  );
}

/* ── Every other act — the Work act card, `Open {object}` for the full page */

function GenericTaskPanel({ item }: { item: WorkRow; host: WorkPanelHost }) {
  const navigate = useNavigate();
  return (
    <div className="p-3" data-testid="task-panel-generic">
      <WorkActionPanel item={item.source} onOpen={() => navigate(item.destination)} />
    </div>
  );
}
