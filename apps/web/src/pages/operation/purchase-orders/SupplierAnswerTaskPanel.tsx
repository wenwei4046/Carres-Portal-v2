/**
 * THE SUPPLIER-ANSWER TASK — PO Duty asks the supplier about goods still owed.
 *
 *   `purchasing.supplier_date_passed`   `Ask {supplier} when the goods will arrive`
 *
 * A PURCHASING act on the exact PO (Purchasing §2.4, #1907) — never Receiving
 * work. The feed emits no balance / short-receipt rule (Purchasing correction
 * 2026-10-06), so this panel answers exactly the rule above. It is drawn in
 * the ONE task view (`TaskFrame`, owner's round 3 brief of 13 Oct 2026): the
 * facts `Supplier Deliver To` and `PO Delivery Date`, then under `Steps` the
 * goods lines read-only (`Order Qty · Received Qty · Pending Delivery Qty`)
 * and ONE `Record supplier answer` button that opens the EXISTING form (its
 * own door) on the host's full surface, because its line table is wider than
 * the panel. `Route`, `History` and `Files` read the same PO.
 */
import { useQuery } from "@tanstack/react-query";
import { documentDisplayNumber } from "@carres/shared";
import Button from "@/components/kit/Button";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { useOperationSuppliers, type operationPosListResponse, type SupplierRow } from "@/lib/queries";
import EmbeddedSalesOrders from "../components/EmbeddedSalesOrders";
import SupplierReplySection, { stillToDeliver } from "./SupplierReplySection";
import TaskFrame, { TaskWideSurface } from "../tasks/TaskFrame";
import { purchasingFileStages } from "../tasks/task-files";
import type { WorkPanelHost } from "../tasks/tasks-host";
import { poTaskHistory, poTaskOrders } from "./po-task-parts";
import PoTaskGoods from "./PoTaskGoods";

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
  const poId = item.source.object.id;
  const poQ = useQuery({
    queryKey: ["operation", "pos", "one", poId],
    queryFn: () => apiFetch<operationPosListResponse>(`/api/operation/pos?status=all&poId=${encodeURIComponent(poId)}`),
    staleTime: 10_000,
  });
  const suppliersQ = useOperationSuppliers();
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
  const orders = poTaskOrders(po);
  const poLabel = documentDisplayNumber(`${po.id}-V${version}`);
  /* The answer form is a line table wider than the panel: it opens on the
     host's full surface (the door Issue PO's review uses), never squeezed. */
  const openAnswer = () => host.openReview((close) => (
    <TaskWideSurface title="Record supplier answer" about={`${supplierName} · ${poLabel}`}>
      <SupplierReplySection
        startEditing
        onCancel={close}
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
        onSaved={() => { close(); host.result(`Supplier answer recorded · ${supplierName} · ${poLabel}`); }}
      />
    </TaskWideSurface>
  ));

  return (
    <div className="p-3" data-testid={`supplier-answer-panel-${po.id}`}>
      <TaskFrame
        head={{ title: `Ask ${supplierName} when the goods will arrive`, page: "Purchasing", record: documentDisplayNumber(po.id), moduleIcon: "shopping_cart",
          destination: `/operation/procurement?po=${encodeURIComponent(po.id)}` }}
        facts={[
          { key: "deliver-to", icon: "warehouse", label: "Supplier Deliver To", value: deliverTo },
          { key: "po-date", icon: "local_shipping", label: "PO Delivery Date", value: poDate ? fmtDate(poDate) : "Not recorded" },
        ]}
        orders={orders}
        salesOrders={orders.length ? <EmbeddedSalesOrders orderIds={orders.map((order) => order.orderId)} /> : undefined}
        history={poTaskHistory(po)}
        files={purchasingFileStages(orders, [{ id: po.id, label: poLabel }])}
        steps={
          <div className="flex flex-col gap-3" data-testid="supplier-answer-po">
            <PoTaskGoods label="Goods lines" lines={lines.map((line) => ({
              key: line.id, name: line.model, detail: line.size || null,
              orderQty: line.qty, receivedQty: line.receivedQty, pendingQty: stillToDeliver(line),
            }))} />
            <div className="flex justify-end">
              <Button variant="primary" icon="confirm" disabled={!canRecord} data-testid="supplier-answer-record" onClick={openAnswer}>Record supplier answer</Button>
            </div>
          </div>
        }
      />
    </div>
  );
}
