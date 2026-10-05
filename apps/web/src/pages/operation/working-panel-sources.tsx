/**
 * PAGE WORK SOURCES — what each module page hands the shared Working Panel.
 *
 * LOCALHOST PROPOSAL (owner flow 2026-10-05) — never deployed until the owner
 * confirms the walk.
 *
 * NO NEW TASK ENGINE. Every item is a Work engine item from the ONE open work
 * set (`useOpenWorkSet` → `/api/operation/work`): its owner, permissions,
 * timing and completion are the server's. A page only says WHICH of those
 * items are its own and how to draw one. Nothing is derived from the table's
 * current filter or search, and nothing here ticks, orders, reserves or sends.
 */
import { useCallback, useMemo, useRef, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  PO_WINDOW_WORK_COPY,
  parsePoWindowKey,
  poWindowWorkFromSoBatch,
  type PoWindowWork,
  type SoBatchPurchaseResponse,
} from "@carres/shared";
import CompactModuleCard, { type CardFact, type CardModule } from "@/components/kit/CompactModuleCard";
import DocumentTable from "@/components/kit/DocumentTable";
import { fmtDate } from "@/lib/fmt-date";
import type { PageWorkBucket, PageWorkItem, PageWorkSource } from "@/components/working-panel/page-work";
import { useOpenWorkSet, type WorkRow } from "./use-open-work";

/** The Work engine's own placement, in the host's buckets. */
export function bucketOfWorkRow(row: WorkRow): PageWorkBucket {
  if (row.timingBucket === "overdue") return "missed";
  if (row.timingBucket === "today") return "today";
  if (row.timingBucket === "later") return "next";
  return "no_date";
}

/** `2026-10-05T11:30` → its Malaysia instant. */
function windowDueAt(key: string): number | null {
  const parts = parsePoWindowKey(key);
  if (!parts) return null;
  const at = Date.parse(`${parts.date}T${parts.time}:00+08:00`);
  return Number.isFinite(at) ? at : null;
}

/**
 * A PO window keeps its own time (Purchasing §5.6.1): once that time has
 * passed unfinished it is Missed, even on the same day.
 */
export function bucketOfPoWindow(row: WorkRow, now: number): PageWorkBucket {
  const due = windowDueAt(row.source.object.id);
  if (due !== null && due <= now) return "missed";
  return bucketOfWorkRow(row) === "missed" ? "missed" : bucketOfWorkRow(row);
}

/**
 * The open work set in STABLE pieces: `useOpenWorkSet` returns a fresh object
 * every render, and a page source rebuilt every render would re-register
 * itself for ever. Items are memoised by the query; retry goes through a ref.
 */
function useStableWork() {
  const work = useOpenWorkSet();
  const retryRef = useRef(work.retry);
  retryRef.current = work.retry;
  const retry = useCallback(() => retryRef.current(), []);
  const state: PageWorkSource["state"] = work.hasData ? "ready" : work.error ? "failed" : "loading";
  return { items: work.items, state, retry };
}

/** The main tab carries the source's own two sentences — nothing re-worded. */
function workFact(row: WorkRow): CardFact {
  return { key: "work", label: row.problem, value: row.line };
}

/* ── SO Batch Purchase — one PO window per round ─────────────────────────── */

export function useSoBatchPageWork(data: SoBatchPurchaseResponse | undefined): PageWorkSource {
  const work = useStableWork();
  const navigate = useNavigate();
  /* Counts read the page's own SO Batch read through the SAME arithmetic the
     Work feed is built from (`poWindowWorkFromSoBatch`, Law D). */
  const windows = useMemo(() => {
    const byKey = new Map<string, PoWindowWork>();
    if (!data || data.poWindowsUnavailable) return byKey;
    try {
      for (const window of poWindowWorkFromSoBatch(data, [])) byKey.set(window.key, window);
    } catch {
      /* Settings unavailable: the card still shows the Work item's sentences. */
    }
    return byKey;
  }, [data]);
  return useMemo(() => {
    const now = Date.now();
    const items: PageWorkItem[] = work.items
      .filter((row) => row.ruleKey === "purchasing.po_window")
      .map((row) => {
        const key = row.source.object.id;
        const bucket = bucketOfPoWindow(row, now);
        const window = windows.get(key) ?? null;
        return {
          key: row.id,
          bucket,
          sortAt: key,
          label: row.source.object.label,
          action: row.line,
          render: (onClose) => (
            <PoWindowCard row={row} window={window} missed={bucket === "missed"} onClose={onClose}
              onOpen={() => navigate(row.destination)} />
          ),
        };
      });
    return { pageKey: "so-batch", pageName: "SO Batch Purchase", state: work.state, items, retry: work.retry };
  }, [work.items, work.state, work.retry, windows, navigate]);
}

