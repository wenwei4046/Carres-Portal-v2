import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  comparePoRisk,
  expectedArrivalOf,
  myHolidaySet,
  ordinalLabel,
  poDateHistoryOf,
  PO_DELAY_REASONS,
  PO_STATE_ACTION_SHORT,
  PO_WORK_STATES,
  PO_WORK_STATE_LABEL,
  poArrivalGapOf,
  poCurrentActionOf,
  poOverdueDays,
  poReceivingProgress,
  poReviseSaveGapOf,
  poUnsharedVersionNoticeOf,
  poVersionLabelOf,
  poWorkStateOf,
  productionWorkingDaysFor,
  purchasingActionButton,
  poPurposeLabelOf,
  purchasingActionQueue,
  purchasingCallCalendarDays,
  purchasingCallCalendarOf,
  callCalendarBucketOf,
  purchasingSupplierCallsOf,
  railItemLabel,
  workWeekOffDaysFor,
  type PoCurrentAction,
  type PoRiskRow,
  type PoWorkspacePo,
  type PoWorkState,
  type ProductSkuDto,
  type PurchasingOpenCall,
} from "@carres/shared";
import PurchasingTabs from "./PurchasingTabs";
// The shared rail recipe (extracted 2026-08-03). Its own docblock told the
// next chat to open this page to delete the inline pair and import these —
// done with T2, so the rail recipe has one home again (§2.2).
import { RailGroup, RailItem } from "./components/workspace-rail";
import DataTable, {
  type Column,
  type ColumnFilter,
  type TableSort,
} from "@/components/kit/DataTable";
import EmptyState from "@/components/kit/EmptyState";
import Icon from "@/components/kit/Icon";
import SearchInput from "@/components/kit/SearchInput";
import {
  F_NONE,
  dateFilterMatches,
  datePresetOptions,
  monthLabel,
  rangeValue,
} from "@/lib/excel-date-filter";
import { fmtDate, fmtDateShort } from "@/lib/fmt-date";
import { apiFetch } from "@/lib/api";
import { renderPoPdf } from "@/lib/pdf/render";
import type { PoTemplateData } from "@/lib/pdf/types";
import {
  useCatalog,
  useOperationPos,
  useOperationSuppliers,
  usePoLineAction,
  useRecordBalanceDateMutation,
  useRecordReadyDate,
  useRecordSend,
  useRecordSupplierDate,
  useRevisePo,
  useSetMessageTemplate,
  useOperationWarehouse,
  usePurchasingSettings,
  useCorrectionWork,
  type operationPoListRow,
  type SupplierRow,
} from "@/lib/queries";
import CorrectionWorkList from "./CorrectionWorkList";
/* ONE evidence component, shared with SO Batch Purchase (Card §9 Task 6). */
import PoIssueEvidence from "./components/PoIssueEvidence";

/**
 * OperationPurchaseOrders — the Supplier Execution Workspace
 * (Jess, 2026-08-01/02 — final freeze; record in memory
 * `purchase-orders-architecture-freeze-2026-08-01`).
 *
 * **Copy To Order's page shell 1:1 — the Purchasing module has ONE Workspace
 * template.** Same header strip, same tabs, same 200px navigation rail, same
 * kit-DataTable listing behaviour, same scrolling. Only the CONTENT differs:
 *
 *   NAVIGATION (200px, To Order's launcher style)
 *     CALLS        Overdue · Today · Tomorrow      (the engine's dues)
 *     WORK STATUS  Need Supplier Confirmation · Waiting Goods ·
 *                  Ready to Receive · Completed    (work states, not data
 *                  states — derived, never stored)
 *
 *   LISTING (kit DataTable — the AutoCount register; Jess's Purchasing law,
 *     2026-08-02: the listing is for FINDING — sort, filter, search; the
 *     work happens in the workspace). **NINE frozen columns, ONE fixed set**
 *     (Loo, 2026-08-04 — Q7): PO Issued · Supplier · PO No. · SO No. ·
 *     Items · Destination · Customer Delivery · Expected Arrival ·
 *     Current Action.
 *
 *     **THE SET NEVER CHANGES BECAUSE THE PANEL OPENED.** His words:
 *     *"Operator 的眼睛会一直重新学习页面，Information Hierarchy 每开一次
 *     Detail 就改变，这是 ERP 不应该发生的."* There is no compact variant and
 *     no honesty guard — a column that can never hide cannot be hidden while
 *     it is filtered. When the nine do not fit, the LISTING REGION scrolls
 *     sideways (AutoCount's own grid does); deleting business information to
 *     avoid a scrollbar is the thing he forbade, and resize + reorder (PR 601)
 *     are how an operator who wants a different balance gets one.
 *
 *     **Default order = RISK TO THE CUSTOMER'S PROMISE** (Loo, 2026-08-04 —
 *     `comparePoRisk`): a late call, then goods landing after the promise,
 *     then on the day. It replaces `PO Issued` oldest first, which sorted by
 *     how long the DOCUMENT had waited rather than by how close the CUSTOMER
 *     was; her rule keeps its column, its header sort and the tie-breaker.
 *     Every column sorts by header click and
 *     filters by its ▼ (dates: Excel presets + month buckets + Custom Date
 *     Range); the top Search finds across PO/Supplier/SKU/Model/SO/Customer
 *     — two different jobs, both stay.
 *
 *   WORKSPACE (400px right) — the Supplier Workspace for ONE PO (Jess's
 *     v2 freeze, 2026-08-02): WORKING HEADER → REFERENCE LAYER (untitled —
 *     the panel IS the PO) → SUPPLIER FOLLOW-UP → RECEIVING SUMMARY →
 *     ACTIVITY (tools + business timeline). See WorkspaceBody's comment
 *     for the full architecture; GRN and Claim will speak the same shape.
 *
 * **ONE PURCHASE ORDER, ONE WAY OF LOOKING AT IT** (Q10 · Loo, 2026-08-05,
 * from a top-to-toe review of the LIVE page). Measured at 1280: the register's
 * table is 1203px inside a 568px listing — 635px off the right edge, taking
 * `Customer Delivery`, `Expected Arrival` and `Current Action` with it — while
 * the expanded row showed `PO-2038` and the panel beside it showed `PO-2032`.
 * **Two different purchase orders on one screen.**
 *
 * The fix is a STATE, not a rule: `{ poId, mode }` — see `nextPoView`. One id
 * feeds the panel AND the expanded set, so two POs are structurally
 * unrepresentable, and the two ways of looking at one PO are exclusive:
 *
 *     click a row      → the PANEL opens on that PO
 *     click the ⌄      → the row EXPANDS and the panel CLOSES (full listing)
 *     collapse the ⌃   → the panel comes back, same PO
 *     the panel's ✕    → closes it; clicking any row brings it back
 *
 * Mission: pick today's supplier PO → update supplier progress → talk to the
 * supplier → hand over to Receiving.
 *
 * Deliberately absent until their stores exist (dead controls are banned):
 * Notes (no store) · Supplier DO (no store).
 *
 * Two entries LEFT this list and the correction is worth keeping: the Email
 * door and the send history are BUILT (`po_sends` / `po_revisions`, 0312), and
 * the address is read from `suppliers.contact_email` — **`suppliers.email` no
 * longer exists**, dropped by 0313 because it was a second column for a fact
 * `contact_email` already held. A comment naming a dropped column sends the
 * next reader looking for it.
 */

// design-standard: not-a-list-page — this is the Supplier Execution Workspace
// (To Order's shell with a Workspace pane); its listing renders through the
// kit DataTable.

/** Today in MYT — the app's zone, never the browser's. */
function todayMYT(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date());
}

/**
 * The list row → the workspace's own shape.
 *
 * **`supplierArrivalDateIso` is what the SUPPLIER said, and it is read from the
 * promise ledger rather than from `eta_date`** (Loo, 2026-08-05). `eta_date`
 * has held our own estimate since 2026-08-03, so a null test on it can no
 * longer tell a promise from a guess — see `PoWorkspacePo` for the five live
 * POs that measured the damage. `poDateHistoryOf` keeps the arrival run and the
 * ready-date run apart, so `currentDate` is the arrival the factory named and a
 * ready date can never be mistaken for one.
 */
function callPoOf(po: operationPoListRow): PoWorkspacePo {
  return {
    poId: po.id,
    supplierId: po.supplier_id,
    status: po.status,
    etaDateIso: po.eta_date,
    supplierArrivalDateIso: poDateHistoryOf(po.promises).currentDate,
    tomorrowAnswerAboutDateIso: po.tomorrow_answer_about_date ?? null,
    lines: po.purchase_order_lines.map((l) => ({
      id: l.id,
      sku: l.sku,
      qty: l.qty,
      receivedQty: l.received_qty,
      shortSinceIso: l.short_since ?? null,
      balanceAnswerAboutQty: l.balance_answer_about_qty ?? null,
    })),
  };
}

/**
 * THE EXCEL ROWS: one per SO × SKU, never the paper's stacked cells (Jess,
 * 2026-08-02). Received is dealt across a line's rows in the same SO order the
 * quantities were — a DISPLAY attribution until P5's allocation.
 *
 * `lineQty` / `lineReceived` ride along because the destination doors work on
 * the LINE, not on the SO slice: what may still be re-routed is the line's
 * un-received remainder, and a row showing 1 of a 3-unit line must not tell the
 * split arithmetic that there is only 1 to move.
 */
function docRowsOf(
  po: operationPoListRow,
  labelOf: (l: operationPoListRow["purchase_order_lines"][number]) => string,
) {
  const out: {
    key: string;
    lineId: string;
    so: number | null;
    /** The business name a buyer says out loud — `Booqit 1B(LHF)`. */
    label: string;
    /** The code. It identifies, it does not describe, so it never leads. */
    sku: string;
    qty: number;
    received: number;
    lineQty: number;
    lineReceived: number;
    remark: string | null;
    destinationId: string | null;
    opsRemark: string | null;
  }[] = [];
  for (const l of po.purchase_order_lines) {
    const parts =
      l.so_rows && l.so_rows.length > 0
        ? l.so_rows
        : [{ so: null, qty: l.qty, remark: null }];
    let recvLeft = l.received_qty;
    parts.forEach((r, i) => {
      const got = Math.min(recvLeft, r.qty);
      recvLeft -= got;
      out.push({
        key: `${l.id}-${i}`,
        lineId: l.id,
        so: r.so,
        label: labelOf(l),
        sku: l.sku,
        qty: r.qty,
        received: got,
        lineQty: l.qty,
        lineReceived: l.received_qty,
        remark: r.remark,
        destinationId: l.destination_id ?? null,
        opsRemark: l.ops_remark ?? null,
      });
    });
  }
  return out;
}

function soRefsOf(po: operationPoListRow): number[] {
  const set = new Set<number>();
  if (po.so != null) set.add(po.so);
  for (const s of po.so_refs ?? []) set.add(s);
  return [...set].sort((a, b) => a - b);
}

// The work-state vocabulary + the ONE Current Action source live in
// packages/shared (`po-workspace.ts`) — Law 7: a page-local word table would
// be a second action engine, and the header could disagree with the column.
type WorkState = PoWorkState;
const WORK_STATE_LABEL = PO_WORK_STATE_LABEL;
const WORK_STATES = PO_WORK_STATES;

function workStateOf(po: operationPoListRow, today: string): WorkState {
  // ONE mapping — `callPoOf`. Spelling the row out a second time here is how
  // the work state came to read `eta_date` while the Current Action read the
  // engine; they are the same PO and they now go through the same door.
  return poWorkStateOf(callPoOf(po), today);
}

// The Excel date ▼ machinery lives in ONE lib (`excel-date-filter.ts`) so
// every date column — here and, after Jess's live review, portal-wide —
// speaks the same presets and the same Custom Date Range.

/**
 * `Fri, 7 Aug` — a rail day row's word. `railDayLabel` is DELETED (owner ruling
 * 2026-08-15): it composed a no-year date by slicing the weekday off `fmtDate`
 * and regexing the year off `fmtDateShort`, which is a fourth date spelling
 * built out of two others. THE YEAR RULE makes the no-year form the formatter's
 * own answer, so the rail calls `fmtDate` like everything else.
 */
/** The document's quiet control — one recipe, spelled once (§6.6). */
/** Pane hide/expand chevron — one recipe, spelled once (§6.6). */
const PANE_BTN =
  "p-2 rounded text-kit-slate-9 hover:text-kit-slate-12 hover:bg-kit-slate-3";

const DOC_BTN =
  "px-3 py-1 rounded border border-kit-slate-5 text-body text-kit-slate-11 hover:text-kit-slate-12";

/**
 * ── THE ONE STATE (Q10 · Loo, 2026-08-05) ─────────────────────────────────
 *
 * **A purchase order is looked at in ONE of two ways, never both**: the RIGHT
 * PANEL to read it, print it and talk to the supplier; the ROW EXPAND to change
 * its lines. Before this card the page held those as two independent stores —
 * `?po=` for the panel and `expandedPo` for the expand — and they drifted the
 * first time an operator used them: the expanded row said `PO-2038` while the
 * panel beside it said `PO-2032`.
 *
 * **There is ONE id and ONE mode, so two different purchase orders cannot be
 * represented at all.** That is the same move Q5 made for "one expand at a
 * time" (a single id, never a Set): a rule that says *keep them in step* is a
 * rule somebody will break; a state that cannot hold two is not.
 *
 * `closed` is the panel's ✕ — the selection survives it, which is why clicking
 * any row brings the panel straight back and no "show" control is needed.
 */
type PoMode = "panel" | "expand" | "closed";
type PoView = { readonly poId: string | null; readonly mode: PoMode };
type PoEvent =
  /** A row was clicked — read this PO. */
  | { readonly type: "open"; readonly id: string }
  /** The row's ⌄ / ⌃ — work on this PO's lines, or stop. */
  | { readonly type: "toggleExpand"; readonly id: string }
  /** The panel's ✕. */
  | { readonly type: "close" };

function nextPoView(cur: PoView, ev: PoEvent): PoView {
  switch (ev.type) {
    case "open":
      return { poId: ev.id, mode: "panel" };
    case "toggleExpand":
      // Expanding a DIFFERENT row moves the selection with it — that is the
      // whole point: the panel can never be left behind on another PO.
      return cur.poId === ev.id && cur.mode === "expand"
        ? { poId: ev.id, mode: "panel" }
        : { poId: ev.id, mode: "expand" };
    case "close":
      return { poId: cur.poId, mode: "closed" };
  }
}

/** The kit takes a Set; the page has ONE id and ONE mode. */
const NO_EXPANSION: ReadonlySet<string> = new Set<string>();

/**
 * THE WORKING AREA'S SIX COLUMNS — one recipe, spelled once (§6.6), so the
 * header, every line and the total row cannot drift apart.
 *
 * **A GRID, not a flex row, and that is Q10 Ⓓ.** `Description` was `flex-1`
 * inside a cell that spans the whole 1208px table, so it took 787px and pushed
 * `Qty`, `Destination` and `Received` past the right edge of a 568px listing.
 * `minmax(0, 1fr)` takes what is LEFT of the five measured tracks and can never
 * take more; the tracks themselves are exact, so no fixed column can be
 * squeezed either. Sum of the fixed tracks + gaps = 384px, which is what the
 * expand needs before `Description` gets its first pixel.
 *
 * **Q11 DID NOT CHANGE THIS LINE, AND THE REASON IS A MEASUREMENT.** "Take what
 * is left" only eats the screen while the record it sits in is as wide as the
 * screen; the record is `w-fit` now (see `PoWorkArea`), so *left over* is the
 * record's own content width and this track resolves to the description's own
 * size. Probed on production with PO-2037 open: swapping this token for
 * `minmax(0,auto)` gives the SAME record width (474px) and the SAME six column
 * origins (277 · 301 · 373 · 471 · 519 · 687) in all three grids — identical,
 * so the token that was already here stays.
 *
 * What the `1fr` still buys is ALIGNMENT: the header, every line and the TOTAL
 * are three separate grids of one width, and a flexible track absorbs the same
 * slack in each, so they cannot fall out of line. A `max-content` track would
 * size each grid to its OWN longest string and stagger them.
 */
const ITEM_GRID =
  "grid grid-cols-[16px_64px_minmax(0,1fr)_40px_160px_64px] gap-2";

