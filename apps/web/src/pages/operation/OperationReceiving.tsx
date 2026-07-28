import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronsLeft } from "lucide-react";
import { poReceivingProgress, type PoReceivingState } from "@carres/shared";
import {
  useOperationPos,
  useOperationSuppliers,
  useOperationWarehouse,
  type SupplierRow,
} from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";
import ListPageShell, { type ActiveChip } from "@/components/ListPageShell";
import { SectionBand, SectionCard } from "@/components/SectionPanel";
import ReceivePOModal from "./components/ReceivePOModal";
import WarehouseReceiptsPanel from "./components/WarehouseReceiptsPanel";
import PurchasingTabs from "./PurchasingTabs";

/**
 * OperationReceiving — the check-in station (goods coming IN from a supplier;
 * goods going OUT to a customer are Delivery, and the two never share a word).
 *
 * GRN scope: goods INTO Carres Klang only. AL/HOUZS goods never hit Klang, so
 * they are tracked by Stock Location, not by a Klang GRN. Current master data
 * has Carres Klang as the only own warehouse, so every open PO shown here is
 * Klang-bound; the own-warehouse filter only activates once an LP-owned
 * warehouse actually exists.
 *
 * 2026-07-27 (R1): the row stops being a binary "Receive → / Done". A PROGRESS
 * column reads the four per-line numbers through the shared
 * `poReceivingProgress` and says, in words, where the delivery is — In transit ·
 * Partially received (8/10) · Fully received · Receiving issue — with the
 * outstanding qty underneath it. 还有 2 张没到 must be readable from this list
 * without opening anything.
 *
 * 2026-07-28 (⑦ P2, the Receiving half): this tab gets the frame and the click
 * behaviour every other list page already has.
 *
 *  - **The page renders through `ListPageShell` with no title and no
 *    breadcrumb** (UI-KIT §8.3, the module-tab law). The `HQ · Operations`
 *    kicker + `Receiving` h1 + strapline that used to sit here duplicated the
 *    active tab and burned ~80px of a 200px chrome budget (§1.3). The tab IS
 *    the title — the same shape To Order and Claims already ship.
 *  - **The three status tabs (`To receive` / `Received` / `All`) become facet
 *    rows**, because UI-KIT §8.4 puts a module's queue names in the rail and
 *    keeping a second filter UI for the same axis is two doors onto one filter.
 *    The sets are unchanged: `Check in` is the old To-receive tab, `Fully
 *    received` is the old Received tab, and NOTHING picked is the old All.
 *  - **§8.2 in full:** a row filters, clicking it again clears, two picks are
 *    two ✕-able chips, clicking a ROW (not just its button) opens the drawer,
 *    and closing the drawer gives the list back — filter, search and the
 *    table's scroll position. **The table is the scroll target here**, not the
 *    rail: on To Order the middle list was folded INTO the rail, so the rail
 *    was that tab's list; on this tab the list is still a table.
 *
 * **Not this card:** `Receive →` on the row is a banned verb (COPY-STANDARD
 * bans `Receive` as a verb; the act is `Check in`) and the R6 panel above says
 * `Check in` for the same act. That rename is card **R8 ①** and P2 deliberately
 * leaves it — a rename is not a click behaviour, and R8 sweeps three screens in
 * one PR. So the rail says `Check in` (the dictionary's word for this queue)
 * while the row button still says `Receive →` for one release.
 */

/** The rail's three queue rows.
 *
 *  `Check in` is the dictionary's queue tile for this tab's one action
 *  (COPY-STANDARD, the PURCHASING table). The other two name a STATE, and a
 *  filter may state a fact — they are R1's own words, read off the SAME shared
 *  module the Progress column reads rather than retyped here, so one state can
 *  never be spelt two ways on one screen (rule 8). */
type QueueKey = "check_in" | "receiving_issue" | "fully_received";

const ISSUE_LABEL = poReceivingProgress([
  { qty: 1, received_qty: 0, damaged_qty: 1 },
]).label;
const FULLY_LABEL = poReceivingProgress([{ qty: 1, received_qty: 1 }]).label;

