/**
 * Purchasing → **To Order** — the Work Queue + Excel Workspace
 * (Jess's freeze, 2026-08-01, over Loo's final freeze of the same day).
 *
 * MISSION (one sentence, hers): decide which customer orders become purchase
 * orders today. Purchase Orders MANAGES the documents once they exist.
 *
 * THE PAGE IS TWO DIMENSIONS AND NOTHING ELSE:
 *
 * LEFT = the WORK QUEUE (Linear's density). Two blocks:
 *   · PO SCHEDULE — the PURCHASE CALENDAR (Jess, 2026-08-01): one row per
 *     upcoming configured PO day, ROLLING from today (yesterday's Monday is
 *     never shown), each demand snapped to the nearest EARLIER PO day —
 *     never later. A red OVERDUE row sits above the calendar and the next
 *     run may never swallow it. The engine opens the first upcoming run;
 *     the operator roams freely.
 *   · CATEGORY — All · Mattress · Bedframe · Sofa, the WORK ORDER (清完一类
 *     再下一类), no counts (the grid answers the moment you click).
 *   · `+ Create Purchase` — the manual entrance, may never be missing.
 *
 * RIGHT = the EXCEL WORKSPACE. One toolbar (2990's language: pill search ·
 * selection state · the Issue pill, which EXISTS ONLY WHILE SOMETHING IS
 * SELECTED · a quiet `Updated hh:mm` — never a Refresh). One grid, SEVEN
 * frozen columns in AutoCount's ALIGNED shape (T1, Loo 2026-08-06):
 *
 *   ☑ · SO No. · Customer · Customer Delivery · Supplier · Qty · Model · PO No.
 *
 * The ORDER's facts print once, on an aligned order line under the headers
 * that name them (never a free-text sentence — Loo ruled that hard to read);
 * item rows carry what is true of one piece of goods. Every column sorts by
 * header click and filters by its ▼ — the Delivery ▼ is the portal's Excel
 * date ▼ (presets · months · Custom Date Range…) plus `Overdue`, and the PO
 * filter speaks business: `Yet to Order` + the real numbers, never
 * `(Blanks)`. An always-on `Total · N units` strip closes the sheet.
 * No Status pills (two filter doors for one fact is the Excel sin), no Sort
 * By, no Group By.
 *
 * THE GOLDEN RULE STANDS: `Order By` never reaches the screen. Each row
 * carries it ONLY to know its time bucket; the operator sees the CUSTOMER's
 * date. Engine pre-selects exactly its own plan (orderBy ≤ today); rows in
 * later buckets start unticked and a human ticks them — overrides are DELTAS
 * a refetch cannot overturn.
 *
 * ORDERED rows (recent POs, one row per customer order) stay in the grid in
 * their time bucket — `Today + Ordered` answers 今天已经下了哪些. Their PO No.
 * is a link that lands on Purchase Orders with that PO opened: the receipt is
 * the door to the next step. Real history belongs to Purchase Orders.
 *
 * On Issue: one governed review captures transaction cost / Free of Charge and
 * a factory-pickup document's procurement partner. One POST still uses the
 * authoritative engine; rows update IN PLACE, the left counts fall, the
 * bottom bar reports and a partial failure stays with Retry until it succeeds.
 */
import { useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  TO_ORDER_WORDS as W,
  categoryLabel,
  categoryUnitsLine,
  defaultDocuments,
  ordersHeadline,
  poScheduleBucket,
  poScheduleDays,
  posCreatedLine,
  railItemLabel,
  selectedShort,
  issuePosShort,
  planFromDocuments,
  toOrderBuilds,
  unitsHeadline,
  unresolvedHeadline,
  freeStockLine,
  onPoLine,
  reserveFromStockLabel,
  reservedFromStockLabel,
  stockExpandLabel,
  // The hierarchy projection (CARD-2026-08-18-so-batch-purchase §2/§3).
  buildHierarchy,
  leafCoverage,
  leafToBuy,
  leafNeed,
  selectableKeysOf,
  type HierarchyGroup,
  type HierarchyLeaf,
  type ToOrderOrderedRow,
  type ToOrderProposal,
} from "@carres/shared";
import Button from "@/components/kit/Button";
import Card from "@/components/kit/Card";
import DataTable, {
  type Column,
  type ColumnFilter,
  type GroupRowCell,
  type TableSort,
} from "@/components/kit/DataTable";
import EmptyState from "@/components/kit/EmptyState";
import GridToolbar from "@/components/kit/GridToolbar";
import Icon from "@/components/kit/Icon";
import Input from "@/components/kit/Input";
import Loading from "@/components/kit/Loading";
import Modal from "@/components/kit/Modal";
import SearchInput from "@/components/kit/SearchInput";
import Select from "@/components/kit/Select";
import Textarea from "@/components/kit/Textarea";
import { apiFetch } from "@/lib/api";
// The Excel date ▼ machinery lives in ONE lib (`excel-date-filter.ts`) so this
// page's Delivery ▼ speaks the same presets, month buckets and Custom Date
// Range as Purchase Orders' three date columns — built there 2026-08-02 "to
// flow back to every date column in the portal", and T1 is the flow-back.
import {
  dateFilterMatches,
  datePresetOptions,
  monthLabel,
  rangeValue,
} from "@/lib/excel-date-filter";
import { fmtDate, fmtDateShort } from "@/lib/fmt-date";
import { displayCustomerName } from "@/lib/customer-name";
import { qk } from "@/lib/queries";
/** A deliver-to option the payload carries. Lived in the retired
 *  CreatePurchaseDialog; the grid's own destination cell still needs it. */
interface Destination {
  id: string;
  name: string;
  isDefault: boolean;
}
import PurchasingTabs from "./PurchasingTabs";

// ── Wire types ──────────────────────────────────────────────────────────────

interface Unresolved {
  sku: string;
  orderId: string;
  so: number | null;
}

interface ToOrderResponse {
  today: string;
  /** Settings' PO Days — the rail's purchase calendar runs on it. */
  poDays?: number[];
  proposals: ToOrderProposal[];
  destinations: Destination[];
  procurementPartners?: { id: string; name: string }[];
  /** Recent POs read back — the grid's `Ordered` answer. */
  ordered?: ToOrderOrderedRow[];
  /** Demand the catalog could not answer for. Empty is the only healthy value. */
  unresolved?: Unresolved[];
  /** P10 — the warehouse the free-stock offer was counted at, by its own
   *  name. `null` = there is no offer to make and no sentence to print. */
  stockWarehouse?: string | null;
  scope?: {
    so: number;
    orderFound: boolean;
    issuable: number;
    blockedProductionDays: number;
    blockedDeliveryDate: number;
    unresolved: number;
    alreadyCovered: number;
    alreadyIssued: number;
  };
}

/** P10 — what `Reserve` answers with. The number is the SERVER's. The wire key
 *  stays `taken`: it is a contract, not a word anybody reads (P13). */
interface ReserveStockResponse {
  taken: number;
  reference: string;
  items: number;
}

interface IssueResponse {
  supplier: string;
  destination: string;
  pos: { id: string; customer: string }[];
}

/** One group's batch outcome — the grid and the bar are the progress report. */
type GroupResult =
  | { status: "queued" }
  | { status: "done"; pos: string[] }
  | { status: "failed"; message: string };

type CommercialDecision =
  | { treatment: "normal"; unitCost: string; costSource: "catalog" | "hand_entered" }
  | { treatment: "free_of_charge"; reason: string };

/** One grid row = one BUILD (a thing with a MODEL NAME — `2 items` is
 *  banned from the Model column, Jess 2026-08-01) within one
 *  supplier×category proposal — or one already-ordered build on a recent
 *  PO. The ☑ stays build-level exactly as Loo froze it: membership of THIS
 *  purchase order, nothing more. */
interface GridRow {
  key: string;
  proposalKey: string | null;
  buildKey: string | null;
  category: string;
  /**
   * The factory. Supplier × category is what decides how many purchase orders
   * `Issue` produces, and before 2026-08-03 that fact lived only in the
   * button's `title` tooltip — unreachable by keyboard (`01` §9).
   */
  supplier: string | null;
  orderId: string | null;
  customer: string | null;
  so: number | null;
  delivery: string | null;
  late: boolean;
  /**
   * P18 — the ORDER's planned production-start date (`orders.proceed_date`).
   *
   * It sits on the row only to travel to the GROUP HEADER, exactly as `so` and
   * `customer` do. It is never rendered in a cell: Loo ruled 2026-08-04 that a
   * fact which is not per-row gets no column, and every line under one SO
   * carries the same value. `null` on a Ready Stock demand — no order, no plan.
   */
  proceedDate: string | null;
  model: string;
  /** The build's one spec sentence (fabric · colour · legs) — the hierarchy's
   *  variant level groups on it. `""` on a receipt read back off a PO. */
  spec: string;
  qty: number;
  /**
   * The calendar row this demand belongs to: `overdue` · a PO day's ISO
   * date · `past` (an old ordered row — Purchase Orders' business). Built
   * from the engine's orderBy, which itself never renders.
   */
  bucket: string;
  /** Set on a row the server read back as already ordered. */
  orderedPo: string | null;
  /** TRUE = Ready Stock a human typed, not a customer requirement. */
  readyStock: boolean;
  /** Where that ready stock goes — what the group header says instead of a
   *  customer name, because a ready stock buy has no customer. */
  destination: string | null;
  /**
   * P10 — how many units the warehouse could cover TODAY. `0` on every row on
   * a floor with no matching stock, which is what keeps the grid byte-identical
   * to what it was: the expand control appears only where this is above zero.
   */
  freeStock: number;
  /** P10 — units of this build already taken from ready stock. */
  takenFromStock: number;
  /**
   * T3 — units of this build an OPEN purchase order already covers. `qty` is
   * already net of it, which is the whole reason it is on the row: a quantity
   * that fell with nothing beside it cannot be checked by the person who has
   * to sign the purchase order.
   *
   * `0` on an ordered row (a receipt decides nothing) and `0` on a build whose
   * every line was FULLY covered — such a build never reaches this grid at
   * all, because it has nothing left to buy.
   */
  coveredByOpenPo: number;
  /** T3 — the purchase orders behind it, for the cell's hover. Empty = no
   *  title; a reference is never invented. */
  coveredByOpenPoPos: string[];
  /** Customer demand remains visible, but cannot enter an Issue document. */
  blocker: "blocked_delivery_date" | null;
}

/**
 * The rail's CATEGORY rows — Loo's walking order, then the two accessory
 * KINDS Jess planned ahead (2026-08-01): their demand arrives with the
 * inventory pipeline; the rows exist so the layout never moves again.
 */
const RAIL_CATEGORIES: { key: string; word: string }[] = [
  { key: "mattress", word: categoryLabel("mattress") },
  { key: "bedframe", word: categoryLabel("bedframe") },
  { key: "sofa", word: categoryLabel("sofa") },
  { key: "pillow", word: W.categoryPillow },
  { key: "mattress_protector", word: W.categoryMattressProtector },
];

/** Where a PO's document lives — the per-supplier channel tab. */
const PO_TAB_SLUG: Record<string, string> = {
  mattress: "nice-future",
  sofa: "hookka-sofa",
  bedframe: "hookka-bedframe",
};