function PoWindowCard({ row, window, missed, onClose, onOpen }: {
  row: WorkRow; window: PoWindowWork | null; missed: boolean; onClose: () => void; onOpen: () => void;
}) {
  const parts = parsePoWindowKey(row.source.object.id);
  const W = PO_WINDOW_WORK_COPY;
  const info: CardFact[] = window
    ? [
        { key: "buy", label: W.demandHeading, value: W.itemsWord(window.demand.items),
          status: `${window.demand.orders} ${window.demand.orders === 1 ? "Sales Order" : "Sales Orders"}` },
        { key: "send", label: W.posHeading, value: window.pos.length === 0 ? "No PO yet" : window.unsent > 0 ? String(window.unsent) : W.sentWord },
      ]
    : [];
  const suppliers = window?.demand.suppliers ?? [];
  const modules: CardModule[] = [
    { key: "info", label: "Info", summary: info, communication: null },
    {
      key: "so-batch", label: "SO Batch Purchase", communication: null,
      summary: [workFact(row)],
      items: suppliers.length ? (
        <DocumentTable label={W.demandHeading} columns={[
          { key: "supplier", label: "Supplier" }, { key: "items", label: "Items", numeric: true },
          { key: "orders", label: "Sales Orders", numeric: true },
        ]} rows={suppliers.map((s, i) => ({ key: `${s.supplierId ?? "none"}-${i}`, cells: { supplier: s.supplier, items: s.items, orders: s.orders } }))} />
      ) : undefined,
    },
    /* The shared embedded `Sales Order` tab lands with #1926; until then the
       tab is shown unavailable — no SO content of our own. */
    { key: "sales-order", label: "Sales Order", disabled: true, communication: null },
  ];
  return (
    <CompactModuleCard
      name={row.source.object.label}
      reference={parts ? fmtDate(parts.date) : row.source.object.id}
      referenceStatus={missed ? "Missed" : undefined}
      openLabel={W.openSoBatch}
      onOpen={onOpen}
      closeLabel="Close panel"
      onClose={onClose}
      modulesLabel="SO Batch Purchase"
      initialModule="so-batch"
      modules={modules}
    />
  );
}

/* ── Sales Orders — the order's own card ─────────────────────────────────── */

export function useSalesOrdersPageWork<Row extends { id: string }>(
  rows: readonly Row[],
  renderOrder: (row: Row, close: () => void) => ReactNode,
): PageWorkSource {
  const work = useStableWork();
  const navigate = useNavigate();
  return useMemo(() => {
    const byId = new Map(rows.map((row) => [row.id, row]));
    /* One card per order: the order's earliest Work item decides its place. */
    const seen = new Set<string>();
    const items: PageWorkItem[] = [];
    for (const row of [...work.items].filter((r) => r.module === "orders" && r.source.object.kind === "sales_order")
      .sort((a, b) => (a.dueIso ?? "9999").localeCompare(b.dueIso ?? "9999"))) {
      const orderId = row.source.object.id;
      if (seen.has(orderId)) continue;
      seen.add(orderId);
      const order = byId.get(orderId);
      items.push({
        key: row.id,
        bucket: bucketOfWorkRow(row),
        sortAt: row.dueIso,
        label: row.source.object.label,
        action: row.line,
        render: (onClose) => order ? renderOrder(order, onClose) : (
          <GenericWorkCard row={row} mainTab="Sales Order" onClose={onClose}
            onOpen={() => navigate(`/operation/orders/so/${encodeURIComponent(orderId)}`)} />
        ),
      });
    }
    return { pageKey: "sales-orders", pageName: "Sales Orders", state: work.state, items, retry: work.retry };
  }, [work.items, work.state, work.retry, rows, renderOrder, navigate]);
}

/* ── Purchase Orders — one PO per card ───────────────────────────────────── */

export function usePurchaseOrdersPageWork(
  rows: ReadonlyArray<{ id: string; supplierName: string }>,
  openPo: (poId: string) => void,
): PageWorkSource {
  const work = useStableWork();
  return useMemo(() => {
    const byId = new Map(rows.map((row) => [row.id, row]));
    const items: PageWorkItem[] = work.items
      .filter((row) => row.module === "purchasing" && row.source.object.kind === "purchase_order")
      .map((row) => {
        const po = byId.get(row.source.object.id);
        return {
          key: row.id,
          bucket: bucketOfWorkRow(row),
          sortAt: row.dueIso,
          label: row.source.object.label,
          action: row.line,
          render: (onClose) => (
            <GenericWorkCard row={row} mainTab="Purchase Order" reference={po?.supplierName ?? row.recipient ?? ""}
              onClose={onClose} onOpen={() => openPo(row.source.object.id)} />
          ),
        };
      });
    return { pageKey: "purchase-orders", pageName: "Purchase Orders", state: work.state, items, retry: work.retry };
  }, [work.items, work.state, work.retry, rows, openPo]);
}

/**
 * A Work item drawn in the shared card when the page has no richer card for
 * its record: the record in the header, the source's own sentences in the
 * page's tab, `Sales Order` unavailable until the shared embedded tab lands.
 */
function GenericWorkCard({ row, mainTab, reference, onClose, onOpen }: {
  row: WorkRow; mainTab: string; reference?: string; onClose: () => void; onOpen: () => void;
}) {
  return (
    <CompactModuleCard
      name={row.source.object.label}
      reference={reference ?? row.recipient ?? ""}
      referenceStatus={bucketOfWorkRow(row) === "missed" ? "Missed" : undefined}
      openLabel="Open full page"
      onOpen={onOpen}
      closeLabel="Close panel"
      onClose={onClose}
      modulesLabel={mainTab}
      initialModule="main"
      modules={[
        { key: "info", label: "Info", communication: null,
          summary: row.dueIso ? [{ key: "due", label: "Working day", value: fmtDate(row.dueIso) }] : [] },
        { key: "main", label: mainTab, communication: null, summary: [workFact(row)] },
        ...(mainTab === "Sales Order" ? [] : [{ key: "sales-order", label: "Sales Order", disabled: true, communication: null }]),
      ]}
    />
  );
}
