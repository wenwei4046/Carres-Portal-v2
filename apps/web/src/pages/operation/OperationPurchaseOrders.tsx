import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  addWorkingDays,
  myHolidaySet,
  poReceivingProgress,
  purchasingActionQueue,
  purchasingSupplierCallsOf,
  railItemLabel,
  type ProductSkuDto,
  type PurchasingOpenCall,
  type SupplierCallPo,
} from "@carres/shared";
import PurchasingTabs from "./PurchasingTabs";
import { TopBarIcons } from "./components/GlobalTopBar";
import DataTable, {
  type Column,
  type ColumnFilter,
  type TableSort,
} from "@/components/kit/DataTable";
import EmptyState from "@/components/kit/EmptyState";
import Icon from "@/components/kit/Icon";
import SearchInput from "@/components/kit/SearchInput";
import { fmtDate, fmtDateShort } from "@/lib/fmt-date";
import {
  useCatalog,
  useOperationPos,
  useOperationPoUnits,
  useOperationSuppliers,
  useOperationWarehouse,
  usePurchasingSettings,
  type operationPoListRow,
  type SupplierRow,
} from "@/lib/queries";

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
 *   LISTING (kit DataTable — the AutoCount work listing)
 *     PO No. · Supplier · Items · Goods Arriving At · Received ·
 *     Current Action. Header sorts, ▼ AutoFilters, search — To Order's own
 *     reflexes. A row answers "which PO is this?" without opening it.
 *
 *   WORKSPACE (400px right) — ONE live Purchase Order. It reads as a PO,
 *     not an ERP form: document head, items, the supplier's date, receiving
 *     line — and the supplier COMMUNICATION desk at the bottom (draft the
 *     WhatsApp from live data → copy → open the group). Real PDF only on
 *     [Print PDF].
 *
 * Mission: pick today's supplier PO → update supplier progress → talk to the
 * supplier → hand over to Receiving.
 *
 * Deliberately absent until their stores exist (dead controls are banned):
 * Email window (`suppliers.email`) · I've Sent + History (`po_sends`) ·
 * Notes (no store) · Supplier DO (no store) · editable Goods Arriving At
 * (Phase 6 — writes the promise ledger through its own door).
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