const QUEUES: {
  key: QueueKey;
  label: string;
  testId: string;
  danger?: boolean;
  match: (s: PoReceivingState) => boolean;
}[] = [
  {
    key: "check_in",
    label: "Check in",
    testId: "facet-queue-check-in",
    match: (s) => s !== "fully_received",
  },
  {
    key: "receiving_issue",
    label: ISSUE_LABEL,
    testId: "facet-queue-receiving-issue",
    danger: true,
    match: (s) => s === "receiving_issue",
  },
  {
    key: "fully_received",
    label: FULLY_LABEL,
    testId: "facet-queue-fully-received",
    match: (s) => s === "fully_received",
  },
];

/** Humanise a PO sup_status into a short stage label for the queue. */
const SUP_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  in_production: "In production",
  ready_confirm_sent: "Awaiting accept",
  ready_for_pickup: "Ready",
  partially_shipped: "Partial",
  delivered: "Arrived",
  reassign_needed: "Reassign",
};

function supStatusLabel(s: string): string {
  return (
    SUP_STATUS_LABEL[s] ??
    s.replace(/_/g, " ").replace(/^\w/, (m) => m.toUpperCase())
  );
}

/** PO sup_status → v17 pill. pending/in_production = amber (waiting);
 *  ready_for_pickup/delivered = green; reassign = red. */
const SUP_STATUS_PILL: Record<string, string> = {
  pending: "pill-warning",
  in_production: "pill-warning",
  ready_confirm_sent: "pill-sent",
  ready_for_pickup: "pill-confirmed",
  partially_shipped: "pill-collected",
  delivered: "pill-confirmed",
  reassign_needed: "pill-overdue",
};
function supStatusPill(s: string): string {
  return SUP_STATUS_PILL[s] ?? "pill-neutral";
}

/** R1 — progress state → v17 pill. Grey while nothing has landed, amber while
 *  half-landed, green when settled, red when something is wrong. Colour lives
 *  here (design is the web's job); the shared module owns the state + words. */
const PROGRESS_PILL: Record<PoReceivingState, string> = {
  in_transit: "pill-neutral",
  partially_received: "pill-warning",
  fully_received: "pill-confirmed",
  receiving_issue: "pill-overdue",
};

/** What the list looked like before a drawer opened (UI-KIT §8.2). */
interface ReceivingListState {
  queueFilter: Set<QueueKey>;
  supplierFilter: string | null;
  search: string;
  tableScrollTop: number;
}

