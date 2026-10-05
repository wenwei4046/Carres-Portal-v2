/**
 * WHAT A TASK OPENS — each module's own Working Panel, in the Tasks area.
 *
 * LOCAL PROPOSAL (owner direction 2026-10-05, storyboard screens 9–25c). The
 * host never draws a module's work itself: a row opens that module's panel
 * (Purchasing → the batch panel, Warehouse → its read-only Warehouse tab whose
 * `Receive` opens the full-width Receiving engine, Delivery → the Sales
 * Order's Delivery tab plus the act). Every panel reuses the shared parts —
 * `CompactModuleCard`, `SalesOrderCompactView`, `EmbeddedSalesOrders`,
 * `WorkActionPanel`, `DeliveryDatesEdit`, `PoReceivingView` / `ReceivingRecord`,
 * `PoWindowPanel` / `PoIssueEvidence`, `SoBatchIssueWorkspace` — and their
 * real doors. In the local walk those doors are answered by fixtures
 * (SIMULATED); nothing here writes anywhere else.
 *
 * `WORK_PANELS` is the seam Purchasing A plugs its batch panel into:
 * `WORK_PANELS.po_window = (item, host) => <BatchPanel … />`.
 */
import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  defaultAllocations,
  groupSelectionsIntoDocuments,
  isSelectableForBuying,
  parsePoWindowKey,
  poWindowTimeWord,
  soBatchPurchaseResponseSchema,
  type PoWindowWork,
  type SoBatchPurchaseResponse,
} from "@carres/shared";
import CompactModuleCard, { type CardFact } from "@/components/kit/CompactModuleCard";
import Button from "@/components/kit/Button";
import { apiFetch, ApiError } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import type { operationOrdersListResponse } from "@/lib/queries";
import type { SalesOrderTemplateData } from "@/lib/pdf/types";
import type { WorkRow } from "../use-open-work";
import { buildRegisterRow, salesLocationOf } from "../sales-order-columns";
import SalesOrderCompactView from "../components/SalesOrderCompactView";
import EmbeddedSalesOrders, { SalesOrderItemsTable } from "../components/EmbeddedSalesOrders";
import { DeliveryDatesEdit } from "../components/DeliveryBrief";
import WorkActionPanel from "../work/WorkActionPanel";
import PoWindowPanel, { usePoWindow } from "../work/PoWindowPanel";
import SoBatchIssueWorkspace from "../so-batch/SoBatchIssueWorkspace";
import { useDeliveryScopeCard } from "../delivery-scope-card";
import { partiesWord } from "./tasks-model";
import type { WorkPanelHost } from "./tasks-host";
import WarehouseReceivePanel from "./warehouse-task-panel";

export type WorkPanelRenderer = (item: WorkRow, host: WorkPanelHost) => ReactNode;

/** Panels keyed by the Work item's object kind. Purchasing A replaces
 *  `po_window` with its BatchPanel; the defaults below stand until then. */
export const WORK_PANELS: Partial<Record<string, WorkPanelRenderer>> = {
  po_window: (item, host) => <DefaultBatchPanel key={item.id} item={item} host={host} />,
  delivery_scope: (item, host) => <DeliveryTaskPanel key={item.id} item={item} host={host} />,
  delivery_order: (item, host) => <DeliveryTaskPanel key={item.id} item={item} host={host} />,
};

/** The panel a task opens: the registry by object kind, Warehouse receiving
 *  for a PO the Warehouse must receive, else the act card. */
export function panelFor(item: WorkRow, host: WorkPanelHost): ReactNode {
  const byKind = WORK_PANELS[item.source.object.kind];
  if (byKind) return byKind(item, host);
  if (item.module === "receiving" && item.source.object.kind === "purchase_order") {
    return <WarehouseReceivePanel key={item.id} item={item} host={host} />;
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

function DeliveryTaskPanel({ item, host }: { item: WorkRow; host: WorkPanelHost }) {
  const navigate = useNavigate();
  const orderId = item.source.object.kind === "delivery_scope" ? item.source.object.id : item.orderId ?? null;
  const order = useOrderRow(orderId);
  const known = order.data?.source;
  const scope = useDeliveryScopeCard(orderId, 0, known);
  if (order.isPending) return <PanelState text="Loading…" />;
  if (order.isError || !order.data) return <PanelState text="This Sales Order could not be opened" alert />;
  const { row } = order.data;
  const card = scope.card && !scope.failed ? scope.card : null;
  return (
    <div className="flex flex-col gap-3 p-3" data-testid="task-panel-delivery">
      <SalesOrderCompactView
        row={row}
        salesLocation={salesLocationOf(row.o)}
        initialModule="delivery"
        items={<OrderItems orderId={row.id} reference={`SO-${row.so}`} />}
        onOpen={() => navigate(`/operation/orders/so/${row.id}`)}
        onClose={host.close}
      />
      <WorkActionPanel
        item={item.source}
        onOpen={() => navigate(item.destination)}
        embedded={card ? (
          <>
            <DeliveryDatesEdit
              card={card}
              layout="stack"
              onSaved={(sentence) => host.result(`${sentence} · SO-${row.so}`)}
              onDone={() => undefined}
            />
            <p className="text-meta text-kit-slate-11">Saving finishes this task.</p>
          </>
        ) : (
          <PanelState text={scope.loading ? "Loading…" : "The delivery could not be loaded"} />
        )}
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