function callPoOf(po: operationPoListRow): SupplierCallPo {
  return {
    poId: po.id,
    supplierId: po.supplier_id,
    status: po.status,
    etaDateIso: po.eta_date,
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

function soRefsOf(po: operationPoListRow): number[] {
  const set = new Set<number>();
  if (po.so != null) set.add(po.so);
  for (const s of po.so_refs ?? []) set.add(s);
  return [...set].sort((a, b) => a - b);
}

/**
 * The four WORK states (Jess, 2026-08-02): how the operator finds work, not
 * how the database stores it. DERIVED from quantities + the engine — never a
 * column. A cancelled PO files under Completed (the work is over) and the
 * naming split, if wanted, is a dictionary-phase call.
 */
type WorkState =
  | "need_confirmation"
  | "waiting"
  | "ready"
  | "completed"
  | "cancelled";

const WORK_STATE_LABEL: Record<WorkState, string> = {
  need_confirmation: "Need Confirmation",
  waiting: "Waiting Goods",
  ready: "Ready to Receive",
  completed: "Completed",
  cancelled: "Cancelled",
};
const WORK_STATES: readonly WorkState[] = [
  "need_confirmation",
  "waiting",
  "ready",
  "completed",
  "cancelled",
];

function workStateOf(po: operationPoListRow, today: string): WorkState {
  const p = poReceivingProgress(po.purchase_order_lines);
  if (po.status === "cancelled") return "cancelled";
  if (po.status !== "open") return "completed";
  if (p.ordered > 0 && p.received >= p.ordered) return "completed";
  // Goods have arrived: something is checked in, or the confirmed day has come.
  if (p.received > 0 || (po.eta_date && po.eta_date <= today)) return "ready";
  if (!po.eta_date) return "need_confirmation";
  return "waiting";
}

const F_NONE = "__none__";
// Goods Arriving At ▼ — Excel's own preset vocabulary (Jess, 2026-08-02).
const F_TODAY = "__today__";
const F_YESTERDAY = "__yesterday__";
const F_THIS_WEEK = "__this_week__";
const F_LAST_WEEK = "__last_week__";
const F_THIS_MONTH = "__this_month__";
const F_LAST_MONTH = "__last_month__";

function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** Monday of the ISO week `iso` falls in. */
function weekStartIso(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return addDaysIso(iso, -dow);
}
function inRange(v: string, from: string, to: string): boolean {
  return v >= from && v <= to;
}
/** Does an arriving date hit one Excel preset / month / sentinel value? */
function arrivingMatches(eta: string | null, value: string, today: string): boolean {
  if (value === F_NONE) return eta == null;
  if (eta == null) return false;
  const ws = weekStartIso(today);
  switch (value) {
    case F_TODAY:
      return eta === today;
    case F_YESTERDAY:
      return eta === addDaysIso(today, -1);
    case F_THIS_WEEK:
      return inRange(eta, ws, addDaysIso(ws, 6));
    case F_LAST_WEEK:
      return inRange(eta, addDaysIso(ws, -7), addDaysIso(ws, -1));
    case F_THIS_MONTH:
      return eta.slice(0, 7) === today.slice(0, 7);
    case F_LAST_MONTH: {
      const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() - 1);
      return eta.slice(0, 7) === d.toISOString().slice(0, 7);
    }
    default:
      // `m:2026-08` — one month bucket; anything else is an exact day.
      if (value.startsWith("m:")) return eta.slice(0, 7) === value.slice(2);
      return eta === value;
  }
}
function monthLabel(ym: string): string {
  const d = new Date(`${ym}-01T00:00:00Z`);
  return d.toLocaleDateString("en-MY", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The document's quiet control — one recipe, spelled once (§6.6). */
/** Pane hide/expand chevron — one recipe, spelled once (§6.6). */
const PANE_BTN =
  "p-2 rounded text-kit-slate-9 hover:text-kit-slate-12 hover:bg-kit-slate-3";

const DOC_BTN =
  "px-3 py-1 rounded border border-kit-slate-5 text-body text-kit-slate-11 hover:text-kit-slate-12";

export default function OperationPurchaseOrders() {
  const posQ = useOperationPos({ status: "all" });
  const suppliersQ = useOperationSuppliers();
  const warehouseQ = useOperationWarehouse();
  const catalogQ = useCatalog();
  const settingsQ = usePurchasingSettings();
  const [params, setParams] = useSearchParams();

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<TableSort | null>(null);
  const [colFilters, setColFilters] = useState<Map<string, ReadonlySet<string>>>(
    new Map(),
  );
  const [stateSel, setStateSel] = useState<WorkState | null>(null);
  // All three panes hide and expand (Jess, 2026-08-02 — amends her earlier
  // "nav never collapses").
  const [navOpen, setNavOpen] = useState(true);
  const [listingOpen, setListingOpen] = useState(true);
  const [workspaceOpen, setWorkspaceOpen] = useState(true);

  const today = todayMYT();
  const pos = useMemo(() => posQ.data?.pos ?? [], [posQ.data]);

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
  /** `Carres Cloud · King ×2 · +1` — identify the PO without opening it. */
  const itemsPreviewOf = (po: operationPoListRow): string => {
    const ls = po.purchase_order_lines;
    if (ls.length === 0) return "—";
    const head = `${friendlySku(ls[0].sku)} ×${ls[0].qty}`;
    return ls.length > 1 ? `${head} · +${ls.length - 1}` : head;
  };
  const itemsTitleOf = (po: operationPoListRow): string =>
    po.purchase_order_lines
      .map((l) => `${friendlySku(l.sku)} ×${l.qty}`)
      .join("\n");

  const prodDaysByPair = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of settingsQ.data?.productionDays ?? [])
      m.set(`${r.supplierId}|${r.category}`, r.workingDays);
    return m;
  }, [settingsQ.data]);
  const offDaysBySupplier = useMemo(() => {
    const m = new Map<string, readonly number[] | null>();
    for (const r of settingsQ.data?.suppliers ?? []) m.set(r.id, r.offDays);
    return m;
  }, [settingsQ.data]);
  const holidays = useMemo(() => myHolidaySet(), []);

  /** The listing's ONE arrival answer per PO: the supplier's confirmed date,
   *  else the engine's default (issued + production working days on the
   *  supplier's week). No setting → no default, never a silent 7 (P1). */
  const etaByPo = useMemo(() => {
    const m = new Map<string, { date: string | null; confirmed: boolean }>();
    for (const po of pos) {
      if (po.eta_date) {
        m.set(po.id, { date: po.eta_date, confirmed: true });
        continue;
      }
      const line = po.purchase_order_lines[0];
      const modelId = line ? skuBySku.get(line.sku)?.modelId : undefined;
      const cat = modelId ? modelCategoryById.get(modelId) : undefined;
      const days =
        cat != null ? prodDaysByPair.get(`${po.supplier_id}|${cat}`) : undefined;
      const off = offDaysBySupplier.get(po.supplier_id);
      if (days == null || off == null) {
        m.set(po.id, { date: null, confirmed: false });
        continue;
      }
      m.set(po.id, {
        date: addWorkingDays((po.placed_at ?? "").slice(0, 10), days, {
          offDays: off,
          holidays,
        }),
        confirmed: false,
      });
    }
    return m;
  }, [pos, skuBySku, modelCategoryById, prodDaysByPair, offDaysBySupplier, holidays]);
  const etaOf = (po: operationPoListRow) =>
    etaByPo.get(po.id) ?? { date: po.eta_date, confirmed: po.eta_date != null };

  /** The engine's open calls per PO — the ONLY urgency source on this page. */
  const callsByPo = useMemo(() => {
    const m = new Map<string, PurchasingOpenCall[]>();
    for (const po of pos) {
      m.set(po.id, purchasingSupplierCallsOf(callPoOf(po), { todayIso: today }));
    }
    return m;
  }, [pos, today]);

  const callsOf = (po: operationPoListRow) => callsByPo.get(po.id) ?? [];

  // ── The pipeline: search → rail (calls × work status) → column filters →
  //    sort. Every rail count is computed with the OTHER dimensions applied,
  //    so a visible number always matches the rows its click produces. ─────

  const searched = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (s === "") return pos;
    return pos.filter(
      (p) =>
        p.id.toLowerCase().includes(s) ||
        supplierNameOf(p.supplier_id).toLowerCase().includes(s) ||
        soRefsOf(p).some((n) => `so-${n}`.includes(s)) ||
        p.purchase_order_lines.some(
          (l) =>
            l.sku.toLowerCase().includes(s) ||
            friendlySku(l.sku).toLowerCase().includes(s),
        ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, search, supplierById, skuBySku, modelNameById]);

  const passesState = (p: operationPoListRow, sel: WorkState | null) =>
    sel === null || workStateOf(p, today) === sel;

  function passesCol(
    po: operationPoListRow,
    colKey: string,
    sel: ReadonlySet<string>,
  ): boolean {
    if (sel.size === 0) return true;
    switch (colKey) {
      case "supplier":
        return sel.has(po.supplier_id);
      case "issued":
        return [...sel].some((v) =>
          arrivingMatches((po.placed_at ?? "").slice(0, 10) || null, v, today),
        );
      case "custdel":
        return [...sel].some((v) =>
          arrivingMatches(po.customer_delivery ?? null, v, today),
        );
      case "arriving":
        return [...sel].some((v) => arrivingMatches(etaOf(po).date, v, today));
      case "action": {
        const top = callsOf(po)[0];
        return sel.has(top ? top.key : F_NONE);
      }
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
      (p) => passesState(p, stateSel) && passesAllCols(p),
    );
    const rank = (p: operationPoListRow) => {
      const st = workStateOf(p, today);
      if (st === "completed" || st === "cancelled") return 4;
      const calls = callsOf(p);
      if (calls.some((c) => c.late)) return 0;
      if (calls.length > 0) return 1;
      return 2;
    };
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
          case "received": {
            const pr = poReceivingProgress(p.purchase_order_lines);
            return String(pr.received).padStart(6, "0");
          }
          case "action":
            return callsOf(p)[0]?.key ?? "zzz";
          default:
            return "";
        }
      };
      sorted.sort((a, b) => dir * val(a).localeCompare(val(b)));
    } else {
      // The engine's own order: late → open call → quiet → done.
      sorted.sort((a, b) => {
        const ra = rank(a);
        const rb = rank(b);
        if (ra !== rb) return ra - rb;
        const ea = a.eta_date ?? "9999-12-31";
        const eb = b.eta_date ?? "9999-12-31";
        if (ea !== eb) return ea.localeCompare(eb);
        return (b.placed_at ?? "").localeCompare(a.placed_at ?? "");
      });
    }
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searched, stateSel, colFilters, sort, callsByPo, supplierById]);

  const stateCounts = useMemo(() => {
    const m = new Map<WorkState, number>();
    for (const s of WORK_STATES) m.set(s, 0);
    for (const p of searched) {
      if (!passesAllCols(p)) continue;
      const st = workStateOf(p, today);
      m.set(st, (m.get(st) ?? 0) + 1);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searched, colFilters, callsByPo]);

  // ── Selection: ?po= is the one source; first row auto-selects. ──────────

  const selectedId = params.get("po");
  const selected = useMemo(
    () => pos.find((p) => p.id === selectedId) ?? null,
    [pos, selectedId],
  );
  // The Item ID column's real data — the per-unit goods ids minted at Issue
  // (0153). Grouped by sku; WorkspaceBody deals them out line by line.
  const unitsQ = useOperationPoUnits(selected?.id ?? null);
  const unitCodesBySku = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const u of unitsQ.data?.units ?? []) {
      const arr = m.get(u.sku) ?? [];
      arr.push(u.unit_code);
      m.set(u.sku, arr);
    }
    return m;
  }, [unitsQ.data]);
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

  const openPo = (id: string) =>
    setParams((prev) => {
      const n = new URLSearchParams(prev);
      n.set("po", id);
      return n;
    });

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
    searchable = false,
  ): ColumnFilter => ({
    options,
    selected: colFilters.get(key) ?? new Set(),
    onChange: setColFilter(key),
    label: `Filter ${key}`,
    clearLabel: "Clear",
    ...(searchable ? { searchPlaceholder: "Search" } : {}),
  });

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
    const opts: { value: string; label: string }[] = [
      { value: F_TODAY, label: "Today" },
      { value: F_YESTERDAY, label: "Yesterday" },
      { value: F_THIS_WEEK, label: "This Week" },
      { value: F_LAST_WEEK, label: "Last Week" },
      { value: F_THIS_MONTH, label: "This Month" },
      { value: F_LAST_MONTH, label: "Last Month" },
    ];
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

  const actionOptions = useMemo(() => {
    const base = searched.filter((p) => passesAllCols(p, "action"));
    const keys = new Set<string>();
    let none = false;
    for (const p of base) {
      const top = callsOf(p)[0];
      if (top) keys.add(top.key);
      else none = true;
    }
    const opts = [...keys].sort().map((k) => ({
      value: k,
      label: purchasingActionQueue(k as PurchasingOpenCall["key"]),
    }));
    if (none) opts.push({ value: F_NONE, label: "—" });
    return opts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searched, colFilters, callsByPo]);

  // ── The listing — fixed px interiors, one auto tail (the frozen recipe) ──

  const columns: readonly Column<operationPoListRow>[] = [
    {
      key: "issued",
      label: "Issued Date",
      width: "88px",
      sortable: true,
      filter: filterFor("issued", issuedOptions),
      cell: (p) => (
        <span className="tabular-nums">
          {fmtDateShort((p.placed_at ?? "").slice(0, 10))}
        </span>
      ),
    },
    {
      key: "custdel",
      label: "Customer Delivery",
      width: "96px",
      sortable: true,
      filter: filterFor("custdel", custdelOptions),
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
      key: "po",
      label: "PO No.",
      width: "104px",
      sortable: true,
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
                  late ? "bg-kit-red-9" : "bg-kit-amber-9",
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
      key: "supplier",
      label: "Supplier",
      width: "104px",
      sortable: true,
      filter: filterFor("supplier", supplierOptions, true),
      cell: (p) => supplierNameOf(p.supplier_id),
    },
    {
      key: "items",
      label: "Items",
      width: "150px",
      sortable: true,
      cell: (p) => (
        <span className="block truncate" title={itemsTitleOf(p)}>
          {itemsPreviewOf(p)}
        </span>
      ),
    },
    {
      key: "arriving",
      label: "Goods Arriving At",
      width: "96px",
      sortable: true,
      filter: filterFor("arriving", arrivingOptions),
      cell: (p) => {
        const eta = etaOf(p);
        if (!eta.date) return <span className="text-kit-slate-9">—</span>;
        const late = callsOf(p).some((c) => c.late);
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
          </span>
        );
      },
    },
    {
      key: "received",
      label: "Received",
      width: "72px",
      align: "right",
      numeric: true,
      sortable: true,
      cell: (p) => {
        const pr = poReceivingProgress(p.purchase_order_lines);
        return `${pr.received} / ${pr.ordered}`;
      },
    },
    {
      key: "action",
      label: "Current Action",
      width: "auto",
      sortable: true,
      filter: filterFor("action", actionOptions),
      cell: (p) => {
        const top = callsOf(p)[0];
        if (!top) return <span className="text-kit-slate-9">—</span>;
        return (
          <span className={top.late ? "text-kit-red-11" : "text-kit-slate-12"}>
            {purchasingActionQueue(top.key)}
          </span>
        );
      },
    },
  ];

  /** Gmail's reading-pane recipe (Jess, 2026-08-02): while the document pane
   *  is open the listing keeps the IDENTIFY columns, every one at full size;
   *  collapse the pane and the full register returns. Two honesty guards:
   *  Customer Delivery stays in the compact set (it is WHY a PO is chased),
   *  and a column carrying an ACTIVE filter or sort can never be hidden — a
   *  filter you cannot see is a lie the table tells (P2's own law). */
  const COMPACT_KEYS = new Set([
    "custdel",
    "po",
    "supplier",
    "items",
    "arriving",
    "received",
  ]);
  const visibleColumns = workspaceOpen
    ? columns.filter(
        (c) =>
          COMPACT_KEYS.has(c.key) ||
          (colFilters.get(c.key)?.size ?? 0) > 0 ||
          sort?.key === c.key,
      )
    : columns;

  const filtered = colFilters.size > 0 || stateSel !== null;
  const clearAll = () => {
    setColFilters(new Map());
    setStateSel(null);
  };

  return (
    <div
      className="h-full min-h-0 flex flex-col bg-kit-slate-3"
      data-testid="purchase-orders-workspace"
    >
      {/* The top strip — To Order's own shape: breadcrumb + shared icons. */}
      <div
        className="shrink-0 flex items-center justify-between gap-3 px-6 pt-3 pb-1"
        data-testid="po-header-strip"
      >
        <div className="min-w-0 flex items-center gap-1.5 text-meta text-kit-slate-11">
          <span>Purchasing</span>
          <Icon name="forward" size={14} />
          <span className="text-kit-slate-12">Purchase Orders</span>
        </div>
        <TopBarIcons />
      </div>

      <PurchasingTabs />

      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* ── NAVIGATION · 200px — the Register's business filter (Jess:
             "Business filters live in the left navigation; column-specific
             filters remain native Excel filters."). One group: SUPPLIER
             PROGRESS — what to do with the supplier, never a data status. ── */}
        {!navOpen && (
          <div className="shrink-0 border-r border-kit-slate-5 bg-white flex flex-col items-center pt-3 px-1">
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              title="Show filters"
              aria-label="Show filters"
              data-testid="po-rail-expand"
              className={PANE_BTN}
            >
              <Icon name="forward" size={14} />
            </button>
          </div>
        )}
        <nav
          className={[
            "w-[200px] shrink-0 min-h-0 overflow-y-auto border-r border-kit-slate-5 px-3 py-3 flex-col gap-4 bg-white",
            navOpen ? "flex" : "hidden",
          ].join(" ")}
          aria-label="Purchase order register"
          data-testid="po-rail"
        >
          <div>
            <div className="flex items-center px-1.5">
              <span className="text-label font-semibold uppercase tracking-wide text-kit-slate-9">
                Supplier Progress
              </span>
              <button
                type="button"
                onClick={() => setNavOpen(false)}
                title="Hide filters"
                aria-label="Hide filters"
                data-testid="po-rail-collapse"
                className={`ml-auto ${PANE_BTN} !p-1`}
              >
                <Icon name="back" size={14} />
              </button>
            </div>
            <div className="mt-1 flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => setStateSel(null)}
                aria-pressed={stateSel === null}
                data-testid="po-rail-state-all"
                className={[
                  "relative flex items-center gap-2 px-2 py-1.5 rounded-control text-left text-body w-full",
                  stateSel === null
                    ? "bg-kit-blue-3 text-kit-slate-12 font-semibold"
                    : "text-kit-slate-11 hover:bg-kit-blue-3",
                ].join(" ")}
              >
                {stateSel === null && (
                  <span
                    aria-hidden
                    className="absolute left-0 top-1 bottom-1 w-0.5 bg-kit-blue-9"
                  />
                )}
                <span className="flex-1 truncate">All</span>
              </button>
              {WORK_STATES.map((st) => {
                const n = stateCounts.get(st) ?? 0;
                const on = stateSel === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStateSel(on ? null : st)}
                    aria-pressed={on}
                    data-testid={`po-rail-state-${st}`}
                    className={[
                      "relative flex items-center gap-2 px-2 py-1.5 rounded-control text-left text-body w-full",
                      on
                        ? "bg-kit-blue-3 text-kit-slate-12 font-semibold"
                        : "text-kit-slate-11 hover:bg-kit-blue-3",
                    ].join(" ")}
                  >
                    {on && (
                      <span
                        aria-hidden
                        className="absolute left-0 top-1 bottom-1 w-0.5 bg-kit-blue-9"
                      />
                    )}
                    <span className="flex-1 truncate">{WORK_STATE_LABEL[st]}</span>
                    <span className="tabular-nums text-label text-kit-slate-9">
                      {n}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </nav>

        {/* ── LISTING — the AutoCount work listing (kit DataTable) ──────── */}
        {!listingOpen && (
          <div className="shrink-0 border-r border-kit-slate-5 bg-white flex flex-col items-center pt-3 px-1">
            <button
              type="button"
              onClick={() => setListingOpen(true)}
              title="Show listing"
              aria-label="Show listing"
              data-testid="po-listing-expand"
              className={PANE_BTN}
            >
              <Icon name="forward" size={14} />
            </button>
          </div>
        )}
        <div
          className={[
            "flex-1 min-w-0 min-h-0 flex-col border-r border-kit-slate-5 bg-white",
            listingOpen ? "flex" : "hidden",
          ].join(" ")}
          data-testid="po-listing"
        >
          <div className="shrink-0 px-3 pt-3 pb-2 flex items-center gap-2">
            <div className="flex-1 max-w-[420px]">
              <SearchInput
                id="po-search"
                placeholder="Search"
                pill
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={() => setListingOpen(false)}
              title="Hide listing"
              aria-label="Hide listing"
              data-testid="po-listing-collapse"
              className={`ml-auto ${PANE_BTN}`}
            >
              <Icon name="back" size={14} />
            </button>
          </div>
          {/* Excel's own answer to eight columns in half a screen: the
              LISTING region scrolls horizontally (the page never does).
              min-width = the frozen column set at full size. */}
          <div className="flex-1 min-h-0 overflow-auto">
            <div className={workspaceOpen ? "" : "min-w-[880px]"}>
              <DataTable<operationPoListRow>
              rows={rows}
              columns={visibleColumns}
              rowId={(p) => p.id}
              onRowOpen={(p) => openPo(p.id)}
              sort={sort}
              onSortChange={setSort}
              loading={posQ.isLoading}
              label="Purchase orders"
              empty={
                <EmptyState
                  title="No purchase orders."
                  detail="Issue one from To Order."
                />
              }
              />
            </div>
          </div>
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

        {/* ── WORKSPACE — ONE live Purchase Order. Collapsible; when the
             listing is hidden it takes the whole stage. ─────────────────── */}
        {!workspaceOpen && (
          <div className="shrink-0 bg-white flex flex-col items-center pt-3 px-1 border-l border-kit-slate-5">
            <button
              type="button"
              onClick={() => setWorkspaceOpen(true)}
              title="Show purchase order"
              aria-label="Show purchase order"
              data-testid="po-workspace-expand"
              className={PANE_BTN}
            >
              <Icon name="back" size={14} />
            </button>
          </div>
        )}
        <main
          className={[
            "shrink-0 min-h-0 overflow-y-auto bg-white",
            workspaceOpen ? (listingOpen ? "w-[400px]" : "flex-1 min-w-0") : "hidden",
          ].join(" ")}
          data-testid="po-workspace"
        >
          {selected ? (
            <WorkspaceBody
              po={selected}
              supplier={supplierById.get(selected.supplier_id)}
              warehouse={warehouseById.get(selected.warehouse_id)}
              calls={callsOf(selected)}
              sizeOf={(raw) => skuBySku.get(raw)?.variant ?? null}
              unitCodesBySku={unitCodesBySku}
              eta={etaOf(selected)}
              onCollapse={() => setWorkspaceOpen(false)}
            />
          ) : (
            !posQ.isLoading &&
            pos.length === 0 && (
              <div className="h-full flex items-center justify-center">
                <EmptyState title="No purchase orders." />
              </div>
            )
          )}
        </main>
      </div>
    </div>
  );
}

