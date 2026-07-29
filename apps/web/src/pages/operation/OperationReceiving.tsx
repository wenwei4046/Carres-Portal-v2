import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  poReceivingProgress,
  purchasingActionButton,
  purchasingActionQueue,
  purchasingSupplierCallsOf,
  type PoReceivingState,
  type PurchasingOpenCall,
  type SupplierCallPo,
} from "@carres/shared";
import {
  useOperationPos,
  useOperationSuppliers,
  useOperationWarehouse,
  type operationPoListRow,
  type SupplierRow,
} from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";
import ListPageShell, { type ActiveChip } from "@/components/ListPageShell";
import { SectionCard, SectionBand } from "@/components/SectionPanel";
import FacetRow, { EmptyFacetHint } from "@/components/FacetRow";
import ReceivePOModal from "./components/ReceivePOModal";
import RecordSupplierAnswerModal from "./components/RecordSupplierAnswerModal";
import WarehouseReceiptsPanel from "./components/WarehouseReceiptsPanel";
import PurchasingTabs from "./PurchasingTabs";

/**
 * OperationReceiving — the GRN (goods-received) station (P3 of
 * project-orders-control-spec; Jess redesign Q3a=B menu split).
 *
 * Splits the old "Receiving"(=Procurement) menu in two: PO create/manage stays
 * on the **Purchase Order** menu (TabbedProcurementShell), and THIS page is the
 * pure **待收 queue** — open POs whose goods come into Carres Klang. The
 * operator finds the PO, hits Check in, and books the units in via the existing
 * ReceivePOModal (per-line tick + DO upload + signed checkbox → the v3
 * operation_receive_po_with_do RPC; ops_stock_items incoming→free + stock_balances).
 *
 * GRN scope: goods INTO Carres Klang only. AL/HOUZS goods (mattress→HOUZS
 * Balakong, sofa→at OHANA) never hit Klang, so they're tracked by Stock
 * Location, not a Klang GRN. Current master data has Carres Klang as the only
 * own warehouse, so every open PO shown here is Klang-bound; when multi-location
 * lands (P4) this list filters to own-warehouse POs.
 *
 * 2026-07-27 (R1 of the receiving & claim queue): the row stops being a binary
 * "Receive → / Done". A PROGRESS column reads the four per-line numbers through
 * the shared `poReceivingProgress` and says, in words, where the delivery is —
 * In transit · Partially received (8/10) · Fully received · Receiving issue —
 * with the outstanding qty underneath it ("2 units pending delivery").
 *
 * 2026-07-28 (card P2, the Receiving half): this tab gets the facet rail and
 * the §8.2 interaction law it has never had.
 *
 * **Which of §8.2's two shapes is this page?** A QUEUE-TILE page, not a stage
 * picker. The test §8.2 gives is the empty state, not the look: To Order is a
 * stage page because clearing its stage renders a blank screen — there is no
 * "all three at once" body. Receiving renders ONE table for every combination
 * of filters, and "nothing selected" is the `All` tab, which is a legal and
 * genuinely useful view (it is how an operator finds one PO). So every tile
 * here toggles, and every pick is an ✕-able chip.
 *
 * The rail carries three groups, in §8.4's order — the module's own queue name
 * first, danger first inside a group:
 *
 *   Today's work  ·  Check in            the ONE action of PURCHASING-WORKING-FLOW
 *                                        §7 that lives on this tab. Counted from
 *                                        QUANTITIES (§9), never from a status word
 *   Progress      ·  the R1 states       facts this page already computes
 *   Supplier      ·  per factory         the same facet the To Order tab carries
 *
 * 2026-07-28 (card **R8**, the banned-verb sweep): the row's action button said
 * `Receive →` while the R6 panel directly above it said `Check in` — the same
 * act, two words, on one screen. COPY-STANDARD bans `Receive` as a verb outright
 * ("Log goods arrival — the ACT: **Check in**"), so this was lag, not a
 * decision. The button, the facet tile and its chip now all read
 * `purchasingActionQueue`/`Button("check_in")`; nothing else on the page moved.
 */