export default function OperationPurchaseOrders() {
  const posQ = useOperationPos({ status: "all" });
  const suppliersQ = useOperationSuppliers();
  const warehouseQ = useOperationWarehouse();
  const catalogQ = useCatalog();
  const settingsQ = usePurchasingSettings();
  /* 3.4 · correction work this module OWNS. Open only — closed work is
   * history, and history does not belong above a working register. */
  const purchasingWorkQ = useCorrectionWork({ module: "purchasing", state: "open" });
  const [params, setParams] = useSearchParams();

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<TableSort | null>(null);
  const [colFilters, setColFilters] = useState<Map<string, ReadonlySet<string>>>(
    new Map(),
  );
  const [stateSel, setStateSel] = useState<WorkState | null>(null);
  /**
   * T2 — the CALLS calendar's one selected row, or null = all. A string key
   * (`overdue` · `later` · `day:2026-08-06`) rather than a discriminated
   * object, so equality is `===` and the testid IS the state. Day rows are
   * VIEWS, never actions — a call cannot be made early — so a click only
   * narrows the listing; nothing is pre-ticked or pulled forward.
   */
  const [calSel, setCalSel] = useState<string | null>(null);
  /**
   * HOW this PO is being looked at — see `nextPoView`. WHICH PO it is lives in
   * `?po=`, and there is only ever one of it, so the panel and the expand
   * cannot name two different purchase orders.
   *
   * Jess's 2026-08-02 shell toggle is GONE with this state (Q10 Ⓐ): it lived in
   * the shell's page-meta slot and it was a dead end — `openPo` only wrote the
   * URL, so once the panel was hidden, clicking a row did nothing at all. The
   * close control belongs to the panel it closes (Gmail · GitHub · Linear ·
   * Fiori all put it at the panel's own top-right), and with it there, clicking
   * any row brings the panel back — so no "show" button is needed.
   *
   * ONE PO EXPANDS AT A TIME (Loo's rule 2, §12.7.5) holds for free: `poId` is
   * a single id, so the state cannot represent two open rows.
   */
  const [mode, setMode] = useState<PoMode>("panel");

  const today = todayMYT();
  const pos = useMemo(() => posQ.data?.pos ?? [], [posQ.data]);
  // 0311's registry — the per-line picker's options, off the same read.
  const destinations = useMemo(
    () => posQ.data?.destinations ?? [],
    [posQ.data],
  );
  const messageTemplate = posQ.data?.messageTemplate ?? null;

  const supplierById = useMemo(() => {
    const m = new Map<string, SupplierRow>();
    for (const s of suppliersQ.data?.suppliers ?? []) m.set(s.id, s);
    return m;
  }, [suppliersQ.data]);
  const supplierNameOf = (id: string) => supplierById.get(id)?.name ?? id;

  const warehouseById = useMemo(() => {
    const m = new Map<string, { name: string; address: string | null }>();
    for (const w of warehouseQ.data?.warehouses ?? [])
      m.set(w.id, { name: w.name, address: w.address ?? null });
    return m;
  }, [warehouseQ.data]);

  // Friendly item names — the PoDetailModal/OperationWarehouse pattern:
  // "Carres Cloud · King" instead of the bare SKU code.
  const skuBySku = useMemo(() => {
    const m = new Map<string, ProductSkuDto>();
    for (const s of catalogQ.data?.skus ?? []) m.set(s.sku, s);
    return m;
  }, [catalogQ.data]);
  const modelNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const md of catalogQ.data?.models ?? []) m.set(md.id, md.name);
    return m;
  }, [catalogQ.data]);
  const modelCategoryById = useMemo(() => {
    const m = new Map<string, string>();
    for (const md of catalogQ.data?.models ?? []) m.set(md.id, md.category);
    return m;
  }, [catalogQ.data]);
  const friendlySku = (raw: string): string => {
    const sku = skuBySku.get(raw);
    if (!sku) return raw;
    const model = modelNameById.get(sku.modelId);
    return railItemLabel(model ?? raw, sku.variant);
  };
  /** The Items words (Jess, 2026-08-02): the listing speaks MODEL — To Order's
   *  own `railItemLabel` over the SERVER-resolved name, so a non-catalog SKU
   *  never prints its code. The catalog lookup survives only as the fallback
   *  for an older Worker that has not sent `model_name` yet. */
  const lineLabel = (
    l: operationPoListRow["purchase_order_lines"][number],
  ): string =>
    l.model_name
      ? railItemLabel(l.model_name, l.size ?? null)
      : friendlySku(l.sku);
  /** `×N` only when N says something — `Cody Q`, `Sonic K ×3`, never `×1`
   *  (Jess, 2026-08-02: a marker on every row is noise, not information). */
  const lineText = (
    l: operationPoListRow["purchase_order_lines"][number],
  ): string => (l.qty >= 2 ? `${lineLabel(l)} ×${l.qty}` : lineLabel(l));
  /** `Cody Q · +2` — identify the PO without opening it. */
  const itemsPreviewOf = (po: operationPoListRow): string => {
    const ls = po.purchase_order_lines;
    if (ls.length === 0) return "—";
    const head = lineText(ls[0]);
    return ls.length > 1 ? `${head} · +${ls.length - 1}` : head;
  };
  const itemsTitleOf = (po: operationPoListRow): string =>
    po.purchase_order_lines.map(lineText).join("\n");

  /**
   * WHERE THE GOODS GO, for the whole PO (Q7 · Loo, 2026-08-04): *"没有
   * Destination，Operator 根本不知道这张 PO 是特殊单."*
   *
   * A line with no destination of its own follows the PO's (0311's rule, the
   * same one the expand's picker reads), and a PO with no destination follows
   * its warehouse — so the register can never print a blank for a fact every
   * PO has. **The names are the SAVED ones**, never re-spelt: COPY-STANDARD
   * locks `Carres Klang` · `AL Sungai Buloh` · `HOUZS` and warns by name
   * against shortening `AL Sungai Buloh` to `AL`.
   *
   * The PO's own destination LEADS when the lines disagree — the row is one
   * value for one document (§12.7.5's ROW test) and the per-line truth is the
   * expand's, which is why this is a FLAG and not a duplicated field.
   */
  const destNamesOf = (po: operationPoListRow): string[] => {
    const nameOf = (id: string | null | undefined): string | null =>
      id == null ? null : (destinations.find((d) => d.id === id)?.name ?? null);
    const fallback =
      nameOf(po.destination_id) ??
      warehouseById.get(po.warehouse_id)?.name ??
      null;
    const seen: string[] = [];
    const add = (n: string | null) => {
      if (n != null && !seen.includes(n)) seen.push(n);
    };
    add(fallback);
    for (const l of po.purchase_order_lines)
      add(nameOf(l.destination_id) ?? fallback);
    return seen;
  };
  /** `Carres Klang +1` — the portal's existing pattern. `Multiple (2)` is
   *  refused by name (Q7's Must-NOT): it names no destination at all. */
  const destTextOf = (po: operationPoListRow): string => {
    const names = destNamesOf(po);
    if (names.length === 0) return "—";
    return names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0];
  };

  /** The sales orders this PO was built from — `SO-1206 +4` when there are
   *  several (Loo: *"Operator 经常需要知道这张 PO 是哪几个 Sales Order
   *  组成的"*). The full list rides the cell's own title. */
  const soTextOf = (po: operationPoListRow): string => {
    const refs = soRefsOf(po);
    if (refs.length === 0) return "—";
    const head = `SO-${refs[0]}`;
    return refs.length > 1 ? `${head} +${refs.length - 1}` : head;
  };

  const holidays = useMemo(() => myHolidaySet(), []);

  /**
   * The listing's ONE arrival answer per PO — **the date, and who said it.**
   *
   * `confirmed` USED TO BE `po.eta_date != null` and that was a lie from
   * 2026-08-03, the day the To Order issue path began stamping our own estimate
   * into `eta_date`. It is now a question about the promise ledger — *has a
   * supplier ever named an arrival for this PO* — which is the only place an
   * answer to it has ever lived. `poDateHistoryOf` is the one reader of that
   * ledger, and it keeps the ready-date run separate, so the factory saying
   * *"it will be FINISHED on the 12th"* can never be printed as *"it will
   * ARRIVE on the 14th, and they told us so."*
   *
   * The DATE shown is still `eta_date`: 0306 moves it on every `delayed`
   * answer, so once a supplier has spoken the stored date IS their current
   * word. Only when there is no stored date at all does the register fall back
   * to the estimate — 16 of the live 24 POs, all issued before the birth stamp
   * existed — and it computes it with `expectedArrivalOf`, the SAME function
   * the issue path stamps with. This page used to spell that arithmetic itself
   * and forget the transit leg (Loo, 2026-08-05).
   *
   * No production or transit number → no date at all, never a silent 7 (P1).
   */
  const etaByPo = useMemo(() => {
    const m = new Map<string, { date: string | null; confirmed: boolean }>();
    const settings = settingsQ.data;
    for (const po of pos) {
      const supplierDate = poDateHistoryOf(po.promises).currentDate;
      if (po.eta_date || supplierDate) {
        m.set(po.id, {
          date: po.eta_date ?? supplierDate,
          confirmed: supplierDate != null,
        });
        continue;
      }
      const line = po.purchase_order_lines[0];
      const modelId = line ? skuBySku.get(line.sku)?.modelId : undefined;
      m.set(po.id, {
        date: settings
          ? expectedArrivalOf(settings, {
              supplierId: po.supplier_id,
              category: modelId ? modelCategoryById.get(modelId) : undefined,
              fromIso: po.placed_at,
              holidays,
            })
          : null,
        confirmed: false,
      });
    }
    return m;
  }, [pos, skuBySku, modelCategoryById, settingsQ.data, holidays]);
  const etaOf = (po: operationPoListRow) =>
    etaByPo.get(po.id) ?? { date: po.eta_date, confirmed: false };

  /**
   * The `confirm_ready_date` facts (Slice 1, Loo 2026-08-06) — the engine's
   * OPT-IN: without them it asks no ready-date question, so this page is the
   * one place the call can open (Receiving's own mapping never carries them).
   * Held back until Settings loads — a call whose due cannot be computed yet
   * would flicker in dueless and then grow a clock.
   */
  const readyFactsOf = (po: operationPoListRow) => {
    const settings = settingsQ.data;
    if (!settings) return {};
    const line = po.purchase_order_lines[0];
    const modelId = line ? skuBySku.get(line.sku)?.modelId : undefined;
    const category = modelId ? modelCategoryById.get(modelId) ?? null : null;
    return {
      expectedReadyDateIso: po.expected_ready_date ?? null,
      customerDeliveryIso: po.customer_delivery ?? null,
      readyDateDue: {
        productionWorkingDays: productionWorkingDaysFor(settings, po.supplier_id, category),
        factoryOffDays: workWeekOffDaysFor(settings, po.supplier_id),
        bufferDays: settings.orderByBufferDays,
      },
    };
  };

  /** The engine's open calls per PO — the ONLY urgency source on this page. */
  const callsByPo = useMemo(() => {
    const m = new Map<string, PurchasingOpenCall[]>();
    for (const po of pos) {
      m.set(
        po.id,
        purchasingSupplierCallsOf(
          { ...callPoOf(po), ...readyFactsOf(po) },
          { todayIso: today },
        ),
      );
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, today, settingsQ.data, skuBySku, modelCategoryById]);

  const callsOf = (po: operationPoListRow) => callsByPo.get(po.id) ?? [];

  // ── The ONE Current Action per PO (shared `poCurrentActionOf`, Law 7):
  //    engine call first, state word only when the engine is quiet. The
  //    header's hero and this column read the SAME map — they cannot drift.
  const actionByPo = useMemo(() => {
    const m = new Map<string, PoCurrentAction | null>();
    for (const po of pos) {
      m.set(
        po.id,
        poCurrentActionOf(
          { ...callPoOf(po), ...readyFactsOf(po) },
          { todayIso: today },
        ),
      );
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, today, settingsQ.data, skuBySku, modelCategoryById]);
  const actionOf = (po: operationPoListRow) => actionByPo.get(po.id) ?? null;
  const actionKeyOf = (a: PoCurrentAction | null): string =>
    a == null ? F_NONE : a.kind === "call" ? a.call.key : a.key;
  // The register's short spelling (Jess: 19 identical seven-word rows are
  // wallpaper) — the workspace hero keeps the full wording.
  const actionListWordOf = (a: PoCurrentAction): string =>
    a.kind === "call"
      ? purchasingActionQueue(a.call.key)
      : PO_STATE_ACTION_SHORT[a.key];

  // ── RISK ORDER (Loo, 2026-08-04) — the register's default. Built from the
  //    facts the row already prints: the engine's calls, the work state, the
  //    customer's date and the SAME arrival the `Expected Arrival` cell shows,
  //    so a row's position and its own cells can never tell two stories. The
  //    comparator itself is `comparePoRisk` in packages/shared — a page-local
  //    one would be a second priority (Law 7's shape, applied to sorting).
  const riskByPo = useMemo(() => {
    const m = new Map<string, PoRiskRow>();
    for (const po of pos) {
      m.set(po.id, {
        poId: po.id,
        state: workStateOf(po, today),
        calls: callsByPo.get(po.id) ?? [],
        customerDeliveryIso: po.customer_delivery ?? null,
        arrivalIso: etaByPo.get(po.id)?.date ?? po.eta_date,
        placedAtIso: po.placed_at ?? null,
      });
    }
    return m;
  }, [pos, today, callsByPo, etaByPo]);

  // ── The pipeline: search → rail (calls × work status) → column filters →
  //    sort. Every rail count is computed with the OTHER dimensions applied,
  //    so a visible number always matches the rows its click produces. ─────

  // Cross-field find (Jess, 2026-08-02): PO No. · Supplier · SKU · Model ·
  // Sales Order No. · Customer. The column ▼ is the precise narrow; this box
  // is "which PO carries it" — two different jobs, both stay.
  const searched = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (s === "") return pos;
    return pos.filter(
      (p) =>
        p.id.toLowerCase().includes(s) ||
        supplierNameOf(p.supplier_id).toLowerCase().includes(s) ||
        soRefsOf(p).some((n) => `so-${n}`.includes(s)) ||
        (p.orders ?? []).some((o) =>
          o.customer_name.toLowerCase().includes(s),
        ) ||
        p.purchase_order_lines.some(
          (l) =>
            l.sku.toLowerCase().includes(s) ||
            (l.model_name ?? "").toLowerCase().includes(s) ||
            lineLabel(l).toLowerCase().includes(s),
        ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, search, supplierById, skuBySku, modelNameById]);

  const passesState = (p: operationPoListRow, sel: WorkState | null) =>
    sel === null || workStateOf(p, today) === sel;

  /**
   * T2 — the CALLS calendar's five day columns, and each open call's row key.
   * `purchasingCallCalendarDays` is the engine's own window (today + four more
   * OFFICE working days, weekends and `myHolidaySet()` public holidays both
   * skipped), so the rail and the engine cannot disagree about which day a
   * due belongs to. A dueless call keys to null — it has no day and can never
   * be late (P1/T7), so it shows in the unfiltered listing only.
   */
  const calDays = useMemo(
    () => purchasingCallCalendarDays({ todayIso: today }),
    [today],
  );
  const calKeyOf = (c: PurchasingOpenCall): string | null => {
    const b = callCalendarBucketOf(c, calDays, today);
    if (!b) return null;
    return b.kind === "day" ? `day:${b.dayIso}` : b.kind;
  };

  /** A calendar row filters to the POs carrying an open call on it. */
  const passesCal = (p: operationPoListRow, sel: string | null) =>
    sel === null || callsOf(p).some((c) => calKeyOf(c) === sel);

  function passesCol(
    po: operationPoListRow,
    colKey: string,
    sel: ReadonlySet<string>,
  ): boolean {
    if (sel.size === 0) return true;
    switch (colKey) {
      case "supplier":
        return sel.has(po.supplier_id);
      case "po":
        return sel.has(po.id);
      case "items":
        return po.purchase_order_lines.some((l) => sel.has(lineLabel(l)));
      case "sono": {
        const refs = soRefsOf(po);
        if (refs.length === 0) return sel.has(F_NONE);
        return refs.some((n) => sel.has(`SO-${n}`));
      }
      case "dest":
        return destNamesOf(po).some((n) => sel.has(n));
      case "issued":
        return [...sel].some((v) =>
          dateFilterMatches((po.placed_at ?? "").slice(0, 10) || null, v, today),
        );
      case "custdel":
        return [...sel].some((v) =>
          dateFilterMatches(po.customer_delivery ?? null, v, today),
        );
      case "arriving":
        return [...sel].some((v) => dateFilterMatches(etaOf(po).date, v, today));
      case "action":
        return sel.has(actionKeyOf(actionOf(po)));
      default:
        return true;
    }
  }
  const passesAllCols = (p: operationPoListRow, except: string | null = null) =>
    [...colFilters.entries()].every(
      ([k, sel]) => k === except || passesCol(p, k, sel),
    );

  const rows = useMemo(() => {
    const base = searched.filter(
      (p) => passesState(p, stateSel) && passesCal(p, calSel) && passesAllCols(p),
    );
    const sorted = [...base];
    if (sort) {
      const dir = sort.dir === "asc" ? 1 : -1;
      const val = (p: operationPoListRow): string => {
        switch (sort.key) {
          case "issued":
            return (p.placed_at ?? "").slice(0, 10);
          case "custdel":
            return p.customer_delivery ?? "9999-12-31";
          case "po":
            return p.id;
          case "supplier":
            return supplierNameOf(p.supplier_id);
          case "items":
            return itemsPreviewOf(p);
          case "arriving":
            return etaOf(p).date ?? "9999-12-31";
          case "sono": {
            const refs = soRefsOf(p);
            return refs.length === 0
              ? "zzz"
              : String(refs[0]).padStart(9, "0");
          }
          case "dest":
            return destTextOf(p);
          case "action": {
            const a = actionOf(p);
            return a ? actionListWordOf(a) : "zzz";
          }
          default:
            return "";
        }
      };
      sorted.sort((a, b) => dir * val(a).localeCompare(val(b)));
    } else {
      // The Register's default order: RISK TO THE CUSTOMER'S PROMISE (Loo,
      // 2026-08-04). It replaces `PO Issued` oldest first as the DEFAULT and
      // settles a conflict between two laws that both said something true —
      // `PO Issued` keeps its column and its header sort, and survives inside
      // `comparePoRisk` as the tie-breaker. Clearing a header sort returns
      // here, which is why this is the `else` branch and not a preset sort.
      sorted.sort((a, b) => {
        const ra = riskByPo.get(a.id);
        const rb = riskByPo.get(b.id);
        if (!ra || !rb) return a.id.localeCompare(b.id);
        return comparePoRisk(ra, rb);
      });
    }
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searched, stateSel, calSel, colFilters, sort, callsByPo, riskByPo, supplierById]);

  const stateCounts = useMemo(() => {
    const m = new Map<WorkState, number>();
    for (const s of WORK_STATES) m.set(s, 0);
    for (const p of searched) {
      if (!passesAllCols(p) || !passesCal(p, calSel)) continue;
      const st = workStateOf(p, today);
      m.set(st, (m.get(st) ?? 0) + 1);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searched, colFilters, callsByPo, calSel]);

  /**
   * T2 — the CALLS calendar's counts: supplier CALLS due per row, from the
   * engine's own dues (the balance call counts per PO LINE, exactly as the
   * engine returns it). Computed with the OTHER dimensions applied, so a
   * visible number always matches its click.
   */
  const callCalendar = useMemo(() => {
    const all: PurchasingOpenCall[] = [];
    for (const p of searched) {
      if (!passesAllCols(p) || !passesState(p, stateSel)) continue;
      all.push(...callsOf(p));
    }
    return purchasingCallCalendarOf(all, { todayIso: today });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searched, colFilters, callsByPo, stateSel]);

  // ── Selection: ?po= is the one source; first row auto-selects. ──────────

  const selectedId = params.get("po");
  const selected = useMemo(
    () => pos.find((p) => p.id === selectedId) ?? null,
    [pos, selectedId],
  );
  // The per-unit Item IDs left the Reference Layer (Jess, 2026-08-02): they
  // answer "what does the WAREHOUSE receive", not "what is this PO" — they
  // belong to the Receiving/GRN workspace. GET /:id/units stays for it.
  useEffect(() => {
    if (selected || posQ.isLoading || rows.length === 0) return;
    setParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.set("po", rows[0].id);
        return n;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, posQ.isLoading, rows]);

  /**
   * The ONE reducer both surfaces go through. `poId` is written to the URL and
   * `mode` to state, but they are decided TOGETHER by `nextPoView`, so there is
   * no path that moves one without the other.
   */
  const view: PoView = { poId: selectedId, mode };
  const dispatch = (ev: PoEvent) => {
    const next = nextPoView(view, ev);
    setMode(next.mode);
    if (next.poId != null && next.poId !== view.poId)
      setParams((prev) => {
        const n = new URLSearchParams(prev);
        n.set("po", next.poId as string);
        return n;
      });
  };

  const setColFilter = (key: string) => (next: ReadonlySet<string>) =>
    setColFilters((prev) => {
      const n = new Map(prev);
      if (next.size === 0) n.delete(key);
      else n.set(key, next);
      return n;
    });

  const filterFor = (
    key: string,
    options: ColumnFilter["options"],
    opts: { searchable?: boolean; range?: boolean } = {},
  ): ColumnFilter => {
    const selected = colFilters.get(key) ?? new Set<string>();
    const current = [...selected].find((v) => v.startsWith("r:")) ?? null;
    const [, curFrom, curTo] = current?.split(":") ?? [];
    return {
      options,
      selected,
      onChange: setColFilter(key),
      label: `Filter ${key}`,
      clearLabel: "Clear",
      ...(opts.searchable ? { searchPlaceholder: "Search" } : {}),
      ...(opts.range
        ? {
            range: {
              label: "Custom Date Range…",
              applyLabel: "Apply",
              from: curFrom ?? null,
              to: curTo ?? null,
              // ONE range at a time (Excel's own behaviour): a new pair
              // replaces the old pair, presets already ticked stay.
              onApply: (from: string, to: string) => {
                const next = new Set(
                  [...selected].filter((v) => !v.startsWith("r:")),
                );
                next.add(rangeValue(from, to));
                setColFilter(key)(next);
              },
            },
          }
        : {}),
    };
  };

  const supplierOptions = useMemo(() => {
    const ids = [
      ...new Set(
        searched
          .filter((p) => passesAllCols(p, "supplier"))
          .map((p) => p.supplier_id),
      ),
    ];
    return ids
      .map((id) => ({ value: id, label: supplierNameOf(id) }))
      .sort((a, b) => a.label.localeCompare(b.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searched, colFilters, supplierById]);

  /** Excel's date ▼ vocabulary — presets, then the months the data holds. */
  const dateOptionsFor = (
    colKey: string,
    getter: (p: operationPoListRow) => string | null,
  ): { value: string; label: string }[] => {
    const base = searched.filter((p) => passesAllCols(p, colKey));
    const opts: { value: string; label: string }[] = datePresetOptions();
    const months = [
      ...new Set(
        base
          .map(getter)
          .filter(Boolean)
          .map((d) => (d as string).slice(0, 7)),
      ),
    ]
      .sort()
      .reverse();
    for (const ym of months) opts.push({ value: `m:${ym}`, label: monthLabel(ym) });
    if (base.some((p) => getter(p) == null))
      opts.push({ value: F_NONE, label: "—" });
    return opts;
  };
  const issuedOptions = useMemo(
    () => dateOptionsFor("issued", (p) => (p.placed_at ?? "").slice(0, 10) || null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searched, colFilters],
  );
  const custdelOptions = useMemo(
    () => dateOptionsFor("custdel", (p) => p.customer_delivery ?? null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searched, colFilters],
  );
  const arrivingOptions = useMemo(
    () => dateOptionsFor("arriving", (p) => etaOf(p).date),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searched, colFilters],
  );

  // Every column carries its ▼ (Jess's Purchasing law, 2026-08-02 — the
  // AutoCount reflex: each column filters by its own values). These three
  // list the DISTINCT cell values the current view holds, nothing invented.
  const poOptions = useMemo(() => {
    const ids = [
      ...new Set(searched.filter((p) => passesAllCols(p, "po")).map((p) => p.id)),
    ].sort();
    return ids.map((id) => ({ value: id, label: id }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searched, colFilters]);
  const itemsOptions = useMemo(() => {
    const labels = new Set<string>();
    for (const p of searched.filter((r) => passesAllCols(r, "items")))
      for (const l of p.purchase_order_lines) labels.add(lineLabel(l));
    return [...labels].sort().map((v) => ({ value: v, label: v }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searched, colFilters, skuBySku, modelNameById]);
  /** Q7 — the two new columns take the same ▼ every other column carries
   *  (Jess's Purchasing law, 2026-08-02). Both list the DISTINCT values the
   *  current view holds, nothing invented. */
  const soOptions = useMemo(() => {
    const refs = new Set<number>();
    let none = false;
    for (const p of searched.filter((r) => passesAllCols(r, "sono"))) {
      const rs = soRefsOf(p);
      if (rs.length === 0) none = true;
      for (const n of rs) refs.add(n);
    }
    const opts = [...refs]
      .sort((a, b) => a - b)
      .map((n) => ({ value: `SO-${n}`, label: `SO-${n}` }));
    if (none) opts.push({ value: F_NONE, label: "—" });
    return opts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searched, colFilters]);
  const destOptions = useMemo(() => {
    const names = new Set<string>();
    for (const p of searched.filter((r) => passesAllCols(r, "dest")))
      for (const n of destNamesOf(p)) names.add(n);
    return [...names].sort().map((v) => ({ value: v, label: v }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searched, colFilters, destinations, warehouseById]);

  const actionOptions = useMemo(() => {
    const base = searched.filter((p) => passesAllCols(p, "action"));
    const byKey = new Map<string, string>();
    let none = false;
    for (const p of base) {
      const a = actionOf(p);
      if (a) byKey.set(actionKeyOf(a), actionListWordOf(a));
      else none = true;
    }
    const opts = [...byKey.entries()]
      .sort((x, y) => x[1].localeCompare(y[1]))
      .map(([value, label]) => ({ value, label }));
    if (none) opts.push({ value: F_NONE, label: "—" });
    return opts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searched, colFilters, actionByPo]);

  // ── The listing — ONE fixed set of NINE, every width a MEASURED minimum ──
  //
  // Loo's frozen order (2026-08-04 · Q7):
  //   PO Issued · Supplier · PO No. · SO No. · Items · Destination ·
  //   Customer Delivery · Expected Arrival · Current Action
  //
  // Every width below is MEASURED in a real browser against the app's own
  // stylesheet (13px Inter, the DataTable cell's `px-2` = 16px, header = the
  // word + 2 + the ▼'s 24 + 16).
  //
  // **SINCE P20.1 THEY ARE EXACT, NOT MINIMUMS.** `sizing="content"` gives a
  // column what its def asks for and NOTHING more, and the slack goes to the
  // kit's filler — so a width here is what renders on a 1280 laptop and on a
  // 1920 monitor alike. Before it, the absent prop meant `"fill"`, which spends
  // a declared pixel as a SHARE: measured at 900px the nine declared 1,171 and
  // rendered 1,201, so no column was the width its own comment states.
  // **Do not re-derive one by guessing** — jsdom has no widths, so no page test
  // can catch a clipped cell; only the browser can.
  const columns: readonly Column<operationPoListRow>[] = [
    {
      key: "issued",
      // `PO Issued`, never `Created` (Jess, 2026-08-02): the official date
      // the supplier receives the PO — it starts the lead time, it is the
      // date on the PDF, and operators say "the PO we issued last week",
      // never "the record we created". A system Created date, if ever
      // wanted, belongs in the workspace's details block, not here.
      label: "PO Issued",
      width: "96px",
      sortable: true,
      filter: filterFor("issued", issuedOptions, { range: true }),
      cell: (p) => (
        <span className="tabular-nums">
          {fmtDateShort((p.placed_at ?? "").slice(0, 10))}
        </span>
      ),
    },
    {
      key: "supplier",
      label: "Supplier",
      // Measured, not guessed: the widest supplier name needs 87px
      // (`Nice Future`, 70.7 + the cell's own 16) — and 88 once the column
      // carries P17's separator, which takes 1px of the BOX rather than of
      // the content. Widened by Loo, 2026-08-05 (card Q13), from P17's own
      // reported cost: at 87 the live page clipped `Nice Future` by exactly
      // 1px on 4 rows, with `text-overflow: clip`, so no ellipsis said so.
      // **A frozen width that truncates is not the frozen intent** — Q7 froze
      // these numbers so that nothing truncates, and 87 stopped delivering
      // that the day the rule landed.
      width: "88px",
      sortable: true,
      filter: filterFor("supplier", supplierOptions, { searchable: true }),
      cell: (p) => supplierNameOf(p.supplier_id),
    },
    {
      key: "po",
      label: "PO No.",
      width: "83px",
      sortable: true,
      filter: filterFor("po", poOptions, { searchable: true }),
      cell: (p) => {
        const calls = callsOf(p);
        const late = calls.some((c) => c.late);
        return (
          <span className="flex items-center gap-1.5">
            {p.id === selectedId && (
              <span
                aria-hidden
                className="w-0.5 h-4 bg-kit-blue-9 shrink-0"
              />
            )}
            {calls.length > 0 && (
              <span
                aria-hidden
                data-testid={late ? "po-dot-late" : "po-dot-open"}
                className={[
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  late ? "bg-kit-red-9" : "bg-kit-amber-11",
                ].join(" ")}
              />
            )}
            <span
              className={
                p.id === selectedId
                  ? "font-mono font-semibold text-kit-blue-11"
                  : "font-mono"
              }
            >
              {p.id}
            </span>
          </span>
        );
      },
    },
    {
      key: "sono",
      // `SO No.` (Loo, 2026-08-04): *"PO 是从 SO 来的，Operator 经常需要知道
      // 这张 PO 是哪几个 Sales Order 组成的."* The data has been on the wire
      // since the register shipped (`so` + `so_refs`) and no column read it.
      label: "SO No.",
      // 94 → 95, Loo 2026-08-05 (card Q13 follow-up), the same ruling that
      // took `supplier` to 88: P17's separator takes 1px of the BOX, so 94
      // left `SO-1206 +4` 77px of content for 78px of ink and clipped it on
      // 2 live rows with no ellipsis. **A frozen width that truncates is not
      // the frozen intent.**
      width: "95px",
      sortable: true,
      filter: filterFor("sono", soOptions, { searchable: true }),
      cell: (p) => {
        const refs = soRefsOf(p);
        if (refs.length === 0) return <span className="text-kit-slate-9">—</span>;
        return (
          <span
            className="block truncate font-mono"
            title={refs.map((n) => `SO-${n}`).join("\n")}
          >
            {soTextOf(p)}
          </span>
        );
      },
    },
    {
      key: "items",
      label: "Items",
      // Q7 — Items stops being the `auto` tail: there is no tail any more.
      // Every one of the nine is a MEASURED minimum and the region scrolls
      // when they do not fit, because deleting business information to avoid
      // a scrollbar is exactly what Loo forbade. `Booqit 1B(…)` still
      // truncates first among the word columns, which was Q1's argument and
      // survives it.
      //
      // 135 → 136, Loo 2026-08-05 (card Q13 follow-up), the same ruling that
      // took `supplier` to 88 and `sono` to 95: P17's separator takes 1px of
      // the BOX, so 135 left `Booqit 2B(LHF) · +1` 118px of content for 119px
      // of ink. **The column still truncates on a long enough item list — it
      // always did, and it has a `title` — but it may not lose its last pixel
      // to a border.**
      width: "136px",
      sortable: true,
      filter: filterFor("items", itemsOptions, { searchable: true }),
      cell: (p) => (
        <span className="block truncate" title={itemsTitleOf(p)}>
          {itemsPreviewOf(p)}
        </span>
      ),
    },
    {
      key: "dest",
      // `Destination` (Loo, 2026-08-04): *"没有 Destination，Operator 根本不
      // 知道这张 PO 是特殊单."* The ROW prints ONE value for the document — a
      // FLAG — and the expand carries the per-LINE value the row structurally
      // cannot hold. A flag and a field are not the same fact (§12.7.5's
      // rule 1), which is why this is not the duplication that rule bans.
      label: "Destination",
      headerTitle:
        "Where the supplier sends the goods — a PO whose lines split shows the first and how many more",
      width: "135px",
      sortable: true,
      filter: filterFor("dest", destOptions, { searchable: true }),
      cell: (p) => {
        const names = destNamesOf(p);
        if (names.length === 0) return <span className="text-kit-slate-9">—</span>;
        return (
          <span className="block truncate" title={names.join("\n")}>
            {destTextOf(p)}
          </span>
        );
      },
    },
    {
      key: "custdel",
      label: "Customer Delivery",
      // A merged PO carries several customers' dates; until P5's allocation
      // splits them, this column is the EARLIEST — and says so (Jess,
      // 2026-08-02: never let staff read it as the whole PO's only date).
      headerTitle:
        "Earliest customer delivery across this PO's sales orders — a merged PO carries more than one",
      width: "140px",
      sortable: true,
      filter: filterFor("custdel", custdelOptions, { range: true }),
      cell: (p) => {
        const d = p.customer_delivery ?? null;
        if (!d) return <span className="text-kit-slate-9">—</span>;
        const st = workStateOf(p, today);
        const late =
          d < today && st !== "completed" && st !== "cancelled";
        return (
          <span className={late ? "text-kit-red-11 tabular-nums" : "tabular-nums"}>
            {fmtDateShort(d)}
          </span>
        );
      },
    },
    {
      key: "arriving",
      // `Expected Arrival` — §12.2 ②, the portal-wide date dictionary Loo
      // froze on 2026-08-04. The old spelling is RETIRED because it named no
      // destination: *arrival of what, where?* This word and `Customer
      // Delivery` work as a pair precisely because each names its own end —
      // arrival at OUR warehouse against delivery to THEIR house.
      //
      // Q5 put the new word in the expand two rows below and this column kept
      // the old one, so one fact was spelt two ways on one screen. The other
      // two pages still carrying it (Receiving, and `Stock` / `Stock ETA` on
      // the Orders list) are OTHER LANES and each sweeps its own screens.
      label: "Expected Arrival",
      // Wider than a bare date: the gap tail rides here, and a truncated
      // warning is worse than no warning. MEASURED against the worst line the
      // cell can hold — `25 Aug 26  8d late (revised)` — never estimated.
      width: "206px",
      sortable: true,
      filter: filterFor("arriving", arrivingOptions, { range: true }),
      cell: (p) => {
        const eta = etaOf(p);
        if (!eta.date) return <span className="text-kit-slate-9">—</span>;
        const late = callsOf(p).some((c) => c.late);
        const st = workStateOf(p, today);
        // The subtraction the operator used to do in their head. Closed and
        // cancelled POs stay silent — their gap is history, not work.
        const gap =
          st === "completed" || st === "cancelled"
            ? null
            : poArrivalGapOf(p.customer_delivery ?? null, eta.date);
        return (
          <span
            className={[
              "tabular-nums",
              late
                ? "text-kit-red-11"
                : eta.confirmed
                  ? "text-kit-slate-12"
                  : "text-kit-slate-9",
            ].join(" ")}
            title={eta.confirmed ? undefined : "Expected — supplier has not confirmed"}
          >
            {fmtDateShort(eta.date)}
            {gap && (
              /* WHO SAID THE DATE decides the tone (Loo, 2026-08-04). Ten of
                 the live 21 rows print a gap warning and EIGHT of those ten
                 are computed from OUR OWN estimate — the factory has said
                 nothing. A guess and a fact were painted the same red, and
                 they need opposite next actions: one is a phone call to make,
                 the other is a promise already broken. No new word and no new
                 label — the date's own tooltip already says which is which;
                 the colour now says it too. `same day` stays amber either
                 way: it is tight, not broken. */
              <span
                data-testid="po-arrival-gap"
                data-tone={
                  gap.tone === "late" && eta.confirmed ? "confirmed" : "estimate"
                }
                className={
                  gap.tone === "late" && eta.confirmed
                    ? " text-kit-red-11"
                    : " text-kit-amber-11"
                }
                title={
                  gap.tone === "late"
                    ? "The goods land after the date promised to the customer"
                    : "The goods land on the customer's own date — no day to spare"
                }
              >
                {"  "}
                {gap.label}
              </span>
            )}
            {p.eta_revised && (
              /* 2990s' own marker: the date shown is not the first date the
                 supplier named — the history lives in the promise ledger. */
              <span className="text-kit-slate-9"> (revised)</span>
            )}
          </span>
        );
      },
    },
    // `Received` LEFT the register (Q7 · Loo, 2026-08-04): it is not one of
    // his nine, and `Received At` — the fact the operator actually asks for —
    // lives in the expand beside the line it belongs to. Nothing visible is
    // lost today: 0 of 21 POs have ever received anything.
    {
      key: "action",
      label: "Current Action",
      // MEASURED in a real browser against the app's own stylesheet, 13px
      // Inter + the DataTable cell's `px-2` (16px total): `Check Expected
      // Arrival` 160 · `Confirm what happens next` 186 · `Confirm tomorrow's
      // delivery` 191 · `Confirm balance delivery date` 201. 192px carries
      // every one of them but the last, which keeps its own `title`.
      //
      // Q8 (Loo, 2026-08-04) took FOUR words out of this list and the width
      // did not move, which is why that card changed no layout: the three it
      // deleted were the SHORT ones (`Confirm Arrival` 109 · `Open Receiving`
      // 113 · `Contact Supplier` 119 · `Waiting for Goods` 126), and his own
      // replacement is 160 — longer than all four, still 32px inside the
      // column, and still shorter than the string that SETS the width.
      //
      // It was `auto` and it was the ONLY column being squeezed: measured
      // 23px at a 1280 viewport, 109 at 1366, 183 at 1440 — so on an ordinary
      // business laptop three of the seven words were cut, with
      // `text-overflow: clip`, so not even an ellipsis said so.
      //
      // Q7 moves it 200 → 192, and that is not a shave: 192 is the MEASURED
      // minimum of the longest word that fits (`Confirm tomorrow's delivery`
      // = 175.4 + the cell's 16 = 192 exactly). The one 201px string,
      // `Confirm balance delivery date`, was already the exception Q1 named
      // and it still keeps its own `title`.
      //
      // P20.1 · 192 → 193, and it is Q13's pixel arriving at the LAST column.
      // P17 draws a column's rule on its RIGHT and skips the last one, because
      // the last column's right edge is the wrapper's own border — but under
      // `sizing="content"` a FILLER follows every column, so the last real
      // column now rules its own edge like the other eight (kit `columnRule`:
      // `fills || ci < length - 1`). That rule takes 1px of the BOX, not of the
      // content, which is exactly the defect Q13 measured on `supplier`,
      // `sono` and `items`: re-measured in a browser against the app's own
      // stylesheet, `Confirm tomorrow's delivery` is 175.44 + the cell's 16 +
      // the rule's 1 = 192.44, so 192 clips it by half a pixel with
      // `text-overflow: clip` and nothing on screen says so.
      // **A frozen width that truncates is not the frozen intent.**
      width: "193px",
      sortable: true,
      filter: filterFor("action", actionOptions),
      cell: (p) => {
        const a = actionOf(p);
        // `—` is a real answer, not a gap (§12.3): a PO whose goods are on
        // their way, or already checked in, has nothing for a person to DO
        // here — the rail carries the status and Receiving carries the door.
        if (!a) return <span className="text-kit-slate-9">—</span>;
        const late = a.kind === "call" && a.call.late;
        const word = actionListWordOf(a);
        return (
          <span
            title={word}
            className={late ? "text-kit-red-11" : "text-kit-slate-12"}
          >
            {word}
          </span>
        );
      },
    },
  ];

  /**
   * THERE IS NO COMPACT SET, AND THAT IS THE RULING (Loo, 2026-08-04 · Q7).
   *
   * Gmail's reading-pane recipe used to swap the register down to five
   * columns whenever the workspace was open, with an HONESTY GUARD holding a
   * filtered or sorted column visible. Both are gone. His words: *"Operator
   * 的眼睛会一直重新学习页面，Information Hierarchy 每开一次 Detail 就改变，
   * 这是 ERP 不应该发生的."*
   *
   * The guard disappeared WITH the feature rather than being deleted — a
   * column that can never hide cannot be hidden while it is filtered. This is
   * the ruling most likely to be quietly re-introduced under another name, so
   * `the column set never changes` is asserted by its own test.
   */
  const visibleColumns = columns;

  /** The kit takes a Set; the page keeps ONE id and ONE mode. */
  const expandedRows = useMemo(
    () =>
      view.mode === "expand" && view.poId ? new Set([view.poId]) : NO_EXPANSION,
    [view.mode, view.poId],
  );

  const filtered = colFilters.size > 0 || stateSel !== null || calSel !== null;
  const clearAll = () => {
    setColFilters(new Map());
    setStateSel(null);
    setCalSel(null);
  };

  return (
    <div
      /* SURFACE LAW (Jess, 2026-08-02): the kit-canvas token — grey is
       * chrome, every working surface below is white. Runs here first,
       * flows back portal-wide after her live review. */
      className="h-full min-h-0 flex flex-col bg-kit-canvas"
      data-testid="purchase-orders-workspace"
    >
      {/* SHELL LAW (Loo, 2026-08-02 — PR 560/561, "壳画头"): the shell
          draws the header, pages never do. PurchasingTabs IS the whole 44px
          row (module word · tabs · global icons); this page draws no
          breadcrumb, no title, no icons of its own. */}
      <PurchasingTabs
        right={
          <div className="flex items-center gap-2">
            {/* Gmail's answer to "search with no height": it lives in the
                HEADER. Cross-field find: PO / Supplier / SKU / Model / SO /
                Customer. */}
            <div className="w-56">
              <SearchInput
                id="po-search"
                placeholder="Search"
                pill
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {/* The pane toggle LEFT this slot (Q10 Ⓐ): closing the panel is
                the PANEL's control, and it now lives at the panel's own
                top-right. No master grows arrows on its panels. */}
          </div>
        }
      />

      {/* ── STAGE 3 · card 3.4 — what a sales order change started HERE.
           This page is FROZEN (Jess, 2026-08-03: stop polishing), so this is
           purely additive and INVISIBLE until there is work: no rail group, no
           column, nothing moved in the register. A shared PO whose sales order
           changed is the one thing purchasing must not learn from a toast that
           has already gone. ── */}
      {(purchasingWorkQ.data?.work ?? []).length > 0 && (
        <div className="shrink-0 border-b border-kit-slate-5 bg-white px-4 py-3">
          <div className="text-label font-semibold tracking-wide text-base-500 uppercase">
            Sales order changes to check
          </div>
          <div className="mt-2">
            <CorrectionWorkList work={purchasingWorkQ.data?.work ?? []} canClose emptyWord="" />
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* ── NAVIGATION · 200px — the Register's business filter (Jess:
             "Business filters live in the left navigation; column-specific
             filters remain native Excel filters."). One group: SUPPLIER
             PROGRESS — what to do with the supplier, never a data status. ── */}
        <nav
          className="w-[200px] shrink-0 min-h-0 overflow-y-auto border-r border-kit-slate-5 px-3 py-3 flex flex-col gap-4 bg-white"
          aria-label="Purchase order register"
          data-testid="po-rail"
        >
          {/* ── CALLS (T2, frozen with Loo 2026-08-06) — the week's factory
               calls as a rolling five-office-working-day window. Overdue is
               red and ABOVE the days, rendered only above zero; a zero-count
               day STILL renders (purchasing is planned work); Later holds
               everything beyond the window, only above zero. Counts are the
               engine's own dues. Day rows are VIEWS — a call cannot be made
               early — so a click only narrows the listing. No duty chip here:
               identity's one home is the Team panel (§2.2). ── */}
          <RailGroup title="Calls">
            {callCalendar.overdue > 0 && (
              <RailItem
                label="Overdue"
                count={callCalendar.overdue}
                active={calSel === "overdue"}
                onClick={() => setCalSel(calSel === "overdue" ? null : "overdue")}
                danger
                title={`${callCalendar.overdue} call${callCalendar.overdue === 1 ? "" : "s"} late`}
                testId="po-rail-call-overdue"
              />
            )}
            {callCalendar.days.map((d) => (
              <RailItem
                key={d.dayIso}
                label={fmtDate(d.dayIso)}
                count={d.count}
                active={calSel === `day:${d.dayIso}`}
                onClick={() =>
                  setCalSel(calSel === `day:${d.dayIso}` ? null : `day:${d.dayIso}`)
                }
                title={fmtDate(d.dayIso)}
                testId={`po-rail-call-day-${d.dayIso}`}
              />
            ))}
            {callCalendar.later > 0 && (
              <RailItem
                label="Later"
                count={callCalendar.later}
                active={calSel === "later"}
                onClick={() => setCalSel(calSel === "later" ? null : "later")}
                title={`Due after ${fmtDate(calDays[calDays.length - 1])}`}
                testId="po-rail-call-later"
              />
            )}
          </RailGroup>
          <RailGroup title="Supplier Progress">
            <RailItem
              label="All"
              active={stateSel === null}
              onClick={() => setStateSel(null)}
              testId="po-rail-state-all"
            />
            {WORK_STATES.map((st) => (
              <RailItem
                key={st}
                label={WORK_STATE_LABEL[st]}
                count={stateCounts.get(st) ?? 0}
                active={stateSel === st}
                onClick={() => setStateSel(stateSel === st ? null : st)}
                testId={`po-rail-state-${st}`}
              />
            ))}
          </RailGroup>
        </nav>

        {/* ── LISTING — the AutoCount work listing (kit DataTable) ──────── */}
        <div
          className="flex-1 min-w-0 min-h-0 flex flex-col border-r border-kit-slate-5 bg-white [container-type:inline-size]"
          data-testid="po-listing"
        >
          {/* ⭐ ONE SCROLLBAR, AND IT IS THE KIT'S (card P20.2).
               The region used to carry a hand-written `overflow-auto` div with a
               `min-w-[1214px]` child inside it, which forced the PAGE PANE to be
               the scroller — and the kit's `<thead>` is `sticky top-0` against
               the KIT's box, so on the one tab whose rows run longest the column
               headers scrolled away and the operator lost the names of the
               numbers. To Order and Claims already let the kit's own box scroll;
               this makes the gesture the same on all four grids.

               The min-width went WITH it and nothing was lost: it existed to stop
               `"fill"` redistributing the nine measured widths, and P20.1 ended
               that by passing `sizing="content"` — the columns now take exactly
               what they measured and the kit's box scrolls below their sum.
               AutoCount's own grid scrolls, and **deleting business information
               to avoid a scrollbar is the thing Loo forbade** — an operator who
               wants a different balance has resize and reorder (PR 601).

               `container-type: inline-size` moves UP onto the pane, because the
               element it sat on is gone and a page may not style the kit's div.
               It is what lets the expanded record be sized to the VISIBLE width
               (`100cqi`) instead of the ~1,214px table it spans — Q10 Ⓓ, measured
               at 1280 before that fix: the expand's own header was 1171px inside
               568px, so `Qty`, `Destination` and `Received` were unreachable.
               Nothing here is absolutely positioned (the ▼ menus are Radix
               portals), so the containment costs nothing.

               **IT IS 2px WIDER THAN THE SCROLLPORT AND THE RECORD PAYS FOR
               THAT**, which is why `PoWorkArea`'s ceiling gained a `- 2px`:
               measured in a browser, this pane is 900 while the kit's scrollport
               inside its 1px borders is 898. */}
          <DataTable<operationPoListRow>
          rows={rows}
          columns={visibleColumns}
          /* P20.1 — ONE width mechanism across the five Purchasing tabs.
             Every width above was MEASURED in a browser and `"fill"` (the
             absence of this prop) spends them as SHARES, so a measurement
             became a ratio the moment the pane was wider than their sum:
             declared 1,171 · rendered 1,201 at 900px, i.e. no column had
             the width its own comment states. `"content"` gives each
             column exactly what it asks for and hands the slack to the
             kit's filler, which is what To Order and Claims already do. */
          sizing="content"
          rowId={(p) => p.id}
          onRowOpen={(p) => dispatch({ type: "open", id: p.id })}
          sort={sort}
          onSortChange={setSort}
          loading={posQ.isLoading}
          rowMuted={(p) => p.status === "cancelled"}
          /* THE WORKING AREA (Q5, Loo 2026-08-04). The mechanism is
             D0.5d's — the kit renders the control and the tall cell, and
             this page renders the contents and owns which row is open. The
             label is the record's own name, which is the precedent the
             Report tab set: an accessible name that invents no word. */
          expansion={{
            expanded: expandedRows,
            onToggle: (id) => dispatch({ type: "toggleExpand", id }),
            label: (p) => p.id,
            render: (p) => (
              <PoWorkArea
                po={p}
                supplierName={supplierNameOf(p.supplier_id)}
                calls={callsOf(p)}
                labelOf={lineLabel}
                eta={etaOf(p)}
                today={today}
                destinations={destinations}
                fallbackDestName={
                  warehouseById.get(p.warehouse_id)?.name ?? "—"
                }
              />
            ),
          }}
          /* THE GRID IS THE OPERATOR'S (Q5, Loo 2026-08-04). §13.3 asks
             one question of every kit power — *will this make the operator
             finish faster today?* — and he answered these two by name:
             resize because supplier names are different lengths and one
             width cannot suit them all, reorder because different
             operators watch different columns. So this is a WIRING, not a
             feature: the arithmetic, the handle and the a11y repair are
             all D0.5d's, and the two strings are the kit's own, verbatim
             from `/ui` — they are accessible names for a drag, never a
             visible word, so nothing here is invented.

             It is deliberately NOT remembered (§0.4 — a grid's shape is
             the company's): a reload is the reset, which is why there is
             no reset control and no word for one. Footer totals and row
             grouping stay UNWIRED — Loo ruled both unproven the same day,
             and *"the kit has it"* is not an answer. */
          layout={{
            resizeLabel: "Drag to resize",
            reorderLabel: "Drag to reorder",
          }}
          label="Purchase orders"
          empty={
            <EmptyState
              title="No purchase orders."
              detail="Issue one from To Order."
            />
          }
          />
          <div className="shrink-0 flex items-center gap-3 px-3 h-10 border-t border-kit-slate-5 text-meta text-kit-slate-11">
            <span>{rows.length} purchase orders</span>
            {filtered && (
              <button
                type="button"
                onClick={clearAll}
                data-testid="po-clear-filters"
                className="px-2 py-0.5 rounded-full bg-kit-slate-3 text-kit-slate-11 hover:text-kit-slate-12"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* ── WORKSPACE — ONE live Purchase Order, and only while this PO is
             being READ. Expanding a row closes it and hands the listing the
             400px back (Q10): the two ways of looking at one purchase order
             are exclusive, so the page can never show two. ─────────────── */}
        <main
          className={[
            "shrink-0 min-h-0 overflow-y-auto bg-white",
            view.mode === "panel" ? "w-[400px]" : "hidden",
          ].join(" ")}
          data-testid="po-workspace"
        >
          {view.mode === "panel" &&
            (selected ? (
              <WorkspaceBody
                po={selected}
                supplier={supplierById.get(selected.supplier_id)}
                warehouse={warehouseById.get(selected.warehouse_id)}
                messageTemplate={messageTemplate}
                labelOf={lineLabel}
                destinations={destinations}
                onClose={() => dispatch({ type: "close" })}
              />
            ) : (
              !posQ.isLoading &&
              pos.length === 0 && (
                <div className="h-full flex items-center justify-center">
                  <EmptyState title="No purchase orders." />
                </div>
              )
            ))}
        </main>
      </div>
    </div>
  );
}

/**
 * ── THE WORKING AREA — the row expand (Q5, Loo 2026-08-04) ─────────────────
 *
 * His diagnosis after using the page: **`Right panel not friendly to edit
 * detail.`** The panel's JOB was defined wrong, not the editing — it had become
 * everything at once: edit · timeline · notes · communication · print.
 *
 * `PURCHASING-INFORMATION-MODEL.md` §12.7.5 splits it, and the split is his:
 *
 *   DOCUMENT DATA — destination · the two dates · qty · line remark · received
 *     → the EXPAND. The document is in front of you and you type into it,
 *       which is the whole reason AutoCount feels good.
 *   ACTIVITY — communication · timeline · files · print
 *     → the RIGHT PANEL, which stops being an editing surface.
 *
 * **ONE editing surface** (his rule 3): the date door and the per-line doors
 * moved OUT of the panel rather than being kept in both. Two doors onto one PO
 * is C1's bypass in a new coat.
 *
 * **ONE PO expands at a time** (his rule 2) — the page owns that, not this
 * component: the expand holds date pickers and dropdowns, and three open at
 * once is a page of live controls with no focus.
 *
 * **It is NOT a tree** (his rule 4): two levels, fixed forever. Nothing in here
 * is itself expandable.
 *
 * Qty renders as TEXT and there is deliberately no input:
 * `PURCHASING-WORKING-FLOW.md` §3 rules that items are ADDED to a sent PO by
 * raising a NEW one, and migration 0316 left PO-line quantities RPC-only with
 * no `set_line_qty` door. Building the input Loo sketched would need a
 * migration AND the reversal of a frozen rule.
 */
function PoWorkArea({
  po,
  supplierName,
  calls,
  labelOf,
  eta,
  today,
  destinations,
  fallbackDestName,
}: {
  po: operationPoListRow;
  supplierName: string;
  calls: PurchasingOpenCall[];
  labelOf: (l: operationPoListRow["purchase_order_lines"][number]) => string;
  eta: { date: string | null; confirmed: boolean };
  today: string;
  destinations: { id: string; name: string; is_default: boolean }[];
  fallbackDestName: string;
}) {
  const [dateOpen, setDateOpen] = useState(false);
  const progress = poReceivingProgress(po.purchase_order_lines);
  const overdue = poOverdueDays(callPoOf(po), today);
  const workState = poWorkStateOf(callPoOf(po), today);
  /** The same shared rule the register's cell reads — spelling it twice is how
   *  a guess ends up red in one place and amber in the other. */
  const gap =
    workState === "completed" || workState === "cancelled"
      ? null
      : poArrivalGapOf(po.customer_delivery ?? null, eta.date);
  const rows = useMemo(() => docRowsOf(po, labelOf), [po, labelOf]);
  const hist = useMemo(() => poDateHistoryOf(po.promises), [po.promises]);

  return (
    /* SIZED TO THE VISIBLE WIDTH (Q10 Ⓓ). The expanded cell spans every column,
     * so it inherits the table's 1208px minimum — measured on production at
     * 1280, the expand's own header came out 1171px inside a 568px listing and
     * `Qty`, `Destination` and `Received` could not be reached at all.
     * `100cqi` is the LISTING PANE's width (its container-query size, set on
     * `po-listing`), minus the kit cell's own 2rem of padding — and minus 2px,
     * which is card P20.2's whole cost. Until P20.2 the query container WAS
     * the scroller, a page-owned `overflow-auto` div, so `100cqi` was the
     * scrollport exactly. That div is gone — the kit's box is the one scroller
     * now — and a page may not put a class on the kit's div, so the container
     * moved up one level to the pane. The pane is 2px wider than the scrollport
     * because the kit's box carries a 1px border on each side: MEASURED in a
     * browser, pane 900 → `kit.clientWidth` 898, and `calc(100cqi - 2rem - 2px)`
     * lands on 866, which is exactly `898 - 32`.
     *
     * On a platform with CLASSIC (space-taking) scrollbars a vertical bar would
     * make the ceiling ~15px generous, because the pane does not know about it.
     * That is a soft cap, not Q10's bug — the failure Q10 fixed was 231px past
     * the edge — and it is written down here rather than left to be
     * rediscovered.
     *
     * **`position: sticky` was tried and MEASURED NOT TO WORK here, so it is
     * not left in as a class that does nothing.** A probe with `sticky left-0`
     * inside this `<td>` scrolled straight off (left −123 at scrollLeft 400)
     * while the identical probe one level up, outside the table, stuck at the
     * scrollport edge (260). A sticky element whose containing block is a
     * table cell does not hold horizontally. It costs nothing today: expanding
     * CLOSES the panel, so the listing is 968px and the whole record fits
     * inside it without scrolling at all.
     *
     * **AND CONTENT-WIDTH SINCE Q11 (Loo, 2026-08-05), WHICH IS WHY THE `w-` IS
     * NOW A `max-w-`.** Pinned to the visible width the record was ALWAYS the
     * whole pane, so `Description` — the one flexible track — held 1191px at
     * 1920 for 67px of ink and pushed `Qty`, `Destination` and `Received` to the
     * far edge: 1138px of nothing between an item's name and its quantity, on
     * every line, five lines on PO-2037. `w-fit` ends the row where its content
     * ends and leaves the slack on the RIGHT, where empty space reads as empty.
     * Measured on production, PO-2037: the record goes 1575 → 474 at 1920 and
     * 935 → 474 at 1280, and `Description` 1191 → 90.
     *
     * **THE BOUND IS LOAD-BEARING AND IT IS NOT DECORATION.** `width:fit-content`
     * is capped by the AVAILABLE width, and available here is the `<td>`'s —
     * i.e. the whole ~1,214px table, not the pane. Measured with a 200-char
     * description at 1280: bounded, the record is 935 and `Received` ends at
     * 1212, inside the 1217 scrollport, and the name truncates (scrollWidth 1871
     * against clientWidth 551); with the `max-w` removed the record is 1171 and
     * `Received` ends at 1448 — 231px past the right edge, which is Q10's bug
     * re-opened. Never remove it.
     *
     * jsdom has no widths — every number above is from a real browser. */
    <div
      data-testid={`po-work-${po.id}`}
      className="w-fit max-w-[calc(100cqi-2rem-2px)]"
    >
      {/* ① THE TWO DATES — §12.2's ① and ②, side by side, because the whole
           question an operator answers here is *what did the factory say, and
           when does it reach us*. Both are editable; the panel carries neither
           any more. */}
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-1">
        <ReadyDateField po={po} supplierName={supplierName} />
        <div className="flex items-baseline gap-2 text-body leading-6">
          <span className="text-label text-kit-slate-9">Expected Arrival</span>
          <button
            type="button"
            onClick={() => setDateOpen((o) => !o)}
            aria-expanded={dateOpen}
            data-testid="po-date-row"
            className="flex items-baseline gap-1 rounded-control px-1 text-left hover:bg-kit-slate-3"
          >
            {eta.date ? (
              <span
                className={[
                  "tabular-nums border-b border-dashed border-kit-slate-5",
                  eta.confirmed ? "text-kit-slate-12" : "text-kit-slate-9",
                ].join(" ")}
              >
                {fmtDateShort(eta.date)}
                {!eta.confirmed && (
                  <span className="text-kit-slate-9"> · expected</span>
                )}
              </span>
            ) : (
              <span className="text-kit-slate-9 border-b border-dashed border-kit-slate-5">
                —
              </span>
            )}
            {gap && (
              <span
                data-testid="po-arrival-gap"
                data-tone={
                  gap.tone === "late" && eta.confirmed ? "confirmed" : "estimate"
                }
                className={
                  gap.tone === "late" && eta.confirmed
                    ? "text-kit-red-11"
                    : "text-kit-amber-11"
                }
              >
                ⚠ {gap.label}
              </span>
            )}
            {overdue != null && (
              <span className="text-kit-red-11" data-testid="po-overdue">
                ⚠ Overdue by {overdue} day{overdue === 1 ? "" : "s"}
              </span>
            )}
            <Icon name={dateOpen ? "collapse" : "forward"} size={14} />
          </button>
        </div>
      </div>

      {dateOpen && (
        <div
          className="mt-1 pl-2 border-l-2 border-kit-blue-9"
          data-testid="po-date-extend"
        >
          <SupplierDateForm po={po} confirmed={eta.confirmed} supplierName={supplierName} />
          {/* THE QUEUE, AND — for the balance call — ITS DOOR (Q14). The
              tomorrow call keeps no trigger here: its door is `SupplierDateForm`
              one line above on this same surface, and a second one would
              re-open exactly the two-doors defect this card closes. */}
          {calls.map((c) =>
            c.key === "confirm_balance_delivery_date" && c.poLineId ? (
              <BalanceDateRow key={c.poLineId} call={c} po={po} />
            ) : (
              <CallStatement key={c.poLineId ?? c.key} call={c} />
            ),
          )}
          {/* TWO RUNS, EACH NAMED (Q5). `poDateHistoryOf` filtered the ready
              kind out until now, so the first ready date an operator recorded
              would have been swallowed by the history sitting beside the
              field. They are never merged into one numbered run: they are
              different FACTS, and a slip measured between a ready date and an
              arrival date is a number about nothing. */}
          <DateRun
            label="Expected Arrival"
            testid="po-date-history"
            entries={hist.entries}
            emptyText={`No date from ${supplierName} yet.`}
          />
          {hist.readyEntries.length > 0 && (
            <DateRun
              label="Supplier Ready Date"
              testid="po-ready-history"
              entries={hist.readyEntries}
              emptyText=""
            />
          )}
        </div>
      )}

      {/* ② THE LINES — one row per SO × SKU (the Excel rows, Jess 2026-08-02),
           and the destination is EDITABLE right there. This is the fact the
           row and the panel structurally cannot show: the row prints ONE value
           for the whole PO (`Carres Klang +1`) and the panel answers for one
           PO at a time, so *"which lines across my open POs go to AL?"* used
           to mean opening all 21. */}
      <div className="mt-3" data-testid="po-doc-items">
        <div
          className={`${ITEM_GRID} text-label uppercase tracking-wide text-kit-slate-9 border-y border-kit-slate-5 py-1`}
        >
          <span className="font-medium">#</span>
          <span className="font-medium">SO No.</span>
          <span className="min-w-0 font-medium">Description</span>
          <span className="text-right font-medium">Qty</span>
          <span className="font-medium">Destination</span>
          <span className="text-right font-medium">Received</span>
        </div>
        {rows.map((r, i) => (
          <LineRow
            key={r.key}
            row={r}
            index={i + 1}
            poDestinationId={po.destination_id ?? null}
            destinations={destinations}
            fallbackDestName={fallbackDestName}
          />
        ))}
        <div className={`${ITEM_GRID} py-1.5 text-body`}>
          <span />
          <span />
          <span className="min-w-0 text-label uppercase tracking-wide text-kit-slate-9">
            Total
          </span>
          <span className="text-right font-semibold text-kit-slate-12 tabular-nums">
            {progress.ordered}
          </span>
          <span />
          <span className="text-right font-semibold text-kit-slate-12 tabular-nums">
            {progress.received} / {progress.ordered}
          </span>
        </div>
        {progress.issueQty > 0 && (
          <div className="text-body text-kit-red-11">
            {progress.issueQty} with a problem
          </div>
        )}
      </div>
    </div>
  );
}

/** One open call, stated. A dot for its tone, the queue word, its own due. */
function CallStatement({
  call,
  children,
}: {
  call: PurchasingOpenCall;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2 text-body leading-6">
      <span
        aria-hidden
        className={[
          "w-1.5 h-1.5 rounded-full shrink-0 self-center",
          call.late ? "bg-kit-red-9" : "bg-kit-amber-11",
        ].join(" ")}
      />
      <span className="text-kit-slate-12">{purchasingActionQueue(call.key)}</span>
      {children}
      {call.dueIso && (
        <span className="ml-auto text-label text-kit-slate-9">
          due {fmtDateShort(call.dueIso)}
        </span>
      )}
    </div>
  );
}

/**
 * `Confirm balance delivery date` — Q14, THE DOOR THAT LIVED ON THE WRONG TAB.
 *
 * Until this card the ONLY surface in the portal that could close this action
 * was `RecordSupplierAnswerModal`, on RECEIVING — while §1's role-anchor (Loo,
 * 2026-08-05) gives every call that ASKS THE SUPPLIER for something to the
 * buyer. Its twin, the tomorrow call, had grown TWO doors on TWO tabs for the
 * same reason. Q12 ruled which one stays; this is the balance half landing
 * where its queue already was, which is Loo's own words on `Confirm ready
 * date` the same day: **queue and door in one place.**
 *
 * **IT IS RENDERED FROM THE ENGINE'S ARRAY, NEVER FROM THE ITEM ROWS, AND THAT
 * IS WHAT MAKES "ONE DOOR PER LINE" STRUCTURAL RATHER THAN A RULE SOMEBODY
 * KEEPS.** `balanceDeliveryCallsOf` walks `po.lines`, so it can emit at most
 * one call per LINE. The Items grid below walks `docRowsOf`, which deals ONE
 * line out across every sales order it covers — measured on production
 * 2026-08-05, **7 of 21 open POs carry more than one SO and they hold 18 of the
 * 35 lines**, so a button on the item row would have given one fact two to five
 * doors. That is the very defect this card removes, one tier down.
 *
 * The manner is `SupplierDateForm`'s, not `ReadyDateField`'s: this is a
 * multi-field form, and Jess ruled those get a real button ("i cant save?").
 * Every visible string is ruled — the queue word, `Record balance date` and
 * `Balance date recorded` are `order-action-words`', and the line's own fact is
 * `poReceivingProgress().pendingLabel`, R1's shipped sentence, exactly as the
 * retired modal printed it. **`Remarks` is this surface's own live word for
 * free text** (the date form beside it), chosen over the modal's
 * `Note (optional)` so that one page does not spell one thing two ways.
 */
function BalanceDateRow({
  call,
  po,
}: {
  call: PurchasingOpenCall;
  po: operationPoListRow;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [remarks, setRemarks] = useState("");
  const [remarksOpen, setRemarksOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = useRecordBalanceDateMutation();

  const line = po.purchase_order_lines.find((l) => l.id === call.poLineId) ?? null;
  const pending = poReceivingProgress(line ? [line] : []).pendingLabel;

  const close = () => {
    setOpen(false);
    setDate("");
    setRemarks("");
    setRemarksOpen(false);
    setErr(null);
  };
  const submit = () => {
    if (date === "" || save.isPending || !call.poLineId) return;
    setErr(null);
    save.mutate(
      {
        poLineId: call.poLineId,
        newDate: date,
        ...(remarks.trim() ? { reason: remarks.trim() } : {}),
      },
      {
        onSuccess: close,
        onError: (e) => setErr(e instanceof Error ? e.message : String(e)),
      },
    );
  };
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") close();
  };

  return (
    <div data-testid={`po-balance-${call.poLineId}`}>
      <CallStatement call={call}>
        {/* WHICH line, and how much of it is short. A PO can carry several
            balance calls at once, so the queue word alone does not say which
            one this row is about. */}
        <span className="min-w-0 truncate text-label text-kit-slate-9">
          {call.sku}
          {pending ? ` · ${pending}` : ""}
        </span>
      </CallStatement>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid={`po-balance-open-${call.poLineId}`}
          className="text-body text-kit-slate-9 border-b border-dashed border-kit-slate-5 hover:text-kit-slate-12"
        >
          Record the balance date…
        </button>
      ) : (
        <div className="py-1" data-testid={`po-balance-form-${call.poLineId}`}>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={date}
              autoFocus
              onChange={(e) => setDate(e.target.value)}
              onKeyDown={keys}
              aria-label={purchasingActionQueue("confirm_balance_delivery_date")}
              data-testid={`po-balance-input-${call.poLineId}`}
              className="h-8 rounded-control border border-kit-slate-5 bg-white px-2 text-body text-kit-slate-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9"
            />
            {remarksOpen ? (
              <input
                type="text"
                value={remarks}
                autoFocus
                onChange={(e) => setRemarks(e.target.value)}
                onKeyDown={keys}
                placeholder="Remarks"
                aria-label="Remarks"
                data-testid={`po-balance-remarks-${call.poLineId}`}
                className="h-8 flex-1 min-w-[8rem] rounded-control border border-kit-slate-5 bg-white px-2 text-body text-kit-slate-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9"
              />
            ) : (
              <button
                type="button"
                onClick={() => setRemarksOpen(true)}
                data-testid={`po-balance-remarks-open-${call.poLineId}`}
                className="text-label text-kit-slate-9 border-b border-dashed border-kit-slate-5 hover:text-kit-slate-12"
              >
                + Remarks
              </button>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={date === "" || save.isPending}
              data-testid={`po-balance-save-${call.poLineId}`}
              className={`${DOC_BTN} disabled:opacity-40`}
            >
              {save.isPending
                ? "Saving…"
                : purchasingActionButton("confirm_balance_delivery_date")}
            </button>
            <button
              type="button"
              onClick={close}
              data-testid={`po-balance-cancel-${call.poLineId}`}
              className="text-label text-kit-slate-9 hover:text-kit-slate-12"
            >
              Cancel
            </button>
          </div>
          {err && (
            <div
              className="mt-1 text-label text-kit-red-11"
              data-testid={`po-balance-error-${call.poLineId}`}
            >
              {err}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** One numbered run of dates, named by the FIELD it belongs to. */
function DateRun({
  label,
  testid,
  entries,
  emptyText,
}: {
  label: string;
  testid: string;
  entries: readonly { ordinal: number; date: string; reason: string | null; remarks: string | null; recordedAt: string }[];
  emptyText: string;
}) {
  if (entries.length === 0) {
    return emptyText ? (
      <div className="text-label text-kit-slate-9 leading-6">{emptyText}</div>
    ) : null;
  }
  return (
    <div data-testid={testid}>
      <div className="text-label text-kit-slate-9">{label}</div>
      {entries.map((e) => (
        <div
          key={e.recordedAt}
          className="flex items-baseline gap-2 text-body leading-6"
        >
          {/* One date earns no number — `1st` of one is not a sequence. */}
          {entries.length > 1 && (
            <span className="w-7 shrink-0 text-label text-kit-slate-9">
              {ordinalLabel(e.ordinal)}
            </span>
          )}
          <span className="w-[68px] shrink-0 tabular-nums text-kit-slate-12">
            {fmtDateShort(e.date)}
          </span>
          <span className="min-w-0 text-kit-slate-9">
            {[e.reason, e.remarks].filter(Boolean).join(" · ")}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * `Supplier Ready Date` — §12.2 ①, the day the FACTORY says it has finished.
 *
 * THE DOOR THAT HAD NO HANDLE: `purchasing_record_ready_date` shipped with
 * migration 0318 on 2026-08-03 and nothing in the portal ever called it, so
 * `Confirm ready date` — an action the flow file has carried since it was
 * written — could not be closed from a screen.
 *
 * ONE value, so it takes the ruled inline manner exactly (Jess, 2026-08-02): a
 * value is TEXT until clicked, then a control; **Enter saves, Esc cancels, and
 * there is no Save button.** A date already given is never edited — you record
 * the NEXT one, and the ledger keeps both.
 */
function ReadyDateField({
  po,
  supplierName,
}: {
  po: operationPoListRow;
  supplierName: string;
}) {
  const held = po.expected_ready_date ?? null;
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const save = useRecordReadyDate(po.id);

  const close = () => {
    setEditing(false);
    setDate("");
    setErr(null);
  };
  const submit = () => {
    if (date === "" || save.isPending) return;
    setErr(null);
    save.mutate(
      { newDate: date },
      {
        onSuccess: close,
        onError: (e) => setErr(e instanceof Error ? e.message : String(e)),
      },
    );
  };

  return (
    <div className="flex items-baseline gap-2 text-body leading-6">
      <span className="text-label text-kit-slate-9">Supplier Ready Date</span>
      {editing ? (
        <input
          type="date"
          value={date}
          autoFocus
          onChange={(e) => setDate(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") close();
          }}
          aria-label={`Supplier ready date from ${supplierName}`}
          data-testid="po-ready-date-input"
          className="h-8 rounded-control border border-kit-slate-5 bg-white px-2 text-body text-kit-slate-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          data-testid="po-ready-date-open"
          className={[
            "border-b border-dashed border-kit-slate-5 text-left hover:text-kit-slate-12 tabular-nums",
            held ? "text-kit-slate-12" : "text-kit-slate-9",
          ].join(" ")}
        >
          {held ? fmtDateShort(held) : "—"}
        </button>
      )}
      {save.isPending && (
        <span className="text-label text-kit-slate-9">Saving…</span>
      )}
      {err && (
        <span className="text-label text-kit-red-11" data-testid="po-ready-date-error">
          {err}
        </span>
      )}
    </div>
  );
}

/* ── THE ACTIVITY PANEL for ONE Purchase Order.
 *
 * **It stopped being an editing surface on 2026-08-04 (Q5, Loo).** The panel
 * used to carry the date door, the items grid and the per-line doors as well as
 * the communication desk — everything at once, which is what produced
 * *"Right panel not friendly to edit detail."* §12.7.5's split sends DOCUMENT
 * DATA to the expand and leaves ACTIVITY here:
 *
 *   IDENTITY     which PO this is — the subject the activity is ABOUT. Read
 *                only, and purchasing cannot move a customer's promise.
 *   ACTIVITY     "What have we communicated?" — Document · Communication ·
 *                Communication History (`ActivityDesk`).
 *
 * What LEFT, and where it went: `Expected Arrival` + its history and
 * `Supplier Ready Date` → the expand's two date fields · the items grid, the
 * per-line destination and the ops remark → the expand's line rows. **Nothing
 * was deleted and nothing is in two places** — his rule 1 (nothing appears in
 * two tiers) and rule 3 (one editing surface).
 *
 * Rhythm = CARRES WORKSPACE RHYTHM v1: one continuous working document,
 * hairline + small-caps sections, 24px property rows, no cards, no letterhead
 * (the paper look belongs to the printed 0307 document). */

/** The Linear property row: label + value, ONE 24px line, never stacked. */
function Prop({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 text-body leading-6">
      <span className="w-32 shrink-0 text-label text-kit-slate-9">{label}</span>
      <span className="min-w-0 text-kit-slate-12">{children}</span>
    </div>
  );
}

/**
 * THE SIX WORDS OF THE PANEL'S ITEMS BLOCK — read-only, so five facts and no
 * control. Narrower tracks than the expand's: the panel is 400px, of which 368
 * is usable, and it carries no destination picker.
 */
const PANEL_ITEM_GRID =
  "grid grid-cols-[16px_64px_minmax(0,1fr)_32px_56px] gap-2";

function WorkspaceBody({
  po,
  supplier,
  warehouse,
  messageTemplate,
  labelOf,
  destinations,
  onClose,
}: {
  po: operationPoListRow;
  supplier: SupplierRow | undefined;
  warehouse: { name: string; address: string | null } | undefined;
  messageTemplate: string | null;
  labelOf: (l: operationPoListRow["purchase_order_lines"][number]) => string;
  destinations: { id: string; name: string; is_default: boolean }[];
  onClose: () => void;
}) {
  const supplierName = supplier?.name ?? po.supplier_id;
  const items = useMemo(() => docRowsOf(po, labelOf), [po, labelOf]);
  const progress = poReceivingProgress(po.purchase_order_lines);
  /** REVISE takes the stage (0364, Jess 2026-08-18): while it is open the
   *  read-only Items block and the Communication desk step aside, the same way
   *  Receiving Mode takes the Receiving pane — five editable lines plus a
   *  reason do not fit beside them in 368px. Closed on every PO change. */
  const [revising, setRevising] = useState(false);
  useEffect(() => setRevising(false), [po.id]);
  /** `PO-2041 · Version 2` — nothing for Version 1 (shared rule). */
  const versionLabel = poVersionLabelOf(po.version);
  /** The governed sentence, DERIVED: the current version was minted after the
   *  last observed hand-over. */
  const unshared = poUnsharedVersionNoticeOf(
    { id: po.id, version: po.version, revised_at: po.revised_at, sends: po.sends },
    supplierName,
  );
  return (
    <div className="px-4 py-4" data-testid="po-document">
      {/* ── ① IDENTITY + ITS ACTIONS, on one row (Q10 Ⓐ + Ⓔ).
           `Print PDF` came UP out of the `DOCUMENT` band, which held one
           button and spent a title and a hairline on it: the object's
           identity and the actions on it belong together at the top (Fiori's
           Object Page · BC's document page · GitHub · Linear). Measured:
           `PO-2038` 100.8 + gap 8 + `Print PDF` 83.8 = 192.6px inside 368px.
           The ✕ is the PANEL's own control — closing it is not the page's
           business, and clicking any row brings it back. ─────────────── */}
      <div className="flex items-start gap-2" data-testid="po-panel-title">
        <span className="min-w-0 flex-1 text-page font-semibold font-mono text-kit-slate-12">
          {po.id}
          {/* The version fact lives on the PANEL TITLE, never on a register
              column (Jess, 2026-08-18): `PO-2041 · Version 2`. Version 1
              prints nothing — an unrevised PO is just the PO. */}
          {versionLabel ? (
            <span className="text-kit-slate-9 font-sans" data-testid="po-version">
              {" "}· {versionLabel}
            </span>
          ) : null}
        </span>
        {/* The Revise door (0364) — an act on the DOCUMENT, so it sits with
            the object's own actions beside Print PDF (Q10's rule). Only an
            open PO can be revised: received and cancelled are finished
            stories. */}
        {po.status === "open" && !revising ? (
          <button
            type="button"
            onClick={() => setRevising(true)}
            data-testid="po-revise-open"
            className={DOC_BTN}
          >
            Revise
          </button>
        ) : null}
        <PrintPdfButton poId={po.id} />
        <button
          type="button"
          onClick={onClose}
          title="Hide purchase order"
          aria-label="Hide purchase order"
          data-testid="po-panel-close"
          className={PANE_BTN}
        >
          <Icon name="close" size={14} />
        </button>
      </div>

      {/* The unshared version is WORK TO DO, never a stage (frozen rule:
          communication is not a STATUS). Amber — it is our own gap, not a
          factory's broken promise. */}
      {unshared ? (
        <div className="mt-1 text-label text-kit-amber-11" data-testid="po-unshared">
          {unshared}
        </div>
      ) : null}

      {/* ── ② FIXED HEADER — the facts this activity is ABOUT. ────────── */}
      <div className="mt-2 flex items-start gap-2" data-testid="po-working-header">
        <div className="min-w-0 flex-1">
          <Prop label="PO Issued">
            <span className="tabular-nums">
              {fmtDateShort((po.placed_at ?? "").slice(0, 10))}
            </span>
          </Prop>
          <Prop label="Delivery To">{warehouse?.name ?? "—"}</Prop>
          <Prop label="Supplier">{supplierName}</Prop>
          {/* Why this PO was born (0361; MASTER §1: a PO carries the reason it
              was born for). Absent on pre-0361 POs — the row hides rather than
              printing a dash the operator must interpret. */}
          {poPurposeLabelOf(po.purpose) ? (
            <Prop label="Need for">
              <span data-testid="po-need-for">{poPurposeLabelOf(po.purpose)}</span>
            </Prop>
          ) : null}
          {/* The date we promised the CUSTOMER — the one number the supplier
              date has to be judged against, and it was not on this panel at
              all (Jess, 2026-08-03). Read-only here: purchasing cannot move
              a customer's promise. */}
          <Prop label="Customer Delivery">
            {po.customer_delivery ? (
              <span className="tabular-nums" data-testid="po-customer-delivery">
                {fmtDateShort(po.customer_delivery)}
              </span>
            ) : (
              <span className="text-kit-slate-9">—</span>
            )}
          </Prop>
        </div>
      </div>

      {/* ── ③ ITEMS — WHAT IS ON THE PURCHASE ORDER, read-only (Q10 Ⓔ).
           Loo, after using the page: *"为什么你把我 right panel 里面的 listing
           拿走？give me back."* Q5 took it out to obey §12.7.5 rule 1, and the
           cost the rule did not predict was that clicking a row opened a panel
           naming the supplier, the dates and the communication and never
           saying what was ON the purchase order — two actions where there had
           been one, on the most-asked question about a PO.

           **Rule 1 is narrowed, not deleted: a fact may be READ in two tiers
           and WRITTEN in only one.** So there is no dropdown, no date field,
           no `Save` and no `⋮` here — the destination, the two dates and the
           note stay in the expand, and rule 3 (ONE editing surface) is
           untouched. A test asserts this block holds no control at all.

           REVISE (0364) does not weaken that: while its form is open the
           read-only block is OFF the stage entirely, so one PO never shows an
           editable and a read-only copy of the same line at once. */}
      {revising ? (
        <ReviseForm
          po={po}
          labelOf={labelOf}
          destinations={destinations}
          onClose={() => setRevising(false)}
        />
      ) : (
        <>
      <div className="mt-4">
        <DeskBand>Items</DeskBand>
      </div>
      <div className="mt-1" data-testid="po-panel-items">
        <div
          className={`${PANEL_ITEM_GRID} text-label uppercase tracking-wide text-kit-slate-9 border-b border-kit-slate-5 py-1`}
        >
          <span className="font-medium">#</span>
          <span className="font-medium">SO No.</span>
          <span className="min-w-0 font-medium">Description</span>
          <span className="text-right font-medium">Qty</span>
          {/* `Received`, not the pre-Q5 `Recv` — one fact, one word, and it is
              the expand's own. REPORTED as a departure from the card's sketch:
              both strings shipped before Q5, `Received` is the newer of the
              two, and it fits (the panel's tracks are measured for it). */}
          <span className="text-right font-medium">Received</span>
        </div>
        {items.map((r, i) => (
          <div
            key={r.key}
            data-testid={`po-panel-item-${i + 1}`}
            className={`${PANEL_ITEM_GRID} py-1.5 text-body border-b border-kit-slate-4`}
          >
            <span className="text-kit-slate-9 tabular-nums">{i + 1}</span>
            <span className="text-label text-kit-slate-11 tabular-nums">
              {r.so != null ? `SO-${r.so}` : "—"}
            </span>
            {/* The business name leads; the code identifies on hover — the
                same rule the register's Items column and the expand read. */}
            <span
              title={r.sku}
              className="min-w-0 truncate font-semibold text-kit-slate-12"
            >
              {r.label}
            </span>
            <span className="text-right text-kit-slate-12 tabular-nums">
              {r.qty}
            </span>
            <span className="text-right tabular-nums text-kit-slate-9">
              {r.received}
            </span>
          </div>
        ))}
        <div className={`${PANEL_ITEM_GRID} py-1.5 text-body`}>
          <span />
          <span />
          <span className="min-w-0 text-label uppercase tracking-wide text-kit-slate-9">
            Total
          </span>
          <span className="text-right font-semibold text-kit-slate-12 tabular-nums">
            {progress.ordered}
          </span>
          <span className="text-right font-semibold text-kit-slate-12 tabular-nums">
            {progress.received}
          </span>
        </div>
      </div>

      {/* ── ④ ACTIVITY — tools + the business timeline. ───────────────── */}
      <ActivityDesk po={po} supplier={supplier} template={messageTemplate} />
        </>
      )}
    </div>
  );
}

/**
 * REVISE — a sent PO keeps its number and mints a version (Jess, 2026-08-18;
 * 0364). EXISTING lines only: qty (floored at what has already been received)
 * and where each line goes, from the governed destination registry. ONE
 * required reason. Save mints `Version {n}`: the server snapshots the prior
 * document with the reason and the author, and the panel title picks up the
 * new version from the refetch. Adding items is still a NEW PO; stopping is
 * still the whole PO (Cancel).
 *
 * Zero popups, zero toasts (this page's law): the floor is stated INLINE on
 * the line that has one, the disabled Save NAMES its gap (the Receiving button
 * law — first gap wins), and a server refusal prints inline under the form.
 */
const REVISE_GRID = "grid grid-cols-[16px_minmax(0,1fr)_56px_120px] gap-2";

function ReviseForm({
  po,
  labelOf,
  destinations,
  onClose,
}: {
  po: operationPoListRow;
  labelOf: (l: operationPoListRow["purchase_order_lines"][number]) => string;
  destinations: { id: string; name: string; is_default: boolean }[];
  onClose: () => void;
}) {
  const save = useRevisePo(po.id);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  /** Draft per LINE (the ruling's floor is per line, so the form speaks
   *  lines — not the Excel SO × SKU rows the read-only block prints). The
   *  destination draft holds the RESOLVED value; only a real change rides
   *  the wire, so a line that merely FOLLOWS the PO's destination is never
   *  rewritten into an explicit one as a side effect. */
  const [draft, setDraft] = useState<
    Record<string, { qty: string; destinationId: string }>
  >(() =>
    Object.fromEntries(
      po.purchase_order_lines.map((l) => [
        l.id,
        {
          qty: String(l.qty),
          destinationId: l.destination_id ?? po.destination_id ?? "",
        },
      ]),
    ),
  );

  const lines = po.purchase_order_lines;
  const resolvedOf = (l: (typeof lines)[number]) =>
    l.destination_id ?? po.destination_id ?? "";

  /** The changed lines, exactly as the wire wants them. */
  const changes = lines.flatMap((l) => {
    const d = draft[l.id];
    if (!d) return [];
    const qty = Number(d.qty);
    const qtyChanged = Number.isInteger(qty) && qty !== l.qty;
    const destChanged = d.destinationId !== "" && d.destinationId !== resolvedOf(l);
    if (!qtyChanged && !destChanged) return [];
    return [
      {
        lineId: l.id,
        qty: Number.isInteger(qty) && qty >= 1 ? qty : l.qty,
        destinationId: destChanged ? d.destinationId : (l.destination_id ?? null),
      },
    ];
  });

  const belowFloorSku =
    lines.find((l) => {
      const d = draft[l.id];
      if (!d) return false;
      const qty = Number(d.qty);
      return !Number.isInteger(qty) || qty < 1 || qty < l.received_qty;
    })?.sku ?? null;

  const gap = poReviseSaveGapOf({
    belowFloorSku,
    nothingChanged: changes.length === 0,
    reasonEmpty: reason.trim() === "",
  });
  const nextVersion = (po.version ?? 1) + 1;

  const submit = () => {
    if (gap != null || save.isPending) return;
    setErr(null);
    save.mutate(
      { reason: reason.trim(), lines: changes },
      {
        onSuccess: onClose,
        onError: (e) => setErr(e instanceof Error ? e.message : String(e)),
      },
    );
  };

  return (
    <div data-testid="po-revise-form">
      <div className="mt-4">
        <DeskBand>Revise</DeskBand>
      </div>
      <div
        className={`${REVISE_GRID} mt-1 text-label uppercase tracking-wide text-kit-slate-9 border-b border-kit-slate-5 py-1`}
      >
        <span className="font-medium">#</span>
        <span className="min-w-0 font-medium">Description</span>
        <span className="text-right font-medium">Qty</span>
        <span className="font-medium">Destination</span>
      </div>
      {lines.map((l, i) => {
        const d = draft[l.id] ?? { qty: String(l.qty), destinationId: resolvedOf(l) };
        const qty = Number(d.qty);
        const belowFloor = !Number.isInteger(qty) || qty < 1 || qty < l.received_qty;
        return (
          <div key={l.id} className="border-b border-kit-slate-4">
            <div
              className={`${REVISE_GRID} py-1.5 text-body`}
              data-testid={`po-revise-line-${i + 1}`}
            >
              <span className="text-kit-slate-9 tabular-nums">{i + 1}</span>
              <span
                title={l.sku}
                className="min-w-0 truncate font-semibold text-kit-slate-12"
              >
                {labelOf(l)}
              </span>
              <input
                type="number"
                min={Math.max(1, l.received_qty)}
                value={d.qty}
                onChange={(e) =>
                  setDraft((cur) => ({
                    ...cur,
                    [l.id]: { ...d, qty: e.target.value },
                  }))
                }
                aria-label={`Qty for ${l.sku}`}
                data-testid={`po-revise-qty-${i + 1}`}
                className="h-8 w-full rounded-control border border-kit-slate-5 bg-white px-2 text-right text-body text-kit-slate-12 tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9"
              />
              <select
                value={d.destinationId}
                onChange={(e) =>
                  setDraft((cur) => ({
                    ...cur,
                    [l.id]: { ...d, destinationId: e.target.value },
                  }))
                }
                aria-label={`Destination for ${l.sku}`}
                data-testid={`po-revise-destination-${i + 1}`}
                className="h-8 w-full min-w-0 rounded-control border border-kit-slate-5 bg-white px-1 text-body text-kit-slate-12"
              >
                {d.destinationId === "" && <option value="">—</option>}
                {destinations.map((dst) => (
                  <option key={dst.id} value={dst.id}>
                    {dst.name}
                  </option>
                ))}
              </select>
            </div>
            {/* THE FLOOR, stated where it binds — only when it binds: goods a
                warehouse already holds cannot be un-ordered by editing a
                document. Red only when the draft breaks it. */}
            {l.received_qty > 0 ? (
              <div
                className={`pb-1.5 pl-6 text-label ${belowFloor ? "text-kit-red-11" : "text-kit-slate-9"}`}
                data-testid={`po-revise-floor-${i + 1}`}
              >
                {l.received_qty} received
              </div>
            ) : null}
          </div>
        );
      })}

      <div className="mt-2">
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why"
          aria-label="Why"
          data-testid="po-revise-reason"
          className="h-8 w-full rounded-control border border-kit-slate-5 bg-white px-2 text-body text-kit-slate-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9"
        />
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={gap != null || save.isPending}
          data-testid="po-revise-save"
          className={`${DOC_BTN} font-medium disabled:opacity-40`}
        >
          {save.isPending ? "Saving…" : (gap ?? `Save Version ${nextVersion}`)}
        </button>
        <button
          type="button"
          onClick={onClose}
          data-testid="po-revise-cancel"
          className="text-label text-kit-slate-9 hover:text-kit-slate-12"
        >
          Cancel
        </button>
      </div>
      {err ? (
        <div className="mt-1 text-label text-kit-red-11" data-testid="po-revise-error">
          {err}
        </div>
      ) : null}
    </div>
  );
}

/**
 * `Print PDF` — produce the document, and record NOTHING.
 *
 * Jess froze the boundary on 2026-08-03: **printing is producing, not
 * delivering.** So this writes no history, moves no status, mints no revision,
 * and may be pressed any number of times. The act the Portal records is the
 * DOOR being opened, in the Communication band below.
 *
 * The pipeline is the portal's existing one, not a new one: the server
 * assembles the money-free payload (`purchasing_po_document`, migration 0307)
 * and the browser renders it, because Cloudflare Workers block the WASM that
 * @react-pdf needs.
 *
 * It moved out of `ActivityDesk` and up beside the PO number in Q10 — the
 * `DOCUMENT` band it used to head carried this one button and nothing else.
 */
function PrintPdfButton({ poId }: { poId: string }) {
  const [printing, setPrinting] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  async function printPdf() {
    setPrinting(true);
    setFailed(null);
    try {
      const data = await apiFetch<PoTemplateData>(
        `/api/operation/pos/${poId}/print-data`,
      );
      const blob = await renderPoPdf(data);
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (!win) {
        // Pop-up blocked — hand the operator the file instead of nothing.
        const a = document.createElement("a");
        a.href = url;
        a.download = `${poId}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      // Stated in place, not in a toast that leaves: the operator is mid-task
      // and the reason has to still be there when they look back.
      setFailed(e instanceof Error ? e.message : "Could not open the PDF.");
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div className="shrink-0 flex flex-col items-end">
      <button
        type="button"
        onClick={() => void printPdf()}
        disabled={printing}
        data-testid="po-print-pdf"
        className={`${DOC_BTN} font-medium disabled:opacity-40`}
      >
        {printing ? "Opening…" : "Print PDF"}
      </button>
      {failed && (
        <p
          className="mt-1 text-label text-kit-red-11"
          data-testid="po-print-failed"
        >
          {failed}
        </p>
      )}
    </div>
  );
}


/**
 * ONE LINE OF THE PURCHASE ORDER — and the doors that belong to it (0311, Jess
 * 2026-08-02; moved out of the right panel's ⋮ and into the expand by Q5).
 *
 * The destination used to open behind a ⋮ inside the right panel. It is a CELL
 * of the working area's grid now, because that is the ONE fact neither the row
 * nor the panel can show: the register's row prints one value for the whole PO
 * (`Carres Klang +1`) and the panel answers for one PO at a time, so *"which
 * lines across my open POs go to AL this week?"* meant opening all 21.
 *
 * **THE EDITING CONTROLS SIT ON THEIR OWN STRIP UNDER THE ROW, AND THAT WAS
 * MEASURED RATHER THAN PREFERRED.** With the select, the `Move` field and the
 * two controls all inside the 160px Destination cell, the cluster measured
 * **68px tall in a real browser at the compact listing width (680px)** — it
 * wrapped onto three lines and pushed the row to 81px. jsdom has no widths, so
 * no page test could have caught it. The cell keeps the select; everything else
 * gets the row's full width.
 *
 * INLINE EDIT, Linear's/Notion's manner (Jess, 2026-08-02: "it always show like
 * that?"): a value is TEXT until you click it. Esc puts it back and posts
 * nothing.
 *
 * **The commit control stays, and that is a REPORTED departure from Q5's "no
 * Save button anywhere in the expand".** Jess ruled it live on 2026-08-02 with
 * *"i cant save for AL"*: a picker changed with the MOUSE has no keyboard
 * gesture to commit, and the `Move` field makes it a two-value act. The button
 * is named by what it does — `Split` when only part of the line moves — so a
 * partial move can never be committed by something that reads `Save`.
 *
 * When only PART of the quantity goes elsewhere the LINE splits; the PO stays
 * one document with one supplier (her frozen law). Only the un-received
 * remainder can move: goods a warehouse already holds cannot be re-routed by
 * editing a document.
 */
function LineRow({
  row,
  index,
  poDestinationId,
  destinations,
  fallbackDestName,
}: {
  row: ReturnType<typeof docRowsOf>[number];
  index: number;
  poDestinationId: string | null;
  destinations: { id: string; name: string; is_default: boolean }[];
  fallbackDestName: string;
}) {
  const act = usePoLineAction(row.lineId);
  const current = row.destinationId ?? poDestinationId ?? "";
  const currentName =
    destinations.find((d) => d.id === current)?.name ?? fallbackDestName;

  const [editing, setEditing] = useState<null | "dest" | "note">(null);
  const [dest, setDest] = useState(current);
  const [moveQty, setMoveQty] = useState("");
  const [note, setNote] = useState(row.opsRemark ?? "");
  const [err, setErr] = useState<string | null>(null);

  /** The LINE's un-received remainder, never this row's SO slice: a row showing
   *  1 of a 3-unit line must not tell the split arithmetic there is one to
   *  move. (The SO attribution is a DISPLAY one until P5.) */
  const free = Math.max(0, row.lineQty - row.lineReceived);
  const moving = Number(moveQty || 0);
  const changed = dest !== "" && dest !== current;
  const willSplit = changed && moving >= 1 && moving < free;

  const close = () => {
    setEditing(null);
    setDest(current);
    setMoveQty("");
    setNote(row.opsRemark ?? "");
    setErr(null);
  };
  const run = (
    path: "destination" | "split" | "ops-remark",
    body: Record<string, unknown>,
  ) => {
    setErr(null);
    act.mutate(
      { path, body },
      {
        onSuccess: () => setEditing(null),
        onError: (e) => setErr(e instanceof Error ? e.message : String(e)),
      },
    );
  };
  const saveDestination = () => {
    if (!changed) return close();
    if (willSplit) run("split", { moveQty: moving, destinationId: dest });
    else run("destination", { destinationId: dest });
  };
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") saveDestination();
    if (e.key === "Escape") close();
  };

  const EDIT_TEXT =
    "border-b border-dashed border-kit-slate-5 text-left hover:text-kit-slate-12";

  return (
    <div>
      <div
        data-testid={`po-item-row-${index}`}
        className={`${ITEM_GRID} py-1.5 text-body border-b border-kit-slate-4`}
      >
        <span className="text-kit-slate-9 tabular-nums">{index}</span>
        <span className="text-label text-kit-slate-11 tabular-nums">
          {row.so != null ? `SO-${row.so}` : "—"}
        </span>
        <span className="min-w-0">
          {/* The BUSINESS name leads (Jess, 2026-08-03): a buyer knows Booqit ·
              Cody · Jager, not 5539-1B(LHF). The code identifies rather than
              describes, so it lives on hover. */}
          <span
            title={row.sku}
            className="block font-semibold text-kit-slate-12 truncate"
          >
            {row.label}
          </span>
          {/* TWO remarks, two owners: the SALES one came over from the sales
              order and prints for the factory; the OPS one is purchasing's own
              and never prints. */}
          {row.remark && (
            <span className="block text-label text-kit-slate-11">
              Sales: {row.remark}
            </span>
          )}
          {editing === "note" ? (
            <input
              type="text"
              value={note}
              autoFocus
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") run("ops-remark", { text: note });
                if (e.key === "Escape") close();
              }}
              placeholder="Internal — never printed"
              aria-label="Ops remark"
              data-testid={`po-line-ops-remark-${index}`}
              className="mt-0.5 h-7 w-full rounded-control border border-kit-slate-5 bg-white px-2 text-label text-kit-slate-12"
            />
          ) : (
            /* ONE value → the ruled manner exactly: Enter saves, Esc cancels,
               no Save button. */
            <button
              type="button"
              onClick={() => setEditing("note")}
              data-testid={`po-line-ops-open-${index}`}
              className={`block max-w-full truncate text-label text-kit-slate-9 ${EDIT_TEXT}`}
            >
              {row.opsRemark ? `Ops: ${row.opsRemark}` : "Add a note…"}
            </button>
          )}
        </span>
        <span className="text-right text-kit-slate-12 tabular-nums">
          {row.qty}
        </span>
        <span className="min-w-0">
          {editing === "dest" ? (
            <select
              value={dest}
              autoFocus
              onChange={(e) => setDest(e.target.value)}
              onKeyDown={keys}
              aria-label="Destination"
              data-testid={`po-line-destination-${index}`}
              className="h-8 w-full min-w-0 rounded-control border border-kit-slate-5 bg-white px-1 text-body text-kit-slate-12"
            >
              {destinations.length === 0 && (
                <option value="">{fallbackDestName}</option>
              )}
              {destinations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          ) : (
            <button
              type="button"
              onClick={() => setEditing("dest")}
              data-testid={`po-line-destination-open-${index}`}
              className={`block max-w-full truncate text-kit-slate-12 ${EDIT_TEXT}`}
            >
              {currentName}
            </button>
          )}
        </span>
        <span className="text-right tabular-nums text-kit-slate-9">
          {row.received} / {row.qty}
        </span>
      </div>
      {editing === "dest" && (
        /* THE ROW'S OWN WIDTH, not the cell's 160px — measured: the four
           controls inside the cell wrapped onto three lines. */
        <div
          className="flex flex-wrap items-center gap-2 pb-1.5 px-2 text-body border-b border-kit-slate-4"
          data-testid={`po-line-edit-${index}`}
        >
          {changed && free > 1 && (
            <>
              <span className="text-label text-kit-slate-9">Move</span>
              <input
                type="number"
                min={1}
                max={free}
                value={moveQty}
                onChange={(e) => setMoveQty(e.target.value)}
                onKeyDown={keys}
                placeholder={`${free}`}
                aria-label="Move how many"
                data-testid={`po-line-move-qty-${index}`}
                className="h-8 w-14 rounded-control border border-kit-slate-5 bg-white px-2 text-right text-body text-kit-slate-12 tabular-nums"
              />
              <span className="text-label text-kit-slate-9">of {free}</span>
            </>
          )}
          <button
            type="button"
            onClick={saveDestination}
            disabled={!changed || act.isPending}
            data-testid={`po-line-destination-save-${index}`}
            className={`${DOC_BTN} disabled:opacity-40`}
          >
            {act.isPending ? "Saving…" : willSplit ? "Split" : "Save"}
          </button>
          <button
            type="button"
            onClick={close}
            data-testid={`po-line-destination-cancel-${index}`}
            className="text-label text-kit-slate-9 hover:text-kit-slate-12"
          >
            Cancel
          </button>
          {changed && (
            <span
              className="text-label text-kit-slate-9"
              data-testid={`po-line-effect-${index}`}
            >
              {willSplit
                ? `${moving} of ${free} move; ${free - moving} stay.`
                : `All ${free} move.`}
            </span>
          )}
        </div>
      )}
      {err && (
        <div
          className="pb-1.5 px-2 text-label text-kit-red-11 border-b border-kit-slate-4"
          data-testid={`po-line-error-${index}`}
        >
          {err}
        </div>
      )}
    </div>
  );
}

/**
 * The supplier-date form (Jess, 2026-08-02) — ONE door for her whole cycle.
 *
 * The operator keys a DATE and nothing else about the answer: the SAME date
 * the PO already holds means the promise stands (`shipping`), a different one
 * is a delay and must carry a reason. Situation A (the supplier told us early)
 * and situation B (nobody told us, we phoned) are the same act, so they are
 * the same form — the only difference is whether a date was there before.
 *
 * Reason is the countable CATEGORY; Remarks is the free-text story. Two
 * fields, never folded: a category that swallows prose cannot be counted.
 */
function SupplierDateForm({
  po,
  confirmed,
  supplierName,
}: {
  po: operationPoListRow;
  confirmed: boolean;
  supplierName: string;
}) {
  /**
   * The date this call is ABOUT — `purchase_orders.eta_date`, because that is
   * literally what `purchasing_record_tomorrow_delivery` reads
   * (`v_about := v_po.eta_date`) and refuses to run without.
   *
   * **It does NOT key on `confirmed`, and that is load-bearing.** Provenance
   * now says *the supplier has never named an arrival*, which is true of a PO
   * carrying our own estimate — but the RPC still holds that estimate as the
   * date being answered. Tying `held` to provenance would send `shipping` with
   * a `firstDate` the RPC ignores for that answer, and the supplier's real date
   * would be recorded as a promise about our guess and then dropped. The form's
   * arithmetic must match the door's; only the WORDING follows provenance.
   */
  const held = po.eta_date ?? null;
  // INLINE EDIT, the same manner as the line surface (Jess, 2026-08-02): the
  // extend is QUIET until you ask to record something. A Remarks box standing
  // open on a panel nobody is editing is furniture, and a Reason picker that
  // only appears once a date differs is invisible until then — so the whole
  // form appears together, on one click, and Enter saves it.
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState<string>(PO_DELAY_REASONS[0]);
  const [remarks, setRemarks] = useState("");
  // Remarks is the EXCEPTION, not the rule (Jess, 2026-08-02) — most answers
  // are a date and a reason. It stays folded until asked for.
  const [remarksOpen, setRemarksOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = useRecordSupplierDate(po.id);

  const moved = held != null && date !== "" && date !== held;
  const shiftDays =
    held && date
      ? Math.round(
          (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${held}T00:00:00Z`)) /
            86_400_000,
        )
      : 0;

  const close = () => {
    setOpen(false);
    setDate("");
    setRemarks("");
    setRemarksOpen(false);
    setErr(null);
  };

  function submit() {
    if (date === "" || save.isPending) return;
    setErr(null);
    const body =
      held == null
        ? { answer: "shipping" as const, firstDate: date, remarks: remarks || undefined }
        : moved
          ? { answer: "delayed" as const, newDate: date, reason, remarks: remarks || undefined }
          : { answer: "shipping" as const, remarks: remarks || undefined };
    save.mutate(body, {
      onSuccess: close,
      onError: (e) => setErr(e instanceof Error ? e.message : String(e)),
    });
  }
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") submit();
    if (e.key === "Escape") close();
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="po-date-open"
        className="text-body text-kit-slate-9 border-b border-dashed border-kit-slate-5 hover:text-kit-slate-12"
      >
        {/* `a NEW date` only once there IS an old one the supplier gave. A PO
            wearing our own estimate has had no supplier date at all, so it asks
            for the first — the string this page already carried, now reaching
            the POs that always needed it. */}
        {confirmed ? "Record a new date…" : "Record the supplier's date…"}
      </button>
    );
  }

  return (
    <div className="py-1" data-testid="po-date-form">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={date}
          autoFocus
          onChange={(e) => setDate(e.target.value)}
          onKeyDown={keys}
          aria-label={held == null ? "Supplier delivery date" : "New supplier delivery date"}
          data-testid="po-date-input"
          className="h-8 rounded-control border border-kit-slate-5 bg-white px-2 text-body text-kit-slate-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9"
        />
        {moved && (
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={keys}
            aria-label="Reason"
            data-testid="po-date-reason"
            className="h-8 rounded-control border border-kit-slate-5 bg-white px-2 text-body text-kit-slate-12"
          >
            {PO_DELAY_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        )}
        {remarksOpen ? (
          <input
            type="text"
            value={remarks}
            autoFocus
            onChange={(e) => setRemarks(e.target.value)}
            onKeyDown={keys}
            placeholder="Remarks"
            aria-label="Remarks"
            data-testid="po-date-remarks"
            className="h-8 flex-1 min-w-[8rem] rounded-control border border-kit-slate-5 bg-white px-2 text-body text-kit-slate-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9"
          />
        ) : (
          <button
            type="button"
            onClick={() => setRemarksOpen(true)}
            data-testid="po-date-remarks-open"
            className="text-label text-kit-slate-9 border-b border-dashed border-kit-slate-5 hover:text-kit-slate-12"
          >
            + Remarks
          </button>
        )}
        {/* A MULTI-field form needs a button (Jess: "i cant save?"). Enter-to-
            save is an inline-edit gesture for ONE value; here it is a hint at
            best, and a hidden control at worst. Esc still cancels. */}
        <button
          type="button"
          onClick={submit}
          disabled={date === "" || save.isPending}
          data-testid="po-date-save"
          className={`${DOC_BTN} disabled:opacity-40`}
        >
          {save.isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={close}
          data-testid="po-date-cancel"
          className="text-label text-kit-slate-9 hover:text-kit-slate-12"
        >
          Cancel
        </button>
      </div>
      {/* Say what Save will record BEFORE it happens; silent until a date is
          keyed, because with nothing keyed there is nothing to record. */}
      {date !== "" && (
        <div className="text-label text-kit-slate-9" data-testid="po-date-effect">
          {held == null
            ? `First date from ${supplierName}.`
            : shiftDays > 0
              ? `Delay ${shiftDays} day${shiftDays === 1 ? "" : "s"} from ${fmtDateShort(held)}.`
              : shiftDays < 0
                ? `Earlier by ${-shiftDays} day${shiftDays === -1 ? "" : "s"} than ${fmtDateShort(held)}.`
                : `Same date — the supplier confirms ${fmtDateShort(held)}.`}
        </div>
      )}
      {err && (
        <div className="mt-1 text-label text-kit-red-11" data-testid="po-date-error">
          {err}
        </div>
      )}
    </div>
  );
}

/**
 * ACTIVITY — Work + History (Jess, 2026-08-02, renamed from Communication):
 * the communication tools on top, the unified BUSINESS timeline below.
 * The timeline is a READ-TIME MERGE of the real stores — never a master
 * `activity` table, never a copy. Today the only store on this wire is the
 * PO itself (issued); sends (`po_sends`) · notes (`po_notes`) · receiving
 * events join in Phase 3/4 with their own stores. Field CHANGES never
 * appear here — a field's history lives beside the field, in its section.
 */
/**
 * Same day + same channel + same revision = ONE row with a count.
 *
 * **The row prints the FIRST press, never the latest** (Jess, 2026-08-03):
 * *"Timeline 每一行代表一个事件，不是最新状态."* The row's meaning is *this
 * revision left the Portal at this moment*, and that became true on the first
 * press; every later press is what `×2` says. Printing the latest time would
 * walk a moment that never moved.
 *
 * The earliest is computed by MIN rather than taken from the input order — the
 * api sends `sent_at desc` today, and a row whose meaning depends on an api's
 * ORDER BY is a row that changes meaning when somebody tunes a query.
 */
function groupSends(
  sends: NonNullable<operationPoListRow["sends"]>,
): {
  key: string;
  firstAt: string;
  channel: string;
  revNo: number | null;
  count: number;
}[] {
  const out: {
    key: string;
    firstAt: string;
    channel: string;
    revNo: number | null;
    count: number;
  }[] = [];
  for (const s of sends) {
    const day = s.sent_at.slice(0, 10);
    const revNo = s.po_revisions?.rev_no ?? null;
    const key = `${day}|${s.channel}|${revNo ?? "-"}`;
    const hit = out.find((g) => g.key === key);
    if (hit) {
      hit.count += 1;
      if (s.sent_at < hit.firstAt) hit.firstAt = s.sent_at;
    } else {
      out.push({ key, firstAt: s.sent_at, channel: s.channel, revNo, count: 1 });
    }
  }
  return out;
}

/**
 * The door a send went out of, named as the operator knows it.
 *
 * The stored `channel` is plumbing (`whatsapp` · `email`); the screen says
 * `WhatsApp opened` · `Email opened` — ONE shape for every door, so
 * `Supplier Portal opened` joins it later without a new sentence (Jess,
 * 2026-08-03). **It names what the Portal OBSERVED**, never what reached the
 * supplier.
 */
function doorLabel(channel: string): string {
  if (channel === "whatsapp") return "WhatsApp";
  if (channel === "email") return "Email";
  return channel;
}

/**
 * One concern, one labelled band (Jess, 2026-08-03). `Document` ·
 * `Communication` · `Communication History` are three CONCERNS, so
 * `Download PDF`, `Supplier Portal`, Teams or WeCom each join an existing
 * band later without the structure moving.
 *
 * Small-caps label over a hairline — the workspace rhythm already in use in
 * this file, spelled once (§6.6) rather than three times.
 */
function DeskBand({ children }: { children: ReactNode }) {
  return (
    <>
      <h3 className="text-label font-semibold uppercase tracking-wide text-kit-slate-9">
        {children}
      </h3>
      <div className="mt-1 border-t border-kit-slate-4" />
    </>
  );
}

function ActivityDesk({
  po,
  supplier,
  template,
}: {
  po: operationPoListRow;
  supplier: SupplierRow | undefined;
  template: string | null;
}) {
  const [draftOpen, setDraftOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const send = useRecordSend(po.id);
  const saveTemplate = useSetMessageTemplate();
  const qc = useQueryClient();

  const supplierName = supplier?.name ?? "supplier";
  const items = po.purchase_order_lines
    .map((l) => `${l.sku} ×${l.qty}`)
    .join("\n");
  /**
   * WHAT THE SUPPLIER IS TOLD — and the register's provenance rule reaches
   * here too, because this is the one screen a FACTORY reads (Loo, 2026-08-05).
   *
   * `po.eta_date` alone used to decide it, so a PO born with our own estimate
   * sent the factory `Expected Arrival: 14 Aug` — our arithmetic handed back to
   * them as though it were their agreement, and the very question we needed to
   * ask went unasked. When no supplier has named an arrival the draft asks for
   * one; that sentence already existed on this page for the dateless case, and
   * it is simply reaching the POs that always needed it.
   *
   * §12.2 ② — `Expected Arrival` is the ONE word for this fact everywhere it
   * appears, and a message a supplier holds is where it matters most.
   */
  const arriving =
    po.eta_date && poDateHistoryOf(po.promises).currentDate
      ? `Expected Arrival: ${fmtDate(po.eta_date)}`
      : "Please confirm the arrival date.";

  /** The ONE company-wide draft, filled in. A template with no placeholders
   *  still works — it is simply sent as written. */
  const fill = (t: string) =>
    t
      .replaceAll("{supplier}", supplierName)
      .replaceAll("{po}", po.id)
      .replaceAll("{items}", items)
      .replaceAll("{date}", arriving);

  const DEFAULT_TEMPLATE =
    "Hi {supplier},\n\n{po}\n{items}\n\n{date}\n\n— Carres";

  // EDITABLE (Jess, 2026-08-02): the draft is a starting point, not a rule.
  // It re-fills when the PO changes, and any edit stays until sent.
  const [text, setText] = useState(() => fill(template ?? DEFAULT_TEMPLATE));
  useEffect(() => {
    setText(fill(template ?? DEFAULT_TEMPLATE));
    setDraftOpen(false);
    setSaved(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [po.id, template]);

  /**
   * The WhatsApp door, and WHICH door it is.
   *
   * COPY-STANDARD (Loo, 2026-07-28) gives this button two labels, not one:
   * `Open WhatsApp group` for the supplier's saved group link, `Open WhatsApp`
   * for a `wa.me/` chat with one named party. The word follows the BEHAVIOUR —
   * a label naming a door the click does not open is worse than a vague one,
   * because the operator learns to stop reading it. The label is therefore
   * resolved at render time from what is on file, never a third blended word.
   */
  const wa = useMemo(() => {
    if (supplier?.whatsapp_group_url)
      return { url: supplier.whatsapp_group_url, isGroup: true };
    const digits = (supplier?.contact ?? "").replace(/\D/g, "");
    return digits ? { url: `https://wa.me/${digits}`, isGroup: false } : null;
  }, [supplier]);
  const email = supplier?.contact_email ?? null;
  const mailto = email
    ? `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
        `${po.id} — Carres Purchase Order`,
      )}&body=${encodeURIComponent(text)}`
    : null;

  const sends = po.sends ?? [];
  /* ⭐ THE SAME GOVERNED EVIDENCE JOURNEY AS SO BATCH PURCHASE
     (Card §5.3 / §9 Task 6 — "reuse the same evidence component and law on the
     Purchase Order detail page"). One component, so the two surfaces cannot
     drift into telling an operator different things about the same document.
     It reads PERSISTED `po_sends`, so a reload, a second operator and a
     revision all agree, and it declares the CURRENT version — after a revise,
     the previous version's evidence stays as history and the new version is
     unsent. */
  const issuedPo = {
    id: po.id,
    supplierId: po.supplier_id ?? "",
    supplierName: supplier?.name ?? null,
    destinationId: po.destination_id ?? "",
    destination: null,
  };

  return (
    <section className="mt-4 pt-3 border-t border-kit-slate-5" data-testid="po-activity">
      {/* ① COMMUNICATION — ONE AREA, and it is `PoIssueEvidence` below.
          Loo froze this band's home on 2026-08-03: *"Communication starts from
          the DOCUMENT, never from the register."* That still holds; what
          changed on 2026-08-24 (Card 02 closure §7) is that this band no longer
          keeps its OWN `Copy message` · `Open WhatsApp group` · `Open email`
          beside the governed evidence surface, which carried the same three.
          One document had two sets of send controls and two accounts of what
          had happened to it — and a `Download PDF` that handed over JSON.

          The supplier's real doors are resolved here, where the supplier is
          known, and PASSED IN. `Message` still opens the draft below, because
          composing is not communicating.

          Every label names the DOOR it opens, never the outcome it hopes for —
          `docs/ACTION-FLOW-STANDARD.md` Law 8, the Observation Law (Jess,
          2026-08-03): *opening an external application, copying text, or
          generating a file does not prove that the external outcome occurred.*
          So no control anywhere here may say `Send`.

          `Record the PDF sent` is the one act that completes Issue PO, and it
          is not a tick-box: it asks WHO received it and WHICH VERSION, and
          refuses a version the operator did not actually see (0378). */}
      <DeskBand>Communication</DeskBand>
      <div className="mt-1 flex items-center gap-2">
        {saved && (
          <span className="text-label font-medium text-kit-green-11" data-testid="po-template-saved">
            Template saved
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setDraftOpen((o) => !o)}
          aria-expanded={draftOpen}
          data-testid="po-wa-toggle"
          className="inline-flex items-center gap-1 text-label text-kit-slate-9 hover:text-kit-slate-12"
        >
          <Icon name={draftOpen ? "collapse" : "expand"} size={14} />
          Message
        </button>
        {send.isPending && (
          <span className="text-label text-kit-slate-9">Recording…</span>
        )}
      </div>

      <div className="mt-3" data-testid="po-issue-evidence">
        <PoIssueEvidence
          po={issuedPo}
          version={po.version ?? 1}
          evidence={sends}
          /* The supplier's own doors, resolved where the supplier is known. */
          doors={{ whatsapp: wa, mailto, message: text, supplierName: supplier?.name ?? null }}
          /* An external app OPENED — history, and it completes nothing. */
          onOpened={(channel) => send.mutate({ channel })}
          onConfirmed={() => void qc.invalidateQueries({ queryKey: ["operation", "pos"] })}
        />
      </div>

      {draftOpen && (
        <div className="mt-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            aria-label="Message"
            data-testid="po-wa-message"
            className="w-full rounded-card border border-kit-slate-5 bg-white px-3 py-2 text-body text-kit-slate-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9"
          />
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                // Saved with the PLACEHOLDERS back in, or the next PO would
                // inherit this one's number and items.
                const generic = text
                  .replaceAll(po.id, "{po}")
                  .replaceAll(supplierName, "{supplier}")
                  .replaceAll(items, "{items}")
                  .replaceAll(arriving, "{date}");
                saveTemplate.mutate(
                  { text: generic },
                  { onSuccess: () => setSaved(true) },
                );
              }}
              disabled={saveTemplate.isPending}
              data-testid="po-save-template"
              className={`${DOC_BTN} disabled:opacity-40`}
            >
              {saveTemplate.isPending ? "Saving…" : "Save as template"}
            </button>
            <span className="text-label text-kit-slate-9">
              Used for every supplier · {"{supplier} {po} {items} {date}"}
            </span>
          </div>
        </div>
      )}

      {/* ③ COMMUNICATION HISTORY — what the Portal OBSERVED, and nothing
          more. Deliberately NOT called `History`: the PO's real history will
          later carry revisions, arrival-date changes, notes and
          claims, and that name is being kept for it (Jess, 2026-08-03 —
          overriding her own 2026-08-02 `ACTIVITY`, whose reason was that the
          section would hold the business timeline; it holds only the doors).

          An internal act — `Print PDF`, and `Download PDF` when it comes —
          never lands here: this band is communication WITH THE SUPPLIER. */}
      <div className="mt-4">
        <DeskBand>Communication History</DeskBand>
      </div>
      {sends.length === 0 ? (
        <div className="mt-2 text-label text-kit-slate-9" data-testid="po-history">
          No communication yet.
        </div>
      ) : (
        <ul className="mt-2 flex flex-col gap-2" data-testid="po-history">
          {/* Opening WhatsApp twice in a morning is ONE event that happened
              twice — same day, same channel, same revision collapse into one
              row (Jess caught the duplicate). `×2` does NOT mean "sent twice";
              it means the same Portal action was observed twice, which is what
              answers an operator who says "I definitely pressed it again". */}
          {groupSends(sends).map((g) => (
            <li key={g.key} data-testid="po-history-row">
              <div className="flex items-baseline gap-2 text-body">
                <span className="text-kit-slate-12 min-w-0">
                  {doorLabel(g.channel)} opened
                  {g.revNo != null ? (
                    <span className="text-kit-slate-9"> · Snapshot {g.revNo}</span>
                  ) : null}
                </span>
                {g.count > 1 ? (
                  <span
                    className="ml-auto shrink-0 text-label text-kit-slate-9 tabular-nums"
                    data-testid="po-history-count"
                  >
                    ×{g.count}
                  </span>
                ) : null}
              </div>
              {/* The FIRST press, never the latest — see `groupSends`. */}
              <div className="text-label text-kit-slate-9 tabular-nums">
                {fmtDate(g.firstAt, { time: true })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
