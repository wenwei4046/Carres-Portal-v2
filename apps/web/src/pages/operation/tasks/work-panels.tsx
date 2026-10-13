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
 *   delivery         `assign_logistics` and `confirm_delivery_date` about one
 *                    order open Delivery's own form (`Assign logistics` ·
 *                    `Update date and time`), as the Workspace page does.
 *   everything else  the act itself: what is wrong, what finishes it and
 *                    `Open {object}`, the module destination exactly as the
 *                    Work page opens it.
 *
 * Every panel is drawn in the ONE task view (`TaskFrame`, owner's round 3
 * brief of 13 Oct 2026): the panel supplies its steps and what only its module
 * knows; the frame owns the head, the fact rows and the tabs. A form wider
 * than the panel opens on the host's full surface (`TaskWideSurface`).
 */
import { type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { documentDisplayNumber, parsePoWindowKey, poLineReportable } from "@carres/shared";
import Button from "@/components/kit/Button";
import Icon from "@/components/kit/Icon";
import StepList, { Step } from "@/components/kit/StepList";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { useOperationSuppliers, type operationPosListResponse, type SupplierRow } from "@/lib/queries";
import type { WorkRow } from "../use-open-work";
import DeliveryProofReviewWork from "../components/DeliveryProofReviewWork";
import EmbeddedSalesOrders from "../components/EmbeddedSalesOrders";
import { AssignLogisticsForm, DeliveryDateForm, SupplierAnswerForm, useRefreshWork } from "../work/WorkActForms";
import { BatchPanel } from "../so-batch/BatchPanel";
import { poTaskHistory, poTaskOrders } from "../purchase-orders/po-task-parts";
import PoTaskGoods from "../purchase-orders/PoTaskGoods";
import SupplierAnswerTaskPanel, { SUPPLIER_ANSWER_RULES } from "../purchase-orders/SupplierAnswerTaskPanel";
import TaskFrame, { TaskWideSurface } from "./TaskFrame";
import { purchasingFileStages } from "./task-files";
import { TASK_VIEW_WORDS as V } from "./task-view";
import type { WorkPanelHost } from "./tasks-host";
import { TASK_MODULE_SYMBOL, TASK_MODULE_WORD } from "./tasks-model";

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

/* ── PO Duty — the exact PO, with the Work page's own `Record supplier answer`
   (Purchasing §2.4). Receiving is never asked to chase. ─────────────────── */

function PoDutyTaskPanel({ item, host }: { item: WorkRow; host: WorkPanelHost }) {
  const poId = item.source.object.id;
  const poQ = useQuery({
    queryKey: ["operation", "pos", "one", poId],
    queryFn: () => apiFetch<operationPosListResponse>(`/api/operation/pos?status=all&poId=${encodeURIComponent(poId)}`),
    staleTime: 10_000,
  });
  const suppliersQ = useOperationSuppliers();
  const po = poQ.data?.pos.find((p) => p.id === poId) ?? null;
  if (poQ.isPending) return <PanelState text="Loading…" />;
  if (poQ.isError || !po) return <PanelState text="This purchase order could not be opened" alert />;
  const supplier = (suppliersQ.data?.suppliers ?? []).find((s) => s.id === po.supplier_id) as
    | (SupplierRow & { whatsapp_group_url?: string | null })
    | undefined;
  const supplierName = supplier?.name ?? "the supplier";
  const lines = po.purchase_order_lines ?? [];
  const orders = poTaskOrders(po);
  const poDate = po.official_delivery_date ?? po.eta_date;
  const poLabel = documentDisplayNumber(po.version == null ? po.id : `${po.id}-V${po.version}`);
  /* The Work page's own answer form is a line table wider than the panel: it
     opens on the host's full surface, never squeezed into the panel. */
  const openAnswer = () => host.openReview((close) => (
    <TaskWideSurface title="Record supplier answer" about={`${supplierName} · ${item.source.object.label}`}>
      <SupplierAnswerForm
        poId={po.id}
        supplierName={supplierName}
        onCancel={close}
        onDone={() => { close(); host.result(`Supplier answer recorded · ${item.source.object.label}`); }}
      />
    </TaskWideSurface>
  ));
  return (
    <div className="p-3" data-testid="task-panel-po-duty">
      <TaskFrame
        head={{ title: item.line, page: TASK_MODULE_WORD[item.module], record: item.source.object.label, moduleIcon: TASK_MODULE_SYMBOL[item.module], destination: item.destination }}
        facts={[{ key: "po-date", icon: "local_shipping", label: "PO Delivery Date", value: poDate ? fmtDate(poDate) : "Not recorded" }]}
        orders={orders}
        salesOrders={orders.length ? <EmbeddedSalesOrders orderIds={orders.map((order) => order.orderId)} /> : undefined}
        history={poTaskHistory(po)}
        files={purchasingFileStages(orders, [{ id: po.id, label: poLabel }])}
        steps={
          <div className="flex flex-col gap-3" data-testid="task-po-duty">
            <p className="text-body text-c-ink">{item.problem}</p>
            <PoTaskGoods
              label={`Goods · ${item.source.object.label}`}
              lines={lines.map((l) => ({
                key: l.id,
                name: [l.model_name, l.size].filter(Boolean).join(" ") || l.sku,
                detail: l.sku,
                orderQty: Number(l.qty ?? 0),
                receivedQty: Number(l.received_qty ?? 0),
                pendingQty: poLineReportable(l),
              }))}
            />
            <div className="flex flex-wrap items-center gap-2">
              {supplier?.whatsapp_group_url ? (
                <a href={supplier.whatsapp_group_url} target="_blank" rel="noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-control border border-kit-slate-5 bg-white px-3 text-body text-kit-slate-12 hover:bg-kit-slate-3">
                  <Icon name="message" size={14} />Open WhatsApp group
                </a>
              ) : null}
              <Button variant="primary" size="sm" onClick={openAnswer} data-testid="task-record-supplier-answer">Record supplier answer</Button>
            </div>
          </div>
        }
      />
    </div>
  );
}

/* ── Every other act — what is wrong, what finishes it, and the record's own
   page (`Open {object}`), where the owning module's form lives. ─────────── */

const ORDER_KINDS = new Set(["sales_order", "delivery_scope"]);

/**
 * Delivery's two acts that are done in place (Workspace §5.10 "Acts done in place"):
 * the task's one button opens Delivery's OWN form, the same component the
 * Delivery page mounts, so a save writes the same one record. The form says
 * its own result; the task leaves the list when the Work feed closes it.
 */
const DELIVERY_ACTS: Record<string, { button: string; form: (orderId: string, onDone: () => void) => ReactNode }> = {
  assign_logistics: { button: "Assign logistics", form: (orderId, onDone) => <AssignLogisticsForm orderId={orderId} onDone={onDone} /> },
  confirm_delivery_date: { button: "Update date and time", form: (orderId, onDone) => <DeliveryDateForm orderId={orderId} onDone={onDone} /> },
};

function GenericTaskPanel({ item, host }: { item: WorkRow; host: WorkPanelHost }) {
  const navigate = useNavigate();
  const refresh = useRefreshWork();
  const work = item.source;
  const embedded = work.interaction.mode === "embedded";
  /* An admitted embedded action (Delivery proof review) is done here. */
  const owningForm = work.interaction.mode === "embedded" && work.interaction.componentKey === "delivery.proof_review"
    ? <DeliveryProofReviewWork doNumber={work.object.id} />
    : null;
  const finish = work.interaction.mode === "read_only" ? work.interaction.reason : work.completionStatement;
  /* A Sales Order task and a delivery task with no DO yet are both about one
     order, by its id (`operation/work.ts`): they have a Route and its document. */
  const orders = ORDER_KINDS.has(work.object.kind) ? [{ orderId: work.object.id, label: work.object.label }] : [];
  const deliveryAct = orders.length ? DELIVERY_ACTS[item.ruleKey] ?? null : null;
  /* Delivery's forms are field grids wider than the panel: they open on the
     host's full surface and close back to the task, saved or cancelled. */
  const openDeliveryAct = () => {
    if (!deliveryAct) return;
    host.openReview((close) => (
      <TaskWideSurface title={deliveryAct.button} about={work.object.label}>
        {deliveryAct.form(work.object.id, () => { close(); refresh(); })}
      </TaskWideSurface>
    ));
  };
  return (
    <div className="p-3" data-testid="task-panel-generic">
      <TaskFrame
        head={{ title: item.line, page: TASK_MODULE_WORD[item.module], record: work.object.label, moduleIcon: TASK_MODULE_SYMBOL[item.module], destination: item.destination }}
        orders={orders}
        files={orders.length ? purchasingFileStages(orders, []).slice(0, 1) : []}
        steps={
          <div className="flex flex-col gap-3" data-testid="task-generic-steps">
            <p className="text-body text-c-ink" data-testid="task-generic-problem">{work.problem}</p>
            <StepList aria-label={V.tab.steps}>
              <Step n={1} state="current" title={work.requiredResult}
                /* One sentence, said once: the finish line only when it adds to the title. */
                sub={finish !== work.requiredResult ? <span data-testid="task-generic-finish">{V.finishWhen}: {finish}</span> : undefined}>
                {owningForm}
                {embedded && owningForm ? null : deliveryAct ? (
                  <div><Button variant="primary" size="sm" onClick={openDeliveryAct} data-testid="task-generic-act">{deliveryAct.button}</Button></div>
                ) : (
                  <div><Button variant="primary" size="sm" onClick={() => navigate(item.destination)} data-testid="task-generic-open">{V.open(work.object.label)}</Button></div>
                )}
              </Step>
            </StepList>
            {work.nextConsequence ? <p className="text-meta text-c-secondary" data-testid="task-generic-next">{V.then}: {work.nextConsequence}</p> : null}
          </div>
        }
      />
    </div>
  );
}
