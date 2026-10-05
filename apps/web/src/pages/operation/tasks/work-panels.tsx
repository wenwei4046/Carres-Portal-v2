/**
 * WHAT A TASK OPENS — each module's own Working Panel, in the Tasks area.
 *
 * LOCAL PROPOSAL (owner direction 2026-10-05, storyboard screens 9–25c). The
 * host never draws a module's work itself: a row opens that module's panel
 * (Purchasing → the batch panel, Warehouse → Receiving, Delivery → the Sales
 * Order's Delivery tab plus the act). Every panel reuses the shared parts —
 * `CompactModuleCard`, `SalesOrderCompactView`, `EmbeddedSalesOrders`,
 * `WorkActionPanel`, `DeliveryDatesEdit`, `ReceivingWorkspace`,
 * `PoWindowPanel` / `PoIssueEvidence`, `SoBatchIssueWorkspace` — and their
 * real doors. In the local walk those doors are answered by fixtures
 * (SIMULATED); nothing here writes anywhere else.
 *
 * `WORK_PANELS` is the seam Purchasing A plugs its batch panel into:
 * `WORK_PANELS.po_window = (item, host) => <BatchPanel … />`.
 */
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Route, Routes, useNavigate } from "react-router-dom";
import {
  defaultAllocations,
  groupSelectionsIntoDocuments,
  isSelectableForBuying,
  parsePoWindowKey,
  poLineReportable,
  poWindowTimeWord,
  soBatchPurchaseResponseSchema,
  type PoWindowWork,
  type SoBatchPurchaseResponse,
} from "@carres/shared";
import CompactModuleCard, { type CardFact } from "@/components/kit/CompactModuleCard";
import Button from "@/components/kit/Button";
import DocumentTable from "@/components/kit/DocumentTable";
import Icon from "@/components/kit/Icon";
import { apiFetch, ApiError } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { useOperationSuppliers, type operationOrdersListResponse, type operationPosListResponse, type SupplierRow } from "@/lib/queries";
import type { SalesOrderTemplateData } from "@/lib/pdf/types";
import type { WorkRow } from "../use-open-work";
import { buildRegisterRow, salesLocationOf } from "../sales-order-columns";
import SalesOrderCompactView from "../components/SalesOrderCompactView";
import EmbeddedSalesOrders, { SalesOrderItemsTable, linkedSalesOrderIds } from "../components/EmbeddedSalesOrders";
import ReceivingRecord from "../components/ReceivingRecord";
import DeliveryOrderPage from "../DeliveryOrderPage";
import { SupplierAnswerForm } from "../work/WorkActForms";
import WorkActionPanel from "../work/WorkActionPanel";
import PoWindowPanel, { usePoWindow } from "../work/PoWindowPanel";
import SoBatchIssueWorkspace from "../so-batch/SoBatchIssueWorkspace";
import { useDeliveryScopeCard } from "../delivery-scope-card";
import { partiesWord } from "./tasks-model";
import type { WorkPanelHost } from "./tasks-host";

export type WorkPanelRenderer = (item: WorkRow, host: WorkPanelHost) => ReactNode;

/** Panels keyed by the Work item's object kind. Purchasing A replaces
 *  `po_window` with its BatchPanel; the defaults below stand until then. */
export const WORK_PANELS: Partial<Record<string, WorkPanelRenderer>> = {
  po_window: (item, host) => <DefaultBatchPanel key={item.id} item={item} host={host} />,
  /* The Warehouse lane's `warehouse-task-panel.tsx` replaces this default. */
  receiving: (item, host) => <ReceiveTaskPanel key={item.id} item={item} host={host} />,
};

/** The panel a task opens: the registry by object kind, then the module's
 *  own door, else the act card. */