type Tab = "to_receive" | "received" | "all";

const TABS: { key: Tab; label: string }[] = [
  { key: "to_receive", label: "To receive" },
  { key: "received", label: "Received" },
  { key: "all", label: "All" },
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

/**
 * P2 — the PROGRESS facet rows. Same four state words the row's pill already
 * prints; the row adds `(8/10)` because it is talking about ONE PO, and a facet
 * holds many, so it names the state bare. Nothing new is invented here — the
 * words are `packages/shared/po-receiving.ts`'s own.
 *
 * Order is §8.4's: the danger group first. A receiving issue is the only one of
 * the four where the supplier still owes good units AND something has already
 * gone wrong, so it leads.
 */
const PROGRESS_FACETS: {
  state: PoReceivingState;
  label: string;
  tone?: "danger";
  title: string;
}[] = [
  {
    state: "receiving_issue",
    label: "Receiving issue",
    tone: "danger",
    title:
      "Something arrived damaged or as the wrong item, and the supplier still owes good units.",
  },
  {
    state: "partially_received",
    label: "Partially received",
    title: "Some good units are booked in and the rest are still coming.",
  },
  {
    state: "in_transit",
    label: "In transit",
    title: "Nothing has been counted in against this PO yet.",
  },
  {
    state: "fully_received",
    label: "Fully received",
    title: "Every unit ordered has been counted in — nothing is outstanding.",
  },
];

function toggleInSet<T>(cur: Set<T>, v: T): Set<T> {
  const next = new Set(cur);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
}

/** Everything the drawer must give back on close (§8.2, last line). */
interface ReceivingListState {
  tab: Tab;
  search: string;
  checkInOnly: boolean;
  tomorrowOnly: boolean;
  balanceOnly: boolean;
  progressFilter: Set<PoReceivingState>;
  supplierFilter: Set<string>;
  facetScrollTop: number;
}

/** Today, as a local ISO date — the engine takes it as a parameter so a test
 *  can stand on any weekday and nothing drifts with the machine's clock. */
function todayIso(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** The list row → the P3 engine's own shape. ONE mapping, so the facet counts
 *  and the row buttons can never read a PO two different ways. */
export function supplierCallPoOf(po: operationPoListRow): SupplierCallPo {
  return {
    poId: po.id,
    supplierId: po.supplier_id,
    status: po.status,
    etaDateIso: po.eta_date,
    tomorrowAnswerAboutDateIso: po.tomorrow_answer_about_date ?? null,
    lines: (po.purchase_order_lines ?? []).map((l) => ({
      id: l.id,
      sku: l.sku,
      qty: Number(l.qty ?? 0),
      receivedQty: Number(l.received_qty ?? 0),
      shortSinceIso: l.short_since ?? null,
      balanceAnswerAboutQty: l.balance_answer_about_qty ?? null,
    })),
  };
}

export default function OperationReceiving() {
  const [tab, setTab] = useState<Tab>("to_receive");
  const [search, setSearch] = useState("");
  const [receivePoId, setReceivePoId] = useState<string | null>(null);

  // P2 — the facet rail this tab has never had.
  const [facetOpen, setFacetOpen] = useState(true);
  const [checkInOnly, setCheckInOnly] = useState(false);
  // P3 — the two supplier calls this band was reserved for by P2-Receiving.
  const [tomorrowOnly, setTomorrowOnly] = useState(false);
  const [balanceOnly, setBalanceOnly] = useState(false);
  const [answerFor, setAnswerFor] = useState<
    { kind: "tomorrow" | "balance"; poId: string; poLineId?: string } | null
  >(null);
  const [progressFilter, setProgressFilter] = useState<Set<PoReceivingState>>(
    () => new Set(),
  );
  const [supplierFilter, setSupplierFilter] = useState<Set<string>>(
    () => new Set(),
  );
  const [collapsedFacet, setCollapsedFacet] = useState<Set<string>>(
    () => new Set(),
  );
  const toggleFacet = (key: string) =>
    setCollapsedFacet((cur) => toggleInSet(cur, key));

  const { data, isLoading, isError, error, refetch } = useOperationPos();
  const suppliersQ = useOperationSuppliers();
  const warehouseQ = useOperationWarehouse();

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

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { to_receive: 0, received: 0, all: live.length };
    for (const p of live) {
      if (p.status === "received") c.received += 1;
      else c.to_receive += 1;
    }
    return c;
  }, [live]);

  /** Every PO's R1 progress, computed once — the facet counts and the row's
   *  own pill read the SAME object, so a queue count and its list cannot
   *  disagree (`docs/PURCHASING-WORKING-FLOW.md` §3). */
  const progressById = useMemo(() => {
    const m = new Map<string, ReturnType<typeof poReceivingProgress>>();
    for (const p of live) m.set(p.id, poReceivingProgress(p.purchase_order_lines));
    return m;
  }, [live]);

  /** The rows the status TAB scopes — the facet counts are taken over exactly
   *  this set, so clicking a tile always shows the number it printed. */
  const tabScoped = useMemo(
    () =>
      live.filter((p) => {
        if (tab === "to_receive" && p.status === "received") return false;
        if (tab === "received" && p.status !== "received") return false;
        return true;
      }),
    [live, tab],
  );

  // ── Facet counts ───────────────────────────────────────────────────────────
  //
  // `Check in` is the one action of PURCHASING-WORKING-FLOW §7 that lives on
  // this tab, and §9 is explicit about how it is counted: "A PO is finished by
  // QUANTITY, never by the existence of a receiving record." So the tile counts
  // POs that still owe units, read off `poReceivingProgress`, and NOT the
  // `status` word the tabs read.
  const checkInCount = useMemo(
    () =>
      tabScoped.filter((p) => (progressById.get(p.id)?.pendingDelivery ?? 0) > 0)
        .length,
    [tabScoped, progressById],
  );

  // ── P3 · the two supplier calls ────────────────────────────────────────────
  //
  // Computed ONCE per PO and read by the tiles, the row buttons and nothing
  // else, so a queue count and its list structurally cannot disagree — the same
  // rule `progressById` follows one block up.
  //
  // `Confirm balance delivery date` is counted per PO LINE (§3), and this tab's
  // ROW is a PO. The tile therefore prints the number of POs it will show —
  // P2-Claims' honesty rule, a visible cell above zero always returns at least
  // that many rows — and the ROW names its lines. The per-line figure is not
  // lost: it is the number of buttons on the row.
  const callsById = useMemo(() => {
    const today = todayIso();
    const m = new Map<string, PurchasingOpenCall[]>();
    for (const p of live) {
      m.set(
        p.id,
        purchasingSupplierCallsOf(supplierCallPoOf(p), { todayIso: today }),
      );
    }
    return m;
  }, [live]);

  const tomorrowCount = useMemo(
    () =>
      tabScoped.filter((p) =>
        (callsById.get(p.id) ?? []).some(
          (a) => a.key === "confirm_tomorrows_delivery",
        ),
      ).length,
    [tabScoped, callsById],
  );

  const balancePoCount = useMemo(
    () =>
      tabScoped.filter((p) =>
        (callsById.get(p.id) ?? []).some(
          (a) => a.key === "confirm_balance_delivery_date",
        ),
      ).length,
    [tabScoped, callsById],
  );

  const progressCounts = useMemo(() => {
    const m = new Map<PoReceivingState, number>();
    for (const p of tabScoped) {
      const st = progressById.get(p.id)?.state;
      if (st) m.set(st, (m.get(st) ?? 0) + 1);
    }
    return m;
  }, [tabScoped, progressById]);

  const supplierFacets = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of tabScoped) m.set(p.supplier_id, (m.get(p.supplier_id) ?? 0) + 1);
    return [...m.entries()]
      .map(([id, n]) => ({ id, n, name: supplierById.get(id)?.name ?? "—" }))
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  }, [tabScoped, supplierById]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tabScoped.filter((p) => {
      const progress = progressById.get(p.id);
      const calls = callsById.get(p.id) ?? [];
      if (checkInOnly && (progress?.pendingDelivery ?? 0) <= 0) return false;
      if (
        tomorrowOnly &&
        !calls.some((a) => a.key === "confirm_tomorrows_delivery")
      )
        return false;
      if (
        balanceOnly &&
        !calls.some((a) => a.key === "confirm_balance_delivery_date")
      )
        return false;
      if (progressFilter.size > 0 && (!progress || !progressFilter.has(progress.state)))
        return false;
      if (supplierFilter.size > 0 && !supplierFilter.has(p.supplier_id)) return false;
      if (!q) return true;
      const supName = supplierById.get(p.supplier_id)?.name ?? "";
      return (
        p.id.toLowerCase().includes(q) || supName.toLowerCase().includes(q)
      );
    });
  }, [
    tabScoped,
    progressById,
    callsById,
    checkInOnly,
    tomorrowOnly,
    balanceOnly,
    progressFilter,
    supplierFilter,
    search,
    supplierById,
  ]);

  // ── Active-filter chips (§8.2: two tiles picked → two ✕-able chips) ────────
  const activeChips: ActiveChip[] = [];
  if (checkInOnly)
    activeChips.push({
      label: purchasingActionQueue("check_in"),
      onClear: () => setCheckInOnly(false),
    });
  if (tomorrowOnly)
    activeChips.push({
      label: purchasingActionQueue("confirm_tomorrows_delivery"),
      onClear: () => setTomorrowOnly(false),
    });
  if (balanceOnly)
    activeChips.push({
      label: purchasingActionQueue("confirm_balance_delivery_date"),
      onClear: () => setBalanceOnly(false),
    });
  for (const f of PROGRESS_FACETS)
    if (progressFilter.has(f.state))
      activeChips.push({
        label: f.label,
        onClear: () =>
          setProgressFilter((cur) => toggleInSet(cur, f.state)),
      });
  for (const id of supplierFilter)
    activeChips.push({
      label: `Supplier: ${supplierById.get(id)?.name ?? "—"}`,
      onClear: () => setSupplierFilter((cur) => toggleInSet(cur, id)),
    });

  const anyFilter =
    checkInOnly ||
    tomorrowOnly ||
    balanceOnly ||
    progressFilter.size > 0 ||
    supplierFilter.size > 0 ||
    search.trim() !== "";
  const resetFilters = () => {
    setCheckInOnly(false);
    setTomorrowOnly(false);
    setBalanceOnly(false);
    setProgressFilter(new Set());
    setSupplierFilter(new Set());
    setSearch("");
  };

  // ── §8.2 · closing the drawer gives the list back ──────────────────────────
  //
  // The one overlay this tab opens is ReceivePOModal (the Check in form). It
  // closes by invalidating the PO list, which re-renders the facet rail — and a
  // shorter rail makes the browser clamp its scrollTop before React has
  // finished. Same shape as the To Order half, written here rather than shared:
  // the behaviour belongs in `PageShell` / `DataTable` and that is D0.5c on
  // line ⑧, which the P2 card explicitly reserves.
  const facetInnerRef = useRef<HTMLDivElement | null>(null);
  const getFacetScroller = () =>
    facetInnerRef.current?.closest<HTMLElement>(
      '[data-testid="listshell-facet"]',
    ) ?? null;
  const listStateBeforeDrawer = useRef<ReceivingListState | null>(null);
  const pendingFacetScroll = useRef<number | null>(null);

  const snapshotList = () => {
    listStateBeforeDrawer.current = {
      tab,
      search,
      checkInOnly,
      tomorrowOnly,
      balanceOnly,
      progressFilter,
      supplierFilter,
      facetScrollTop: getFacetScroller()?.scrollTop ?? 0,
    };
  };

  /** §8.2's last line, and it applies to EVERY overlay this tab opens — the
   *  Check in form and P3's two record-answer forms alike. One snapshot/restore
   *  pair, so a third overlay cannot be added that forgets to give the list
   *  back. */
  const restoreList = () => {
    const s = listStateBeforeDrawer.current;
    listStateBeforeDrawer.current = null;
    if (!s) return;
    setTab(s.tab);
    setSearch(s.search);
    setCheckInOnly(s.checkInOnly);
    setTomorrowOnly(s.tomorrowOnly);
    setBalanceOnly(s.balanceOnly);
    setProgressFilter(s.progressFilter);
    setSupplierFilter(s.supplierFilter);
    pendingFacetScroll.current = s.facetScrollTop;
  };

  const openReceive = (poId: string) => {
    snapshotList();
    setReceivePoId(poId);
  };

  const closeReceive = () => {
    setReceivePoId(null);
    restoreList();
  };

  const openAnswer = (
    kind: "tomorrow" | "balance",
    poId: string,
    poLineId?: string,
  ) => {
    snapshotList();
    setAnswerFor({ kind, poId, poLineId });
  };

  const closeAnswer = () => {
    setAnswerFor(null);
    restoreList();
  };

  // Re-apply the scroll after every render until it sticks. One assignment is
  // not enough: the refetch that runs on close lands a frame or two later and
  // re-lays the rail out underneath it. Gives up once the rail is too short to
  // hold the old position — a PO that was fully received is genuinely gone.
  useLayoutEffect(() => {
    const want = pendingFacetScroll.current;
    if (want == null) return;
    const el = getFacetScroller();
    if (!el) return;
    el.scrollTop = want;
    if (el.scrollTop === want || el.scrollHeight - el.clientHeight <= want) {
      pendingFacetScroll.current = null;
    }
  });

  const receivePo = receivePoId
    ? live.find((p) => p.id === receivePoId) ?? null
    : null;

  const answerPo = answerFor
    ? live.find((p) => p.id === answerFor.poId) ?? null
    : null;

  if (isLoading) {
    return (
      <>
        <PurchasingTabs />
        <div className="px-9 py-8 pb-14">
        <div data-testid="operation-receiving-skeleton">
          <div className="h-9 w-1/3 bg-base-100 rounded animate-pulse mb-6" />
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
      </>
    );
  }

  if (isError) {
    return (
      <>
        <PurchasingTabs />
        <div className="px-9 py-8 pb-14">
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
      </>
    );
  }

  const total = visible.length;

  return (
    <div className="h-full flex flex-col">
      <PurchasingTabs />
      <div className="flex-1 min-h-0">
        {/* UI-KIT §8.3 module-tab law — the tab bar above IS the title, so the
            shell renders no breadcrumb and no page title. The kicker + <h1>
            this page used to draw were ~80px of a 200px list budget spent
            repeating the word already lit in the tab bar. */}
        <ListPageShell
          testId="operation-receiving"
          facetOpen={facetOpen}
          onFacetToggle={() => setFacetOpen((v) => !v)}
          facetToggleTitle="Show filters"
          toolbar={
            <div
              className="flex gap-1 p-1 bg-base-100 rounded w-fit max-w-full overflow-auto"
              role="tablist"
              aria-label="Receiving status"
            >
              {TABS.map((t) => {
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(t.key)}
                    className={`px-3 py-1.5 text-[12px] rounded cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                      active
                        ? "bg-white text-base-900 font-semibold shadow-sm"
                        : "text-base-600 font-medium hover:text-base-900"
                    }`}
                  >
                    <span>{t.label}</span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-px rounded-full ${
                        active
                          ? "bg-base-100 text-base-700"
                          : "bg-base-200 text-base-500"
                      }`}
                    >
                      {counts[t.key]}
                    </span>
                  </button>
                );
              })}
            </div>
          }
          toolbarRight={
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="PO number or supplier…"
              className="w-[230px] px-3 py-1.5 border border-base-200 rounded-full text-[13px] bg-white outline-none focus:border-base-700"
            />
          }
          activeChips={activeChips}
          footer={
            <>
              <span className="tabular-nums">
                {total} {total === 1 ? "PO" : "POs"}
              </span>
              {anyFilter && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="hover:text-base-900 transition-colors"
                >
                  Reset filters
                </button>
              )}
            </>
          }
          facet={
            <div ref={facetInnerRef} className="flex flex-col gap-2 min-h-0 flex-1">
              <SectionCard>
                {/* TODAY'S WORK — the module's own queue name, first (§8.4).
                    Only ONE of §7's six actions is computable on this tab:
                    `Check in`. The other five are the To Order tab's, the
                    Claims tab's, or P3's, and a tile for an action nothing can
                    count would be a number nobody wrote. The band hides itself
                    when the count is zero — on the `Received` tab there is by
                    definition nothing to check in. */}
                {(checkInCount > 0 || tomorrowCount > 0 || balancePoCount > 0) && (
                  <>
                    <SectionBand
                      title="Today's work"
                      strong
                      collapsed={collapsedFacet.has("today")}
                      onToggle={() => toggleFacet("today")}
                    />
                    {!collapsedFacet.has("today") && (
                      <div>
                        {/* §4's display order, top rung first: the tomorrow call
                            and Check in are both "today's run"; the balance call
                            is rung 4, cleaning up a part-delivery. Each band row
                            hides at zero — a reassuring `0` is not a fact worth
                            permanent height. */}
                        {tomorrowCount > 0 && (
                          <FacetRow
                            testId="receiving-facet-tomorrow"
                            label={purchasingActionQueue(
                              "confirm_tomorrows_delivery",
                            )}
                            count={tomorrowCount}
                            active={tomorrowOnly}
                            onClick={() => setTomorrowOnly((v) => !v)}
                          />
                        )}
                        {checkInCount > 0 && (
                          <FacetRow
                            testId="receiving-facet-checkin"
                            label={purchasingActionQueue("check_in")}
                            count={checkInCount}
                            active={checkInOnly}
                            title="A PO that still owes units — counted from the quantities booked in, never from a status word somebody typed."
                            onClick={() => setCheckInOnly((v) => !v)}
                          />
                        )}
                        {balancePoCount > 0 && (
                          <FacetRow
                            testId="receiving-facet-balance"
                            label={purchasingActionQueue(
                              "confirm_balance_delivery_date",
                            )}
                            count={balancePoCount}
                            active={balanceOnly}
                            onClick={() => setBalanceOnly((v) => !v)}
                          />
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* PROGRESS — the page's own column, as a filter. Facts, so
                    they are multi-select: "show me the issues AND the
                    part-deliveries" is one question, not two. */}
                <SectionBand
                  title="Progress"
                  strong
                  collapsed={collapsedFacet.has("progress")}
                  onToggle={() => toggleFacet("progress")}
                />
                {!collapsedFacet.has("progress") && (
                  <div>
                    {PROGRESS_FACETS.every(
                      (f) => (progressCounts.get(f.state) ?? 0) === 0,
                    ) ? (
                      <EmptyFacetHint text="Nothing here" />
                    ) : (
                      PROGRESS_FACETS.map((f) =>
                        (progressCounts.get(f.state) ?? 0) > 0 ? (
                          <FacetRow
                            key={f.state}
                            testId={`receiving-facet-progress-${f.state}`}
                            label={f.label}
                            count={progressCounts.get(f.state) ?? 0}
                            tone={f.tone}
                            title={f.title}
                            active={progressFilter.has(f.state)}
                            onClick={() =>
                              setProgressFilter((cur) => toggleInSet(cur, f.state))
                            }
                          />
                        ) : null,
                      )
                    )}
                  </div>
                )}

                {/* SUPPLIER — the same facet the To Order tab carries, counted
                    in POs here because a PO is this tab's row. */}
                <SectionBand
                  title="Supplier"
                  strong
                  collapsed={collapsedFacet.has("supplier")}
                  onToggle={() => toggleFacet("supplier")}
                />
                {!collapsedFacet.has("supplier") && (
                  <div>
                    {supplierFacets.length === 0 ? (
                      <EmptyFacetHint text="Nothing here" />
                    ) : (
                      supplierFacets.map((f) => (
                        <FacetRow
                          key={f.id}
                          testId={`receiving-facet-supplier-${f.id}`}
                          label={f.name}
                          count={f.n}
                          active={supplierFilter.has(f.id)}
                          onClick={() =>
                            setSupplierFilter((cur) => toggleInSet(cur, f.id))
                          }
                        />
                      ))
                    )}
                  </div>
                )}
              </SectionCard>
            </div>
          }
        >
          {/* R6 — what the warehouse counted and Carres has not checked in yet.
              Renders NOTHING when nothing is waiting, so it costs zero permanent
              pixels and cannot be scrolled past out of habit. It sits above the
              queue because a count already on file is work the operator can
              finish in one click, while every row below still needs the goods in
              front of them. */}
          <div className="shrink-0">
            <WarehouseReceiptsPanel />
          </div>

          {/* Table */}
          <div className="flex-1 min-h-0 bg-white border border-base-200 rounded-t-[12px] rounded-b-none shadow-sm overflow-auto">
            <table
              className="w-full border-collapse text-[13px] [&_tbody_tr:nth-child(even)]:bg-base-100/70"
              style={{ minWidth: 920 }}
            >
              <thead className="bg-base-700 border-b-2 border-primary text-white sticky top-0 z-10">
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
                {visible.map((po) => {
                  const progress =
                    progressById.get(po.id) ??
                    poReceivingProgress(po.purchase_order_lines);
                  const supName = supplierById.get(po.supplier_id)?.name ?? "—";
                  const whName = warehouseById.get(po.warehouse_id)?.name ?? "—";
                  const done = po.status === "received";
                  return (
                    <tr
                      key={po.id}
                      className="border-t border-base-100 align-top hover:bg-primary/5"
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
                      {/* P3 — every open action of this PO, never just the top
                          one: Law 1 says one action may not suppress another,
                          and a PO delivered short on Monday genuinely carries
                          its balance call AND its next tomorrow call at once.
                          Order is §4's. */}
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        {done ? (
                          <span className="inline-flex items-center gap-1 text-[12px] text-success">
                            <span className="w-[7px] h-[7px] rounded-full bg-success" />
                            Done
                          </span>
                        ) : (
                          <div className="inline-flex flex-col items-end gap-1">
                            {(callsById.get(po.id) ?? [])
                              .filter(
                                (a) => a.key === "confirm_tomorrows_delivery",
                              )
                              .map((a) => (
                                <button
                                  key={a.key}
                                  type="button"
                                  onClick={() => openAnswer("tomorrow", po.id)}
                                  className={`text-[11px] py-1.5 px-3 ${
                                    a.late ? "btn-danger" : "btn-secondary"
                                  }`}
                                  title={purchasingActionQueue(
                                    "confirm_tomorrows_delivery",
                                  )}
                                  data-testid={`tomorrow-${po.id}`}
                                >
                                  {purchasingActionButton(
                                    "confirm_tomorrows_delivery",
                                  )}
                                </button>
                              ))}
                            <button
                              type="button"
                              onClick={() => openReceive(po.id)}
                              className="btn-primary text-[11px] py-1.5 px-3"
                              data-testid={`receive-${po.id}`}
                            >
                              {purchasingActionButton("check_in")}
                            </button>
                            {(callsById.get(po.id) ?? [])
                              .filter(
                                (a) =>
                                  a.key === "confirm_balance_delivery_date",
                              )
                              .map((a) => (
                                <button
                                  key={a.poLineId}
                                  type="button"
                                  onClick={() =>
                                    openAnswer("balance", po.id, a.poLineId)
                                  }
                                  className={`text-[11px] py-1.5 px-3 ${
                                    a.late ? "btn-danger" : "btn-secondary"
                                  }`}
                                  title={`${a.sku} · ${purchasingActionQueue(
                                    "confirm_balance_delivery_date",
                                  )}`}
                                  data-testid={`balance-${a.poLineId}`}
                                >
                                  {purchasingActionButton(
                                    "confirm_balance_delivery_date",
                                  )}
                                </button>
                              ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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

      {answerPo && answerFor && (
        <RecordSupplierAnswerModal
          kind={answerFor.kind}
          po={answerPo}
          supplierName={supplierById.get(answerPo.supplier_id)?.name ?? ""}
          poLineId={answerFor.poLineId}
          onClose={closeAnswer}
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