/* ── The live Purchase Order — reads as a PO, ends in the desk ─────────── */

function WorkspaceBody({
  po,
  supplier,
  warehouse,
  calls,
  sizeOf,
  unitCodesBySku,
  eta,
  onCollapse,
}: {
  po: operationPoListRow;
  supplier: SupplierRow | undefined;
  warehouse: { name: string; address: string | null } | undefined;
  calls: PurchasingOpenCall[];
  sizeOf: (sku: string) => string | null;
  unitCodesBySku: Map<string, string[]>;
  eta: { date: string | null; confirmed: boolean };
  onCollapse: () => void;
}) {
  const supplierName = supplier?.name ?? po.supplier_id;
  const progress = poReceivingProgress(po.purchase_order_lines);
  const state = workStateOf(po, todayMYT());
  const unitCodesByLine = useMemo(() => {
    const cursor = new Map<string, number>();
    const out = new Map<string, string[]>();
    for (const l of po.purchase_order_lines) {
      const all = unitCodesBySku.get(l.sku) ?? [];
      const from = cursor.get(l.sku) ?? 0;
      out.set(l.id, all.slice(from, from + l.qty));
      cursor.set(l.sku, from + l.qty);
    }
    return out;
  }, [po, unitCodesBySku]);
  const sos = soRefsOf(po);

  return (
    <div className="px-4 py-4" data-testid="po-document">
      <button
        type="button"
        onClick={onCollapse}
        title="Hide purchase order"
        aria-label="Hide purchase order"
        data-testid="po-workspace-collapse"
        className={`mb-2 ${PANE_BTN}`}
      >
        <Icon name="forward" size={14} />
      </button>
      {/* ── The document — PO-PDF-STANDARD's own shape, live data. §3: the
           logo is the wordmark IMAGE, never typeset. The label-gutter pair
           carries the two dates; the PO number is the only hero. ───────── */}
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <img src="/carres-wordmark.webp" alt="Carres" className="h-6 w-auto" />
          <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 items-baseline">
            <span className="text-label uppercase tracking-widest text-kit-slate-9">
              Supplier Delivery By
            </span>
            <span
              className={[
                "text-label font-semibold uppercase tracking-wide",
                eta.confirmed ? "text-kit-slate-12" : "text-kit-slate-9",
              ].join(" ")}
              data-testid="po-doc-delivery-by"
            >
              {eta.date ? fmtDate(eta.date).toUpperCase() : "—"}
            </span>
            <span className="text-label uppercase tracking-widest text-kit-slate-9">
              PO Issued Date
            </span>
            <span className="text-label font-semibold uppercase tracking-wide text-kit-slate-12">
              {fmtDate(po.placed_at).toUpperCase()}
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-label uppercase tracking-widest text-kit-slate-9">
            Purchase Order
          </div>
          <div className="text-page font-semibold font-mono text-kit-slate-12">
            {po.id}
          </div>
        </div>
      </div>
      <div className="mt-2 border-b border-kit-slate-6" />

      {/* The summary strip — what the operator asks first (Jess: Status ·
          Goods Arriving At · Received), then the paper continues below. */}
      <div className="mt-2 pb-2 border-b border-kit-slate-5 grid grid-cols-3 gap-x-4">
        <Fact label="Status" value={WORK_STATE_LABEL[state]} />
        <Fact
          label="Goods Arriving At"
          value={eta.date ? fmtDateShort(eta.date) : "—"}
        />
        <Fact
          label="Received"
          value={`${progress.received} / ${progress.ordered}`}
        />
      </div>

      {/* §4 · §5 — frameless Supplier / Deliver To cards. */}
      <div className="mt-3 grid grid-cols-2 gap-x-4">
        <div>
          <div className="text-label uppercase tracking-widest text-kit-slate-9">
            Supplier
          </div>
          <div className="mt-1 text-body font-semibold text-kit-slate-12">
            {supplierName}
          </div>
          {supplier?.contact && (
            <div className="text-body text-kit-slate-11">{supplier.contact}</div>
          )}
        </div>
        <div>
          <div className="text-label uppercase tracking-widest text-kit-slate-9">
            Deliver To
          </div>
          <div className="mt-1 text-body font-semibold text-kit-slate-12">
            {warehouse?.name ?? "—"}
          </div>
          {warehouse?.address && (
            <div className="text-body text-kit-slate-11">{warehouse.address}</div>
          )}
        </div>
      </div>

      {/* §6 — the item table: # · Sales Order · Item ID · Description · Qty.
           Zero grid lines. Item ID is NOT the SKU — it is the per-unit goods
           id minted at Issue (0153/0154); the ids are not on this wire yet,
           so the reserved column states the absence rather than faking it. */}
      <div className="mt-4" data-testid="po-doc-items">
        <div className="flex gap-2 text-label uppercase tracking-wide text-kit-slate-9 border-y border-kit-slate-5 py-1">
          <span className="w-4 font-medium">#</span>
          <span className="w-16 font-medium">Sales Order</span>
          <span className="w-14 font-medium">Item ID</span>
          <span className="flex-1 font-medium">Description</span>
          <span className="w-10 text-right font-medium">Qty</span>
        </div>
        {po.purchase_order_lines.map((l, i) => {
          const sku = l.sku;
          return (
            <div
              key={l.id}
              className="flex gap-2 py-1.5 text-body border-b border-kit-slate-4"
            >
              <span className="w-4 text-kit-slate-9 tabular-nums">{i + 1}</span>
              <span className="w-16 text-kit-slate-12 tabular-nums">
                {i === 0 && sos.length > 0
                  ? sos.map((n) => (
                      <span key={n} className="block">{`SO-${n}`}</span>
                    ))
                  : "—"}
              </span>
              <span className="w-14 min-w-0">
                {(unitCodesByLine.get(l.id) ?? []).length > 0 ? (
                  (unitCodesByLine.get(l.id) ?? []).map((code) => (
                    <span
                      key={code}
                      className="block font-mono text-label text-kit-slate-11 truncate"
                      title={code}
                    >
                      {code}
                    </span>
                  ))
                ) : (
                  <span className="text-kit-slate-9">—</span>
                )}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold font-mono text-kit-slate-12 truncate">
                  {sku}
                </span>
                {sizeOf(sku) && (
                  <span className="block text-label text-kit-slate-9">
                    {sizeOf(sku)}
                  </span>
                )}
              </span>
              <span className="w-10 text-right font-semibold text-kit-slate-12 tabular-nums">
                {l.qty}
              </span>
            </div>
          );
        })}
      </div>

      {/* Receiving — summary only; the work lives behind the door. */}
      <div className="mt-3 pt-3 border-t border-kit-slate-5 grid grid-cols-2 gap-x-4 gap-y-2">
        <Fact
          label="Received"
          value={`${progress.received} / ${progress.ordered}`}
        />
      </div>
      <div className="mt-2 flex items-center gap-3">
        {progress.issueQty > 0 && (
          <span className="text-body text-kit-red-11">
            {progress.issueQty} with a problem
          </span>
        )}
        <Link
          to="/operation?tab=receiving"
          className="text-body font-medium text-kit-blue-11 hover:underline"
          data-testid="po-open-receiving"
        >
          Open Receiving
        </Link>
      </div>

      {/* The engine's open calls on THIS document. */}
      {calls.length > 0 && (
        <ul
          className="mt-3 pt-3 border-t border-kit-slate-5 flex flex-col gap-1.5"
          data-testid="po-open-calls"
        >
          {calls.map((c) => (
            <li
              key={c.poLineId ?? c.key}
              className="flex items-baseline gap-2 text-body"
            >
              <span
                aria-hidden
                className={[
                  "w-1.5 h-1.5 rounded-full shrink-0 self-center",
                  c.late ? "bg-kit-red-9" : "bg-kit-amber-9",
                ].join(" ")}
              />
              <span className="text-kit-slate-12 min-w-0">
                {purchasingActionQueue(c.key)}
                {c.sku ? <span className="text-kit-slate-9"> · {c.sku}</span> : null}
              </span>
              {c.dueIso && (
                <span className="ml-auto text-label text-kit-slate-9 shrink-0">
                  due {fmtDateShort(c.dueIso)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* ── Communication — the supplier desk, the bottom of the document. */}
      <CommunicationDesk po={po} supplier={supplier} />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-label text-kit-slate-9">{label}</div>
      <div className="text-body text-kit-slate-12">{value}</div>
    </div>
  );
}

function CommunicationDesk({
  po,
  supplier,
}: {
  po: operationPoListRow;
  supplier: SupplierRow | undefined;
}) {
  const [copied, setCopied] = useState(false);

  const message = useMemo(() => {
    const items = po.purchase_order_lines
      .map((l) => `${l.sku} ×${l.qty}`)
      .join("\n");
    const arriving = po.eta_date
      ? `Goods Arriving At: ${fmtDate(po.eta_date)}`
      : "Please confirm the arrival date.";
    return `Hi ${supplier?.name ?? "supplier"},\n\n${po.id}\n${items}\n\n${arriving}\n\n— Carres`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [po, supplier]);

  const waUrl = useMemo(() => {
    if (supplier?.whatsapp_group_url) return supplier.whatsapp_group_url;
    const digits = (supplier?.contact ?? "").replace(/\D/g, "");
    return digits ? `https://wa.me/${digits}` : null;
  }, [supplier]);

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard refused — the text stays selectable below.
    }
  }

  return (
    <section
      className="mt-4 pt-3 border-t border-kit-slate-5"
      data-testid="po-communication"
    >
      <div className="flex items-center gap-2">
        <h3 className="text-label font-semibold uppercase tracking-wide text-kit-slate-9">
          Communication
        </h3>
        {copied && (
          <span
            className="text-label font-medium text-kit-green-11"
            data-testid="po-copied"
          >
            Copied
          </span>
        )}
      </div>

      <div className="mt-2 text-label text-kit-slate-9">WhatsApp message</div>
      <pre
        className="mt-1 whitespace-pre-wrap rounded-card bg-kit-slate-3 px-3 py-2 text-body font-body text-kit-slate-12"
        data-testid="po-wa-message"
      >
        {message}
      </pre>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void copyMessage()}
          data-testid="po-copy-message"
          className={DOC_BTN}
        >
          Copy
        </button>
        {waUrl && (
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="po-open-whatsapp"
            className={`${DOC_BTN} font-medium`}
          >
            Open WhatsApp
          </a>
        )}
      </div>
    </section>
  );
}
