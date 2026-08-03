import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import {
  addWorkingDays,
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
  usePoLineAction,
  useRecordSend,
  useRecordSupplierDate,
  useSetMessageTemplate,
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
 *     Goods Arrival · Received · Current Action. Default order =
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
 * Notes (no store) · Supplier DO (no store) · editable Goods Arrival
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
  //   Goods Arrival · Received · Current Action
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
      // Compact (workspace open) buys the Current Action tail its last 12px.
      // Measured, not guessed: the widest supplier name needs 87px.
      width: workspaceOpen ? "92px" : "104px",
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
      // Same 10px loan as Supplier, and the widest label measures 135px, so
      // nothing here truncates that did not truncate before.
      width: workspaceOpen ? "140px" : "150px",
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
      // `Goods Arrival`, never `Goods Arriving At` (Jess, 2026-08-03): `At`
      // carries no information, and this column's neighbour is `Customer
      // Delivery` — two dates of the same kind, so they now read as a pair.
      // It is also the word ORDERS-WORKING-FLOW.md already uses.
      label: "Goods Arrival",
      // Wider than the 96px it carried as a bare date: the gap tail rides
      // here, and a truncated warning is worse than no warning. 192 is
      // MEASURED against the worst line the cell can hold — `25 Aug 26  8d
      // late (revised)` needs 189 — never estimated: jsdom has no widths, so
      // the page tests structurally cannot catch this and only the browser
      // can. Compact keeps the old 96: there this column appears only when
      // the HONESTY GUARD forces it, and six columns have never fitted 565px.
      width: workspaceOpen ? "96px" : "192px",
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
              <span
                data-testid="po-arrival-gap"
                className={
                  gap.tone === "late"
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
        const word = actionListWordOf(a);
        return (
          <span
            title={word}
            className={
              late
                ? "text-kit-red-11"
                : quiet
                  ? "text-kit-slate-9"
                  : "text-kit-slate-12"
            }
          >
            {word}
          </span>
        );
      },
    },
  ];

  /** Gmail's reading-pane recipe, compact set re-ruled with the 8 columns
   *  (Jess, 2026-08-02): PO Issued (when) · Supplier (with whom) · PO No.
   *  (which document) · Items (which goods) · Current Action (what now).
   *  Customer Delivery / Goods Arrival / Received read off the open Live
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
              // ③ ONE naming rule for both surfaces (Jess, 2026-08-03): the
              // register and the workspace were two languages for one PO —
              // `Booqit 1B(LHF)` in the list, `5539-1B(LHF)` in the document.
              // Passing the LISTING's own function down is what makes them
              // structurally unable to drift apart again.
              labelOf={lineLabel}
              eta={etaOf(selected)}
              today={today}
              destinations={destinations}
              messageTemplate={messageTemplate}
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
 *                     supplier execution — Goods Arrival + its history
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
  labelOf,
  eta,
  today,
  destinations,
  messageTemplate,
}: {
  po: operationPoListRow;
  supplier: SupplierRow | undefined;
  warehouse: { name: string; address: string | null } | undefined;
  calls: PurchasingOpenCall[];
  sizeOf: (sku: string) => string | null;
  /** The REGISTER's own item-naming function, handed down so the document
   *  and the list can never spell one product two ways. */
  labelOf: (l: operationPoListRow["purchase_order_lines"][number]) => string;
  eta: { date: string | null; confirmed: boolean };
  today: string;
  destinations: { id: string; name: string; is_default: boolean }[];
  messageTemplate: string | null;
}) {
  const supplierName = supplier?.name ?? po.supplier_id;
  const progress = poReceivingProgress(po.purchase_order_lines);
  const overdue = poOverdueDays(callPoOf(po), today);
  const workState = poWorkStateOf(callPoOf(po), today);
  /** The gap the register now prints, read by the SAME shared rule — the
   *  delay is RECORDED here, so this is where the operator most needs to know
   *  the promise they are about to break. */
  const gap =
    workState === "completed" || workState === "cancelled"
      ? null
      : poArrivalGapOf(po.customer_delivery ?? null, eta.date);
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
      /** The business name a buyer says out loud — `Booqit 1B(LHF)`. */
      label: string;
      /** The code. It identifies, it does not describe, so it never leads. */
      sku: string;
      size: string | null;
      qty: number;
      received: number;
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
          size: sizeOf(l.sku),
          qty: r.qty,
          received: got,
          remark: r.remark,
          destinationId: l.destination_id ?? null,
          opsRemark: l.ops_remark ?? null,
        });
      });
    }
    return out;
  }, [po, sizeOf, labelOf]);

  const destName = (id: string) =>
    destinations.find((d) => d.id === id)?.name ?? "—";

  // The supplier's date history, numbered — SAP's shape (first promise vs the
  // one they stand on now, plus the slip), read out of the append-only ledger.
  const hist = useMemo(() => poDateHistoryOf(po.promises), [po.promises]);

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
          Goods Arrival
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
          {/* ONE thing beside the date, and it is the promise we made to a
              person (Jess, 2026-08-03). The `2nd date · 6 days later` summary
              that used to sit here was history squeezed into a header — the
              history itself is one click away and says it properly. */}
          {gap && (
            <span
              data-testid="po-arrival-gap"
              className={
                gap.tone === "late" ? "text-kit-red-11" : "text-kit-amber-11"
              }
            >
              {"  "}⚠ {gap.label}
            </span>
          )}
          {overdue != null && (
            <span className="text-kit-red-11" data-testid="po-overdue">
              {"  "}⚠ Overdue by {overdue} day{overdue === 1 ? "" : "s"}
            </span>
          )}
        </span>
        <Icon name={dateOpen ? "collapse" : "forward"} size={14} />
      </button>

      {/* NO action row here (Jess, 2026-08-03). `Next — Waiting for Goods`
          was wrong twice over: `Waiting for Goods` is a STATUS, not a next
          step, and the same slot carries a real ACTION on a PO with an open
          call — one label cannot be true of both. The register's Current
          Action column already says it, and since the compact width was
          fixed it says it whole. */}

      {dateOpen && (
        <div
          className="mt-1 ml-32 pl-2 border-l-2 border-kit-blue-9"
          data-testid="po-date-extend"
        >
          <SupplierDateForm po={po} confirmed={eta.confirmed} supplierName={supplierName} />
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
          {hist.entries.length === 0 ? (
            <div className="text-label text-kit-slate-9 leading-6">
              No date from {supplierName} yet.
            </div>
          ) : (
            /* Numbered oldest first — `1st` is the date the supplier FIRST
               gave (never the engine's estimate: an estimate is our guess,
               not their promise). One date earns no number. */
            <div data-testid="po-date-history">
              {hist.entries.map((e) => (
                <div
                  key={e.recordedAt}
                  className="flex items-baseline gap-2 text-body leading-6"
                >
                  {hist.entries.length > 1 && (
                    <span className="w-7 shrink-0 text-label text-kit-slate-9">
                      {ordinalLabel(e.ordinal)}
                    </span>
                  )}
                  <span className="w-[68px] shrink-0 tabular-nums text-kit-slate-12">
                    {fmtDateShort(e.date)}
                  </span>
                  {/* Not `truncate`: `Production Delay` overflowed by 3px and
                      printed `Production Del…` — a reason category clipped is
                      a reason nobody can count. The ordinal and the date gave
                      back 20px so the five short reasons sit on ONE line; the
                      one long one wraps, which is the honest way to run out
                      of room. */}
                  <span className="min-w-0 text-kit-slate-9">
                    {[e.reason, e.remarks].filter(Boolean).join(" · ")}
                  </span>
                  {/* No "told" column (Jess, 2026-08-02): every answer keyed
                      on the same day printed the same date twice, and a second
                      date beside a delivery date reads as another delivery
                      date. What the row must answer is WHICH date and WHY. */}
                </div>
              ))}
            </div>
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
          <span className="w-6 shrink-0" />
        </div>
        {rows.map((r, i) => (
          <div key={r.key}>
            {/* ⋮ opens NAMED actions (Jess, 2026-08-02: "why so fragile?").
                Excel right-clicks, Gmail and Linear use a ⋮ — a row action
                must be a control with a name, never a word you happen to
                click. The row itself no longer toggles anything. */}
            <div
              data-testid={`po-item-row-${i + 1}`}
              className="w-full flex gap-2 py-1.5 text-body border-b border-kit-slate-4"
            >
              <span className="w-4 text-kit-slate-9 tabular-nums">{i + 1}</span>
              <span className="w-16 text-label text-kit-slate-11 tabular-nums">
                {r.so != null ? `SO-${r.so}` : "—"}
              </span>
              <span className="flex-1 min-w-0">
                {/* The BUSINESS name leads (Jess, 2026-08-03): a buyer knows
                    Booqit · Cody · Jager, not 5539-1B(LHF). Same function as
                    the register's Items column, so the two can never drift.
                    The code identifies rather than describes — it lives on
                    hover and in the row's own expanded surface. The old
                    variant sub-line is gone: `Booqit 1B(LHF)` already says
                    it, and it was printing `1B(LHF)` twice. */}
                <span
                  title={r.sku}
                  className="block font-semibold text-kit-slate-12 truncate"
                >
                  {r.label}
                </span>
                {/* TWO remarks, two owners (Jess, 2026-08-02): the SALES one
                    came over from the sales order and prints for the factory;
                    the OPS one is purchasing's own and never prints. */}
                {r.remark && (
                  <span className="block text-label text-kit-slate-11">
                    Sales: {r.remark}
                  </span>
                )}
                {r.destinationId && (
                  <span className="block text-label text-kit-blue-11">
                    → {destName(r.destinationId)}
                  </span>
                )}
                {r.opsRemark && (
                  <span className="block text-label text-kit-slate-9">
                    Ops: {r.opsRemark}
                  </span>
                )}
              </span>
              <span className="w-8 text-right text-kit-slate-12 tabular-nums">
                {r.qty}
              </span>
              <span className="w-10 text-right tabular-nums text-kit-slate-9">
                {r.received}
              </span>
              <span className="w-6 shrink-0 text-right">
                <button
                  type="button"
                  onClick={() =>
                    setOpenLine(openLine === r.key ? null : r.key)
                  }
                  aria-expanded={openLine === r.key}
                  aria-label={`Actions for line ${i + 1}`}
                  data-testid={`po-item-menu-${i + 1}`}
                  className="px-1 rounded text-kit-slate-9 hover:text-kit-slate-12 hover:bg-kit-slate-3"
                >
                  ⋮
                </button>
              </span>
            </div>
            {openLine === r.key && (
              <div
                className="pl-6 py-1.5 border-b border-kit-slate-4 bg-kit-slate-3"
                data-testid="po-item-extend"
              >
                {/* Where the CODE lives now: the row above says what the
                    product is, this says which exact one — the warehouse and
                    the factory both key on it. */}
                <div
                  className="flex items-baseline gap-2 text-body leading-6"
                  data-testid="po-item-sku"
                >
                  <span className="w-32 shrink-0 text-label text-kit-slate-9">
                    Item ID
                  </span>
                  <span className="font-mono text-kit-slate-12">{r.sku}</span>
                </div>
                <LineWork
                  lineId={r.lineId}
                  qty={r.qty}
                  received={r.received}
                  destinationId={r.destinationId}
                  poDestinationId={po.destination_id ?? null}
                  opsRemark={r.opsRemark}
                  destinations={destinations}
                  fallbackName={warehouse?.name ?? "—"}
                />
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
          <span className="w-6 shrink-0" />
        </div>
        {/* No door to Receiving (Jess, 2026-08-02): the warehouse checks the
            goods in over there and the Recv column moves BY ITSELF — a link
            that only navigates is a step purchasing never needs to take. */}
        {progress.issueQty > 0 && (
          <div className="mt-1 text-body text-kit-red-11">
            {progress.issueQty} with a problem
          </div>
        )}
      </div>

      {/* ── ③ ACTIVITY — tools + the business timeline. ───────────────── */}
      <ActivityDesk po={po} supplier={supplier} template={messageTemplate} />
    </div>
  );
}


/**
 * The line's work surface (Jess, 2026-08-02 — 0311). Purchasing's only
 * per-line job is WHERE THIS PIECE GOES, so that is what opens under the row:
 * a destination picker and purchasing's own note.
 *
 * When only PART of the quantity goes elsewhere the LINE splits — the PO
 * stays one document with one supplier (her frozen law). Only the un-received
 * remainder can move: goods a warehouse already holds cannot be re-routed by
 * editing a document.
 */
/**
 * The line's work surface (Jess, 2026-08-02 — 0311). Purchasing's only
 * per-line job is WHERE THIS PIECE GOES, so that is what opens under the row.
 *
 * INLINE EDIT, Linear's/Notion's manner (Jess, 2026-08-02: "it always show
 * like that?"): a value is TEXT until you click it. A form standing open on
 * every row, with a Save that is grey most of the time, is furniture — the
 * quiet state must look quiet. Enter saves, Esc cancels; there is no Save
 * button anywhere.
 *
 * When only PART of the quantity goes elsewhere the LINE splits — the PO
 * stays one document with one supplier (her frozen law). Only the un-received
 * remainder can move: goods a warehouse already holds cannot be re-routed by
 * editing a document.
 */
function LineWork({
  lineId,
  qty,
  received,
  destinationId,
  poDestinationId,
  opsRemark,
  destinations,
  fallbackName,
}: {
  lineId: string;
  qty: number;
  received: number;
  destinationId: string | null;
  poDestinationId: string | null;
  opsRemark: string | null;
  destinations: { id: string; name: string; is_default: boolean }[];
  fallbackName: string;
}) {
  const act = usePoLineAction(lineId);
  const current = destinationId ?? poDestinationId ?? "";
  const currentName =
    destinations.find((d) => d.id === current)?.name ?? fallbackName;
  const [editing, setEditing] = useState<null | "dest" | "note">(null);
  const [dest, setDest] = useState(current);
  const [moveQty, setMoveQty] = useState("");
  const [note, setNote] = useState(opsRemark ?? "");
  const [err, setErr] = useState<string | null>(null);

  const free = Math.max(0, qty - received);
  const moving = Number(moveQty || 0);
  const changed = dest !== "" && dest !== current;
  const willSplit = changed && moving >= 1 && moving < free;

  const close = () => {
    setEditing(null);
    setDest(current);
    setMoveQty("");
    setNote(opsRemark ?? "");
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

  const EDIT_TEXT =
    "border-b border-dashed border-kit-slate-5 text-left hover:text-kit-slate-12";
  const KEYS = "text-label text-kit-slate-9";

  return (
    <div data-testid="po-line-work">
      <div className="flex items-center gap-2 text-body leading-6">
        <span className="w-24 shrink-0 text-label text-kit-slate-9">
          Destination
        </span>
        {editing === "dest" ? (
          <>
            <select
              value={dest}
              autoFocus
              onChange={(e) => setDest(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveDestination();
                if (e.key === "Escape") close();
              }}
              aria-label="Destination"
              data-testid="po-line-destination"
              className="h-8 rounded-control border border-kit-slate-5 bg-white px-2 text-body text-kit-slate-12"
            >
              {destinations.length === 0 && (
                <option value="">{fallbackName}</option>
              )}
              {destinations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            {changed && free > 1 && (
              <>
                <span className="text-label text-kit-slate-9">Move</span>
                <input
                  type="number"
                  min={1}
                  max={free}
                  value={moveQty}
                  onChange={(e) => setMoveQty(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveDestination();
                    if (e.key === "Escape") close();
                  }}
                  placeholder={`${free}`}
                  aria-label="Move how many"
                  data-testid="po-line-move-qty"
                  className="h-8 w-14 rounded-control border border-kit-slate-5 bg-white px-2 text-right text-body text-kit-slate-12 tabular-nums"
                />
                <span className="text-label text-kit-slate-9">of {free}</span>
              </>
            )}
            <button
              type="button"
              onClick={saveDestination}
              disabled={!changed || act.isPending}
              data-testid="po-line-destination-save"
              className={`${DOC_BTN} disabled:opacity-40`}
            >
              {act.isPending ? "Saving…" : willSplit ? "Split" : "Save"}
            </button>
            <button
              type="button"
              onClick={close}
              data-testid="po-line-destination-cancel"
              className={`${KEYS} hover:text-kit-slate-12`}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setEditing("dest")}
            data-testid="po-line-destination-open"
            className={`${EDIT_TEXT} text-kit-slate-12`}
          >
            {currentName}
          </button>
        )}
      </div>
      {editing === "dest" && changed && (
        <div
          className="ml-24 pl-2 text-label text-kit-slate-9"
          data-testid="po-line-effect"
        >
          {willSplit
            ? `${moving} of ${free} move; ${free - moving} stay.`
            : `All ${free} move.`}
        </div>
      )}

      <div className="mt-1 flex items-center gap-2 text-body leading-6">
        <span className="w-24 shrink-0 text-label text-kit-slate-9">
          Ops remark
        </span>
        {editing === "note" ? (
          <>
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
              data-testid="po-line-ops-remark"
              className="h-8 flex-1 rounded-control border border-kit-slate-5 bg-white px-2 text-body text-kit-slate-12"
            />
            <button
              type="button"
              onClick={() => run("ops-remark", { text: note })}
              disabled={note === (opsRemark ?? "") || act.isPending}
              data-testid="po-line-ops-save"
              className={`${DOC_BTN} disabled:opacity-40`}
            >
              {act.isPending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={close}
              data-testid="po-line-ops-cancel"
              className={`${KEYS} hover:text-kit-slate-12`}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setEditing("note")}
            data-testid="po-line-ops-open"
            className={`${EDIT_TEXT} ${
              opsRemark ? "text-kit-slate-12" : "text-kit-slate-9"
            }`}
          >
            {opsRemark ?? "Add a note…"}
          </button>
        )}
      </div>
      {err && (
        <div className="text-label text-kit-red-11" data-testid="po-line-error">
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
  const held = confirmed ? (po.eta_date ?? null) : null;
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
        {held == null ? "Record the supplier's date…" : "Record a new date…"}
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
/** Same day + same channel + same revision = ONE send with a count. */
function groupSends(
  sends: NonNullable<operationPoListRow["sends"]>,
): { key: string; day: string; channel: string; revNo: number | null; count: number }[] {
  const out: {
    key: string;
    day: string;
    channel: string;
    revNo: number | null;
    count: number;
  }[] = [];
  for (const s of sends) {
    const day = s.sent_at.slice(0, 10);
    const revNo = s.po_revisions?.rev_no ?? null;
    const key = `${day}|${s.channel}|${revNo ?? "-"}`;
    const hit = out.find((g) => g.key === key);
    if (hit) hit.count += 1;
    else out.push({ key, day, channel: s.channel, revNo, count: 1 });
  }
  return out;
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
  const [copied, setCopied] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const send = useRecordSend(po.id);
  const saveTemplate = useSetMessageTemplate();

  const supplierName = supplier?.name ?? "supplier";
  const items = po.purchase_order_lines
    .map((l) => `${l.sku} ×${l.qty}`)
    .join("\n");
  const arriving = po.eta_date
    ? `Goods Arrival: ${fmtDate(po.eta_date)}`
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

  const waUrl = useMemo(() => {
    if (supplier?.whatsapp_group_url) return supplier.whatsapp_group_url;
    const digits = (supplier?.contact ?? "").replace(/\D/g, "");
    return digits ? `https://wa.me/${digits}` : null;
  }, [supplier]);
  const email = supplier?.contact_email ?? null;
  const mailto = email
    ? `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
        `${po.id} — Carres Purchase Order`,
      )}&body=${encodeURIComponent(text)}`
    : null;

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard refused — the text stays selectable below.
    }
  }

  const sends = po.sends ?? [];

  return (
    <section className="mt-3 pt-3 border-t border-kit-slate-5" data-testid="po-activity">
      <div className="flex items-center gap-2">
        <h3 className="text-label font-semibold uppercase tracking-wide text-kit-slate-9">
          Activity
        </h3>
        {copied && (
          <span className="text-label font-medium text-kit-green-11" data-testid="po-copied">
            Copied
          </span>
        )}
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
        {/* The ACT records itself (Jess, 2026-08-02): opening WhatsApp or the
            mail client IS the send, so there is no "I've sent" to remember
            afterwards — a button somebody must press after the fact is a
            record that will be wrong. Copy does NOT record: copying is not
            sending, it is taking the words somewhere else. */}
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
            onClick={() => send.mutate({ channel: "whatsapp" })}
            data-testid="po-open-whatsapp"
            className={`${DOC_BTN} font-medium`}
          >
            WhatsApp
          </a>
        )}
        {/* The portal has NO email sender (Jess picked mailto): the operator's
            own client sends it, with the subject and body already filled. */}
        {mailto ? (
          <a
            href={mailto}
            onClick={() => send.mutate({ channel: "email" })}
            data-testid="po-open-email"
            className={`${DOC_BTN} font-medium`}
          >
            Email
          </a>
        ) : (
          <span className="text-label text-kit-slate-9" data-testid="po-no-email">
            No email on file for {supplierName}
          </span>
        )}
        {send.isPending && (
          <span className="text-label text-kit-slate-9">Recording…</span>
        )}
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

      {/* The timeline — what we have SENT. `PO issued` is the header's fact,
          never repeated here; a supplier's date answers live beside the date. */}
      {sends.length === 0 ? (
        <div
          className="mt-3 pt-2 border-t border-kit-slate-4 text-label text-kit-slate-9"
          data-testid="po-history"
        >
          Nothing sent yet.
        </div>
      ) : (
        <ul
          className="mt-3 pt-2 border-t border-kit-slate-4 flex flex-col gap-1"
          data-testid="po-history"
        >
          {/* Opening WhatsApp twice in a morning is ONE send, not two: same
              day, same channel, same revision collapses to a line with a
              count (Jess caught the duplicate). */}
          {groupSends(sends).map((g) => (
            <li key={g.key} className="flex items-baseline gap-2 text-body">
              <span className="text-label text-kit-slate-9 tabular-nums shrink-0">
                {fmtDateShort(g.day)}
              </span>
              <span className="text-kit-slate-12">
                sent via {g.channel}
                {g.revNo != null ? (
                  <span className="text-kit-slate-9"> · Revision {g.revNo}</span>
                ) : null}
                {g.count > 1 ? (
                  <span className="text-kit-slate-9"> · {g.count}×</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
