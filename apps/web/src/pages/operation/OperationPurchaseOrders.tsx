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
import Badge from "@/components/kit/Badge";
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
import {
  useCatalog,
  useOperationPos,
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
 *   LISTING (kit DataTable — the AutoCount register; Jess's Purchasing law,
 *     2026-08-02: the listing is for FINDING — sort, filter, search; the
 *     work happens in the workspace). Eight frozen columns, her order:
 *     PO Issued · Supplier · PO No. · Items · Customer Delivery ·
 *     Goods Arriving At · Received · Current Action. Default order =
 *     PO Issued OLDEST first (the buyer chases the longest-waiting PO,
 *     never the biggest number). Every column sorts by header click and
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

// The Excel date ▼ machinery lives in ONE lib (`excel-date-filter.ts`) so
// every date column — here and, after Jess's live review, portal-wide —
// speaks the same presets and the same Custom Date Range.

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
      case "received": {
        const pr = poReceivingProgress(po.purchase_order_lines);
        return sel.has(`${pr.received} / ${pr.ordered}`);
      }
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
      // The Register's default order (Jess's Purchasing law, 2026-08-02):
      // PO Issued, OLDEST first — the buyer's day starts at the PO that has
      // been waiting the longest, never at the biggest number. Business
      // priority, not document numbering; PO No. ▼ still sorts by number
      // when someone asks. Clearing a header sort returns here.
      sorted.sort((a, b) => {
        const pa = (a.placed_at ?? "").localeCompare(b.placed_at ?? "");
        if (pa !== 0) return pa;
        return a.id.localeCompare(b.id);
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
  const receivedOptions = useMemo(() => {
    const vals = new Set<string>();
    for (const p of searched.filter((r) => passesAllCols(r, "received"))) {
      const pr = poReceivingProgress(p.purchase_order_lines);
      vals.add(`${pr.received} / ${pr.ordered}`);
    }
    return [...vals].sort().map((v) => ({ value: v, label: v }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searched, colFilters]);

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

  // The eight columns, in Jess's frozen order (2026-08-02):
  //   PO Issued · Supplier · PO No. · Items · Customer Delivery ·
  //   Goods Arriving At · Received · Current Action
  const columns: readonly Column<operationPoListRow>[] = [
    {
      key: "issued",
      // `PO Issued`, never `Created` (Jess, 2026-08-02): the official date
      // the supplier receives the PO — it starts the lead time, it is the
      // date on the PDF, and operators say "the PO we issued last week",
      // never "the record we created". A system Created date, if ever
      // wanted, belongs in the workspace's details block, not here.
      label: "PO Issued",
      width: "88px",
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
      width: "104px",
      sortable: true,
      filter: filterFor("supplier", supplierOptions, { searchable: true }),
      cell: (p) => supplierNameOf(p.supplier_id),
    },
    {
      key: "po",
      label: "PO No.",
      width: "104px",
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
      key: "items",
      label: "Items",
      width: "150px",
      sortable: true,
      filter: filterFor("items", itemsOptions, { searchable: true }),
      cell: (p) => (
        <span className="block truncate" title={itemsTitleOf(p)}>
          {itemsPreviewOf(p)}
        </span>
      ),
    },
    {
      key: "custdel",
      label: "Customer Delivery",
      // A merged PO carries several customers' dates; until P5's allocation
      // splits them, this column is the EARLIEST — and says so (Jess,
      // 2026-08-02: never let staff read it as the whole PO's only date).
      headerTitle:
        "Earliest customer delivery across this PO's sales orders — a merged PO carries more than one",
      width: "96px",
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
      label: "Goods Arriving At",
      width: "96px",
      sortable: true,
      filter: filterFor("arriving", arrivingOptions, { range: true }),
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
            {p.eta_revised && (
              /* 2990s' own marker: the date shown is not the first date the
                 supplier named — the history lives in the promise ledger. */
              <span className="text-kit-slate-9"> (revised)</span>
            )}
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
      filter: filterFor("received", receivedOptions),
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

  /** Gmail's reading-pane recipe, compact set re-ruled with the 8 columns
   *  (Jess, 2026-08-02): PO Issued (when) · Supplier (with whom) · PO No.
   *  (which document) · Items (which goods) · Current Action (what now).
   *  Customer Delivery / Goods Arriving At / Received read off the open Live
   *  PO beside them. HONESTY GUARD unchanged: a column carrying an ACTIVE
   *  filter or sort can never be hidden — a filter you cannot see is a lie
   *  the table tells (P2's own law). */
  const COMPACT_KEYS = new Set(["issued", "supplier", "po", "items", "action"]);
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
      /* SURFACE LAW (Jess, 2026-08-02): the kit-canvas token — grey is
       * chrome, every working surface below is white. Runs here first,
       * flows back portal-wide after her live review. */
      className="h-full min-h-0 flex flex-col bg-kit-canvas"
      data-testid="purchase-orders-workspace"
    >
      {/* The top strip — To Order's own shape: breadcrumb + shared icons.
          The kit-strip token, one whisper above the canvas — Linear's header
          recipe: so close to the page that the data always wins the eye. */}
      <div
        className="shrink-0 flex items-center justify-between gap-3 px-6 pt-3 pb-1 bg-kit-strip"
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
              rowMuted={(p) => p.status === "cancelled"}
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

/* ── The Supplier Workspace for ONE Purchase Order (Jess, 2026-08-02 v2).
 *
 * Frozen architecture — the same language every Document Workspace (PO,
 * GRN, Claim) will speak:
 *
 *   WORKING HEADER          identity + work state + the three facts
 *   REFERENCE LAYER         no section title — the whole panel IS the PO.
 *                           Answers "what is this PO?", nothing more:
 *                           Supplier · Deliver To (names only) + the items
 *                           (Sales Order · Description · Qty). No phone, no
 *                           address (Open WhatsApp is the phone), no Item ID
 *                           (that answers what the WAREHOUSE receives —
 *                           Receiving's workspace owns it).
 *   SUPPLIER FOLLOW-UP      work — the field + ITS OWN history beside it
 *                           (never down in Activity) + the engine's Open
 *                           Actions. The edit door is Phase 4.
 *   RECEIVING SUMMARY       read only — Receiving owns Receiving.
 *   ACTIVITY                communication tools + the BUSINESS timeline
 *                           (read-time merge of the real stores; never a
 *                           master activity table, never field changes).
 *
 * The paper look (logo · "PURCHASE ORDER" letterhead) belongs to the
 * PRINTED 0307 document, never to this working panel. */

function WorkspaceBody({
  po,
  supplier,
  warehouse,
  calls,
  sizeOf,
  eta,
  onCollapse,
}: {
  po: operationPoListRow;
  supplier: SupplierRow | undefined;
  warehouse: { name: string; address: string | null } | undefined;
  calls: PurchasingOpenCall[];
  sizeOf: (sku: string) => string | null;
  eta: { date: string | null; confirmed: boolean };
  onCollapse: () => void;
}) {
  const supplierName = supplier?.name ?? po.supplier_id;
  const progress = poReceivingProgress(po.purchase_order_lines);
  const state = workStateOf(po, todayMYT());
  const late = calls.some((c) => c.late);
  const sos = soRefsOf(po);

  return (
    <div className="px-4 py-4" data-testid="po-document">
      {/* ── WORKING HEADER — dense, zero ceremony: who + state + facts. ── */}
      <div className="flex items-center gap-2" data-testid="po-working-header">
        <button
          type="button"
          onClick={onCollapse}
          title="Hide purchase order"
          aria-label="Hide purchase order"
          data-testid="po-workspace-collapse"
          className={PANE_BTN}
        >
          <Icon name="forward" size={14} />
        </button>
        <span className="text-page font-semibold font-mono text-kit-slate-12">
          {po.id}
        </span>
        <span className="ml-auto" data-testid="po-work-state">
          <Badge>{WORK_STATE_LABEL[state]}</Badge>
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-body">
        <span className="text-kit-slate-9">PO Issued</span>
        <span className="text-kit-slate-12 tabular-nums">
          {fmtDateShort((po.placed_at ?? "").slice(0, 10))}
        </span>
        <span aria-hidden className="text-kit-slate-9">
          ·
        </span>
        <span className="text-kit-slate-9">Goods Arriving At</span>
        {eta.date ? (
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
        ) : (
          <span className="text-kit-slate-9">—</span>
        )}
        <span aria-hidden className="text-kit-slate-9">
          ·
        </span>
        <span className="text-kit-slate-9">Received</span>
        <span className="text-kit-slate-12 tabular-nums">
          {progress.received} / {progress.ordered}
        </span>
      </div>

      {/* ── REFERENCE LAYER — no section title: the whole panel IS the PO.
           "What is this PO?" — identity + items, and nothing else. ────── */}
      <div className="mt-3 pt-3 border-t border-kit-slate-6 grid grid-cols-2 gap-x-4">
        <div>
          <div className="text-label uppercase tracking-widest text-kit-slate-9">
            Supplier
          </div>
          <div className="mt-1 text-body font-semibold text-kit-slate-12">
            {supplierName}
          </div>
        </div>
        <div>
          <div className="text-label uppercase tracking-widest text-kit-slate-9">
            Deliver To
          </div>
          <div className="mt-1 text-body font-semibold text-kit-slate-12">
            {warehouse?.name ?? "—"}
          </div>
        </div>
      </div>

      <div className="mt-3" data-testid="po-doc-items">
        <div className="flex gap-2 text-label uppercase tracking-wide text-kit-slate-9 border-y border-kit-slate-5 py-1">
          <span className="w-16 font-medium">Sales Order</span>
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
              <span className="w-16 text-kit-slate-12 tabular-nums">
                {i === 0 && sos.length > 0
                  ? sos.map((n) => (
                      <span key={n} className="block">{`SO-${n}`}</span>
                    ))
                  : "—"}
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

      {/* ── SUPPLIER FOLLOW-UP — what to do with the supplier, and the
           field's OWN history beside the field (never down in Activity).
           Read-only today; the edit door is Phase 4's promise-ledger
           write. */}
      <section
        className="mt-4 pt-3 border-t border-kit-slate-5"
        data-testid="po-followup"
      >
        <h3 className="text-label font-semibold uppercase tracking-wide text-kit-slate-9">
          Supplier Follow-up
        </h3>
        <div className="mt-2 flex items-baseline gap-2 text-body">
          <span className="text-kit-slate-9">Goods Arriving At</span>
          {eta.date ? (
            <span
              className={[
                "tabular-nums",
                late
                  ? "text-kit-red-11"
                  : eta.confirmed
                    ? "text-kit-slate-12"
                    : "text-kit-slate-9",
              ].join(" ")}
            >
              {fmtDateShort(eta.date)}
              <span className="text-kit-slate-9">
                {" "}
                · {eta.confirmed ? "supplier confirmed" : "expected, not confirmed"}
              </span>
            </span>
          ) : (
            <span className="text-kit-slate-9">— supplier has not confirmed</span>
          )}
        </div>
        {/* This field's history mounts HERE when the promise ledger has
            entries to show — today's wire carries only the latest answer's
            about-date; the Phase-4 ledger read fills the list. */}
        {calls.length > 0 && (
          <div className="mt-2">
            <div className="text-label text-kit-slate-9">Open Actions</div>
            <ul
              className="mt-1 flex flex-col gap-1.5"
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
                    {c.sku ? (
                      <span className="text-kit-slate-9"> · {c.sku}</span>
                    ) : null}
                  </span>
                  {c.dueIso && (
                    <span className="ml-auto text-label text-kit-slate-9 shrink-0">
                      due {fmtDateShort(c.dueIso)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ── RECEIVING SUMMARY — read only. Receiving owns Receiving. ──── */}
      <section
        className="mt-4 pt-3 border-t border-kit-slate-5"
        data-testid="po-receiving-summary"
      >
        <h3 className="text-label font-semibold uppercase tracking-wide text-kit-slate-9">
          Receiving Summary
        </h3>
        <div className="mt-2 flex items-baseline gap-2 text-body">
          <span className="text-kit-slate-9">Received</span>
          <span className="text-kit-slate-12 tabular-nums">
            {progress.received} / {progress.ordered}
          </span>
          <span aria-hidden className="text-kit-slate-9">
            ·
          </span>
          <span className="text-kit-slate-9">Remaining</span>
          <span className="text-kit-slate-12 tabular-nums">
            {progress.ordered - progress.received}
          </span>
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
      </section>

      {/* ── ACTIVITY — communication tools + the business timeline. ───── */}
      <ActivityDesk po={po} supplier={supplier} />
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
function ActivityDesk({
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
      data-testid="po-activity"
    >
      <div className="flex items-center gap-2">
        <h3 className="text-label font-semibold uppercase tracking-wide text-kit-slate-9">
          Activity
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

      <div className="mt-3 pt-2 border-t border-kit-slate-4">
        <div className="text-label text-kit-slate-9">History</div>
        <ul className="mt-1 flex flex-col gap-1 text-body" data-testid="po-history">
          <li className="flex items-baseline gap-2">
            <span className="text-kit-slate-9 tabular-nums shrink-0">
              {fmtDateShort((po.placed_at ?? "").slice(0, 10))}
            </span>
            <span className="text-kit-slate-12">PO issued</span>
          </li>
        </ul>
      </div>
    </section>
  );
}