export function panelFor(item: WorkRow, host: WorkPanelHost): ReactNode {
  const byKind = WORK_PANELS[item.source.object.kind];
  if (byKind) return byKind(item, host);
  if (item.module === "delivery") {
    return DO_PAGE_RULES.has(item.ruleKey)
      ? <DeliveryOrderTaskPanel key={item.id} item={item} host={host} />
      : <DeliveryTaskPanel key={item.id} item={item} host={host} />;
  }
  if (item.module === "purchasing" && item.source.object.kind === "purchase_order") {
    return <PoDutyTaskPanel key={item.id} item={item} host={host} />;
  }
  return <GenericTaskPanel key={item.id} item={item} host={host} />;
}

/* ── shared reads ────────────────────────────────────────────────────────── */

const retryUnlessRefused = (count: number, error: unknown) => !(error instanceof ApiError && error.status === 403) && count < 2;

/** The order's register row — the same one-order door the embedded SO reads. */
function useOrderRow(orderId: string | null) {
  return useQuery({
    queryKey: ["operation", "orders", "row", orderId],
    queryFn: () => apiFetch<operationOrdersListResponse>(`/api/operation/orders?orderId=${encodeURIComponent(orderId!)}`),
    enabled: Boolean(orderId),
    staleTime: 10_000,
    retry: retryUnlessRefused,
    select: (data) => {
      const source = data.orders.find((o) => o.id === orderId);
      return source ? { row: buildRegisterRow(source), source } : null;
    },
  });
}

/** The saved document's lines — the SO card's items, as on its full page. */
function OrderItems({ orderId, reference }: { orderId: string; reference: string }) {
  const doc = useQuery({
    queryKey: ["orders", "sales-order-data", orderId],
    queryFn: () => apiFetch<SalesOrderTemplateData>(`/api/orders/${encodeURIComponent(orderId)}/sales-order-data`),
    staleTime: 10_000,
    retry: retryUnlessRefused,
  });
  if (doc.isPending) return <p role="status" className="text-body text-kit-slate-11">Loading…</p>;
  if (doc.isError) return <p role="alert" className="text-body text-kit-slate-11">Could not be loaded</p>;
  return <SalesOrderItemsTable reference={reference} data={doc.data} />;
}

function PanelState({ text, alert = false }: { text: string; alert?: boolean }) {
  return <p role={alert ? "alert" : "status"} className="p-3.5 text-body text-kit-slate-11">{text}</p>;
}

/** `Missed` in the card's status slot, only for the exceptional state. */
const missedWord = (item: WorkRow) => (item.timingBucket === "overdue" ? "Missed" : undefined);

/* ── Delivery — the Sales Order card on its Delivery tab, then the act ───── */

/** ONE door (Delivery, verified 2026-10-05): the standalone Sales Order card,
 *  `Info · Delivery` only, with the act's OWN existing editor open and empty —
 *  `Assign logistics` → the Logistics editor, every scheduling act → the
 *  Customer (scheduled delivery) editor. The only line above it is the act
 *  and its due date. No second act form. */
const DELIVERY_EDITOR: Record<string, "customer" | "logistics"> = {
  assign_logistics: "logistics",
};

function DeliveryTaskPanel({ item, host }: { item: WorkRow; host: WorkPanelHost }) {
  const navigate = useNavigate();
  const orderId = item.source.object.kind === "delivery_scope" ? item.source.object.id : item.orderId ?? null;
  const order = useOrderRow(orderId);
  const known = order.data?.source;
  const scope = useDeliveryScopeCard(orderId, 0, known);
  if (order.isPending || scope.loading) return <PanelState text="Loading…" />;
  if (order.isError || !order.data) return <PanelState text="This Sales Order could not be opened" alert />;
  if (scope.failed || !scope.card) return <PanelState text="The delivery could not be loaded" alert />;
  const { row } = order.data;
  return (
    <div className="flex flex-col gap-2 p-3" data-testid="task-panel-delivery">
      <p className="flex flex-wrap items-baseline gap-x-2 text-body" data-testid="task-delivery-act">
        <span className="font-semibold text-kit-slate-12">{item.line}</span>
        {item.dueIso ? (
          <span className={item.timingBucket === "overdue" ? "font-semibold text-danger" : "text-kit-slate-11"}>due {fmtDate(item.dueIso)}</span>
        ) : null}
      </p>
      <SalesOrderCompactView
        row={row}
        salesLocation={salesLocationOf(row.o)}
        initialModule="delivery"
        initialEditor={DELIVERY_EDITOR[item.ruleKey] ?? "customer"}
        onSaved={(sentence) => host.result(`${sentence} · SO-${row.so}`)}
        items={<OrderItems orderId={row.id} reference={`SO-${row.so}`} />}
        onOpen={() => navigate(`/operation/orders/so/${row.id}`)}
        onClose={host.close}
      />
    </div>
  );
}

