/**
 * THE SUPPLIER-ANSWER TASK — PO Duty asks the supplier about goods still owed.
 *
 *   `purchasing.supplier_date_passed`   `Ask {supplier} when the goods will arrive`
 *
 * A PURCHASING act on the exact PO (Purchasing §2.4, #1907) — never Receiving
 * work. The feed emits no balance / short-receipt rule (Purchasing correction
 * 2026-10-06), so this panel answers exactly the rule above. The panel is the PO host: the supplier over the PO and its
 * PO Delivery Date, tabs `Info · Purchase Order · Sales Order`, the goods lines
 * read-only (`Order Qty · Received Qty · Pending Delivery Qty`) and ONE
 * `Record supplier answer` button that opens the EXISTING form (its own door),
 * so the goods lines are shown once, never as a second table beside it.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { documentDisplayNumber } from "@carres/shared";
import Button from "@/components/kit/Button";
import CompactModuleCard, { type CardFact } from "@/components/kit/CompactModuleCard";
import DocumentTable from "@/components/kit/DocumentTable";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { useOperationSuppliers, type operationPosListResponse, type SupplierRow } from "@/lib/queries";
import EmbeddedSalesOrders, { linkedSalesOrderIds } from "../components/EmbeddedSalesOrders";
import SupplierReplySection, { stillToDeliver } from "./SupplierReplySection";
import type { WorkPanelHost } from "../tasks/tasks-host";

/** The Work rules this panel answers (the feed's real PO rules, `apps/api/src/lib/purchasing-work-completion.ts`). */
export const SUPPLIER_ANSWER_RULES = new Set(["purchasing.supplier_date_passed"]);

export interface SupplierAnswerItem {
  id: string;
  ruleKey: string;
  timingBucket?: "overdue" | "today" | "later" | "no_date";
  source: { object: { id: string } };
}

function State({ text, alert = false }: { text: string; alert?: boolean }) {
  return <p role={alert ? "alert" : "status"} className="p-3.5 text-body text-kit-slate-11">{text}</p>;
}

export default function SupplierAnswerTaskPanel({ item, host }: { item: SupplierAnswerItem; host: WorkPanelHost }) {
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
  if (poQ.isPending) return <State text="Loading…" />;
  if (poQ.isError || !po) return <State text="This purchase order could not be opened" alert />;

  const supplier = (suppliersQ.data?.suppliers ?? []).find((s) => s.id === po.supplier_id) as SupplierRow | undefined;
  const supplierName = supplier?.name ?? "Supplier";
  const version = po.version ?? 1;
  const destinations = [...(poQ.data?.destinations ?? []), ...(poQ.data?.referencedDestinations ?? [])];
  const deliverTo = destinations.find((d) => d.id === (po.destination_id ?? po.warehouse_id))?.name ?? "Not recorded";
  const poDate = po.official_delivery_date ?? po.eta_date ?? null;
  const currentSend = [...(po.sends ?? [])].reverse().find((s) => s.kind === "confirmed_sent" && s.po_version === version) ?? null;
  const lines = (po.purchase_order_lines ?? []).map((line) => ({
    id: line.id, sku: line.sku,
    item: [line.model_name, line.size].filter(Boolean).join(" · ") || line.sku,
    model: line.model_name || line.sku, size: line.size ?? "",
    qty: Number(line.qty ?? 0), receivedQty: Number(line.received_qty ?? 0), unitIds: [] as string[],
  }));
  const pending = lines.reduce((sum, line) => sum + stillToDeliver(line), 0);
  const canRecord = !!currentSend && pending > 0;
  const orderIds = linkedSalesOrderIds((po.sources ?? []).map((s) => ({ kind: s.kind, orderId: s.order_id ?? null })));
  const info: CardFact[] = [
    { key: "deliver", label: "Supplier Deliver To", value: deliverTo },
    { key: "date", label: "PO Delivery Date", value: poDate ? fmtDate(poDate) : "Not recorded" },
  ];
  const reference = [documentDisplayNumber(`${po.id}-V${version}`), poDate ? `PO Delivery Date ${fmtDate(poDate)}` : null].filter(Boolean).join(" · ");

  return (
    <div className="p-3" data-testid={`supplier-answer-panel-${po.id}`}>
      <CompactModuleCard
        name={supplierName}
        reference={reference}
        referenceStatus={item.timingBucket === "overdue" ? "Missed" : undefined}
        openLabel={`Open ${documentDisplayNumber(po.id)}`}
        onOpen={() => navigate(`/operation/procurement?po=${encodeURIComponent(po.id)}`)}
        closeLabel="Close panel"
        onClose={host.close}
        modulesLabel="Purchase Order"
        initialModule="purchase-order"
        modules={[
          { key: "info", label: "Info", summary: info, communication: null },
          {
            key: "purchase-order", label: "Purchase Order", communication: null,
            content: (
              <div className="flex flex-col gap-3 p-3" data-testid="supplier-answer-po">
                <DocumentTable label="Goods lines" columns={[
                  { key: "item", label: "Item" }, { key: "qty", label: "Order Qty", numeric: true },
                  { key: "received", label: "Received Qty", numeric: true }, { key: "pending", label: "Pending Delivery Qty", numeric: true },
                ]} rows={lines.map((line) => ({ key: line.id, cells: {
                  item: <span className="flex flex-col"><span>{line.model}</span>{line.size ? <span className="text-meta text-kit-slate-11">{line.size}</span> : null}</span>,
                  qty: line.qty, received: line.receivedQty, pending: stillToDeliver(line),
                } }))} />
                {recording ? (
                  <SupplierReplySection
                    startEditing
                    onCancel={() => setRecording(false)}
                    poId={po.id}
                    version={version}
                    officialDeliveryDate={po.official_delivery_date ?? null}
                    supplierName={supplierName}
                    lines={lines}
                    promises={po.promises ?? []}
                    canRecord={canRecord}
                    defaultChannel={currentSend?.channel === "email" ? "email" : "whatsapp"}
                    defaultRecipient={currentSend?.recipient ?? ""}
                    supplierDo={po.do_number || po.do_uploaded_at ? { number: po.do_number ?? null, uploadedAt: po.do_uploaded_at ?? null, file: po.do_file_path ?? null } : null}
                    onSaved={() => { setRecording(false); host.result(`Supplier answer recorded · ${supplierName} · ${documentDisplayNumber(`${po.id}-V${version}`)}`); }}
                  />
                ) : (
                  <div className="flex justify-end">
                    <Button variant="primary" icon="confirm" disabled={!canRecord} data-testid="supplier-answer-record" onClick={() => setRecording(true)}>Record supplier answer</Button>
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