export default function OperationReceiving() {
  // Default = the old `To receive` tab, kept as it was: this is a work queue,
  // so it opens on the work and says so with a ✕-able chip.
  const [queueFilter, setQueueFilter] = useState<Set<QueueKey>>(
    () => new Set<QueueKey>(["check_in"]),
  );
  const [supplierFilter, setSupplierFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [facetOpen, setFacetOpen] = useState(true);
  const [collapsedFacet, setCollapsedFacet] = useState<Set<string>>(
    () => new Set(),
  );
  const [receivePoId, setReceivePoId] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useOperationPos();
  const suppliersQ = useOperationSuppliers();
  const warehouseQ = useOperationWarehouse();

  const toggleFacet = (key: string) =>
    setCollapsedFacet((cur) => {
      const n = new Set(cur);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const supplierById = useMemo(() => {
    const m = new Map<string, SupplierRow>();
    for (const s of suppliersQ.data?.suppliers ?? []) m.set(s.id, s);
    return m;
  }, [suppliersQ.data]);

  const warehouseById = useMemo(() => {
    const m = new Map<string, { id: string; name: string; address: string | null }>();
    for (const w of warehouseQ.data?.warehouses ?? []) m.set(w.id, w);
    return m;
  }, [warehouseQ.data]);

  // P4 (multi-location) — GRN only covers goods INTO an OWN warehouse
  // (owning_partner_id NULL, e.g. Carres Klang). LP-owned warehouses (HOUZS
  // Balakong, OHANA) never hit a Klang GRN — goods there are tracked by the
  // order's Stock Location instead. The own-WH filter only activates once an
  // LP-owned warehouse actually exists; until then every PO is own-WH so the
  // queue is unchanged (current master data has no LP warehouse).
  const ownWarehouseIds = useMemo(() => {
    const s = new Set<string>();
    for (const w of warehouseQ.data?.warehouses ?? [])
      if (w.owning_partner_id == null) s.add(w.id);
    return s;
  }, [warehouseQ.data]);
  const hasLpWarehouse = useMemo(
    () =>
      (warehouseQ.data?.warehouses ?? []).some(
        (w) => w.owning_partner_id != null,
      ),
    [warehouseQ.data],
  );

  const pos = useMemo(() => data?.pos ?? [], [data]);

  // Cancelled POs never belong in a receive queue; then narrow to own-warehouse
  // POs (GRN scope) once any LP-owned warehouse exists.
  const live = useMemo(() => {
    const notCancelled = pos.filter((p) => p.status !== "cancelled");
    return hasLpWarehouse
      ? notCancelled.filter((p) => ownWarehouseIds.has(p.warehouse_id))
      : notCancelled;
  }, [pos, hasLpWarehouse, ownWarehouseIds]);

  /** One row = one PO + the progress its column and its facet both read. */
  const rows = useMemo(
    () =>
      live.map((po) => ({
        po,
        progress: poReceivingProgress(po.purchase_order_lines),
      })),
    [live],
  );

  // Queue counts are taken over every live PO, so a count never depends on
  // which other facet happens to be picked.
  const queueCounts = useMemo(() => {
    const c = new Map<QueueKey, number>();
    for (const q of QUEUES)
      c.set(q.key, rows.filter((r) => q.match(r.progress.state)).length);
    return c;
  }, [rows]);

  const inQueue = useMemo(() => {
    if (queueFilter.size === 0) return rows;
    return rows.filter((r) =>
      QUEUES.some((q) => queueFilter.has(q.key) && q.match(r.progress.state)),
    );
  }, [rows, queueFilter]);

  // SUPPLIER facet — POs of the picked queue(s), so the rail answers "who owes
  // me the goods I am looking at" (To Order's own shape).
  const bySupplier = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of inQueue)
      m.set(r.po.supplier_id, (m.get(r.po.supplier_id) ?? 0) + 1);
    return [...m.entries()]
      .map(([id, n]) => ({
        id,
        name: supplierById.get(id)?.name ?? id,
        n,
      }))
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  }, [inQueue, supplierById]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inQueue.filter(({ po }) => {
      if (supplierFilter && po.supplier_id !== supplierFilter) return false;
      if (!q) return true;
      const supName = supplierById.get(po.supplier_id)?.name ?? "";
      return (
        po.id.toLowerCase().includes(q) || supName.toLowerCase().includes(q)
      );
    });
  }, [inQueue, supplierFilter, search, supplierById]);

  const receivePo = receivePoId
    ? live.find((p) => p.id === receivePoId) ?? null
    : null;

  // ── §8.2 · a pick filters, the same pick again clears ──────────────────────
  const toggleQueue = (key: QueueKey) =>
    setQueueFilter((cur) => {
      const n = new Set(cur);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const toggleSupplier = (id: string) =>
    setSupplierFilter((cur) => (cur === id ? null : id));

  const activeChips: ActiveChip[] = [];
  for (const q of QUEUES)
    if (queueFilter.has(q.key))
      activeChips.push({ label: q.label, onClear: () => toggleQueue(q.key) });
  if (supplierFilter)
    activeChips.push({
      label: `Supplier: ${supplierById.get(supplierFilter)?.name ?? supplierFilter}`,
      onClear: () => setSupplierFilter(null),
    });

  // ── §8.2 · closing the drawer gives the list back ──────────────────────────
  //
  // The drawer this tab opens is ReceivePOModal (check in). It closes by
  // refetching, which re-lays the table out — and a shorter table makes the
  // browser clamp scrollTop before React has finished. So the list state is
  // snapshotted when the drawer opens and put back when it closes.
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const listStateBeforeDrawer = useRef<ReceivingListState | null>(null);
  const pendingTableScroll = useRef<number | null>(null);

  const openReceive = (poId: string) => {
    listStateBeforeDrawer.current = {
      queueFilter,
      supplierFilter,
      search,
      tableScrollTop: tableScrollRef.current?.scrollTop ?? 0,
    };
    setReceivePoId(poId);
  };

  const closeReceive = () => {
    setReceivePoId(null);
    const s = listStateBeforeDrawer.current;
    listStateBeforeDrawer.current = null;
    if (!s) return;
    setQueueFilter(s.queueFilter);
    setSupplierFilter(s.supplierFilter);
    setSearch(s.search);
    pendingTableScroll.current = s.tableScrollTop;
  };

  // Re-apply the scroll after every render until it sticks: one assignment is
  // not enough, because the refetch that runs on close lands a frame or two
  // later. Gives up once the table is too short to hold the old position — a
  // PO that was fully received is genuinely gone from the queue.
  useLayoutEffect(() => {
    const want = pendingTableScroll.current;
    if (want == null) return;
    const el = tableScrollRef.current;
    if (!el) return;
    el.scrollTop = want;
    if (el.scrollTop === want || el.scrollHeight - el.clientHeight <= want) {
      pendingTableScroll.current = null;
    }
  });

  if (isLoading) {
    return (
      <div className="h-full flex flex-col">
        <PurchasingTabs />
        <div className="px-6 py-8">
          <div data-testid="operation-receiving-skeleton">
            <div className="bg-white border border-base-200 rounded">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-14 border-b border-base-100 animate-pulse bg-base-50/40"
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="h-full flex flex-col">
        <PurchasingTabs />
        <div className="px-6 py-8">
          <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm">
            <div className="text-destructive font-semibold mb-2">
              Couldn&rsquo;t load purchase orders
            </div>
            <div className="text-[12px] text-base-700 mb-3">
              {(error as Error | undefined)?.message ?? "Unknown error"}
            </div>
            <button
              type="button"
              onClick={() => void refetch()}
              className="btn-secondary text-[11px] py-1.5 px-3"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <PurchasingTabs />
      <div className="flex-1 min-h-0">
        <ListPageShell
          testId="operation-receiving"
          facetOpen={facetOpen}
          onFacetToggle={() => setFacetOpen((v) => !v)}
          activeChips={activeChips}
          toolbarRight={
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="PO number or supplier…"
              className="w-[230px] px-3 py-1.5 border border-base-200 rounded text-[13px] bg-white outline-none focus:border-base-700"
            />
          }
          facet={
            <SectionCard>
              {/* QUEUES — the work first (§8.4: the module's queue names, the
                  danger group first). All three rows stay visible even at
                  zero: a named 0 says "watched and fine", a hidden row says
                  nobody looked (K1's law). */}
              <SectionBand
                title="Queues"
                strong
                collapsed={collapsedFacet.has("queues")}
                onToggle={() => toggleFacet("queues")}
                right={
                  <button
                    type="button"
                    onClick={() => setFacetOpen(false)}
                    title="Collapse filters"
                    aria-label="Collapse filters"
                    className="shrink-0 p-0.5 rounded text-base-400 hover:text-base-800 hover:bg-hovertint transition-colors"
                  >
                    <ChevronsLeft size={15} />
                  </button>
                }
              />
              {!collapsedFacet.has("queues") && (
                <div>
                  {QUEUES.map((q) => {
                    const n = queueCounts.get(q.key) ?? 0;
                    return (
                      <FacetRow
                        key={q.key}
                        testId={q.testId}
                        label={q.label}
                        count={n}
                        tone={q.danger && n > 0 ? "danger" : undefined}
                        active={queueFilter.has(q.key)}
                        onClick={() => toggleQueue(q.key)}
                      />
                    );
                  })}
                </div>
              )}

              <SectionBand
                title="Supplier"
                strong
                collapsed={collapsedFacet.has("supplier")}
                onToggle={() => toggleFacet("supplier")}
              />
              {!collapsedFacet.has("supplier") && (
                <div>
                  {bySupplier.length === 0 ? (
                    <div className="px-2.5 py-1.5 text-[12px] text-base-400">
                      Nothing here
                    </div>
                  ) : (
                    bySupplier.map((s) => (
                      <FacetRow
                        key={s.id}
                        testId={`facet-supplier-${s.id}`}
                        label={s.name}
                        count={s.n}
                        active={supplierFilter === s.id}
                        onClick={() => toggleSupplier(s.id)}
                      />
                    ))
                  )}
                </div>
              )}
            </SectionCard>
          }
        >
          <div className="flex-1 min-h-0 flex flex-col gap-3">
            {/* R6 — what the warehouse counted and Carres has not checked in
                yet. Renders NOTHING when nothing is waiting, so it costs zero
                permanent pixels and cannot be scrolled past out of habit. It
                sits above the queue because a count already on file is work
                the operator can finish in one click, while every row below
                still needs the goods in front of them. */}
            <WarehouseReceiptsPanel />

            <div
              ref={tableScrollRef}
              data-testid="receiving-table-scroll"
              className="flex-1 min-h-0 bg-white border border-base-200 rounded overflow-auto"
            >
              <table
                className="w-full border-collapse text-[13px] [&_tbody_tr:nth-child(even)]:bg-base-100/70"
                style={{ minWidth: 920 }}
              >
                <thead className="bg-base-700 border-b-2 border-primary text-white">
                  <tr>
                    <Th>PO</Th>
                    <Th>Supplier</Th>
                    <Th>Warehouse</Th>
                    <Th>Progress</Th>
                    <Th>ETA</Th>
                    <Th>Stage</Th>
                    <Th> </Th>
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="p-12 text-center text-[12px] text-base-500"
                      >
                        No purchase orders in this tab.
                      </td>
                    </tr>
                  )}
                  {visible.map(({ po, progress }) => {
                    const supName = supplierById.get(po.supplier_id)?.name ?? "—";
                    const whName = warehouseById.get(po.warehouse_id)?.name ?? "—";
                    const done = po.status === "received";
                    return (
                      <tr
                        key={po.id}
                        onClick={() => openReceive(po.id)}
                        className="border-t border-base-100 align-top hover:bg-primary/5 cursor-pointer"
                        data-testid="receiving-row"
                      >
                        <td className="px-4 py-3 whitespace-nowrap font-mono font-semibold text-base-900">
                          {po.id}
                        </td>
                        <td className="px-4 py-3 text-base-800">{supName}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-base-700">
                          {whName}
                        </td>
                        {/* R1 — the whole point of the card: what still has to
                            arrive is readable here, without opening anything. */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`pill ${PROGRESS_PILL[progress.state]}`}
                            data-testid={`receiving-progress-${po.id}`}
                          >
                            {progress.label}
                          </span>
                          {progress.pendingLabel && (
                            <div className="text-[11px] text-base-600 mt-1">
                              {progress.pendingLabel}
                            </div>
                          )}
                          {progress.issueLabel && (
                            <div className="text-[11px] text-danger mt-0.5">
                              {progress.issueLabel}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-base-700">
                          {po.eta_date ? (
                            fmtDate(po.eta_date)
                          ) : (
                            <span className="text-base-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`pill ${done ? "pill-confirmed" : supStatusPill(po.sup_status)}`}
                          >
                            {done ? "Received" : supStatusLabel(po.sup_status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          {done ? (
                            <span className="inline-flex items-center gap-1 text-[12px] text-success">
                              <span className="w-[7px] h-[7px] rounded-full bg-success" />
                              Done
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                // The row opens the same drawer; stop the
                                // bubble so it is opened once, by one path.
                                e.stopPropagation();
                                openReceive(po.id);
                              }}
                              className="btn-primary text-[11px] py-1.5 px-3"
                              data-testid={`receive-${po.id}`}
                            >
                              Receive →
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </ListPageShell>
      </div>

      {receivePo && (
        <ReceivePOModal
          po={receivePo}
          supplier={supplierById.get(receivePo.supplier_id)}
          warehouse={warehouseById.get(receivePo.warehouse_id)}
          onClose={closeReceive}
        />
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.02em] text-white text-left">
      {children}
    </th>
  );
}

/** One clickable rail row. Local on purpose: the shared version of this lives
 *  in `PageShell` / `DataTable` and that is card D0.5c on line ⑧ — a P-chat
 *  that starts extracting it has taken another line's card. */
function FacetRow({
  label,
  count,
  tone,
  active,
  onClick,
  testId,
}: {
  label: string;
  count: number;
  tone?: "danger";
  active?: boolean;
  onClick: () => void;
  /** Stable hook for the §8.2 click-again-clears tests. */
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      className={`w-full flex items-center gap-2 rounded-full text-left px-2.5 py-1.5 transition-colors ${
        active ? "bg-hovertint" : "hover:bg-hovertint"
      }`}
    >
      <span
        className={`min-w-0 truncate text-[13px] ${
          active ? "text-base-900 font-semibold" : "text-base-700"
        }`}
      >
        {label}
      </span>
      <span
        className={`ml-auto text-[12px] tabular-nums shrink-0 ${
          tone === "danger"
            ? "text-danger font-bold"
            : "text-base-500 font-semibold"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
