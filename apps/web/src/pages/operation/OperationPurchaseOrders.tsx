import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  addWorkingDays,
  myHolidaySet,
  PO_DELAY_REASONS,
  PO_STATE_ACTION_SHORT,
  PO_WORK_STATES,
  PO_WORK_STATE_LABEL,
  poCurrentActionOf,
  poOverdueDays,
  poReceivingProgress,
  poWorkStateOf,
  purchasingActionQueue,
  purchasingSupplierCallsOf,
  railItemLabel,
  type PoCurrentAction,
  type PoWorkState,
  type ProductSkuDto,
  type PurchasingOpenCall,
  type SupplierCallPo,
} from "@carres/shared";
import PurchasingTabs from "./PurchasingTabs";
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
  useRecordSupplierDate,
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

// The work-state vocabulary + the ONE Current Action source live in
// packages/shared (`po-workspace.ts`) — Law 7: a page-local word table would
// be a second action engine, and the header could disagree with the column.
type WorkState = PoWorkState;
const WORK_STATE_LABEL = PO_WORK_STATE_LABEL;
const WORK_STATES = PO_WORK_STATES;

function workStateOf(po: operationPoListRow, today: string): WorkState {
  return poWorkStateOf(
    {
      status: po.status,
      etaDateIso: po.eta_date,
      lines: po.purchase_order_lines.map((l) => ({
        id: l.id,
        sku: l.sku,
        qty: l.qty,
        receivedQty: l.received_qty,
        shortSinceIso: l.short_since ?? null,
        balanceAnswerAboutQty: l.balance_answer_about_qty ?? null,
      })),
    },
    today,
  );
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
  // ONE pane toggle survives (Jess, 2026-08-02 late — overrides her earlier
  // "all three panes hide"): the workspace open/close, which drives Gmail's
  // reading-pane compact mode. Its control lives in the SHELL's page-meta
  // slot, not in a pane corner — no master grows arrows on panels.
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

  // ── The ONE Current Action per PO (shared `poCurrentActionOf`, Law 7):
  //    engine call first, state word only when the engine is quiet. The
  //    header's hero and this column read the SAME map — they cannot drift.
  const actionByPo = useMemo(() => {
    const m = new Map<string, PoCurrentAction | null>();
    for (const po of pos) {
      m.set(po.id, poCurrentActionOf(callPoOf(po), { todayIso: today }));
    }
    return m;
  }, [pos, today]);
  const actionOf = (po: operationPoListRow) => actionByPo.get(po.id) ?? null;
  const actionKeyOf = (a: PoCurrentAction | null): string =>
    a == null ? F_NONE : a.kind === "call" ? a.call.key : a.key;
  // The register's short spelling (Jess: 19 identical seven-word rows are
  // wallpaper) — the workspace hero keeps the full wording.
  const actionListWordOf = (a: PoCurrentAction): string =>
    a.kind === "call"
      ? purchasingActionQueue(a.call.key)
      : PO_STATE_ACTION_SHORT[a.key];

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
        const a = actionOf(p);
        if (!a) return <span className="text-kit-slate-9">—</span>;
        const late = a.kind === "call" && a.call.late;
        const quiet = a.kind === "state" && a.key === "waiting";
        return (
          <span
            className={
              late
                ? "text-kit-red-11"
                : quiet
                  ? "text-kit-slate-9"
                  : "text-kit-slate-12"
            }
          >
            {actionListWordOf(a)}
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
            <button
              type="button"
              onClick={() => setWorkspaceOpen((o) => !o)}
              aria-pressed={workspaceOpen}
              title={workspaceOpen ? "Hide purchase order" : "Show purchase order"}
              aria-label={workspaceOpen ? "Hide purchase order" : "Show purchase order"}
              data-testid="po-workspace-toggle"
              className={PANE_BTN}
            >
              <Icon name={workspaceOpen ? "forward" : "back"} size={14} />
            </button>
          </div>
        }
      />

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
          <div>
            <div className="flex items-center px-1.5">
              <span className="text-label font-semibold uppercase tracking-wide text-kit-slate-9">
                Supplier Progress
              </span>
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
        <div
          className="flex-1 min-w-0 min-h-0 flex flex-col border-r border-kit-slate-5 bg-white"
          data-testid="po-listing"
        >
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
        <main
          className={[
            "shrink-0 min-h-0 overflow-y-auto bg-white",
            workspaceOpen ? "w-[400px]" : "hidden",
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
              today={today}
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

/* ── The Supplier Workspace for ONE Purchase Order (Jess, 2026-08-02 FINAL).
 *
 * WORKSPACE LAW — every section answers ONE operator question, and a future
 * field that answers none of them does not belong here:
 *
 *   WORK HEADER       identity + work state + CURRENT ACTION (typography
 *                     only — quiet first; a highlighted container only if
 *                     live use proves it does not stand out) + PO Issued ·
 *                     Received. Expected Arrival deliberately NOT here — it
 *                     lives in SUPPLIER with its history.
 *   PURCHASE ORDER    "What is this PO?"          (mission: Reference —
 *                     read only, always the CURRENT revision; edits happen
 *                     in SUPPLIER. UI speaks business, not "Reference".)
 *   SUPPLIER          "What must I do with the supplier?"  (mission: manage
 *                     supplier execution — Goods Arriving At + its history
 *                     beside it, Open Actions; grows forever: DO · Revision
 *                     · Change/Split Deliver To · Claims links.)
 *   ACTIVITY          "What have we communicated?" (mission: record and
 *                     perform business communication — tools + the business
 *                     timeline, a read-time merge of the real stores.)
 *   RECEIVING         "What has happened after arrival?"  (mission: hand
 *                     over to warehouse operation — summary + door only.)
 *
 * Rhythm = CARRES WORKSPACE RHYTHM v1: one continuous working document,
 * hairline + small-caps sections, 24px property rows, ONE loud element
 * (the Current Action), no cards, no letterhead (the paper look belongs to
 * the printed 0307 document). */

/** The Linear property row: label + value, ONE 24px line, never stacked. */
function Prop({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 text-body leading-6">
      <span className="w-32 shrink-0 text-label text-kit-slate-9">{label}</span>
      <span className="min-w-0 text-kit-slate-12">{children}</span>
    </div>
  );
}

function WorkspaceBody({
  po,
  supplier,
  warehouse,
  calls,
  sizeOf,
  eta,
  today,
}: {
  po: operationPoListRow;
  supplier: SupplierRow | undefined;
  warehouse: { name: string; address: string | null } | undefined;
  calls: PurchasingOpenCall[];
  sizeOf: (sku: string) => string | null;
  eta: { date: string | null; confirmed: boolean };
  today: string;
}) {
  const supplierName = supplier?.name ?? po.supplier_id;
  const progress = poReceivingProgress(po.purchase_order_lines);
  const overdue = poOverdueDays(callPoOf(po), today);
  const [dateOpen, setDateOpen] = useState(false);
  const [openLine, setOpenLine] = useState<string | null>(null);

  /** The EXCEL rows: one per SO × SKU (never the paper's stacked cells).
   *  Received is dealt across a line's rows in the same SO order the
   *  quantities were — a DISPLAY attribution until P5's allocation. */
  const rows = useMemo(() => {
    const out: {
      key: string;
      lineId: string;
      so: number | null;
      sku: string;
      size: string | null;
      qty: number;
      received: number;
      remark: string | null;
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
          sku: l.sku,
          size: sizeOf(l.sku),
          qty: r.qty,
          received: got,
          remark: r.remark,
        });
      });
    }
    return out;
  }, [po, sizeOf]);

  const history = useMemo(
    () => (po.promises ?? []).filter((p) => p.kind === "tomorrow_delivery"),
    [po.promises],
  );

  return (
    <div className="px-4 py-4" data-testid="po-document">
      {/* ── ① FIXED HEADER — labels left, the document number right. It
           carries identity + the supplier's date, and NEVER grows. ───── */}
      <div className="flex items-start gap-2" data-testid="po-working-header">
        <div className="min-w-0 flex-1">
          <Prop label="PO Issued">
            <span className="tabular-nums">
              {fmtDateShort((po.placed_at ?? "").slice(0, 10))}
            </span>
          </Prop>
          <Prop label="Delivery To">{warehouse?.name ?? "—"}</Prop>
          <Prop label="Supplier">{supplierName}</Prop>
        </div>
        <span className="text-page font-semibold font-mono text-kit-slate-12 shrink-0">
          {po.id}
        </span>
      </div>

      {/* The supplier's date — the ONE row that opens a form. Overdue is a
          fact printed beside it (Jess's cycle), never a second bucket. */}
      <button
        type="button"
        onClick={() => setDateOpen((o) => !o)}
        aria-expanded={dateOpen}
        data-testid="po-date-row"
        className="mt-0.5 w-full flex items-baseline gap-2 text-body leading-6 text-left hover:bg-kit-blue-2 rounded-control"
      >
        <span className="w-32 shrink-0 text-label text-kit-slate-9">
          Supplier Delivery Date
        </span>
        <span className="min-w-0 flex-1">
          {eta.date ? (
            <span
              className={[
                "tabular-nums",
                eta.confirmed ? "text-kit-slate-12" : "text-kit-slate-9",
              ].join(" ")}
            >
              {fmtDateShort(eta.date)}
              {!eta.confirmed && (
                <span className="text-kit-slate-9"> · expected</span>
              )}
            </span>
          ) : (
            <span className="text-kit-slate-9">—</span>
          )}
          {overdue != null && (
            <span className="text-kit-red-11" data-testid="po-overdue">
              {"  "}⚠ Overdue by {overdue} day{overdue === 1 ? "" : "s"}
            </span>
          )}
        </span>
        <Icon name={dateOpen ? "collapse" : "forward"} size={14} />
      </button>

      {dateOpen && (
        <div
          className="mt-1 ml-32 pl-2 border-l-2 border-kit-blue-9"
          data-testid="po-date-extend"
        >
          <SupplierDateForm po={po} current={eta.date} confirmed={eta.confirmed} />
          {calls.map((c) => (
            <div
              key={c.poLineId ?? c.key}
              className="flex items-baseline gap-2 text-body leading-6"
            >
              <span
                aria-hidden
                className={[
                  "w-1.5 h-1.5 rounded-full shrink-0 self-center",
                  c.late ? "bg-kit-red-9" : "bg-kit-amber-9",
                ].join(" ")}
              />
              <span className="text-kit-slate-12">
                {purchasingActionQueue(c.key)}
              </span>
              {c.dueIso && (
                <span className="ml-auto text-label text-kit-slate-9">
                  due {fmtDateShort(c.dueIso)}
                </span>
              )}
            </div>
          ))}
          {history.length === 0 ? (
            <div className="text-label text-kit-slate-9 leading-6">
              No date from {supplierName} yet.
            </div>
          ) : (
            history.map((h) => (
              <div key={h.recorded_at} className="text-body leading-6">
                <span className="text-label text-kit-slate-9 tabular-nums">
                  {fmtDateShort(h.recorded_at.slice(0, 10))}{"  "}
                </span>
                <span className="text-kit-slate-12">
                  {h.answer === "delayed"
                    ? `moved ${fmtDateShort(h.previous_date ?? "")} → ${fmtDateShort(h.new_date ?? "")}`
                    : `confirmed ${fmtDateShort(h.about_date ?? "")}`}
                </span>
                {h.reason && (
                  <span className="text-kit-slate-9"> · {h.reason}</span>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── ② ITEMS — the Excel grid. Quantities live on the rows, so there
           is no Receiving panel: the total row hands over. ────────────── */}
      <div className="mt-3" data-testid="po-doc-items">
        <div className="flex gap-2 text-label uppercase tracking-wide text-kit-slate-9 border-y border-kit-slate-5 py-1">
          <span className="w-4 font-medium">#</span>
          <span className="w-16 font-medium">SO No.</span>
          <span className="flex-1 font-medium">Description</span>
          <span className="w-8 text-right font-medium">Qty</span>
          <span className="w-10 text-right font-medium">Recv</span>
          <span className="w-20 font-medium">Remark</span>
        </div>
        {rows.map((r, i) => (
          <div key={r.key}>
            <button
              type="button"
              onClick={() => setOpenLine(openLine === r.key ? null : r.key)}
              aria-expanded={openLine === r.key}
              data-testid={`po-item-row-${i + 1}`}
              className="w-full flex gap-2 py-1.5 text-body text-left border-b border-kit-slate-4 hover:bg-kit-blue-2"
            >
              <span className="w-4 text-kit-slate-9 tabular-nums">{i + 1}</span>
              <span className="w-16 text-label text-kit-slate-11 tabular-nums">
                {r.so != null ? `SO-${r.so}` : "—"}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold font-mono text-kit-slate-12 truncate">
                  {r.sku}
                </span>
                {r.size && (
                  <span className="block text-label text-kit-slate-9">
                    {r.size}
                  </span>
                )}
              </span>
              <span className="w-8 text-right text-kit-slate-12 tabular-nums">
                {r.qty}
              </span>
              <span className="w-10 text-right tabular-nums text-kit-slate-9">
                {r.received}
              </span>
              <span
                className="w-20 truncate text-label text-kit-slate-11"
                title={r.remark ?? undefined}
              >
                {r.remark ?? ""}
              </span>
            </button>
            {openLine === r.key && (
              <div
                className="pl-6 py-1.5 border-b border-kit-slate-4 bg-kit-slate-3"
                data-testid="po-item-extend"
              >
                <Prop label="Destination">{warehouse?.name ?? "—"}</Prop>
              </div>
            )}
          </div>
        ))}
        <div className="flex gap-2 py-1.5 text-body border-b border-kit-slate-5">
          <span className="w-4" />
          <span className="w-16" />
          <span className="flex-1 text-label uppercase tracking-wide text-kit-slate-9">
            Total
          </span>
          <span className="w-8 text-right font-semibold text-kit-slate-12 tabular-nums">
            {progress.ordered}
          </span>
          <span className="w-10 text-right font-semibold text-kit-slate-12 tabular-nums">
            {progress.received}
          </span>
          <span className="w-20" />
        </div>
        <div className="mt-1 flex items-center gap-3">
          {progress.issueQty > 0 && (
            <span className="text-body text-kit-red-11">
              {progress.issueQty} with a problem
            </span>
          )}
          <Link
            to="/operation?tab=receiving"
            className="ml-auto text-body font-medium text-kit-blue-11 hover:underline"
            data-testid="po-open-receiving"
          >
            Open Receiving
          </Link>
        </div>
      </div>

      {/* ── ③ ACTIVITY — tools + the business timeline. ───────────────── */}
      <ActivityDesk po={po} supplier={supplier} />
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
  current,
  confirmed,
}: {
  po: operationPoListRow;
  current: string | null;
  confirmed: boolean;
}) {
  const held = confirmed ? (po.eta_date ?? null) : null;
  const [date, setDate] = useState(current ?? "");
  const [reason, setReason] = useState<string>(PO_DELAY_REASONS[0]);
  const [remarks, setRemarks] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const save = useRecordSupplierDate(po.id);

  const moved = held != null && date !== held;
  const canSave = date !== "" && !save.isPending;

  function submit() {
    setErr(null);
    const body =
      held == null
        ? { answer: "shipping" as const, firstDate: date, remarks: remarks || undefined }
        : moved
          ? {
              answer: "delayed" as const,
              newDate: date,
              reason,
              remarks: remarks || undefined,
            }
          : { answer: "shipping" as const, remarks: remarks || undefined };
    save.mutate(body, {
      onSuccess: () => setRemarks(""),
      onError: (e) => setErr(e instanceof Error ? e.message : String(e)),
    });
  }

  return (
    <div className="py-1" data-testid="po-date-form">
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Supplier delivery date"
          data-testid="po-date-input"
          className="h-8 rounded-control border border-kit-slate-5 bg-white px-2 text-body text-kit-slate-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9"
        />
        {moved && (
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
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
        <button
          type="button"
          onClick={submit}
          disabled={!canSave}
          data-testid="po-date-save"
          className={`${DOC_BTN} disabled:opacity-40`}
        >
          {save.isPending ? "Saving…" : "Save"}
        </button>
      </div>
      <input
        type="text"
        value={remarks}
        onChange={(e) => setRemarks(e.target.value)}
        placeholder="Remarks"
        aria-label="Remarks"
        data-testid="po-date-remarks"
        className="mt-1 h-8 w-full rounded-control border border-kit-slate-5 bg-white px-2 text-body text-kit-slate-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9"
      />
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
function ActivityDesk({
  po,
  supplier,
}: {
  po: operationPoListRow;
  supplier: SupplierRow | undefined;
}) {
  const [copied, setCopied] = useState(false);
  // Rhythm spec DO: collapse long tools — the draft is ONE line until
  // opened. Copy works without expanding (it copies the full draft).
  const [draftOpen, setDraftOpen] = useState(false);

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

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setDraftOpen((o) => !o)}
          aria-expanded={draftOpen}
          data-testid="po-wa-toggle"
          className="inline-flex items-center gap-1 text-label text-kit-slate-9 hover:text-kit-slate-12"
        >
          <Icon name={draftOpen ? "collapse" : "expand"} size={14} />
          WhatsApp message
        </button>
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
      {draftOpen && (
        <pre
          className="mt-2 whitespace-pre-wrap rounded-card bg-kit-slate-3 px-3 py-2 text-body font-body text-kit-slate-12"
          data-testid="po-wa-message"
        >
          {message}
        </pre>
      )}

      {/* The timeline — tools above, hairline, then the entries: date over
          event (Jess's polish: one flowing timeline, not two blocks). Each
          store that opens (sends · notes · receiving) adds its entries. */}
      <ul
        className="mt-3 pt-2 border-t border-kit-slate-4 flex flex-col gap-2"
        data-testid="po-history"
      >
        <li>
          <div className="text-label text-kit-slate-9 tabular-nums">
            {fmtDateShort((po.placed_at ?? "").slice(0, 10))}
          </div>
          <div className="text-body text-kit-slate-12">PO issued</div>
        </li>
      </ul>
    </section>
  );
}