/** `10:32 AM` — locale-free on purpose, so a CI node prints what Jess sees. */
function clockLabel(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(d.getMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/**
 * `Fri, 7 Aug` — a rail day row's word. `railDayLabel` is DELETED (owner ruling
 * 2026-08-15): it composed a no-year date by slicing the weekday off `fmtDate`
 * and regexing the year off `fmtDateShort`, which is a fourth date spelling
 * built out of two others. THE YEAR RULE makes the no-year form the formatter's
 * own answer, so the rail calls `fmtDate` like everything else.
 */
/* `properCase` is DELETED (owner ruling 2026-08-15). It lowercased the whole
 * string before raising each word, so `KJ NG` came out `Kj Ng` and
 * `LIM KUAN YANG` came out `Lim Kuan Yang` — a customer's initials rewritten
 * by a page-local copy of a rule that now has ONE home. See
 * `@/lib/customer-name`: capitalize UP only, never down.
 */

/**
 * P12 — the `purchase_demands` row behind a grid row, or `null`.
 *
 * A typed demand carries `demand:<uuid>` as its `orderId` (the api sets it so
 * the demand groups alone and so an issue can be credited back). A CUSTOMER
 * requirement never matches, which is what keeps `Cancel` off every row it has
 * no business on: cancelling a customer's order is the Orders module's act, and
 * this door only reaches the table a human typed into.
 */
function demandIdOf(r: GridRow): string | null {
  return /^demand:(.+)$/.exec(r.orderId ?? "")?.[1] ?? null;
}

/** Sentinels for filter options that are facts, not values. */
const F_OVERDUE = "__overdue__";
const F_NONE = "__none__";
const F_NOT_ORDERED = "__not_ordered__";

// ── Page ────────────────────────────────────────────────────────────────────

export default function OperationToOrder() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawScopeSo = searchParams.get("so");
  const scopeSo = rawScopeSo && /^\d+$/.test(rawScopeSo) ? Number(rawScopeSo) : null;

  const q = useQuery<ToOrderResponse>({
    queryKey: [...qk.operation.toOrder(), { so: scopeSo }],
    queryFn: () =>
      apiFetch<ToOrderResponse>(
        `/api/operation/purchase/to-order${scopeSo == null ? "" : `?so=${scopeSo}`}`,
      ),
    refetchOnWindowFocus: true,
  });

  const proposals = useMemo(() => q.data?.proposals ?? [], [q.data]);
  const poDays = useMemo(() => q.data?.poDays ?? [], [q.data]);
  const orderedRows = useMemo(() => q.data?.ordered ?? [], [q.data]);
  const destinations = useMemo(() => q.data?.destinations ?? [], [q.data]);
  const procurementPartners = useMemo(
    () => q.data?.procurementPartners ?? [],
    [q.data],
  );
  const unresolved = useMemo(() => q.data?.unresolved ?? [], [q.data]);
  const today = q.data?.today ?? null;
  /** P10 — the warehouse the offer was counted at. The page NEVER types the
   *  word: a second warehouse is a rename away, and a sentence naming the
   *  wrong shed is worse than one naming none. */
  const stockWarehouse = q.data?.stockWarehouse ?? null;

  /**
   * The Work Queue's two picks live in the URL, so a refresh or a shared
   * link keeps the view (the 2990 habit). The engine still opens Today.
   */
  /** The purchase calendar — one row per upcoming configured PO day. */
  const scheduleDays = useMemo(
    () => (today ? poScheduleDays(poDays, today) : []),
    [poDays, today],
  );
  // Both rail blocks MULTI-SELECT (Jess, 2026-08-01): tick two runs, tick
  // two categories — the grid is the union. Empty = the default.
  const rawView = searchParams.get("view");
  const viewSet = useMemo(() => {
    // No param = the engine's opening (first upcoming run). An EXPLICIT
    // empty (`view=`) = the operator cleared the block: NO time narrowing
    // at all — the second way to place (Jess, 2026-08-01: browse by
    // category alone; nothing forces a run to stay lit).
    if (rawView == null) {
      // A Sales Order entrance must explain the whole order, not whichever PO
      // day the normal workspace opens on. Explicit rail choices still narrow
      // it, and the unscoped opening remains byte-for-byte unchanged.
      if (scopeSo != null) return new Set() as ReadonlySet<string>;
      return new Set(scheduleDays[0] ? [scheduleDays[0]] : []) as ReadonlySet<string>;
    }
    return new Set(
      rawView.split(",").filter((v) => v === "overdue" || scheduleDays.includes(v)),
    ) as ReadonlySet<string>;
  }, [rawView, scheduleDays, scopeSo]);
  const rawCat = searchParams.get("cat");
  const catSet = useMemo(
    () =>
      new Set(
        (rawCat ?? "").split(",").filter((c) => RAIL_CATEGORIES.some((r) => r.key === c)),
      ) as ReadonlySet<string>,
    [rawCat],
  );
  const setParam = (key: "view" | "cat", value: string) =>
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.set(key, value);
        return n;
      },
      { replace: true },
    );
  const toggleView = (v: string) => {
    // Toggles run against the EFFECTIVE set (the open-where-the-work-is
    // default included), so the first click on a lit default turns it off.
    // Legal forward reference: this body only runs on click, after render.
    const n = new Set(effViewSet);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    setParam("view", [...n].join(","));
  };
  const toggleCat = (c: string) => {
    const n = new Set(catSet);
    if (n.has(c)) n.delete(c);
    else n.add(c);
    setParam("cat", [...n].join(","));
  };
  const clearCats = () => setParam("cat", "");
  const clearSoScope = () =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("so");
        return next;
      },
      { replace: true },
    );
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<TableSort | null>(null);
  /** Per-column Excel filters. An absent key = no filter. */
  const [colFilters, setColFilters] = useState<ReadonlyMap<string, ReadonlySet<string>>>(
    new Map(),
  );
  /**
   * The operator's overrides, as DELTAS against the engine's default — never
   * an absolute set, so a refetch pre-ticks NEW rows and never overturns a
   * human's untick (or tick) of a row it has seen before. Two sets because
   * the default now differs by bucket: today's plan is ON, the future is OFF.
   */
  const [userOff, setUserOff] = useState<ReadonlySet<string>>(new Set());
  const [userOn, setUserOn] = useState<ReadonlySet<string>>(new Set());
  /** PO numbers won this session, by row key — the grid updates in place. */
  const [rowPo, setRowPo] = useState<ReadonlyMap<string, string>>(new Map());
  const [results, setResults] = useState<ReadonlyMap<string, GroupResult>>(new Map());
  const [creating, setCreating] = useState(false);
  const [issueReviewOpen, setIssueReviewOpen] = useState(false);
  const [commercialDecisions, setCommercialDecisions] = useState<
    ReadonlyMap<string, CommercialDecision>
  >(new Map());
  const [documentPartners, setDocumentPartners] = useState<ReadonlyMap<string, string>>(
    new Map(),
  );
  /**
   * P10 — which rows are open, and which one is mid-take.
   *
   * Controlled by the page, which is `DataTable`'s own contract: the page
   * already knows the record it is working on, and a component holding a
   * second copy of that is a second source of truth.
   */
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [reserving, setReserving] = useState<string | null>(null);
  const [reserveError, setReserveError] = useState<ReadonlyMap<string, string>>(new Map());
  /**
   * P12 — the row whose purchase is being cancelled, or `null`.
   *
   * A confirm step exists because a cancel is not undoable from any screen: the
   * record keeps the reason forever and nothing in the portal un-cancels a
   * demand. The step is also where the mandatory reason is typed, so it is not
   * a bare "are you sure?" — it asks for something the record needs.
   */
  const [cancelRow, setCancelRow] = useState<GridRow | null>(null);

  /** Demand the engine cannot plan (`blocked`) cannot be issued — not listed. */
  const planned = useMemo(() => proposals.filter((p) => p.blocked == null), [proposals]);

  /** Every grid row — demand first, then what was already ordered. */
  const allRows = useMemo<GridRow[]>(() => {
    const rows: GridRow[] = [];
    for (const p of planned) {
      for (const r of p.rows) {
        // NO delivery date = NOT purchasable work (Jess, 2026-08-01, ruled
        // three times over my objection — she is right): the engine cannot
        // schedule it, and pre-ticking a run with goods for an unconfirmed
        // order is worse than hiding them. NOT lost demand: the moment the
        // date is confirmed the projection brings the order straight back,
        // and chasing that confirmation is the Orders module's own Call
        // customer action. Ordered rows (receipts) are unaffected.
        //
        // A READY STOCK DEMAND IS EXEMPT, and finding out why cost a real
        // press of the button (2026-08-03). This rule is about a CUSTOMER
        // whose date is not agreed yet. Ready stock has no customer and never
        // will: an empty `Required By` is not "unconfirmed", it is the frozen
        // meaning *buy it on the next run*. Applying the customer rule to it
        // swallowed every typed demand silently — saved, stored, invisible.
        const blocker = r.delivery == null && !r.readyStock ? "blocked_delivery_date" : null;
        const bucket = blocker
          ? "overdue"
          : today == null
            ? "overdue"
            : (() => {
                const b = poScheduleBucket(r.orderBy ?? null, poDays, today);
                return b.kind === "overdue" ? "overdue" : b.day;
              })();
        for (const b of r.builds) {
          rows.push({
            key: `${p.key}:${r.orderId}:${b.key}`,
            proposalKey: p.key,
            buildKey: b.key,
            category: p.category,
            supplier: p.supplierName || null,
            readyStock: r.readyStock === true,
            destination: r.destination ?? null,
            orderId: r.orderId,
            customer: r.customer ?? null,
            so: r.so,
            delivery: r.delivery ?? null,
            late: today != null && r.delivery != null && r.delivery < today,
            proceedDate: r.proceedDate ?? null,
            model: railItemLabel(b.model, b.size ?? null),
            spec: b.spec,
            qty: b.qty,
            bucket,
            /**
             * ⭐ T6 (Loo, 2026-08-06) — A BUILD ALREADY BOUGHT IN FULL IS A
             * RECEIPT, and it takes the receipt's own field.
             *
             * It used to be dropped by the engine, and with it whole customer
             * orders: measured on production, 41 of 78 eligible demand lines
             * were covered and every one of them covered in FULL, so `SO-1210`
             * vanished and *"where is SO-1210?"* was answered on no screen.
             *
             * Writing the purchase order into `orderedPo` — the same field a
             * row read back off a recent PO uses — is what makes the rest of
             * the page correct without one new rule: `poOf` answers, so the row
             * is not selectable, not counted on the rail, not in the category
             * footer, never in a batch, and its `PO No.` cell is already the
             * blue link that opens that document. Every one of those places
             * asks the same question, *does this row have a purchase order?*,
             * and the answer is now honestly yes.
             *
             * The FIRST id, because the cell shows one link; the rest ride the
             * hover (`onPoLine`). It may be a purchase order raised for another
             * customer — the engine nets per SKU, earliest deadline first — and
             * §3 records that, because the number answers *where are these
             * units coming from*, not *this is your document*.
             */
            orderedPo: b.fullyOnPo ? (b.coveredByOpenPoPos?.[0] ?? null) : null,
            freeStock: b.freeStock ?? 0,
            takenFromStock: b.takenFromStock ?? 0,
            coveredByOpenPo: b.coveredByOpenPo ?? 0,
            coveredByOpenPoPos: b.coveredByOpenPoPos ?? [],
            blocker,
          });
        }
      }
    }
    const demandKeys = new Set(rows.map((r) => r.key));
    /**
     * ⭐ A RECEIPT ROW'S KEY MUST BE UNIQUE, and it was not (Loo, on the live
     * page 2026-08-07: *"wrong"*).
     *
     * `po:{poId}:{orderId}` is one key for what the wire sends as one row PER
     * BUILD, so a purchase order carrying three pieces for one customer minted
     * **three rows with the same key**. React saw duplicate keys and placed
     * them where it liked: measured on live data, `SO-1257` rendered as TWO
     * fragments fourteen orders apart, each with its own order line, and the
     * first five rows on the sheet had no order line above them at all. It
     * looked like a sorting bug and it was a keying bug — `rowByKey` and the
     * selection were reading a colliding map the whole time.
     *
     * The ordinal is the row's position in the server's own list, so it is
     * stable for a given answer and needs nothing new on the wire.
     */
    orderedRows.forEach((o, i) => {
      const key = `po:${o.poId}:${o.orderId ?? o.so ?? "manual"}:${i}`;
      if (demandKeys.has(key)) return;
      rows.push({
        key,
        proposalKey: null,
        buildKey: null,
        category: o.category,
        supplier: o.supplierName || null,
        readyStock: false,
        destination: null,
        orderId: o.orderId,
        customer: o.customer ?? null,
        so: o.so,
        delivery: o.delivery,
        late: today != null && o.delivery != null && o.delivery < today,
        proceedDate: o.proceedDate ?? null,
        model: o.model,
        spec: "",
        qty: o.qty,
        // Ordered TODAY sits on the current run's row (今天下了哪些);
        // older receipts belong to Purchase Orders, not this calendar.
        bucket: o.placedAt === today ? (scheduleDays[0] ?? "past") : "past",
        orderedPo: o.poId,
        // An ordered row is a RECEIPT. There is nothing left to decide on it,
        // so it is never offered stock and never opens.
        freeStock: 0,
        takenFromStock: 0,
        // T3 — the same reason: this row IS a purchase order. Its own number is
        // in the `PO No.` cell, and repeating it as coverage would say the
        // document covers itself.
        coveredByOpenPo: 0,
        coveredByOpenPoPos: [],
        blocker: null,
      });
    });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planned, orderedRows, today, poDays, scheduleDays]);

  /** A row's PO, whichever way it got one — this session or the server. */
  const poOf = (r: GridRow) => rowPo.get(r.key) ?? r.orderedPo;

  /** The rail's counts — unissued work per calendar row, falling as POs land. */
  const timeCounts = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const r of allRows) {
      if (poOf(r) || r.blocker != null) continue;
      const s = m.get(r.bucket) ?? new Set<string>();
      s.add(r.orderId ?? r.key);
      m.set(r.bucket, s);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, rowPo]);

  /**
   * ⭐ THE PAGE OPENS WHERE THE WORK IS (Jess, 2026-08-19, on the live page:
   * it opened on today's EMPTY run while `Overdue 18` waited one click above,
   * and a new hire read "No purchase orders to issue" as "no work today").
   * With no explicit rail choice, the default view is Overdue whenever
   * Overdue holds work; today's run only when it does not. An explicit
   * `?view=` — including an explicit clear — is never overridden.
   */
  const effViewSet = useMemo<ReadonlySet<string>>(() => {
    if (rawView != null || scopeSo != null) return viewSet;
    if ((timeCounts.get("overdue")?.size ?? 0) > 0) return new Set(["overdue"]);
    return viewSet;
  }, [rawView, scopeSo, viewSet, timeCounts]);

  // ── The Excel pipeline: view → category → search → column filters → sort ──

  const inView = useMemo(
    () =>
      allRows.filter(
        (r) =>
          (effViewSet.size === 0 || effViewSet.has(r.bucket)) &&
          (catSet.size === 0 || catSet.has(r.category)) &&
          (search.trim() === "" ||
            (r.so != null && `so-${r.so}`.includes(search.trim().toLowerCase())) ||
            r.model.toLowerCase().includes(search.trim().toLowerCase()) ||
            (r.customer ?? "").toLowerCase().includes(search.trim().toLowerCase()) ||
            (poOf(r) ?? "").toLowerCase().includes(search.trim().toLowerCase())),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allRows, effViewSet, catSet, search, rowPo],
  );

  /** Does a row pass ONE column's filter? Sentinels are facts, not values. */
  function passes(r: GridRow, colKey: string, sel: ReadonlySet<string>): boolean {
    if (sel.size === 0) return true;
    switch (colKey) {
      case "delivery":
        // Excel ORs a checklist. `Overdue` is a FACT (the customer's date has
        // passed), everything else is the shared date matcher — presets, month
        // buckets, `r:from:to` ranges and the `—` sentinel all answer there.
        return [...sel].some((v) =>
          v === F_OVERDUE ? r.late : today != null && dateFilterMatches(r.delivery, v, today),
        );
      case "so":
        return sel.has(r.so != null ? String(r.so) : F_NONE);
      case "supplier":
        return sel.has(r.supplier ?? F_NONE);
      case "model":
        return sel.has(r.model);
      case "customer":
        return sel.has(r.customer ?? F_NONE);
      case "qty":
        return sel.has(String(r.qty));
      case "po": {
        const po = poOf(r);
        return (sel.has(F_NOT_ORDERED) && !po) || (po != null && sel.has(po));
      }
      default:
        return true;
    }
  }

  /** Rows passing every column filter EXCEPT `except` — Excel's cascade. */
  const filteredExcept = (except: string | null) =>
    inView.filter((r) =>
      [...colFilters.entries()].every(
        ([k, sel]) => k === except || passes(r, k, sel),
      ),
    );

  /**
   * ── The rail's CATEGORY counts (P9, Loo 2026-08-04) ──────────────────────
   *
   * The six rows were hard-coded `count={null}`, so the page could not answer
   * *"how many mattresses am I buying today?"* anywhere — the grid prints a
   * per-row `Qty` and nothing totalled it.
   *
   * UNITS, not orders. The block above counts customer ORDERS; this one counts
   * physical pieces, because a purchaser buys pieces. Two right-aligned columns
   * of digits in a 200px rail is how a number gets misread, so each row's
   * tooltip names its own unit — `12 Orders` up there, `19 units` here.
   *
   * WHAT IS COUNTED, and each half is a decision:
   *
   * · UNISSUED ONLY (`poOf(r)` skipped) — the same rule `timeCounts` has used
   *   since the calendar shipped ("unissued work per calendar row, falling as
   *   POs land"). Loo's question is what he is BUYING; a row already on a
   *   purchase order has been bought. Two adjacent counts where one falls on
   *   Issue and the other does not would be worse than either alone.
   *
   * · THE CASCADE — every narrowing on the page EXCEPT the category picks
   *   themselves (`filteredExcept(null)` over `inView`, which the memo below
   *   re-derives WITHOUT `catSet`). This is the portal's own facet law (§8.2,
   *   PR 494: each group counted with every filter except its own), and here
   *   it buys one concrete guarantee: the number a row shows is the number of
   *   units its click produces. Count against the unfiltered set instead and
   *   the rail says `Mattress 19` while clicking it shows 3, because the
   *   Supplier column is filtered.
   *
   * `All` is counted the same way, so it always equals what CLEARING the
   * category gives back — the two rows stay arithmetically consistent with
   * each other whichever one is lit.
   */
  const categoryUnits = useMemo(() => {
    const byCategory = new Map<string, number>();
    let all = 0;
    for (const r of allRows) {
      if (poOf(r) || r.blocker != null) continue;
      // Everything `inView` applies except the category picks — see above.
      if (effViewSet.size > 0 && !effViewSet.has(r.bucket)) continue;
      const q = search.trim().toLowerCase();
      if (
        q !== "" &&
        !(
          (r.so != null && `so-${r.so}`.includes(q)) ||
          r.model.toLowerCase().includes(q) ||
          (r.customer ?? "").toLowerCase().includes(q) ||
          (poOf(r) ?? "").toLowerCase().includes(q)
        )
      )
        continue;
      if (![...colFilters.entries()].every(([k, sel]) => passes(r, k, sel))) continue;
      byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + r.qty);
      all += r.qty;
    }
    return { byCategory, all };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, effViewSet, search, colFilters, rowPo]);

  const visibleRows = useMemo(() => {
    const rows = filteredExcept(null);
    const dir = sort?.dir === "desc" ? -1 : 1;
    const cmpNull = <T,>(a: T | null, b: T | null, cmp: (x: T, y: T) => number) => {
      if (a == null && b == null) return 0;
      if (a == null) return 1; // nulls sink under BOTH directions
      if (b == null) return -1;
      return cmp(a, b) * dir;
    };
    const sorted = [...rows];
    if (sort == null) {
      // The frozen default: overdue first, then the customer's soonest date.
      sorted.sort(
        (a, b) =>
          (b.late ? 1 : 0) - (a.late ? 1 : 0) ||
          (a.delivery ?? "9999-12-31").localeCompare(b.delivery ?? "9999-12-31") ||
          (a.so ?? 0) - (b.so ?? 0),
      );
    } else {
      sorted.sort((a, b) => {
        switch (sort.key) {
          case "delivery":
            return cmpNull(a.delivery, b.delivery, (x, y) => x.localeCompare(y));
          case "so":
            return cmpNull(a.so, b.so, (x, y) => x - y);
          case "supplier":
            return cmpNull(a.supplier, b.supplier, (x, y) => x.localeCompare(y));
          case "model":
            return a.model.localeCompare(b.model) * dir;
          case "customer":
            return cmpNull(a.customer, b.customer, (x, y) => x.localeCompare(y));
          case "qty":
            return (a.qty - b.qty) * dir;
          case "po":
            return cmpNull(poOf(a), poOf(b), (x, y) => x.localeCompare(y));
          default:
            return 0;
        }
      });
    }
    /**
     * ⭐ A CUSTOMER ORDER IS NEVER TORN APART BY A SORT (Loo, on the live page,
     * 2026-08-07: *"wrong"*).
     *
     * MEASURED before the fix: sorting by `PO No.` produced **64 group headers
     * for 47 orders — 17 orders split into two or more fragments**, each with
     * its own header, scattered down the sheet, and the first row on screen was
     * an item with no order line above it at all.
     *
     * The cause is structural, not a bad comparator: the kit emits a group
     * header whenever the key CHANGES from the row above (`DataTable`'s own
     * contract — the page's sort decides grouping and the kit re-orders
     * nothing), so a sort on any per-ITEM fact interleaves orders and the
     * grouping shatters. T1 introduced the order line and never asked what a
     * column sort would do to it.
     *
     * So the sort is applied and then the rows are RE-CLUSTERED by order, each
     * order taking the position of its best row. Two guarantees come out of it:
     * an order's items stay together and under their own line, and the sort
     * still means what the header says — click `Qty` and the order holding the
     * biggest quantity comes first. `Array.prototype.sort` is stable, so the
     * within-order order the comparator just produced survives untouched.
     */
    const firstAt = new Map<string, number>();
    sorted.forEach((r, i) => {
      const k = r.orderId ?? r.key;
      if (!firstAt.has(k)) firstAt.set(k, i);
    });
    sorted.sort(
      (a, b) =>
        (firstAt.get(a.orderId ?? a.key) ?? 0) - (firstAt.get(b.orderId ?? b.key) ?? 0),
    );
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, colFilters, sort, rowPo]);

  // ── Selection: the engine pre-ticks ITS plan, a human ticks the rest ──────

  const defaultOn = (r: GridRow) =>
    r.blocker == null &&
    (r.bucket === "overdue" || r.bucket === scheduleDays[0]) &&
    !poOf(r);
  const isSelected = (r: GridRow) =>
    r.blocker == null &&
    !poOf(r) &&
    (defaultOn(r) ? !userOff.has(r.key) : userOn.has(r.key));
  const toggleRow = (r: GridRow) => {
    if (poOf(r) || r.blocker != null) return;
    if (defaultOn(r)) {
      setUserOff((s) => {
        const n = new Set(s);
        if (n.has(r.key)) n.delete(r.key);
        else n.add(r.key);
        return n;
      });
    } else {
      setUserOn((s) => {
        const n = new Set(s);
        if (n.has(r.key)) n.delete(r.key);
        else n.add(r.key);
        return n;
      });
    }
  };

  const selectedKeys = useMemo(() => {
    const s = new Set<string>();
    for (const r of allRows) if (isSelected(r)) s.add(r.key);
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, userOff, userOn, rowPo]);

  const rowByKey = useMemo(() => new Map(allRows.map((r) => [r.key, r])), [allRows]);

  // ── THE HIERARCHY (card §2/§3): Item → variant → SO lines; sofa by SO ────

  /** GridRow → the projection's leaf. Same key, engine numbers untouched —
   *  the projection is a VIEW over `buildToOrder`'s own arithmetic (Law D). */
  const leafOf = (r: GridRow): HierarchyLeaf => ({
    key: r.key,
    category: r.category,
    model: r.model,
    spec: r.spec,
    so: r.so,
    orderId: r.orderId ?? r.key,
    customer: r.customer,
    delivery: r.delivery,
    readyStock: r.readyStock,
    destination: r.destination,
    supplier: r.supplier,
    qty: r.qty,
    takenFromStock: r.takenFromStock,
    freeStock: r.freeStock,
    coveredByOpenPo: r.coveredByOpenPo,
    coveredByOpenPoPos: r.coveredByOpenPoPos,
    orderedPo: poOf(r) ?? null,
  });

  const hierarchy = useMemo(() => {
    const groups = buildHierarchy(visibleRows.map(leafOf));
    if (sort != null) {
      /* A header sort re-orders GROUPS by their best row — the re-cluster law
       * (Loo, 2026-08-07) one level up: an item's lines never scatter, and the
       * sort still means what the header says. Stable sort keeps the ruled
       * float order inside a tie. */
      const at = new Map<string, number>();
      visibleRows.forEach((r, i) => at.set(r.key, i));
      const best = (g: HierarchyGroup) =>
        Math.min(
          ...g.variants.flatMap((v) => v.leaves.map((l) => at.get(l.key) ?? Infinity)),
        );
      groups.sort((a, b) => best(a) - best(b));
    }
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleRows, sort, rowPo]);

  /** The DataTable's flat row order + the band lookups, one pass. */
  const flat = useMemo(() => {
    const rows: GridRow[] = [];
    const variantKeyByRow = new Map<string, string>();
    const variantLabelByRow = new Map<string, string | null>();
    const groupByRow = new Map<string, HierarchyGroup>();
    const facts = new Map<
      string,
      { need: number; toBuy: number; coverage: ReturnType<typeof leafCoverage> }
    >();
    for (const g of hierarchy) {
      for (const v of g.variants) {
        for (const l of v.leaves) {
          const gr = rowByKey.get(l.key);
          if (!gr) continue;
          rows.push(gr);
          variantKeyByRow.set(l.key, v.key);
          variantLabelByRow.set(l.key, v.label);
          groupByRow.set(l.key, g);
          facts.set(l.key, {
            need: leafNeed(l),
            toBuy: leafToBuy(l),
            coverage: leafCoverage(l),
          });
        }
      }
    }
    return { rows, variantKeyByRow, variantLabelByRow, groupByRow, facts };
  }, [hierarchy, rowByKey]);

  /** Only a shortage line is selectable (card §2) — and on a SOFA group the
   *  unit of selection is the whole same-SO set: the fabric batch may never
   *  split across purchase orders (card §3; Mrp.tsx:15-17). */
  const toggleLeaf = (r: GridRow) => {
    if (poOf(r) || r.blocker != null || r.qty <= 0) return;
    const g = flat.groupByRow.get(r.key);
    const keys =
      g != null && g.kind === "so" ? selectableKeysOf(g) : [r.key];
    const target = !isSelected(r);
    for (const k of keys) {
      const x = rowByKey.get(k);
      if (x && !poOf(x) && x.blocker == null && isSelected(x) !== target) toggleRow(x);
    }
  };

  /** Header select-all — over the rows the operator can SEE, Excel's rule. */
  const toggleAllVisible = () => {
    const vis = visibleRows.filter((r) => !poOf(r) && r.blocker == null);
    if (vis.length === 0) return;
    const allSel = vis.every(isSelected);
    setUserOff((s) => {
      const n = new Set(s);
      for (const r of vis) {
        if (!defaultOn(r)) continue;
        if (allSel) n.add(r.key);
        else n.delete(r.key);
      }
      return n;
    });
    setUserOn((s) => {
      const n = new Set(s);
      for (const r of vis) {
        if (defaultOn(r)) continue;
        if (allSel) n.delete(r.key);
        else n.add(r.key);
      }
      return n;
    });
  };

  /** What the pill will do — per group, from the shared projection. The ☑
   *  is BUILD-level, exactly Loo's frozen meaning: membership of THIS
   *  purchase order. And the batch is VIEW-SCOPED (Jess, 2026-08-01,
   *  Excel's iron law): Issue acts on the sheet in front of you — a tick
   *  hidden by a filter neither counts nor issues; it waits, remembered,
   *  for when its view is back. */
  const batch = useMemo(() => {
    const selectedByProposal = new Map<string, Set<string>>();
    let selectedRows = 0;
    /**
     * P9 (Loo, 2026-08-04): UNITS per category for what is TICKED — the
     * footer's line. It is accumulated HERE, in the loop that already decides
     * what Issue acts on, rather than in a memo of its own.
     *
     * That is structural, not tidiness. The batch is VIEW-SCOPED (Jess's
     * Excel law two comments up: a tick hidden by a filter neither counts nor
     * issues). A second count walking `allRows`, or walking `visibleRows` with
     * its own copy of the selection test, would agree with the button today
     * and drift the first time either predicate is touched — and a footer that
     * promises 7 mattresses while the click buys 3 is worse than no footer.
     * One loop, one list, one answer.
     */
    const unitsByCategory = new Map<string, number>();
    for (const r of visibleRows) {
      if (r.proposalKey == null || r.buildKey == null || !isSelected(r)) continue;
      selectedRows += 1;
      unitsByCategory.set(r.category, (unitsByCategory.get(r.category) ?? 0) + r.qty);
      const s = selectedByProposal.get(r.proposalKey) ?? new Set<string>();
      s.add(r.buildKey);
      selectedByProposal.set(r.proposalKey, s);
    }
    let poCount = 0;
    const targets: {
      proposal: ToOrderProposal;
      docs: { key: string; include: boolean; buildKeys: string[] }[];
      orderIdsByDoc: string[][];
    }[] = [];
    for (const p of planned) {
      const sel = selectedByProposal.get(p.key);
      if (!sel || sel.size === 0) continue;
      const orderOf = new Map(toOrderBuilds(p).map((b) => [b.buildKey, b.orderId]));
      const docs = defaultDocuments(p)
        .map((d) => ({
          key: d.key,
          include: true,
          buildKeys: d.buildKeys.filter((k) => sel.has(k)),
        }))
        .filter((d) => d.buildKeys.length > 0);
      if (docs.length === 0) continue;
      poCount += docs.length;
      targets.push({
        proposal: p,
        docs,
        orderIdsByDoc: docs.map((d) => [
          ...new Set(d.buildKeys.map((k) => orderOf.get(k) ?? "")),
        ]),
      });
    }
    return { selectedRows, poCount, targets, unitsByCategory };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleRows, userOff, userOn, rowPo, planned]);

  /**
   * `Mattress 7 · Bedframe 1 · Sofa 1` — the footer's line, in Loo's own
   * walking order (`RAIL_CATEGORIES`), so the footer and the rail read down
   * in the same sequence. A category nothing ticked contributes nothing;
   * `categoryUnitsLine` drops it.
   *
   * Any category the wire produces that the rail does not name is appended
   * rather than dropped — the rail is a FIXED vocabulary and this line is a
   * total, and a total that silently omits units would be the same lie the
   * card exists to end.
   */
  const footerUnits = useMemo(() => {
    const named = RAIL_CATEGORIES.map((c) => ({
      word: c.word,
      units: batch.unitsByCategory.get(c.key) ?? 0,
    }));
    const knownKeys = new Set(RAIL_CATEGORIES.map((c) => c.key));
    const extra = [...batch.unitsByCategory.entries()]
      .filter(([k]) => !knownKeys.has(k))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, units]) => ({ word: categoryLabel(k), units }));
    return categoryUnitsLine([...named, ...extra]);
  }, [batch]);

  const defaultDest = destinations.find((d) => d.isDefault) ?? destinations[0] ?? null;

  const decisionKey = (proposalKey: string, documentKey: string, sku: string) =>
    `${proposalKey}::${documentKey}::${sku}`;
  const documentKey = (proposalKey: string, key: string) => `${proposalKey}::${key}`;

  function openIssueReview() {
    const next = new Map<string, CommercialDecision>();
    for (const target of batch.targets) {
      const plans = planFromDocuments(target.proposal, target.docs);
      plans.forEach((po, index) => {
        const doc = target.docs[index];
        for (const line of po.lines) {
          const cost = line.cost != null && line.cost > 0 ? String(line.cost) : "";
          next.set(decisionKey(target.proposal.key, doc.key, line.sku), {
            treatment: "normal",
            unitCost: cost,
            costSource: cost ? "catalog" : "hand_entered",
          });
        }
      });
    }
    setCommercialDecisions(next);
    setDocumentPartners(new Map());
    setIssueReviewOpen(true);
  }

  const reviewCanIssue = useMemo(() => {
    if (!issueReviewOpen || batch.targets.length === 0) return false;
    for (const target of batch.targets) {
      const plans = planFromDocuments(target.proposal, target.docs);
      for (let index = 0; index < plans.length; index += 1) {
        const doc = target.docs[index];
        if (
          target.proposal.supplierKind === "factory_pickup" &&
          !documentPartners.get(documentKey(target.proposal.key, doc.key))
        ) return false;
        for (const line of plans[index].lines) {
          const decision = commercialDecisions.get(
            decisionKey(target.proposal.key, doc.key, line.sku),
          );
          if (!decision) return false;
          if (decision.treatment === "normal" && !(Number(decision.unitCost) > 0)) return false;
          if (decision.treatment === "free_of_charge" && decision.reason.trim() === "") return false;
        }
      }
    }
    return true;
  }, [batch, commercialDecisions, documentPartners, issueReviewOpen]);

  // ── The batch — one POST per group; grid and bar report in place ─────────
  async function issueAll(only?: ReadonlySet<string>, reviewed = false) {
    const targets = batch.targets.filter((t) => !only || only.has(t.proposal.key));
    if (targets.length === 0 || !defaultDest) return;
    if (reviewed && issueReviewOpen && !reviewCanIssue) return;
    if (reviewed) setIssueReviewOpen(false);
    setCreating(true);
    setResults((m) => {
      const n = new Map(m);
      for (const t of targets) n.set(t.proposal.key, { status: "queued" });
      return n;
    });
    for (const t of targets) {
      try {
        const res = await apiFetch<IssueResponse>(
          "/api/operation/purchase/to-order/issue",
          {
            method: "POST",
            body: JSON.stringify({
              supplierId: t.proposal.supplierId,
              category: t.proposal.category,
              // The engine's default — per-PO confirmation lives on the
              // generated documents, not here (Loo, 2026-08-01).
              destinationId: defaultDest.id,
              // Demand membership remains an ARRANGEMENT. The governed review
              // adds commercial/partner decisions; quantity stays server-owned.
              purchaseOrders: t.docs.map((doc, index) => {
                if (!reviewed) return doc;
                const po = planFromDocuments(t.proposal, t.docs)[index];
                return {
                  ...doc,
                  ...(t.proposal.supplierKind === "factory_pickup"
                    ? {
                        procurementPartnerId: documentPartners.get(
                          documentKey(t.proposal.key, doc.key),
                        ),
                      }
                    : {}),
                  lineDecisions: po.lines.map((line) => {
                    const decision = commercialDecisions.get(
                      decisionKey(t.proposal.key, doc.key, line.sku),
                    )!;
                    return decision.treatment === "free_of_charge"
                      ? {
                          sku: line.sku,
                          treatment: "free_of_charge" as const,
                          reason: decision.reason.trim(),
                        }
                      : {
                          sku: line.sku,
                          treatment: "normal" as const,
                          unitCost: Number(decision.unitCost),
                          costSource: decision.costSource,
                        };
                  }),
                };
              }),
            }),
          },
        );
        setResults((m) =>
          new Map(m).set(t.proposal.key, {
            status: "done",
            pos: res.pos.map((x) => x.id),
          }),
        );
        // The grid updates IN PLACE: each doc's builds take its PO number.
        setRowPo((m) => {
          const n = new Map(m);
          const orderOf = new Map(
            toOrderBuilds(t.proposal).map((b) => [b.buildKey, b.orderId]),
          );
          t.docs.forEach((d, i) => {
            const po = res.pos[i]?.id ?? res.pos[0]?.id ?? "PO";
            for (const k of d.buildKeys)
              n.set(`${t.proposal.key}:${orderOf.get(k)}:${k}`, po);
          });
          return n;
        });
      } catch (e) {
        setResults((m) =>
          new Map(m).set(t.proposal.key, {
            status: "failed",
            message: e instanceof Error ? e.message : "failed",
          }),
        );
      }
    }
    setCreating(false);
    // NO invalidation on purpose: rows must not vanish (Loo — the grid
    // updates in place). The next natural refetch reconciles.
  }

  /**
   * ── P10 · `Reserve` — the human accepting the system's suggestion ─────────
   *
   * NO QUANTITY IS SENT. Loo's ruling 3: the system suggests, the human
   * decides, so there is nothing to type and nothing to mistype — and the
   * REASON is recorded by construction, because the press can mean one thing
   * only.
   *
   * THE WORD IS `Reserve` (P13, Loo 2026-08-04). The goods do not leave; they
   * are locked until delivery, and the order drawer's picker has said
   * `Reserve {n} to {soRef}` for this exact act since 2026-06-30.
   *
   * The server does the whole act (reserve through K4's door, reduce a typed
   * demand through 0320's), then the page REFETCHES rather than patching the
   * row from the response. A reserve changes what every other row may be
   * offered — the pool is shared — so re-reading is the only way the grid
   * stays true. That is the opposite of Issue, which updates in place because
   * a purchase order changes nothing about its neighbours.
   */
  async function reserveStock(row: GridRow) {
    if (!row.orderId || !row.buildKey || reserving) return;
    setReserving(row.key);
    setReserveError((m) => {
      const n = new Map(m);
      n.delete(row.key);
      return n;
    });
    try {
      await apiFetch<ReserveStockResponse>("/api/operation/purchase/to-order/take-stock", {
        method: "POST",
        body: JSON.stringify({ orderId: row.orderId, buildKey: row.buildKey }),
      });
      setExpanded((s) => {
        const n = new Set(s);
        n.delete(row.key);
        return n;
      });
      await q.refetch();
    } catch (e) {
      setReserveError((m) =>
        // The server's own named reason, and the page's existing fallback for
        // a request that failed without one — no new word is invented here.
        new Map(m).set(row.key, e instanceof Error ? e.message : "failed"),
      );
    } finally {
      setReserving(null);
    }
  }

  const failedKeys = useMemo(
    () =>
      new Set(
        [...results.entries()].filter(([, r]) => r.status === "failed").map(([k]) => k),
      ),
    [results],
  );
  const donePoCount = [...results.values()].reduce(
    (n, r) => (r.status === "done" ? n + r.pos.length : n),
    0,
  );
  const donePoIds = useMemo(
    () => [...results.values()].flatMap((r) => (r.status === "done" ? r.pos : [])),
    [results],
  );
  /** ✕ on the success band — done entries clear; failures may NOT be waved off. */
  const dismissDone = () =>
    setResults((m) => new Map([...m].filter(([, r]) => r.status !== "done")));
  const unread = unresolved.length > 0;
  const barHasSomething = creating || donePoCount > 0 || failedKeys.size > 0 || unread;

  // ── Column filters — every column, Excel's shape, business words ─────────

  const setColFilter = (key: string) => (next: ReadonlySet<string>) =>
    setColFilters((m) => {
      const n = new Map(m);
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
      label: `${W.filterLabel} ${key}`,
      clearLabel: W.cancel,
      ...(opts.searchable ? { searchPlaceholder: W.searchPlaceholder } : {}),
      ...(opts.range
        ? {
            range: {
              label: W.customDateRange,
              applyLabel: W.apply,
              from: curFrom ?? null,
              to: curTo ?? null,
              // ONE range at a time (Excel's own behaviour, the Purchase
              // Orders wiring copied verbatim): a new pair replaces the old
              // pair; presets already ticked stay.
              onApply: (from: string, to: string) => {
                const next = new Set([...selected].filter((v) => !v.startsWith("r:")));
                next.add(rangeValue(from, to));
                setColFilter(key)(next);
              },
            },
          }
        : {}),
    };
  };
  /**
   * T1 (Loo, 2026-08-06) — THE THREE COLUMN ▼ COME BACK WITH THEIR COLUMNS.
   * 2026-08-03 moved `SO No.` · `Customer` · `Customer Delivery` onto a
   * free-text group header and their filters went with them; the one
   * capability that lost — filtering to a specific delivery date — was
   * recorded, missed, and is restored here as its own decision: the Delivery ▼
   * is the portal's Excel date ▼ (presets · month buckets · Custom Date
   * Range…) plus the `Overdue` fact.
   */

  const supplierOptions = useMemo(() => {
    const base = filteredExcept("supplier");
    const vals = [...new Set(base.map((r) => r.supplier ?? F_NONE))].sort();
    return vals.map((v) => ({ value: v, label: v === F_NONE ? "—" : v }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, colFilters]);


  const poOptions = useMemo(() => {
    const base = filteredExcept("po");
    const opts: { value: string; label: string }[] = [
      { value: F_NOT_ORDERED, label: W.yetToOrder },
    ];
    const pos = [...new Set(base.map((r) => poOf(r)).filter(Boolean))] as string[];
    pos.sort();
    for (const p of pos) opts.push({ value: p, label: p });
    return opts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, colFilters, rowPo]);

  /** The order numbers the sheet holds — value is the raw number, the label
   *  its printed form, `—` for a typed demand that has none. */
  const soOptions = useMemo(() => {
    const base = filteredExcept("so");
    const vals = [...new Set(base.map((r) => (r.so != null ? String(r.so) : F_NONE)))];
    vals.sort((a, b) =>
      a === F_NONE ? 1 : b === F_NONE ? -1 : Number(a) - Number(b),
    );
    return vals.map((v) => ({ value: v, label: v === F_NONE ? "—" : `SO-${v}` }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, colFilters]);

  const customerOptions = useMemo(() => {
    const base = filteredExcept("customer");
    const vals = [...new Set(base.map((r) => r.customer ?? F_NONE))].sort();
    return vals.map((v) => ({
      value: v,
      label: v === F_NONE ? "—" : displayCustomerName(v),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, colFilters]);

  /**
   * The Delivery ▼ — `Overdue` first (the fact an operator hunts), then
   * Excel's six presets, then the month buckets the sheet actually holds,
   * then `—` only if a dateless row exists (a Ready Stock demand with no
   * `Required By`). The custom range rides `filterFor`'s `range`.
   */
  const deliveryOptions = useMemo(() => {
    const base = filteredExcept("delivery");
    const opts: { value: string; label: string }[] = [
      { value: F_OVERDUE, label: W.filterOverdue },
      ...datePresetOptions(),
    ];
    const months = [
      ...new Set(
        base.map((r) => r.delivery).filter(Boolean).map((d) => (d as string).slice(0, 7)),
      ),
    ]
      .sort()
      .reverse();
    for (const ym of months) opts.push({ value: `m:${ym}`, label: monthLabel(ym) });
    if (base.some((r) => r.delivery == null)) opts.push({ value: F_NONE, label: "—" });
    return opts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, colFilters]);


  /**
   * T1 — what the group ☑ acts on: the VISIBLE run it heads. Jess's Excel
   * iron law binds a group toggle exactly as it binds select-all: a tick
   * hidden by a filter neither counts nor issues, so the box neither reads
   * nor writes rows the sheet is not showing.
   */
  /**
   * The GROUP band's ☑ — a CONVENIENCE toggle over the group's SELECTABLE
   * leaves (shortage only). Selection stays BUILD-level (Loo's frozen
   * meaning: membership of THIS purchase order); this box is all / some (the
   * indeterminate dash) / none over those very leaves, and a group with
   * nothing selectable (fully covered, receipts) gets no box at all.
   */
  const groupRowsOf = (r: GridRow): GridRow[] => {
    const g = flat.groupByRow.get(r.key);
    if (!g) return [];
    return selectableKeysOf(g)
      .map((k) => rowByKey.get(k))
      .filter((x): x is GridRow => x != null && !poOf(x) && x.blocker == null);
  };
  const groupSelState = (r: GridRow): boolean | "indeterminate" | null => {
    const rows = groupRowsOf(r);
    if (rows.length === 0) return null;
    const n = rows.filter(isSelected).length;
    return n === 0 ? false : n === rows.length ? true : "indeterminate";
  };
  const groupSelToggle = (r: GridRow) => {
    const rows = groupRowsOf(r);
    if (rows.length === 0) return;
    const all = rows.every(isSelected);
    for (const x of rows) {
      // Explicit per-row: flip only the rows not already in the target state,
      // so one press is one meaning whatever mix it started from.
      if (all ? isSelected(x) : !isSelected(x)) toggleRow(x);
    }
  };

  /**
   * ── Grid columns — the HIERARCHY grid (CARD-2026-08-18-so-batch-purchase,
   * Jess 2026-08-18; supersedes T1's flat AutoCount-aligned mock) ──────────
   *
   * Item → variant → SO lines. The bands are the kit's group machinery
   * (`group.parent` + `group`); the LEAF columns are the card's own list —
   * SO No · Customer · Customer Delivery · Qty Needed · Stock · On PO ·
   * To Buy · Coverage · Supplier · PO No. The first column is the TREE: the
   * item word on the band, `↳ SO-…` on a line (2990s Mrp's shape — a literal
   * glyph, never padding, so it survives a resize and copies into Excel).
   *
   * `To Buy` is PRINTED, never `11 − 3 − 2`, and the buyer may not edit it —
   * wanting extra for the shelf is a Manual Purchase behind approval
   * (card §2). Only a shortage line is selectable.
   *
   * P16's width law: the numbers below are provisional and are re-measured
   * in a real browser before the card flips EXECUTED — no guessed number
   * outlives the build record.
   */
  const columns: readonly Column<GridRow>[] = [
    {
      /** The TREE column: item word on the band; `↳ SO-…` / `↳ Ready Stock`
       *  on a line; on a sofa line the MODEL, because the band is the SO. */
      key: "so",
      label: W.itemLabel,
      width: "175px",
      sortable: true,
      filter: filterFor("so", soOptions, { searchable: true }),
      cell: (r) => {
        const sofa = flat.groupByRow.get(r.key)?.kind === "so";
        return (
          <span className="flex items-baseline gap-1.5 min-w-0">
            <span className="text-kit-slate-9">↳</span>
            {sofa ? (
              <span className="truncate" title={r.model}>
                {r.model}
              </span>
            ) : (
              <span className="tabular-nums text-kit-slate-12">
                {r.readyStock ? W.readyStockGroup : r.so != null ? `SO-${r.so}` : "—"}
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: "customer",
      label: W.colCustomer,
      width: "181px",
      sortable: true,
      filter: filterFor("customer", customerOptions, { searchable: true }),
      cell: (r) => {
        // A sofa line's identity is its SET band — stated once, above.
        if (flat.groupByRow.get(r.key)?.kind === "so") return null;
        if (r.readyStock)
          return r.destination ? (
            <span className="block truncate" title={r.destination}>
              {r.destination}
            </span>
          ) : null;
        return r.customer ? (
          <span className="block truncate" title={displayCustomerName(r.customer)}>
            {displayCustomerName(r.customer)}
          </span>
        ) : null;
      },
    },
    {
      key: "delivery",
      label: W.colPreferred,
      width: "163px",
      sortable: true,
      filter: filterFor("delivery", deliveryOptions, { range: true }),
      cell: (r) => {
        if (flat.groupByRow.get(r.key)?.kind === "so") return null;
        // G8 — a Ready Stock line prints `Required By {date}` (the create
        // dialog's own word) and NOTHING when none was asked for: an empty
        // date on typed demand means *buy it on the next run*.
        if (r.readyStock)
          return r.delivery ? (
            <span className="tabular-nums">{`${W.requiredBy} ${fmtDateShort(r.delivery)}`}</span>
          ) : null;
        return (
          <span
            className={
              r.late ? "text-kit-red-11 font-medium tabular-nums" : "tabular-nums"
            }
          >
            {r.delivery ? fmtDate(r.delivery) : W.noDeliveryDate}
          </span>
        );
      },
    },
    {
      key: "need",
      label: W.colNeed,
      width: "111px",
      align: "right",
      numeric: true,
      sortable: true,
      cell: (r) => flat.facts.get(r.key)?.need ?? r.qty,
    },
    {
      /** SUGGESTED free stock — advisory, never consumed (locked ruling).
       *  Green because it is something a human can take TODAY (P10). */
      key: "stock",
      label: W.colStock,
      width: "71px",
      align: "right",
      numeric: true,
      sortable: true,
      cell: (r) =>
        r.freeStock > 0 && !poOf(r) ? (
          <span
            className="text-kit-green-11"
            title={freeStockLine(stockWarehouse ?? "", r.freeStock)}
            data-testid={`to-order-free-${r.key}`}
          >
            {r.freeStock}
          </span>
        ) : r.takenFromStock > 0 ? (
          <span className="text-kit-green-11" title={reservedFromStockLabel(r.takenFromStock)}>
            {r.takenFromStock}
          </span>
        ) : null,
    },
    {
      key: "onpo",
      label: W.colOnPo,
      width: "71px",
      align: "right",
      numeric: true,
      sortable: true,
      cell: (r) =>
        r.coveredByOpenPo > 0 && !poOf(r) ? (
          <span
            title={onPoLine(r.coveredByOpenPo, r.coveredByOpenPoPos) ?? undefined}
            data-testid={`to-order-onpo-${r.key}`}
          >
            {r.coveredByOpenPo}
          </span>
        ) : null,
    },
    {
      /** PRINTED, never `11 − 3 − 2` — and never editable (card §2). */
      key: "tobuy",
      label: W.colToBuy,
      width: "75px",
      align: "right",
      numeric: true,
      sortable: true,
      cell: (r) => {
        const n = flat.facts.get(r.key)?.toBuy ?? 0;
        return n > 0 ? (
          <span
            className="font-semibold text-kit-slate-12"
            data-testid={`to-order-tobuy-${r.key}`}
          >
            {n}
          </span>
        ) : (
          <span className="text-kit-slate-9">0</span>
        );
      },
    },
    {
      /** What stands behind THIS promise — `stock` · `PO-2041` · `SHORT`
       *  (card §2: the buyer sees at a glance which promises have nothing
       *  behind them). A receipt's answer is its own PO cell. */
      key: "coverage",
      label: W.colCoverage,
      width: "140px",
      cell: (r) => {
        const c = flat.facts.get(r.key)?.coverage;
        if (!c || c.kind === "ordered") return null;
        if (c.kind === "short")
          return (
            <span
              className="text-kit-red-11 font-semibold"
              data-testid={`to-order-cov-${r.key}`}
            >
              {W.covShort}
            </span>
          );
        if (c.kind === "stock")
          return (
            <span className="text-kit-green-11" data-testid={`to-order-cov-${r.key}`}>
              {W.covStock}
            </span>
          );
        return (
          <button
            type="button"
            className="text-kit-blue-11 tabular-nums hover:underline"
            title={onPoLine(r.coveredByOpenPo, r.coveredByOpenPoPos) ?? undefined}
            onClick={() => {
              const slug = PO_TAB_SLUG[r.category];
              navigate(
                slug
                  ? `/operation/procurement/${slug}?po=${encodeURIComponent(c.po)}`
                  : "/operation/procurement",
              );
            }}
            data-testid={`to-order-cov-${r.key}`}
          >
            {c.po}
          </button>
        );
      },
    },
    {
      key: "supplier",
      label: W.supplierLabel,
      width: "111px",
      sortable: true,
      filter: filterFor("supplier", supplierOptions, { searchable: true }),
      cell: (r) => r.supplier ?? "—",
    },
    {
      key: "po",
      label: W.colPoNo,
      width: "175px",
      sortable: true,
      filter: filterFor("po", poOptions),
      cell: (r) => {
        const po = poOf(r);
        if (!po) {
          return (
            <span className="text-kit-slate-11 truncate">
              {r.blocker === "blocked_delivery_date" ? W.noDeliveryDate : W.yetToOrder}
            </span>
          );
        }
        const slug = PO_TAB_SLUG[r.category];
        return (
          <button
            type="button"
            /* T6 — when the row is a receipt because an open purchase order
               already covers it, the hover names EVERY document behind it
               (`onPoLine`); the cell can only show one link. A row read back
               off a PO of its own keeps the plain word. */
            title={
              r.coveredByOpenPoPos.length > 0
                ? (onPoLine(r.coveredByOpenPo, r.coveredByOpenPoPos) ?? "Open Purchase Order")
                : "Open Purchase Order"
            }
            className="text-kit-blue-11 tabular-nums hover:underline"
            onClick={() =>
              navigate(
                slug
                  ? `/operation/procurement/${slug}?po=${encodeURIComponent(po)}`
                  : "/operation/procurement",
              )
            }
            data-testid={`row-po-${r.key}`}
          >
            {po}
          </button>
        );
      },
    },
  ];

  /**
   * ── The two BANDS of the hierarchy (card §2) — aligned cells ─────────────
   *
   * Level 1 is the ITEM (or, for sofa, the SALES ORDER — the colour-matched
   * set), its totals under the number headers that name them. Level 2 is the
   * variant; a single-variant item answers `null` and the level collapses to
   * two — the kit skips the band. Level 3 is the leaf rows below.
   */
  const bandNum = (n: number, strong = false): GroupRowCell => ({
    align: "right",
    content:
      n > 0 ? (
        <span
          className={
            strong
              ? "font-semibold text-kit-slate-12 tabular-nums"
              : "text-kit-slate-11 tabular-nums"
          }
        >
          {n}
        </span>
      ) : (
        <span className="text-kit-slate-9 tabular-nums">0</span>
      ),
  });

  const parentCells = (r: GridRow): GroupRowCell[] => {
    const g = flat.groupByRow.get(r.key);
    if (!g) return [{ content: null, span: 10 }];
    const suppliers = new Set(
      g.variants.flatMap((v) => v.leaves.map((l) => l.supplier)).filter(Boolean),
    );
    return [
      {
        content: (
          <span
            className="block truncate font-semibold text-kit-slate-12"
            title={g.title}
            data-testid={`to-order-item-${g.key}`}
          >
            {g.title}
          </span>
        ),
      },
      {
        content:
          g.kind === "so" && g.customer ? (
            <span
              className="block truncate text-kit-slate-12"
              title={displayCustomerName(g.customer)}
            >
              {displayCustomerName(g.customer)}
            </span>
          ) : null,
      },
      {
        content: g.delivery ? (
          <span
            className={
              today != null && g.delivery < today
                ? "text-kit-red-11 font-medium tabular-nums"
                : "text-kit-slate-11 tabular-nums"
            }
          >
            {fmtDate(g.delivery)}
          </span>
        ) : null,
      },
      bandNum(g.need),
      {
        align: "right",
        content:
          g.stock > 0 ? (
            <span className="text-kit-green-11 tabular-nums">{g.stock}</span>
          ) : null,
      },
      bandNum(g.onPo),
      bandNum(g.toBuy, true),
      { content: null },
      {
        content:
          suppliers.size === 1 ? (
            <span className="block truncate">{[...suppliers][0] as string}</span>
          ) : null,
      },
      { content: null },
    ];
  };

  const variantCells = (r: GridRow): GroupRowCell[] | null => {
    const label = flat.variantLabelByRow.get(r.key);
    if (label == null) return null;
    const g = flat.groupByRow.get(r.key);
    const v = g?.variants.find((x) => x.key === flat.variantKeyByRow.get(r.key));
    if (!v) return null;
    return [
      {
        span: 3,
        content: (
          <span className="flex items-baseline gap-1.5 min-w-0 pl-3">
            <span className="text-kit-slate-9">↳</span>
            <span className="truncate text-kit-slate-11" title={label}>
              {label}
            </span>
          </span>
        ),
      },
      bandNum(v.need),
      {
        align: "right",
        content:
          v.stock > 0 ? (
            <span className="text-kit-green-11 tabular-nums">{v.stock}</span>
          ) : null,
      },
      bandNum(v.onPo),
      bandNum(v.toBuy, true),
      { content: null, span: 3 },
    ];
  };

  const updatedMs = q.dataUpdatedAt;
  const scope = q.data?.scope ?? null;
  const scopeMessages = scope
    ? [
        !scope.orderFound ? W.scopeNotFound : null,
        scope.blockedProductionDays > 0 ? W.scopeBlockedProductionDays : null,
        scope.blockedDeliveryDate > 0 ? W.scopeBlockedDeliveryDate : null,
        scope.unresolved > 0 ? W.scopeUnresolved : null,
        scope.alreadyCovered > 0 ? W.scopeAlreadyCovered : null,
        scope.alreadyIssued > 0 ? W.scopeAlreadyIssued : null,
      ].filter((message) => message != null) as string[]
    : [];
  const scopedNothingToBuy =
    scope != null &&
    scope.orderFound &&
    scope.issuable === 0 &&
    scope.blockedProductionDays === 0 &&
    scope.blockedDeliveryDate === 0 &&
    scope.unresolved === 0 &&
    scope.alreadyCovered === 0 &&
    scope.alreadyIssued === 0;

  return (
    /* h-full, not flex-1: the app wrapper is overflow-auto, so a page that
     * GROWS makes the whole page scroll. Filling the frame instead keeps the
     * header strip and toolbar still — the grid is the only scroll area
     * (the Orders page's own behaviour).
     *
     * bg-kit-canvas + a white rail — the other four tabs' own base (Loo,
     * 2026-08-06: white base, grey canvas; measured on Receiving, Purchase
     * Orders and Report before changing). */
    <div className="h-full min-h-0 flex flex-col bg-kit-canvas">
      {/* ── The header is the SHELL's (PurchasingTabs) — one 44px row with
           the module word, the tabs and the global icons. This page draws
           no header of its own (Shell pattern, Loo 2026-08-02). ───────── */}
      <PurchasingTabs />

      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* ── The WORK QUEUE (Linear's density; no heading — we are already
             at To Order, and the lit tab says so). Two blocks: TIME, then
             CATEGORY — never mixed (Jess: 上半部 = 时间视角, 下半部 = 商品
             类别). ────────────────────────────────────────────────────── */}
        <aside
          className="w-[200px] shrink-0 min-h-0 overflow-y-auto border-r border-kit-slate-5 px-3 py-3 flex flex-col bg-white"
          data-testid="to-order-nav"
        >
          <span className="px-2 pb-1 text-label font-medium uppercase text-kit-slate-11">
            {W.poScheduleHeading}
          </span>
          {/* The protection rule: a passed PO day is OVERDUE, red, ABOVE the
              calendar — never swallowed by the next run. Rendered only when
              it has something to say. */}
          {(timeCounts.get("overdue")?.size ?? 0) > 0 ? (
            <NavRow
              active={effViewSet.has("overdue")}
              onClick={() => toggleView("overdue")}
              testId="to-order-overdue"
              name={W.filterOverdue}
              tone="danger"
              count={String(timeCounts.get("overdue")?.size ?? 0)}
              countWord={ordersHeadline(timeCounts.get("overdue")?.size ?? 0)}
            />
          ) : null}
          {scheduleDays.map((day) => (
            <NavRow
              key={day}
              active={effViewSet.has(day)}
              onClick={() => toggleView(day)}
              testId={`to-order-day-${day}`}
              name={fmtDate(day)}
              count={String(timeCounts.get(day)?.size ?? 0)}
              countWord={`${ordersHeadline(timeCounts.get(day)?.size ?? 0)} · ${fmtDate(day)}`}
            />
          ))}

          <div className="my-2 border-t border-kit-slate-6" />

          <span className="px-2 pb-1 text-label font-medium uppercase text-kit-slate-11">
            {W.categoryHeading}
          </span>
          {/* P9 (Loo, 2026-08-04): the bare number is UNITS; the word that
              tells it apart from the ORDERS counted above lives in the
              tooltip. A zero row still renders its number — a category is a
              fixed vocabulary, and hiding `Sofa 0` would change the rail's
              shape under the operator, which is the one thing a navigator
              may never do. */}
          <NavRow
            active={catSet.size === 0}
            onClick={clearCats}
            testId="to-order-cat-all"
            name={W.categoryAll}
            count={String(categoryUnits.all)}
            countWord={unitsHeadline(categoryUnits.all)}
          />
          {RAIL_CATEGORIES.map((c) => (
            <NavRow
              key={c.key}
              active={catSet.has(c.key)}
              onClick={() => toggleCat(c.key)}
              testId={`to-order-cat-${c.key}`}
              name={c.word}
              count={String(categoryUnits.byCategory.get(c.key) ?? 0)}
              countWord={unitsHeadline(categoryUnits.byCategory.get(c.key) ?? 0)}
            />
          ))}

          {/* The manual entrance LEFT this page for `Manual Purchase`
              (CARD-2026-08-18-manual-purchase §1): this grid now answers ONE
              question — what have customers ordered that we still have to
              buy. Loo's "the door may never be missing" holds at the module
              level: the door is the rail's own Manual Purchase entry. */}
        </aside>

        {/* ── The Excel Workspace: one toolbar, one grid. ─────────────────
            P16 — NO SIDE GUTTERS. The 16px on each edge held the grid off the
            rail and the window like a card on a page; a sheet meets them. The
            vertical padding stays: the toolbar is not a sheet and still needs
            air above it. */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0 gap-2 pt-2 pb-3">
          <GridToolbar
            search={
              <SearchInput
                id="to-order-search"
                pill
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={W.searchPlaceholder}
                aria-label={W.searchLabel}
              />
            }
            /* THERE IS NO SCOPE LINE, and that is a ruling rather than a gap
             * (Loo, 2026-08-03). One was built and REMOVED the same day: the
             * navigator is permanently on screen with the active row lit, so
             * a line beside the search box repeats what the rail already says
             * 200px to its left — and the first build even printed the weekday
             * twice (`Monday Mon, 3 Aug 26`), because `fmtDate` already names
             * the day.
             *
             * The lesson is worth more than the feature: it was designed from
             * READING THE CODE, never from looking at the page. On the real
             * screen the problem it fixed does not exist. A UX problem that
             * has not been observed is not a problem. */
            right={
              <>
                {scopeSo != null ? (
                  <span
                    className="flex items-center gap-2 rounded-control border border-kit-slate-6 bg-white px-2 h-8 text-body text-kit-slate-12 whitespace-nowrap"
                    data-testid="to-order-so-scope"
                  >
                    <span>{`${W.salesOrderScope} · SO-${scopeSo}`}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="close"
                      aria-label={W.clearSalesOrderScope}
                      onClick={clearSoScope}
                      data-testid="to-order-so-scope-clear"
                    />
                  </span>
                ) : null}
                {creating ? (
                <span className="text-meta text-kit-slate-11" data-testid="to-order-creating">
                  {W.creatingPos}
                </span>
              ) : batch.selectedRows > 0 ? (
                <span
                  className="flex items-center gap-3"
                  data-testid="to-order-issue-pill"
                >
                  <span className="text-meta tabular-nums text-kit-slate-11 whitespace-nowrap">
                    {selectedShort(batch.selectedRows)}
                  </span>
                  <Button
                    variant="primary"
                    shape="pill"
                    onClick={openIssueReview}
                    disabled={batch.poCount === 0 || !defaultDest}
                    /* Why N POs? One per factory × category (sofa one per
                       customer). The hover names the split — the click's
                       result is still the real receipt. */
                    title={batch.targets
                      .map((t) => `${t.proposal.label} — ${t.docs.length} PO`)
                      .join("\n")}
                    data-testid="to-order-issue"
                  >
                    {batch.poCount > 0 ? issuePosShort(batch.poCount) : W.issuePos}
                  </Button>
                </span>
                ) : null}
              </>
            }
            meta={
              updatedMs > 0 ? (
                <span data-testid="to-order-updated" className="flex flex-col items-end leading-tight">
                  <span>{W.updated}</span>
                  <span className="tabular-nums">{clockLabel(updatedMs)}</span>
                </span>
              ) : null
            }
          />

          {/* ── FLASH BANDS (GitHub's flash, not a toast): the report sits
               at the TOP, right under the button that caused it. Success is
               dismissible; a failure STAYS with Retry until it succeeds
               (the law survives the move); a warning stays until resolved.
               Anatomy leaves room for Phase A: `· 5 units [Print labels]`
               joins the success band without a redesign. ─────────────── */}
          {barHasSomething ? (
            <div className="flex shrink-0 flex-col gap-1" data-testid="to-order-bar">
              {unread ? (
                <div className="flex items-center gap-1.5 rounded-card bg-kit-amber-3 px-3 py-1.5 text-body text-kit-amber-11">
                  <Icon name="flag" size={14} />
                  <span data-testid="to-order-unresolved">
                    {`${unresolvedHeadline(unresolved.length)} — ${W.unresolvedHelp}`}
                  </span>
                  <span className="ml-auto text-meta tabular-nums">
                    {unresolved
                      .slice(0, 3)
                      .map((item) => `${item.so != null ? `SO-${item.so} · ` : ""}${item.sku}`)
                      .join(" · ")}
                  </span>
                </div>
              ) : null}
              {!creating && donePoCount > 0 ? (
                <div className="flex items-center gap-1.5 rounded-card bg-kit-green-3 px-3 py-1.5 text-body text-kit-green-11">
                  <Icon name="confirm" size={14} />
                  <span className="tabular-nums" data-testid="to-order-created-line">
                    {posCreatedLine(donePoCount)}
                    {donePoIds.length > 0 && donePoIds.length <= 3
                      ? ` — ${donePoIds.join(" · ")}`
                      : ""}
                  </span>
                  <span className="ml-auto flex items-center gap-2">
                    <Button
                      variant="ghost"
                      icon="open"
                      onClick={() => navigate("/operation/procurement")}
                      data-testid="to-order-continue"
                    >
                      {W.continueInPos}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="close"
                      aria-label={W.cancel}
                      onClick={dismissDone}
                      data-testid="to-order-flash-dismiss"
                    />
                  </span>
                </div>
              ) : null}
              {!creating && failedKeys.size > 0 ? (
                <div className="flex items-center gap-1.5 rounded-card bg-kit-red-3 px-3 py-1.5 text-body text-kit-red-11">
                  <Icon name="close" size={14} />
                  <span data-testid="to-order-failed-line">{`${failedKeys.size} ${W.createFailed}`}</span>
                  <span className="ml-auto">
                    <Button
                      variant="neutral"
                      onClick={() => void issueAll(failedKeys, true)}
                      data-testid="to-order-retry"
                    >
                      {W.retry}
                    </Button>
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}

          {scope && (scopeMessages.length > 0 || scopedNothingToBuy) ? (
            <div
              className="shrink-0 border-y border-kit-slate-5 bg-white px-3 py-2 text-body text-kit-slate-11"
              data-testid="to-order-scope-status"
            >
              {(scopedNothingToBuy ? [W.scopeNothingToBuy] : scopeMessages).join(" · ")}
            </div>
          ) : null}

          <div className="flex-1 min-h-0 flex flex-col" data-testid="to-order-sheet">
            {q.isLoading && allRows.length === 0 ? (
              <Card>
                <Loading variant="skeleton" lines={4} label="Loading today's plan" />
              </Card>
            ) : visibleRows.length === 0 ? (
              colFilters.size > 0 ? (
                /* §8.2 — a click that blanks the table must name its cause
                 * and hand back the way out. */
                <div data-testid="to-order-filters-empty">
                  <Card>
                    <span className="flex items-center gap-3">
                      <span className="text-body text-kit-slate-11">{W.filtersEmpty}</span>
                      <Button
                        variant="neutral"
                        onClick={() => setColFilters(new Map())}
                        data-testid="to-order-clear-filters"
                      >
                        {W.clearFilters}
                      </Button>
                    </span>
                  </Card>
                </div>
              ) : (
                <div data-testid="to-order-empty">
                  <Card padding="none">
                    <EmptyState title={q.error ? (q.error as Error).message : W.empty} />
                  </Card>
                </div>
              )
            ) : (
              /* FLUSH (P16). The rounded frame is gone with the workspace's
                 own 16px gutters: a grid that is a SHEET meets the toolbar
                 above it and the rail beside it squarely. `overflow-hidden`
                 goes with the radius — it existed to clip the corners. */
              <div className="flex-1 min-h-0 flex flex-col">
                <DataTable
                  rows={flat.rows}
                  columns={columns}
                  /* Loo's rule ①, as a mechanism: the columns take exactly
                     what their content measured and the leftover goes to a
                     filler that holds nothing. */
                  sizing="content"
                  rowId={(r) => r.key}
                  empty={W.empty}
                  label={W.itemsTableLabel}
                  sort={sort}
                  onSortChange={setSort}
                  /* q3 (Loo, 2026-08-03): the rail lights `Overdue` in red
                   * while every date ON the row is still comfortably in the
                   * future — because overdue means the ORDER-BY date has
                   * passed, and that date never renders (the GOLDEN RULE).
                   * The bar states the STATE, not the date, so the rule holds
                   * and the row stops looking calm. */
                  /**
                   * ⭐ RED IS FOR WORK, NOT FOR HISTORY (Loo, on the live page
                   * 2026-08-07). T6 put every already-bought order back on the
                   * sheet and they arrived wearing the overdue bar — the page
                   * was telling an operator to act now about goods somebody had
                   * already bought. `01-design-tokens` §2.2 gives red exactly
                   * one job in this portal; a row with a purchase order has no
                   * claim on it.
                   */
                  rowLate={(r) => !poOf(r) && r.blocker == null && r.bucket === "overdue"}
                  /**
                   * ⭐ AND A BOUGHT ROW MUST READ AS DONE FROM THE LEFT EDGE.
                   *
                   * T6 shipped these rows looking identical to work, and the
                   * only thing telling them apart — the purchase-order number —
                   * sits in the LAST column, past 900px of table. Loo's
                   * screenshot is a screen full of orders with nothing on them:
                   * the identity cells are blank on an item row by design, so
                   * the left half of a bought row carried no information at all.
                   *
                   * `rowMuted` is the kit's own washed-out row, already used on
                   * Purchase Orders for a cancelled document — *this is on the
                   * register, and it is not your work*. Same meaning here, and
                   * it reads at any horizontal scroll position. The ORDER LINE
                   * above stays full-strength: who the customer is and when
                   * they want it is still a fact worth reading.
                   */
                  rowMuted={(r) => Boolean(poOf(r))}
                  /* ── Q6 · WHY THERE IS STILL NO `layout` PROP (re-answered
                   * for T1's seven columns, 2026-08-06) — CLAUDE.md §2's own
                   * question, answered per power rather than left silent.
                   *
                   * RESIZE — still refused. Every width is the CONTENT's,
                   * measured against the worst string each column can hold,
                   * so nothing is hidden that a drag could reveal; below
                   * ~1180px the grid SCROLLS sideways (Purchase Orders' own
                   * behaviour) instead of truncating, so a narrow window
                   * needs no rebalancing either. §0.4 forbids remembering a
                   * drag, so wiring it would ask the operator to re-drag
                   * seven columns every morning for nothing.
                   *
                   * REORDER — still refused. The order is Loo's approved T1
                   * mock itself: identity columns first (the order line reads
                   * left-to-right as SO · customer · date), then the item's
                   * facts with Qty against Model (`2 │ Cody K`), PO No. last
                   * as "did it happen". A drag that resets on reload would
                   * invite breaking an approved layout for nothing.
                   *
                   * REPORTED WITH THE REFUSAL: the kit hands both powers out
                   * through ONE `layout` prop, so no page can answer per
                   * power. Here both answers are the same and it costs
                   * nothing; the day a page wants one and not the other, it is
                   * the kit lane's to split. */
                  /* ── P10 (Loo, 2026-08-04) — READY STOCK IS SUGGESTED; THE
                   * HUMAN DECIDES WHETHER TO TAKE IT.
                   *
                   * His option B: AutoCount's inline ⊞, not a third pane — a
                   * pane narrows the grid and reopens the frozen two-column
                   * layout. The kit's own row expand (D0.5d), not a second
                   * one built here.
                   *
                   * A ROW THE WAREHOUSE HOLDS NOTHING FOR GETS NO CONTROL AT
                   * ALL. That is the card's "a row with no stock is visually
                   * untouched", and it is what makes the ⊞ itself the marker:
                   * its presence says there is something to decide, and the
                   * number rides its label so a screen reader gets it too. */
                  /* ⭐ T1.1 — THE ⊞ IS WHERE THE ROW'S ACTS LIVE, and it is now
                   * the ONLY place they live.
                   *
                   * P10 built this expand for `Reserve` and made the control
                   * itself the marker that stock existed. T1.1 moved that
                   * SIGNAL into its own column — the number is a fact, and a
                   * fact belongs where it can be scanned and sorted — which
                   * leaves the expand doing the thing it is actually good at:
                   * holding what you can DO to this row, off the scan path.
                   *
                   * Two acts, one door: `Reserve` (P10) and `Cancel` (P12,
                   * evicted from the `PO No.` cell — G10). A row can offer
                   * either, both, or neither, and a row with neither has no
                   * control at all, exactly as before. */
                  expansion={{
                    expanded,
                    expandable: (r) =>
                      !poOf(r) && (r.freeStock > 0 || demandIdOf(r) != null),
                    label: (r) => stockExpandLabel(r.model, r.freeStock),
                    onToggle: (id) =>
                      setExpanded((s) => {
                        const n = new Set(s);
                        if (n.has(id)) n.delete(id);
                        else n.add(id);
                        return n;
                      }),
                    render: (r) => (
                      <span
                        className="flex items-center gap-3 text-body"
                        data-testid={`to-order-stock-${r.key}`}
                      >
                        {r.freeStock > 0 ? (
                          <>
                            <span className="text-kit-slate-11">
                              {freeStockLine(stockWarehouse ?? "", r.freeStock)}
                            </span>
                            <Button
                              size="sm"
                              onClick={() => reserveStock(r)}
                              disabled={reserving != null}
                              data-testid={`to-order-reserve-${r.key}`}
                            >
                              {reserveFromStockLabel(r.freeStock)}
                            </Button>
                          </>
                        ) : null}
                        {demandIdOf(r) ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setCancelRow(r)}
                            data-testid={`to-order-cancel-${r.key}`}
                          >
                            {W.cancelDemand}
                          </Button>
                        ) : null}
                        {reserveError.get(r.key) ? (
                          <span className="text-kit-red-11">{reserveError.get(r.key)}</span>
                        ) : null}
                      </span>
                    ),
                  }}
                  /* T1 — ONE line per customer order, ALIGNED (Loo's approved
                   * mock, 2026-08-06): the order's facts sit in the table's
                   * own columns via `groupCells`, and its ☑ is a convenience
                   * toggle over the builds it heads. The free-text sentence
                   * this replaces was ruled hard to read. */
                  group={{
                    /* The hierarchy's two bands (card §2): the INNER band is
                     * the VARIANT (fabric / colour), skipped when the item has
                     * one; the OUTER `parent` band is the ITEM — or, for sofa,
                     * the SALES ORDER, because a sofa is a colour-matched SET
                     * (card §3). The selection box rides the parent band and
                     * covers the group's selectable (shortage) leaves only. */
                    keyOf: (r) => flat.variantKeyByRow.get(r.key) ?? r.key,
                    cells: variantCells,
                    parent: {
                      keyOf: (r) => flat.groupByRow.get(r.key)?.key ?? r.key,
                      cells: parentCells,
                      selection: {
                        state: groupSelState,
                        onToggle: groupSelToggle,
                        label: (r) =>
                          `${W.select} ${flat.groupByRow.get(r.key)?.title ?? ""}`.trim(),
                      },
                    },
                    /* ⭐ WHITE, RULED — NOT A GREY BAND (Loo, on the live page,
                     * 2026-08-06: *"every customer is grey too — i confused"*).
                     *
                     * The band was the obvious answer and it was wrong HERE for
                     * a reason the other Purchasing tabs do not have: this grid
                     * carries a group line every two or three rows, so six
                     * bands down one screen stop reading as structure and start
                     * reading as stripes. One band under a header is a
                     * hierarchy; six is a pattern the eye follows instead of
                     * the data.
                     *
                     * BOTH of Loo's own references settle it the same way — the
                     * Orders list is white throughout, and AutoCount's `SO Batch
                     * Posting` parents are white with a rule. And the portal's
                     * surface law already said it: grey is CHROME (the app
                     * background, the header strip, the table head); a
                     * customer's order is DATA, and data is white. */
                    tone: "plain",
                  }}
                  /* T1 — the ALWAYS-ON total: AutoCount's own footer habit,
                   * on the kit's D0.5d totals strip. One sentence, the whole
                   * sheet, whatever is ticked — the page footer's per-category
                   * line below keeps answering for the SELECTION. */
                  totals={{
                    label: W.total,
                    cells: (rows) => [
                      {
                        span: 9,
                        content: (
                          <span className="tabular-nums" data-testid="to-order-total">
                            {/* T6 — the total counts what is still TO BUY, and
                                that is a repair the receipts forced. It used to
                                sum every visible row, which was harmless while
                                the only receipts on the sheet were a handful of
                                POs raised in the last fortnight. T6 puts every
                                order an open PO already covers back on the
                                page — 35 of 62 rows on live data the day it
                                shipped — so summing the sheet would have said
                                `71 units` on a day the buyer had 20 to place.
                                The rail's category counts have skipped bought
                                rows since P9; this makes the two agree instead
                                of contradicting each other 200px apart. */}
                            {`${W.total} · ${unitsHeadline(
                              rows.reduce(
                                (n, r) => (poOf(r) || r.blocker != null ? n : n + r.qty),
                                0,
                              ),
                            )}`}
                          </span>
                        ),
                      },
                    ],
                  }}
                  selection={{
                    selected: selectedKeys,
                    onToggleRow: (id) => {
                      const r = rowByKey.get(id);
                      // The sofa set travels together (card §3) — the leaf
                      // toggle spreads to the whole same-SO set.
                      if (r) toggleLeaf(r);
                    },
                    onToggleAll: toggleAllVisible,
                    label: W.select,
                    // Only a SHORTAGE line is selectable (card §2): a receipt
                    // never, a fully covered line never, To Buy = 0 never.
                    selectable: (r) =>
                      !poOf(r) && r.blocker == null && r.qty > 0,
                  }}
                />
                {/* q1 (Loo, 2026-08-03). The footer counted customer ORDERS
                    while the toolbar counted ROWS and the button counted
                    PURCHASE ORDERS — three numbers, three units, on one
                    screen, and nothing said how they convert (`5 selected ·
                    Issue 3 POs · 3 orders`). His ruling: operations does not
                    work in customer orders; the pair that matters is what I
                    ticked and how many purchase orders it becomes. So the
                    footer counts what is actually on screen, and the customer
                    -order count is gone rather than reworded. */}
                <footer
                  className="shrink-0 flex items-center gap-3 px-3 h-10 border border-t-0 border-kit-slate-5 bg-white text-meta text-kit-slate-11"
                  data-testid="to-order-footer"
                >
                  {/* P9 (Loo, 2026-08-04) — what the tick will BUY, by
                      category, in units.

                      THE CARD SAYS "footer, beside the Issue button" and the
                      two are different places, so the widths were MEASURED in
                      a real browser rather than guessed (jsdom has none).
                      With every row ticked on live data the line is
                      `Mattress 15 · Bedframe 4 · Sofa 1`, and adding it to
                      the toolbar beside the pill costs 257px:

                        1280×720 — toolbar bar 764px, 223px spare → DOES NOT
                                   FIT; the search box gets squeezed
                        1920×1080 — bar 1404px, 607px spare → fits

                      A line that fits on the manager's monitor and breaks on
                      an operator's laptop is not a placement. The footer is a
                      full-width 40px band carrying one right-aligned button:
                      191px used of 764, 573px spare at 1280. So the pair Loo
                      asked for still reads as one sentence — `15 selected ·
                      Issue 3 POs` above the grid, the breakdown below it —
                      and the number of categories can grow to five without
                      anything moving.

                      Present only while something is ticked, because that is
                      the only time it has anything to say — the same
                      condition the Issue pill itself renders on. */}
                  {batch.selectedRows > 0 && footerUnits !== "" ? (
                    <span
                      className="tabular-nums"
                      data-testid="to-order-footer-units"
                    >
                      {footerUnits}
                    </span>
                  ) : null}
                  {/* A column filter narrows SILENTLY (the ▼ turns funnel, and
                      that is all) — so whenever one is on, the footer says so
                      and hands back the way out. Jess's "why 6 orders?" is
                      exactly the question this answers. */}
                  {colFilters.size > 0 ? (
                    <span className="ml-auto">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setColFilters(new Map())}
                        data-testid="to-order-footer-clear"
                      >
                        {W.clearFilters}
                      </Button>
                    </span>
                  ) : null}
                </footer>
              </div>
            )}
          </div>

        </div>
      </div>

      <Modal
        open={issueReviewOpen}
        onOpenChange={setIssueReviewOpen}
        title={W.issueReview}
        width="wide"
        footer={
          <Button
            variant="primary"
            disabled={!reviewCanIssue}
            onClick={() => void issueAll(undefined, true)}
            data-testid="to-order-issue-confirm"
          >
            {batch.poCount > 0 ? issuePosShort(batch.poCount) : W.issuePos}
          </Button>
        }
      >
        <div className="flex flex-col gap-4" data-testid="to-order-issue-review">
          {batch.targets.flatMap((target) => {
            const plans = planFromDocuments(target.proposal, target.docs);
            return plans.map((po, index) => {
              const doc = target.docs[index];
              const docKey = documentKey(target.proposal.key, doc.key);
              return (
                <section key={docKey} className="border border-kit-slate-5 bg-white">
                  <div className="flex items-center justify-between border-b border-kit-slate-5 bg-kit-slate-3 px-3 py-2 text-body">
                    <span className="font-semibold text-kit-slate-12">{target.proposal.supplierName}</span>
                    <span className="tabular-nums text-kit-slate-11">
                      {po.soRefs.map((so) => `SO-${so}`).join(" · ")}
                    </span>
                  </div>
                  <div className="flex flex-col gap-3 p-3">
                    {target.proposal.supplierKind === "factory_pickup" ? (
                      <Select
                        id={`partner-${docKey}`}
                        label={W.procurementPartner}
                        required
                        value={documentPartners.get(docKey)}
                        onValueChange={(value) =>
                          setDocumentPartners((current) => {
                            const next = new Map(current);
                            next.set(docKey, value);
                            return next;
                          })
                        }
                        options={procurementPartners.map((partner) => ({
                          value: partner.id,
                          label: partner.name,
                        }))}
                      />
                    ) : null}
                    {po.lines.map((line) => {
                      const key = decisionKey(target.proposal.key, doc.key, line.sku);
                      const decision = commercialDecisions.get(key);
                      if (!decision) return null;
                      return (
                        <div
                          key={key}
                          className="grid grid-cols-[minmax(180px,1fr)_180px_220px] items-start gap-3 border-t border-kit-slate-4 pt-3 first:border-t-0 first:pt-0"
                        >
                          <div className="text-body text-kit-slate-12">
                            <div className="font-semibold">{line.sku}</div>
                            <div className="text-meta text-kit-slate-11 tabular-nums">{`${W.colQty} · ${line.qty}`}</div>
                          </div>
                          <Select
                            id={`treatment-${key}`}
                            label={W.commercialTreatment}
                            value={decision.treatment}
                            onValueChange={(value) =>
                              setCommercialDecisions((current) => {
                                const next = new Map(current);
                                next.set(
                                  key,
                                  value === "free_of_charge"
                                    ? { treatment: "free_of_charge", reason: "" }
                                    : {
                                        treatment: "normal",
                                        unitCost: line.cost != null && line.cost > 0 ? String(line.cost) : "",
                                        costSource:
                                          line.cost != null && line.cost > 0
                                            ? "catalog"
                                            : "hand_entered",
                                      },
                                );
                                return next;
                              })
                            }
                            options={[
                              { value: "normal", label: W.normalPurchase },
                              { value: "free_of_charge", label: W.freeOfCharge },
                            ]}
                          />
                          {decision.treatment === "normal" ? (
                            <Input
                              id={`cost-${key}`}
                              label={W.transactionCost}
                              type="number"
                              min="0.01"
                              step="0.01"
                              required
                              value={decision.unitCost}
                              error={Number(decision.unitCost) > 0 ? undefined : W.costRequired}
                              onChange={(event) =>
                                setCommercialDecisions((current) => {
                                  const next = new Map(current);
                                  next.set(key, {
                                    treatment: "normal",
                                    unitCost: event.target.value,
                                    costSource:
                                      line.cost != null && Number(event.target.value) === line.cost
                                        ? "catalog"
                                        : "hand_entered",
                                  });
                                  return next;
                                })
                              }
                            />
                          ) : (
                            <Input
                              id={`foc-reason-${key}`}
                              label={W.freeOfChargeReason}
                              required
                              value={decision.reason}
                              onChange={(event) =>
                                setCommercialDecisions((current) => {
                                  const next = new Map(current);
                                  next.set(key, {
                                    treatment: "free_of_charge",
                                    reason: event.target.value,
                                  });
                                  return next;
                                })
                              }
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            });
          })}
        </div>
      </Modal>

      {/* P12 — the confirm step for `Cancel`. The page REFETCHES rather than
          hiding the row itself: a cancel takes the whole remainder, so the row
          is gone from the server's own answer, and removing it locally would be
          this page deciding a thing the server already decided. */}
      <CancelPurchaseDialog
        row={cancelRow}
        onOpenChange={(o) => {
          if (!o) setCancelRow(null);
        }}
        onCancelled={() => void q.refetch()}
      />
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/**
 * One rail row — Linear Sidebar, faithfully this time (Jess, 2026-08-01):
 * ONE line, name left, the bare number right-aligned. The word (`21 Orders`)
 * survives as the row's title for a hover and a screen reader.
 */
function NavRow({
  active,
  onClick,
  testId,
  name,
  count,
  countWord,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  testId: string;
  name: ReactNode;
  count: string | null;
  countWord?: string;
  /** `danger` = the Overdue row — late work wears red, nothing else does. */
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      aria-current={active ? "true" : undefined}
      title={countWord}
      className={[
        "relative flex w-full items-center justify-between gap-2 px-2 py-1 rounded-control text-left mb-px",
        active ? "bg-kit-blue-3" : "hover:bg-kit-slate-3",
      ].join(" ")}
    >
      {active ? (
        <span aria-hidden className="absolute left-0 top-1 bottom-1 w-0.5 bg-kit-blue-9" />
      ) : null}
      <span
        className={[
          "text-body truncate",
          active ? "font-semibold" : "font-medium",
          tone === "danger" ? "text-kit-red-11" : "text-kit-slate-12",
        ].join(" ")}
      >
        {name}
      </span>
      {count != null ? (
        <span
          className={[
            "text-meta tabular-nums shrink-0",
            tone === "danger" ? "text-kit-red-11" : "text-kit-slate-11",
          ].join(" ")}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

/**
 * P12 — `Cancel Purchase` (Loo, 2026-08-04).
 *
 * THE REMAINDER IS WHAT IS CANCELLED, and on a part-ordered demand that is the
 * whole point: *"ordered 3, don't want the other 2"* is an ordinary day, and
 * stopping the 3 runs through the purchase order (`PURCHASING-WORKING-FLOW.md`
 * §9), never through here.
 *
 * NOBODY TYPES A QUANTITY. The row's `Qty` already IS the remainder — the api
 * builds a demand row from the database's GENERATED `remaining_qty` — so the
 * dialog states the number rather than asking for one. A typed number is a
 * number somebody can get wrong, and the act it would serve (reduce a demand)
 * is a different act nobody has asked for.
 *
 * THE REASON IS MANDATORY, and it is why this is a dialog rather than a bare
 * confirm: the record needs something a yes/no cannot give it. `Cancel
 * Purchase` stays disabled until there is one, so the refusal is never
 * something the operator has to meet.
 *
 * THERE IS NO DELETE HERE AND THERE MAY NEVER BE ONE. Cancel keeps the record
 * with its reason; test rubbish is cleaned by SQL on request and the database
 * starts clean at go-live.
 *
 * The way out is the frame's own ✕ (DialogFrame's `Close`), not a second
 * `Cancel` button — two buttons reading `Cancel` in one dialog, one meaning
 * *stop this purchase* and one meaning *stop this dialog*, is the one arrangement
 * that could not be read.
 */
function CancelPurchaseDialog({
  row,
  onOpenChange,
  onCancelled,
}: {
  row: GridRow | null;
  onOpenChange: (open: boolean) => void;
  onCancelled: () => void;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const demandId = row ? demandIdOf(row) : null;
  const canCancel = !saving && demandId != null && reason.trim() !== "";

  function close() {
    setReason("");
    setFailed(null);
    onOpenChange(false);
  }

  async function submit() {
    if (!canCancel || !demandId) return;
    setSaving(true);
    setFailed(null);
    try {
      await apiFetch(
        `/api/operation/purchase/to-order/demand/${encodeURIComponent(demandId)}/cancel`,
        { method: "POST", body: JSON.stringify({ reason: reason.trim() }) },
      );
      close();
      onCancelled();
    } catch (e) {
      // The failure STAYS in the dialog with the reason intact — a cancel that
      // did not happen must not look like one that did. `already_cancelled` and
      // `nothing_to_cancel` both arrive here as the server's own sentence.
      setFailed(e instanceof Error ? e.message : W.createFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={row != null}
      onOpenChange={(o) => {
        if (!o) close();
      }}
      title={W.cancelPurchase}
      footer={
        <span className="flex items-center gap-3 pt-1">
          {failed ? (
            <span className="text-meta text-kit-red-11" data-testid="to-order-cancel-failed">
              {failed}
            </span>
          ) : null}
          <Button
            variant="primary"
            disabled={!canCancel}
            loading={saving}
            onClick={() => void submit()}
            data-testid="to-order-cancel-submit"
          >
            {W.cancelPurchase}
          </Button>
        </span>
      }
    >
      <div className="flex flex-col gap-3" data-testid="to-order-cancel-dialog">
        {/* WHAT is being cancelled, in the grid's own two words for it. Both
            labels are the ones already on this page — `Item` from the create
            dialog, `Qty` from the column — so the dialog and the row it came
            from cannot describe the same purchase differently. */}
        <div className="flex items-baseline gap-2 text-body">
          <span className="text-meta text-kit-slate-11">{W.itemLabel}</span>
          <span className="text-kit-slate-12">{row?.model ?? ""}</span>
        </div>
        <div className="flex items-baseline gap-2 text-body">
          <span className="text-meta text-kit-slate-11">{W.colQty}</span>
          <span className="text-kit-slate-12 tabular-nums" data-testid="to-order-cancel-qty">
            {row?.qty ?? ""}
          </span>
        </div>
        <Textarea
          id="cd-reason"
          label={W.cancelReason}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
    </Modal>
  );
}