/** Delivery result and proof acts open the EXISTING Delivery Order page full
 *  width (the DO panel is still a PROPOSAL) and return to the same task. */
const DO_PAGE_RULES = new Set(["ask_delivery_result", "upload_signed_do", "check_delivery_proof", "upload_delivery_photo"]);

function DeliveryOrderTaskPanel({ item, host }: { item: WorkRow; host: WorkPanelHost }) {
  const doNumber = item.source.object.kind === "delivery_order" ? item.source.object.id : item.source.object.label;
  const open = () => host.openReview((close) => (
    <div className="flex h-full min-h-0 flex-col" data-testid="task-do-page">
      <div className="flex h-10 shrink-0 items-center border-b border-kit-slate-4 px-3">
        <button type="button" onClick={close} className="text-meta font-semibold text-kit-blue-11 hover:underline" data-testid="task-do-back">‹ Tasks</button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <Routes location={`/operation/delivery-orders/${encodeURIComponent(doNumber)}`}>
          <Route path="/operation/delivery-orders/:doId" element={<DeliveryOrderPage />} />
        </Routes>
      </div>
    </div>
  ));
  return (
    <div className="flex flex-col gap-3 p-3" data-testid="task-panel-do">
      <WorkActionPanel item={item.source} onOpen={open} />
    </div>
  );
}

/* ── Warehouse — LOCAL DEFAULT until the Warehouse chat's panel lands ───────
   The Warehouse lane delivers `warehouse-task-panel.tsx` (read-only lines,
   one `Receive`). Until then this default only proves the host plumbing: the
   act card, and `Receive` opening the submitted report's OWN session in the
   existing full-width Receiving record (never a new blank receipt, never
   inside the side panel). */

function ReceiveTaskPanel({ item, host }: { item: WorkRow; host: WorkPanelHost }) {
  const navigate = useNavigate();
  const sessionId = item.source.object.kind === "receiving" ? item.source.object.id : null;
  return (
    <div className="flex flex-col gap-3 p-3" data-testid="task-panel-receive">
      <WorkActionPanel item={item.source} onOpen={() => navigate(item.destination)} />
      {sessionId ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            icon="warehouse"
            data-testid="task-receive"
            onClick={() => host.openReview((close) => (
              <div className="flex h-full min-h-0 flex-col" data-testid="task-receiving-workspace">
                <ReceivingRecord sessionId={sessionId} onBack={close} />
              </div>
            ))}
          >
            Receive
          </Button>
          <span className="text-meta text-kit-slate-11">Opens this arrival report's own receiving record, full width.</span>
        </div>
      ) : null}
    </div>
  );
}

/* ── PO Duty — a missed supplier date, or a partial receipt's balance ─────
   `Ask {supplier} when the goods will arrive` / `Ask {supplier} for the
   balance delivery date` open the exact PO with the existing `Record
   supplier answer` (Purchasing §2.4). Receiving is never asked to chase. */

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

/* ── Purchasing — the local default batch panel (A's BatchPanel replaces it) */

function windowParties(window: PoWindowWork | null): string {
  if (!window) return "Purchasing";
  const unsent = window.pos.filter((po) => !po.sent).map((po) => po.supplierName);
  if (unsent.length) return partiesWord(unsent);
  const demand = window.demand.suppliers.map((s) => s.supplier);
  return demand.length ? partiesWord(demand) : partiesWord(window.pos.map((po) => po.supplierName));
}

