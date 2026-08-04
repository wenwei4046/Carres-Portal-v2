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
 * SELECTED · a quiet `Updated hh:mm` — never a Refresh). One grid, SIX frozen
 * columns; every column sorts by header click and filters by its ▼ — and the
 * PO filter speaks business: `Not Ordered` / `Ordered`, never `(Blanks)`.
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
 * On Issue: zero popups, zero toasts — the pill goes `Creating…`, one POST
 * per supplier×category group (ARRANGEMENT only), rows update IN PLACE, the
 * left counts fall, the bottom bar reports and a partial failure stays with
 * Retry until it succeeds.
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
  weekdayName,
  posCreatedLine,
  railItemLabel,
  selectedShort,
  issuePosShort,
  toOrderBuilds,
  unitsHeadline,
  unresolvedHeadline,
  freeStockLine,
  takeFromStockLabel,
  tookFromStockLabel,
  stockExpandLabel,
  type ToOrderOrderedRow,
  type ToOrderProposal,
} from "@carres/shared";
import Button from "@/components/kit/Button";
import Card from "@/components/kit/Card";
import DataTable, { type Column, type ColumnFilter, type TableSort } from "@/components/kit/DataTable";
import DatePicker from "@/components/kit/DatePicker";
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
import { fmtDate } from "@/lib/fmt-date";
import { qk, useCatalog } from "@/lib/queries";
import PurchasingTabs from "./PurchasingTabs";

// ── Wire types ──────────────────────────────────────────────────────────────

interface Destination {
  id: string;
  name: string;
  isDefault: boolean;
}

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
  /** Recent POs read back — the grid's `Ordered` answer. */
  ordered?: ToOrderOrderedRow[];
  /** Demand the catalog could not answer for. Empty is the only healthy value. */
  unresolved?: Unresolved[];
  /** P10 — the warehouse the free-stock offer was counted at, by its own
   *  name. `null` = there is no offer to make and no sentence to print. */
  stockWarehouse?: string | null;
}

/** P10 — what `Take` answers with. The number is the SERVER's. */
interface TakeStockResponse {
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
  | { status: "pending" }
  | { status: "done"; pos: string[] }
  | { status: "failed"; message: string };

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
  model: string;
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

/** `mee yee` → `Mee Yee`, `PETER` → `Peter` — display only, the record keeps
 *  what was typed. */
function properCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/(^|[\s\-\/])([a-z])/g, (_m, sep, ch) => sep + ch.toUpperCase());
}

/** Sentinels for filter options that are facts, not values. */
const F_OVERDUE = "__overdue__";
const F_NONE = "__none__";
const F_NOT_ORDERED = "__not_ordered__";

// ── Page ────────────────────────────────────────────────────────────────────

