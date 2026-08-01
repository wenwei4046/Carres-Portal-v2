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
  countOrders,
  defaultDocuments,
  ordersHeadline,
  poScheduleBucket,
  poScheduleDays,
  weekdayName,
  posCreatedLine,
  railItemLabel,
  selectedShort,
  poShortCount,
  toOrderBuilds,
  unresolvedHeadline,
  type ToOrderOrderedRow,
  type ToOrderProposal,
} from "@carres/shared";
import Button from "@/components/kit/Button";
import Card from "@/components/kit/Card";
import DataTable, { type Column, type ColumnFilter, type TableSort } from "@/components/kit/DataTable";
import EmptyState from "@/components/kit/EmptyState";
import GridToolbar from "@/components/kit/GridToolbar";
import Input from "@/components/kit/Input";
import Loading from "@/components/kit/Loading";
import Modal from "@/components/kit/Modal";
import SearchInput from "@/components/kit/SearchInput";
import Select from "@/components/kit/Select";
import Textarea from "@/components/kit/Textarea";
import Icon from "@/components/kit/Icon";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { qk } from "@/lib/queries";
import PurchasingTabs from "./PurchasingTabs";
import { TopBarIcons } from "./components/GlobalTopBar";

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
    const valid = new Set(
      (rawView ?? "")
        .split(",")
        .filter((v) => v === "overdue" || scheduleDays.includes(v)),
    );
    if (valid.size === 0 && scheduleDays[0]) valid.add(scheduleDays[0]);
    return valid as ReadonlySet<string>;
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
    // Unticking the last run falls back to the default rather than a blank.
    setParam("view", n.size === 0 ? (scheduleDays[0] ?? "") : [...n].join(","));
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
        if (r.delivery == null) continue;
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
            orderId: r.orderId,
            customer: r.customer ?? null,
            so: r.so,
            delivery: r.delivery ?? null,
            late: today != null && r.delivery != null && r.delivery < today,
            model: railItemLabel(b.model, b.size ?? null),
            qty: b.qty,
            bucket,
            orderedPo: null,
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
          viewSet.has(r.bucket) &&
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
   *  purchase order. An unticked build stays demand and is offered again. */
  const batch = useMemo(() => {
    const selectedByProposal = new Map<string, Set<string>>();
    let selectedRows = 0;
    for (const r of allRows) {
      if (r.proposalKey == null || r.buildKey == null || !isSelected(r)) continue;
      selectedRows += 1;
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
    return { selectedRows, poCount, targets };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, userOff, userOn, rowPo, planned]);

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

  const deliveryOptions = useMemo(() => {
    const base = filteredExcept("delivery");
    const opts: { value: string; label: string }[] = [
      { value: F_OVERDUE, label: W.filterOverdue },
    ];
    const dates = [...new Set(base.map((r) => r.delivery).filter(Boolean))] as string[];
    dates.sort();
    for (const d of dates) opts.push({ value: d, label: fmtDate(d) });
    if (base.some((r) => r.delivery == null))
      opts.push({ value: F_NONE, label: W.noDeliveryDate });
    return opts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, colFilters]);

  const soOptions = useMemo(() => {
    const base = filteredExcept("so");
    const sos = [...new Set(base.map((r) => r.so).filter((x) => x != null))] as number[];
    sos.sort((a, b) => a - b);
    return sos.map((s) => ({ value: String(s), label: `SO-${s}` }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, colFilters]);

  const modelOptions = useMemo(() => {
    const base = filteredExcept("model");
    const models = [...new Set(base.map((r) => r.model))].sort();
    return models.map((m) => ({ value: m, label: m }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, colFilters]);

  const customerOptions = useMemo(() => {
    const base = filteredExcept("customer");
    const vals = [...new Set(base.map((r) => r.customer ?? F_NONE))].sort();
    return vals.map((v) => ({ value: v, label: v === F_NONE ? "—" : properCase(v) }));
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

  // ── Grid columns — Loo's frozen six, now with the Excel reflexes ─────────
  const columns: readonly Column<GridRow>[] = [
    {
      key: "delivery",
      label: W.colPreferred,
      width: 20,
      sortable: true,
      filter: filterFor("delivery", deliveryOptions),
      cell: (r) => (
        <span
          className={
            r.late ? "text-kit-red-11 font-medium tabular-nums" : "tabular-nums"
          }
        >
          {r.delivery ? (
            fmtDate(r.delivery)
          ) : (
            <span className="text-kit-slate-11">{W.noDeliveryDate}</span>
          )}
        </span>
      ),
    },
    {
      key: "so",
      label: W.colSoNo,
      width: 12,
      sortable: true,
      filter: filterFor("so", soOptions, true),
      cell: (r) => (r.so != null ? `SO-${r.so}` : "—"),
    },
    {
      key: "customer",
      label: W.colCustomer,
      width: 16,
      sortable: true,
      filter: filterFor("customer", customerOptions, true),
      cell: (r) => (r.customer ? properCase(r.customer) : "—"),
    },
    {
      key: "model",
      label: W.colModel,
      width: 22,
      sortable: true,
      filter: filterFor("model", modelOptions, true),
      cell: (r) => r.model,
    },
    {
      key: "qty",
      label: W.colQty,
      width: 10,
      align: "right",
      numeric: true,
      sortable: true,
      // NO filter caret here (Jess, 2026-08-01): a distinct-value list of
      // 1·2·3 filters nothing worth the button, and on a narrow numeric
      // column the caret is what pushed the word off the numbers' edge.
      cell: (r) => r.qty,
    },
    {
      key: "po",
      label: W.colPoNo,
      width: 16,
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
            title="Open Purchase Order →"
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
      {/* ── The top strip — the Orders page's own shape: breadcrumb + the
           shared icon cluster. No H1, no search here. ─────────────────── */}
      <div
        className="shrink-0 flex items-center justify-between gap-3 px-6 pt-3 pb-1"
        data-testid="to-order-header-strip"
      >
        <div className="min-w-0 flex items-center gap-1.5 text-meta text-kit-slate-11">
          <span>Purchasing</span>
          <Icon name="forward" size={14} />
          <span className="text-kit-slate-12">To Order</span>
        </div>
        <TopBarIcons />
      </div>

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
          <NavRow
            active={catSet.size === 0}
            onClick={clearCats}
            testId="to-order-cat-all"
            name={W.categoryAll}
            count={null}
          />
          {RAIL_CATEGORIES.map((c) => (
            <NavRow
              key={c.key}
              active={catSet.has(c.key)}
              onClick={() => toggleCat(c.key)}
              testId={`to-order-cat-${c.key}`}
              name={c.word}
              count={null}
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
            className="flex w-full items-center gap-1 px-2 py-1.5 rounded-control text-body text-kit-slate-11 hover:bg-kit-blue-3 text-left"
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
                  <span className="flex flex-col items-end leading-tight text-meta tabular-nums text-kit-slate-11 whitespace-nowrap">
                    <span>{selectedShort(batch.selectedRows)}</span>
                    <span>{poShortCount(batch.poCount)}</span>
                  </span>
                  <Button
                    variant="primary"
                    shape="pill"
                    onClick={() => void issueAll()}
                    disabled={unread || batch.poCount === 0 || !defaultDest}
                    data-testid="to-order-issue"
                  >
                    {W.issuePos}
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
                <div className="flex items-center gap-3 rounded-card bg-kit-amber-3 px-3 py-1.5 text-body text-kit-amber-11">
                  <span data-testid="to-order-unresolved">
                    {`⚠ ${unresolvedHeadline(unresolved.length)} — ${W.unresolvedHelp}`}
                  </span>
                </div>
              ) : null}
              {!creating && donePoCount > 0 ? (
                <div className="flex items-center gap-3 rounded-card bg-kit-green-3 px-3 py-1.5 text-body text-kit-green-11">
                  <span className="tabular-nums" data-testid="to-order-created-line">
                    {`✓ ${posCreatedLine(donePoCount)}`}
                    {donePoIds.length > 0 && donePoIds.length <= 3
                      ? ` — ${donePoIds.join(" · ")}`
                      : ""}
                  </span>
                  <span className="ml-auto flex items-center gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => navigate("/operation/procurement")}
                      data-testid="to-order-continue"
                    >
                      {`${W.continueInPos} →`}
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
                <div className="flex items-center gap-3 rounded-card bg-kit-red-3 px-3 py-1.5 text-body text-kit-red-11">
                  <span data-testid="to-order-failed-line">{`✗ ${failedKeys.size} ${W.createFailed}`}</span>
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
              <>
                <DataTable
                  rows={visibleRows}
                  columns={columns}
                  rowId={(r) => r.key}
                  empty={W.empty}
                  label={W.itemsTableLabel}
                  sort={sort}
                  onSortChange={setSort}
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
                {/* The Orders page's own closing line: what am I looking at,
                    counted. Orders, not rows — a build is not a unit of work
                    a purchaser counts in. */}
                <footer
                  className="shrink-0 flex items-center gap-3 px-3 h-10 border border-t-0 border-kit-slate-5 bg-white text-meta text-kit-slate-11"
                  data-testid="to-order-footer"
                >
                  <span className="tabular-nums">
                    {countOrders(new Set(visibleRows.map((r) => r.orderId ?? r.key)).size)}
                  </span>
                </footer>
              </>
            )}
          </div>

        </div>
      </div>

      <CreatePurchaseDialog open={dialogOpen} onOpenChange={setDialogOpen} proposals={proposals} />
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
        active ? "bg-kit-blue-3" : "hover:bg-kit-blue-3",
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
 * `+ Create Purchase` — GitHub's New Issue, as a purchasing dialog. Reason is
 * part of the FORM, never navigation; Category is never asked (it comes from
 * the item). The SAVE arrives with the unified `purchase_demands` card —
 * until then the Create button is disabled and says so, so the entrance
 * teaches its own future without pretending to work.
 */
function CreatePurchaseDialog({
  open,
  onOpenChange,
  proposals,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposals: ToOrderProposal[];
}) {
  const [reason, setReason] = useState("ready_stock");
  const [supplier, setSupplier] = useState<string | undefined>(undefined);
  const [item, setItem] = useState("");
  const [qty, setQty] = useState("1");
  const [remark, setRemark] = useState("");

  const suppliers = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of proposals) m.set(p.supplierId, p.supplierName);
    return [...m.entries()].map(([value, label]) => ({ value, label }));
  }, [proposals]);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={W.createPurchase}
      footer={
        <span className="flex items-center gap-3 pt-1">
          <span className="text-meta text-kit-slate-11">{W.nextUpdate}</span>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {W.cancel}
          </Button>
          <Button variant="primary" disabled data-testid="to-order-create-submit">
            {W.create}
          </Button>
        </span>
      }
    >
      <div className="flex flex-col gap-3" data-testid="to-order-create-dialog">
        <div>
          <label htmlFor="cp-reason" className="text-meta text-kit-slate-11">
            {W.reason}
          </label>
          <Select
            id="cp-reason"
            value={reason}
            onValueChange={setReason}
            options={[
              { value: "ready_stock", label: W.reasonReadyStock },
              { value: "display", label: W.reasonDisplay },
              { value: "warranty", label: W.reasonWarranty },
              { value: "spare_parts", label: W.reasonSpareParts },
              { value: "office", label: W.reasonOffice },
              { value: "other", label: W.reasonOther },
            ]}
          />
        </div>
        <div>
          <label htmlFor="cp-supplier" className="text-meta text-kit-slate-11">
            {W.supplierLabel}
          </label>
          <Select
            id="cp-supplier"
            value={supplier}
            onValueChange={setSupplier}
            options={suppliers}
          />
        </div>
        <div>
          <label htmlFor="cp-item" className="text-meta text-kit-slate-11">
            {W.itemLabel}
          </label>
          <SearchInput
            id="cp-item"
            value={item}
            onChange={(e) => setItem(e.target.value)}
            placeholder={W.searchItem}
          />
        </div>
        <Input
          id="cp-qty"
          label={W.itemsColQty}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
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