function DefaultBatchPanel({ item, host }: { item: WorkRow; host: WorkPanelHost }) {
  const { window, loading, failed } = usePoWindow(item.source);
  const key = item.source.object.id;
  const parts = parsePoWindowKey(key);
  const time = parts ? poWindowTimeWord(parts.time) : item.source.object.label;
  /* The SAME SO Batch read the window is computed from (cache shared with
     `usePoWindow`), for the batch's Sales Orders and its eligible lines. */
  const demandQ = useQuery<SoBatchPurchaseResponse>({
    queryKey: ["so-batch-purchase", null],
    queryFn: async () =>
      soBatchPurchaseResponseSchema.parse(await apiFetch<unknown>("/api/operation/purchase/demands")) as SoBatchPurchaseResponse,
    staleTime: 15_000,
  });
  const unsent = window?.pos.filter((po) => !po.sent).length ?? 0;
  const orderIds = useMemo(() => {
    const rows = demandQ.data?.rows ?? [];
    return [...new Set([
      ...rows.filter((r) => r.poWindow === key).map((r) => r.orderId),
      ...(window?.pos ?? []).flatMap((po) => po.orderIds),
    ])];
  }, [demandQ.data, key, window]);
  const eligible = useMemo(
    () => (demandQ.data?.rows ?? []).filter((r) => r.poWindow === key && isSelectableForBuying(r)),
    [demandQ.data, key],
  );
  const openIssue = () => {
    const data = demandQ.data;
    if (!data || eligible.length === 0) return;
    const selections = eligible.map((r) => ({ demandId: r.id, allocations: defaultAllocations(r, data.defaultDestinationId ?? "") }));
    const documents = groupSelectionsIntoDocuments(selections, new Map(data.rows.map((r) => [r.id, r])), data.destinations);
    host.openReview((close) => (
      <SoBatchIssueWorkspace
        documents={documents}
        destinations={data.destinations}
        roundWindow={key}
        onBack={close}
        onDone={close}
        onIssued={(pos) => {
          close();
          host.result(`${pos.length === 1 ? "PO issued" : `${pos.length} POs issued`} · ${partiesWord(pos.map((p) => p.supplierName ?? ""))}`, { stay: true });
        }}
      />
    ));
  };
  if (loading) return <PanelState text="Loading…" />;
  if (failed) return <PanelState text="Some information could not be refreshed." alert />;
  const info: CardFact[] = window
    ? [
        { key: "buy", label: "To buy", value: window.demand.items ? `${window.demand.items} ${window.demand.items === 1 ? "item" : "items"}` : "Nothing left", status: window.demand.orders ? `${window.demand.orders} ${window.demand.orders === 1 ? "Sales Order" : "Sales Orders"}` : undefined },
        { key: "send", label: "POs to send", value: window.pos.length === 0 ? "No PO yet" : unsent > 0 ? String(unsent) : "Sent" },
      ]
    : [];
  return (
    <div className="p-3" data-testid="task-panel-batch">
      <CompactModuleCard
        name={windowParties(window)}
        reference={[time, parts ? fmtDate(parts.date, { year: "always" }) : null].filter(Boolean).join(" · ")}
        referenceStatus={missedWord(item)}
        closeLabel="Close panel"
        onClose={host.close}
        modulesLabel="SO Batch Purchase"
        initialModule="batch"
        modules={[
          { key: "info", label: "Info", summary: info, communication: null },
          {
            key: "batch", label: "SO Batch Purchase", communication: null,
            content: (
              <div className="flex flex-col gap-3 p-3" data-testid="task-batch-content">
                {eligible.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2" data-testid="task-batch-issue">
                    <span className="text-body text-kit-amber-11">Nothing issued yet · buy first</span>
                    <Button variant="primary" size="sm" icon="order" onClick={openIssue} data-testid="task-batch-issue-po">Issue PO</Button>
                    <span className="text-meta text-kit-slate-11">opens the approved 50/50 review (PROPOSAL)</span>
                  </div>
                ) : null}
                <PoWindowPanel
                  item={item.source}
                  onSent={(po) => host.result(`PO sent to supplier · ${po.supplierName} · ${po.documentNo}`, { stay: unsent > 1 || eligible.length > 0 })}
                />
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