export default function OperationToOrder() {
  const navigate = useNavigate();

  const q = useQuery<ToOrderResponse>({
    queryKey: qk.operation.toOrder(),
    queryFn: () => apiFetch<ToOrderResponse>("/api/operation/purchase/to-order"),
    refetchOnWindowFocus: true,
  });

  const proposals = useMemo(() => q.data?.proposals ?? [], [q.data]);
  const poDays = useMemo(() => q.data?.poDays ?? [], [q.data]);
  const orderedRows = useMemo(() => q.data?.ordered ?? [], [q.data]);
  const destinations = useMemo(() => q.data?.destinations ?? [], [q.data]);
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
  const [searchParams, setSearchParams] = useSearchParams();
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
      return new Set(scheduleDays[0] ? [scheduleDays[0]] : []) as ReadonlySet<string>;
    }
    return new Set(
      rawView.split(",").filter((v) => v === "overdue" || scheduleDays.includes(v)),
    ) as ReadonlySet<string>;
  }, [rawView, scheduleDays]);
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
    const n = new Set(viewSet);
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
  const [dialogOpen, setDialogOpen] = useState(false);
  /**
   * P10 — which rows are open, and which one is mid-take.
   *
   * Controlled by the page, which is `DataTable`'s own contract: the page
   * already knows the record it is working on, and a component holding a
   * second copy of that is a second source of truth.
   */
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [taking, setTaking] = useState<string | null>(null);
  const [takeError, setTakeError] = useState<ReadonlyMap<string, string>>(new Map());

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
        if (r.delivery == null && !r.readyStock) continue;
        const bucket =
          today == null
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
            model: railItemLabel(b.model, b.size ?? null),
            qty: b.qty,
            bucket,
            orderedPo: null,
            freeStock: b.freeStock ?? 0,
            takenFromStock: b.takenFromStock ?? 0,
          });
        }
      }
    }
    const demandKeys = new Set(rows.map((r) => r.key));
    for (const o of orderedRows) {
      const key = `po:${o.poId}:${o.orderId ?? o.so ?? "manual"}`;
      if (demandKeys.has(key)) continue;
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
        model: o.model,
        qty: o.qty,
        // Ordered TODAY sits on the current run's row (今天下了哪些);
        // older receipts belong to Purchase Orders, not this calendar.
        bucket: o.placedAt === today ? (scheduleDays[0] ?? "past") : "past",
        orderedPo: o.poId,
        // An ordered row is a RECEIPT. There is nothing left to decide on it,
        // so it is never offered stock and never opens.
        freeStock: 0,
        takenFromStock: 0,
      });
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planned, orderedRows, today, poDays, scheduleDays]);

  /** A row's PO, whichever way it got one — this session or the server. */
  const poOf = (r: GridRow) => rowPo.get(r.key) ?? r.orderedPo;

  /** The rail's counts — unissued work per calendar row, falling as POs land. */
  const timeCounts = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const r of allRows) {
      if (poOf(r)) continue;
      const s = m.get(r.bucket) ?? new Set<string>();
      s.add(r.orderId ?? r.key);
      m.set(r.bucket, s);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, rowPo]);

  // ── The Excel pipeline: view → category → search → column filters → sort ──

  const inView = useMemo(
    () =>
      allRows.filter(
        (r) =>
          (viewSet.size === 0 || viewSet.has(r.bucket)) &&
          (catSet.size === 0 || catSet.has(r.category)) &&
          (search.trim() === "" ||
            (r.so != null && `so-${r.so}`.includes(search.trim().toLowerCase())) ||
            r.model.toLowerCase().includes(search.trim().toLowerCase()) ||
            (r.customer ?? "").toLowerCase().includes(search.trim().toLowerCase()) ||
            (poOf(r) ?? "").toLowerCase().includes(search.trim().toLowerCase())),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allRows, viewSet, catSet, search, rowPo],
  );

  /** Does a row pass ONE column's filter? Sentinels are facts, not values. */
  function passes(r: GridRow, colKey: string, sel: ReadonlySet<string>): boolean {
    if (sel.size === 0) return true;
    switch (colKey) {
      case "delivery":
        return (
          (sel.has(F_OVERDUE) && r.late) ||
          sel.has(r.delivery ?? F_NONE)
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
      if (poOf(r)) continue;
      // Everything `inView` applies except the category picks — see above.
      if (viewSet.size > 0 && !viewSet.has(r.bucket)) continue;
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
  }, [allRows, viewSet, search, colFilters, rowPo]);

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
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, colFilters, sort, rowPo]);

  // ── Selection: the engine pre-ticks ITS plan, a human ticks the rest ──────

  const defaultOn = (r: GridRow) =>
    (r.bucket === "overdue" || r.bucket === scheduleDays[0]) && !poOf(r);
  const isSelected = (r: GridRow) =>
    !poOf(r) && (defaultOn(r) ? !userOff.has(r.key) : userOn.has(r.key));
  const toggleRow = (r: GridRow) => {
    if (poOf(r)) return;
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

  /** Header select-all — over the rows the operator can SEE, Excel's rule. */
  const toggleAllVisible = () => {
    const vis = visibleRows.filter((r) => !poOf(r));
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

  // ── The batch — one POST per group; grid and bar report in place ─────────
  async function issueAll(only?: ReadonlySet<string>) {
    const targets = batch.targets.filter((t) => !only || only.has(t.proposal.key));
    if (targets.length === 0 || !defaultDest) return;
    setCreating(true);
    setResults((m) => {
      const n = new Map(m);
      for (const t of targets) n.set(t.proposal.key, { status: "pending" });
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
              // The ARRANGEMENT only. No SKU, no quantity, no price.
              purchaseOrders: t.docs,
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
   * ── P10 · `Take` — the human accepting the system's suggestion ────────────
   *
   * NO QUANTITY IS SENT. Loo's ruling 3: the system suggests, the human takes,
   * so there is nothing to type and nothing to mistype — and the REASON is
   * recorded by construction, because the press can mean one thing only.
   *
   * The server does the whole act (reserve through K4's door, reduce a typed
   * demand through 0320's), then the page REFETCHES rather than patching the
   * row from the response. A take changes what every other row may be offered
   * — the pool is shared — so re-reading is the only way the grid stays true.
   * That is the opposite of Issue, which updates in place because a purchase
   * order changes nothing about its neighbours.
   */
  async function takeStock(row: GridRow) {
    if (!row.orderId || !row.buildKey || taking) return;
    setTaking(row.key);
    setTakeError((m) => {
      const n = new Map(m);
      n.delete(row.key);
      return n;
    });
    try {
      await apiFetch<TakeStockResponse>("/api/operation/purchase/to-order/take-stock", {
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
      setTakeError((m) =>
        // The server's own named reason, and the page's existing fallback for
        // a request that failed without one — no new word is invented here.
        new Map(m).set(row.key, e instanceof Error ? e.message : "failed"),
      );
    } finally {
      setTaking(null);
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

  const filterFor = (key: string, options: ColumnFilter["options"], searchable = false): ColumnFilter => ({
    options,
    selected: colFilters.get(key) ?? new Set(),
    onChange: setColFilter(key),
    label: `${W.filterLabel} ${key}`,
    clearLabel: W.cancel,
    ...(searchable ? { searchPlaceholder: W.searchPlaceholder } : {}),
  });
  /**
   * THREE COLUMN FILTERS LEFT WITH THEIR COLUMNS (Loo, 2026-08-03).
   *
   * `Customer Delivery`, `SO No.` and `Customer` moved onto the group header,
   * so their ▼ went with them rather than being re-homed somewhere nobody
   * would look. Most of what they did survives: the toolbar search already
   * matches SO · model · customer · PO, and the rail already narrows by time.
   *
   * What is genuinely LOST is filtering to one specific delivery date.
   * Reported rather than replaced by a control nobody asked for — if it turns
   * out to be missed, it comes back as its own decision.
   */

  const supplierOptions = useMemo(() => {
    const base = filteredExcept("supplier");
    const vals = [...new Set(base.map((r) => r.supplier ?? F_NONE))].sort();
    return vals.map((v) => ({ value: v, label: v === F_NONE ? "—" : v }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, colFilters]);

  const modelOptions = useMemo(() => {
    const base = filteredExcept("model");
    const models = [...new Set(base.map((r) => r.model))].sort();
    return models.map((m) => ({ value: m, label: m }));
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
  /**
   * ── The GROUP: one line per customer order ────────────────────────────────
   *
   * AutoCount's shape (Loo, 2026-08-03, from its `SO Batch Posting` screen —
   * its own version of this page). Its row IS the customer order and the items
   * open underneath, so the customer's name, the order number and the date are
   * stated ONCE. Ours was one row per item, so a customer buying three pieces
   * printed their name three times.
   *
   * Two facts move onto the header because they belong to the ORDER and could
   * never honestly sit on a row: whether the order is PARTLY ordered, and the
   * purchase-order numbers it has already produced — one customer order can
   * carry several, because SO-1286 goes to two factories and that is two
   * documents.
   *
   * Computed from ALL rows, never from the visible ones: an order is partly
   * ordered whether or not the ordered half happens to pass today's filter,
   * and a status that changed when you filtered would be a status nobody could
   * trust.
   */
  const groupFacts = useMemo(() => {
    const m = new Map<
      string,
      {
        so: number | null;
        customer: string | null;
        delivery: string | null;
        late: boolean;
        total: number;
        ordered: number;
        pos: string[];
      }
    >();
    for (const r of allRows) {
      const k = r.orderId ?? r.key;
      const g =
        m.get(k) ??
        {
          so: r.so,
          customer: r.customer,
          delivery: r.delivery,
          late: r.late,
          total: 0,
          ordered: 0,
          pos: [] as string[],
        };
      g.total += 1;
      const po = poOf(r);
      if (po) {
        g.ordered += 1;
        if (!g.pos.includes(po)) g.pos.push(po);
      }
      m.set(k, g);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, rowPo]);


  /**
   * ── Grid columns — ONE WIDTH SYSTEM, and the order Loo named ─────────────
   *
   * ORDER (Loo, 2026-08-03, on the real page):
   *   Supplier · Customer Delivery · SO No. · Customer · Qty · Model · PO No.
   * The factory comes FIRST because it is what the operator groups by in his
   * head — everything to its right describes that factory's work.
   *
   * WIDTHS ARE ALL PERCENTAGES AND THEY SUM TO 100 (with `DataTable`'s own 4%
   * checkbox). That is `02-components.md`'s DataTable law — *"Give every
   * column a width; the set sums to 100"* — and this page was breaking it:
   * ONE percentage (20), five raw pixel strings, and a final `auto`. Mixing
   * three units means nothing is proportional to anything, and `auto` on the
   * LAST column hands every spare pixel to the narrowest content on the page,
   * which is the empty right-hand third Loo saw.
   *
   * The 2026-08-01 checkpoint's "fixed pixels with the last column auto" is
   * RETIRED by this. It was written to cure percentage columns inflating on a
   * wide monitor; the real cure is that the slack belongs to the column with
   * the longest variable content — Model — not to whichever column is last.
   *
   *   3  ⊞ (DataTable's own, P10)   4  ☑ (DataTable's own)
   *   22 Supplier                   8  Qty
   *   43 Model ← takes the slack   20  PO No.                   ── 100
   *
   * P10's expand control costs 3, and it comes out of MODEL for the same
   * reason Model holds the slack: it is the widest column and the only one
   * with room to give. The identity columns (Customer Delivery · SO No. ·
   * Customer) named in the older split moved into the GROUP HEADER — one
   * line per customer order, AutoCount's own shape.
   *
   * QTY SITS BEFORE MODEL (Loo, 2026-08-03, on the real page). Right-aligned
   * in a 6%% column BETWEEN Model and PO No., the number was pushed to the far
   * side of a wide column and read as though it belonged to neither. Before
   * Model it lands directly against the model name — `2 │ Cody K` — which is
   * how a quantity reads on every invoice and in AutoCount.
   *
   * MEASURED in a real browser, not estimated (2026-08-03): at every viewport
   * from a 13-inch MacBook Air (776px of table) to a 2560 desktop, no column
   * truncates and the table NEVER scrolls sideways. The first split had
   * Customer Delivery at 14 and it fell 10px short of `Fri, 21 Aug 26` on the
   * 13-inch — the 2%% came from Customer, whose names are shorter.
   */
  const columns: readonly Column<GridRow>[] = [
    {
      /**
       * Supplier — the column that answers "why 3 POs?" on the ROW. It is not
       * the same fact as the rail's category, and it stops being derivable
       * from it the day a second mattress supplier exists (September).
       */
      key: "supplier",
      label: W.supplierLabel,
      width: 22,
      sortable: true,
      filter: filterFor("supplier", supplierOptions, true),
      cell: (r) => r.supplier ?? "—",
    },
    {
      key: "qty",
      label: W.colQty,
      width: 8,
      align: "right",
      numeric: true,
      sortable: true,
      // NO filter caret (Jess, 2026-08-01): a distinct-value list of 1·2·3
      // filters nothing worth the button, and on a narrow numeric column the
      // caret is what pushed the word off the numbers' edge.
      cell: (r) => r.qty,
    },
    {
      // The widest column on purpose: model names are the longest and most
      // variable text on the page, so the table's spare width belongs here.
      key: "model",
      label: W.colModel,
      width: 43,
      sortable: true,
      filter: filterFor("model", modelOptions, true),
      cell: (r) =>
        r.takenFromStock > 0 ? (
          <span className="flex items-baseline gap-2 min-w-0">
            <span className="truncate">{r.model}</span>
            {/* P10 — why this row's quantity is smaller than what was asked
                for. A number that simply falls is the silent failure this
                module keeps paying for. It rides the Model column because
                that is where the page's spare width is. */}
            <span className="shrink-0 text-label text-kit-green-11">
              {tookFromStockLabel(r.takenFromStock)}
            </span>
          </span>
        ) : (
          r.model
        ),
    },
    {
      key: "po",
      label: W.colPoNo,
      width: 20,
      sortable: true,
      filter: filterFor("po", poOptions),
      cell: (r) => {
        const po = poOf(r);
        // Not "no data" — WORK. Muted, unclickable, filterable by name.
        if (!po) return <span className="text-kit-slate-11">{W.yetToOrder}</span>;
        // The number is the receipt AND the door to the next step: it lands
        // on Purchase Orders with THIS document opened.
        const slug = PO_TAB_SLUG[r.category];
        return (
          <button
            type="button"
            title="Open Purchase Order"
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

  const updatedMs = q.dataUpdatedAt;

  return (
    /* h-full, not flex-1: the app wrapper is overflow-auto, so a page that
     * GROWS makes the whole page scroll. Filling the frame instead keeps the
     * header strip and toolbar still — the grid is the only scroll area
     * (the Orders page's own behaviour). */
    <div className="h-full min-h-0 flex flex-col bg-kit-slate-3">
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
          className="w-[200px] shrink-0 min-h-0 overflow-y-auto border-r border-kit-slate-5 px-3 py-3 flex flex-col"
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
              active={viewSet.has("overdue")}
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
              active={viewSet.has(day)}
              onClick={() => toggleView(day)}
              testId={`to-order-day-${day}`}
              name={weekdayName(day)}
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

          <div className="my-2 border-t border-kit-slate-6" />

          {/* The manual entrance — always present (Loo: the door may never
              be missing). The dialog is real; its SAVE arrives with the
              unified purchase_demands card. */}
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            data-testid="to-order-create-purchase"
            className="flex w-full items-center gap-1 px-2 py-1.5 rounded-control text-body text-kit-slate-11 hover:bg-kit-slate-3 text-left"
          >
            + {W.createPurchase}
          </button>
        </aside>

        {/* ── The Excel Workspace: one toolbar, one grid. ───────────────── */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0 gap-2 px-4 pt-2 pb-3">
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
              creating ? (
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
                    onClick={() => void issueAll()}
                    disabled={unread || batch.poCount === 0 || !defaultDest}
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
              ) : null
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
                      onClick={() => void issueAll(failedKeys)}
                      data-testid="to-order-retry"
                    >
                      {W.retry}
                    </Button>
                  </span>
                </div>
              ) : null}
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
              <div className="flex-1 min-h-0 flex flex-col rounded-card overflow-hidden">
                <DataTable
                  rows={visibleRows}
                  columns={columns}
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
                  rowLate={(r) => r.bucket === "overdue"}
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
                  expansion={{
                    expanded,
                    expandable: (r) => r.freeStock > 0 && !poOf(r),
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
                        <span className="text-kit-slate-11">
                          {freeStockLine(stockWarehouse ?? "", r.freeStock)}
                        </span>
                        <Button
                          size="sm"
                          onClick={() => takeStock(r)}
                          disabled={taking != null}
                          data-testid={`to-order-take-${r.key}`}
                        >
                          {takeFromStockLabel(r.freeStock)}
                        </Button>
                        {takeError.get(r.key) ? (
                          <span className="text-kit-red-11">{takeError.get(r.key)}</span>
                        ) : null}
                      </span>
                    ),
                  }}
                  /* ONE line per customer order — AutoCount's own shape. The
                   * facts that used to repeat down every row of an order live
                   * here now, plus the two that could only ever be true of an
                   * ORDER: partly ordered, and the purchase orders it has
                   * already produced. */
                  group={{
                    keyOf: (r) => r.orderId ?? r.key,
                    header: (r) => {
                      const g = groupFacts.get(r.orderId ?? r.key);
                      const partly = g != null && g.ordered > 0 && g.ordered < g.total;
                      return (
                        <span
                          className="flex items-center gap-2 text-body"
                          data-testid={`to-order-group-${r.orderId ?? r.key}`}
                        >
                          <span className="font-semibold text-kit-slate-12 tabular-nums">
                            {r.readyStock ? W.readyStockGroup : r.so != null ? `SO-${r.so}` : "—"}
                          </span>
                          {r.readyStock ? (
                            r.destination ? (
                              <span className="text-kit-slate-12 truncate">{r.destination}</span>
                            ) : null
                          ) : r.customer ? (
                            <span className="text-kit-slate-12 truncate">
                              {properCase(r.customer)}
                            </span>
                          ) : null}
                          {/* `No delivery date` is a CUSTOMER's word — it means
                              nobody has promised this yet. On ready stock an
                              empty date means the opposite: buy it on the next
                              run. So the ready stock group prints its date when
                              one was asked for and prints NOTHING when none
                              was, rather than borrowing a sentence that is
                              false about it. */}
                          {r.readyStock && !r.delivery ? null : (
                            <span
                              className={
                                r.late
                                  ? "text-kit-red-11 font-medium tabular-nums"
                                  : "text-kit-slate-11 tabular-nums"
                              }
                            >
                              {r.delivery ? fmtDate(r.delivery) : W.noDeliveryDate}
                            </span>
                          )}
                          {partly ? (
                            <span className="rounded-pill bg-kit-amber-3 px-2 py-0.5 text-label text-kit-amber-11">
                              {W.partlyOrdered}
                            </span>
                          ) : null}
                          {g && g.pos.length > 0 ? (
                            <span className="ml-auto text-kit-blue-11 tabular-nums truncate">
                              {g.pos.join(" · ")}
                            </span>
                          ) : null}
                        </span>
                      );
                    },
                  }}
                  selection={{
                    selected: selectedKeys,
                    onToggleRow: (id) => {
                      const r = rowByKey.get(id);
                      if (r) toggleRow(r);
                    },
                    onToggleAll: toggleAllVisible,
                    label: W.select,
                    selectable: (r) => !poOf(r),
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

      <CreatePurchaseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        destinations={destinations}
        onCreated={() => void q.refetch()}
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
 * `+ Create Purchase` — the manual entrance, and V1 buys READY STOCK only
 * (Jess, 2026-08-03).
 *
 * Five fields and nothing else: Item · Quantity · Deliver To · Required By ·
 * Remark. There is no Purpose picker, because there is one purpose; there is
 * no Supplier picker, because a product has one factory and the server derives
 * it from the SKU — asking a human to pick it is asking them to get it wrong,
 * and a demand pointed at the wrong factory becomes a purchase order pointed
 * at the wrong factory.
 *
 * NOTHING IS DISABLED AND NOTHING IS A PLACEHOLDER. Display begins at the
 * Dealer/Sales portal and Office at a future internal request workflow; both
 * will arrive through the same table, and neither is hinted at here.
 */
function CreatePurchaseDialog({
  open,
  onOpenChange,
  destinations,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  destinations: readonly Destination[];
  onCreated: () => void;
}) {
  const catalog = useCatalog({ enabled: open });
  const [needle, setNeedle] = useState("");
  const [sku, setSku] = useState<string | null>(null);
  const [qty, setQty] = useState("1");
  const [dest, setDest] = useState<string | undefined>(undefined);
  const [requiredBy, setRequiredBy] = useState("");
  const [remark, setRemark] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const defaultDest = destinations.find((d) => d.isDefault) ?? destinations[0];
  const chosenDest = dest ?? defaultDest?.id;

  /** The catalog, as pickable items. A SKU with no factory is NOT offered —
   *  the server would refuse it, and offering it teaches the operator that the
   *  refusal is random rather than a configuration hole. */
  const items = useMemo(() => {
    const models = new Map(
      (catalog.data?.models ?? []).map((m) => [m.id, m.name as string]),
    );
    return (catalog.data?.skus ?? [])
      .filter((s) => s.supplierId != null)
      .map((s) => ({
        sku: s.sku,
        label: railItemLabel(
          models.get(s.modelId) ?? s.sku,
          s.variantKind === "size" ? s.variant : null,
        ),
      }));
  }, [catalog.data]);

  const shown = useMemo(() => {
    const n = needle.trim().toLowerCase();
    if (!n) return items.slice(0, 8);
    return items
      .filter((i) => i.label.toLowerCase().includes(n) || i.sku.toLowerCase().includes(n))
      .slice(0, 8);
  }, [items, needle]);

  const picked = items.find((i) => i.sku === sku) ?? null;
  const qtyN = Number(qty);
  const canSave =
    !saving && sku != null && Number.isInteger(qtyN) && qtyN >= 1 && chosenDest != null;

  function reset() {
    setNeedle("");
    setSku(null);
    setQty("1");
    setDest(undefined);
    setRequiredBy("");
    setRemark("");
    setFailed(null);
  }

  async function save() {
    if (!canSave || !sku || !chosenDest) return;
    setSaving(true);
    setFailed(null);
    try {
      await apiFetch("/api/operation/purchase/to-order/demand", {
        method: "POST",
        body: JSON.stringify({
          sku,
          qty: qtyN,
          destinationId: chosenDest,
          requiredBy: requiredBy || null,
          remark: remark.trim() || null,
        }),
      });
      reset();
      onOpenChange(false);
      onCreated();
    } catch (e) {
      // The failure STAYS in the dialog with the form intact: a demand that
      // did not save must not look like one that did.
      setFailed(e instanceof Error ? e.message : W.createFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      title={W.createPurchase}
      footer={
        <span className="flex items-center gap-3 pt-1">
          {failed ? (
            <span className="text-meta text-kit-red-11" data-testid="to-order-create-failed">
              {failed}
            </span>
          ) : null}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {W.cancel}
          </Button>
          <Button
            variant="primary"
            disabled={!canSave}
            loading={saving}
            onClick={() => void save()}
            data-testid="to-order-create-submit"
          >
            {W.create}
          </Button>
        </span>
      }
    >
      <div className="flex flex-col gap-3" data-testid="to-order-create-dialog">
        <div>
          <label htmlFor="cp-item" className="text-meta text-kit-slate-11">
            {W.itemLabel}
          </label>
          <SearchInput
            id="cp-item"
            value={picked ? picked.label : needle}
            onChange={(e) => {
              setNeedle(e.target.value);
              setSku(null);
            }}
            placeholder={W.searchItem}
          />
          {sku == null ? (
            <div className="mt-1 flex flex-col rounded-control border border-kit-slate-5 bg-white">
              {shown.map((i) => (
                <button
                  key={i.sku}
                  type="button"
                  className="px-2 py-1.5 text-left text-body hover:bg-kit-slate-3"
                  data-testid={`cp-item-${i.sku}`}
                  onClick={() => {
                    setSku(i.sku);
                    setNeedle("");
                  }}
                >
                  {i.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <Input
          id="cp-qty"
          label={W.itemsColQty}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
        <div>
          <label htmlFor="cp-dest" className="text-meta text-kit-slate-11">
            {W.destination}
          </label>
          <Select
            id="cp-dest"
            value={chosenDest}
            onValueChange={setDest}
            options={destinations.map((d) => ({ value: d.id, label: d.name }))}
          />
        </div>
        {/* The kit DATE field, not a text input with type="date" — one date
            spelling for the whole portal (02 · DatePicker). Empty is a real
            answer: buy it on the next run. */}
        <DatePicker
          id="cp-required"
          label={W.requiredBy}
          value={requiredBy || null}
          onChange={(v) => setRequiredBy(v ?? "")}
        />
        <Textarea
          id="cp-remark"
          label={W.remark}
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
        />
      </div>
    </Modal>
  );
}