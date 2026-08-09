/**
 * SalesOrdersRegister — RG-2: the page RUNS THE REGISTER ENGINE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THE REGISTER LAW STILL RULES THE GRID
 *
 *   "The register never owns workflow. A register may: Search · Filter · Sort ·
 *    Select · Inspect. It never executes business workflow — workflow always
 *    belongs to its owning module. Bulk selection may only be used for
 *    view-oriented actions (print / export / copy), never operational
 *    workflow."                     (verbatim home: docs/MIGRATION-MAP.md)
 *
 * RG-2's shape (docs/ui-reference/00-register-laws.md, Laws 1–13):
 *
 * ```
 * ENGINE      components/register/DataGrid — 2990's shipped grid, COPIED not
 *             re-implemented (Law 13: one engine, never forked). It owns
 *             search (left, 200px) · header ▽ filters · Columns n/m + Reset ·
 *             resize/reorder/layout persistence · virtualization · Export
 *             Excel (current view / N selected) · the selection bar.
 * THIS PAGE   owns only what the engine cannot know: the rows (Carres
 *             orders), the column catalog, the scope, and the Detail Panel.
 * PANEL       FIXED 480px (owner ruling A — not resizable; below 1200px it
 *             clamps to max(400px, 40%)). A flex sibling, never an overlay:
 *             the grid keeps every column and scrolls sideways when tight.
 * SELECTION   checkboxes serve Export ONLY (the LAW's own clause) — the
 *             engine's selection bar says "N selected · Clear · Export
 *             Excel (N)" and exports the SELECTED rows.
 * URL         `?order=<id>` opens the panel (Service Cases' J2 deep link
 *             still lands here); `?view=document` swaps to the printable
 *             Sales Order. Filter state lives in the engine, layout in
 *             localStorage — RG-2 wires the URL to the panel alone.
 * ```
 *
 * SEARCH IS STILL CLIENT-SIDE, AND IT IS STILL ONE DEBT WITH THE 200-ROW CAP.
 * See `docs/MIGRATION-MAP.md` D-A · D-B.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import Select from "@/components/kit/Select";
import Money from "@/components/Money";
import { useOperationOrders } from "@/lib/queries";
import ModuleHeader from "./components/ModuleHeader";
import SalesOrderDocument from "./SalesOrderDocument";
import SalesOrderPanel from "./SalesOrderPanel";
import { isDelivered, isRental, type MoneyState } from "./sales-order-facts";
import {
  buildRegisterRow,
  moneyText,
  REGISTER_FIELDS,
  type RegisterField,
  type RegisterRow,
} from "./sales-order-columns";

/** The engine persists { order, hidden, widths, groupBy, sort } under this key. */
const GRID_STORE = "carres.salesOrders.grid.v1";

/** ONE cell, ONE fact. A money state is a number or a sentence, never nothing. */
function moneyCell(state: MoneyState) {
  if (state.kind === "amount") return <Money value={state.value} />;
  return state.kind === "settled" ? "Paid in full" : "No price yet";
}

/** What Export writes for a money column: the raw figure, else the sentence. */
function moneyExport(state: MoneyState): string | number {
  return state.kind === "amount" ? state.value : moneyText(state);
}

/**
 * The catalog (sales-order-columns.ts) resolved into the engine's column
 * shape. `text` keeps its four jobs — cell, ▽ filter, sort, export — and the
 * exceptions render markup ON TOP of it, never instead of it:
 *   · Customer — name black + phone gray, SAME line (RG-2's own clause);
 *     the ▽ still lists the NAME alone, export writes `Name · phone`.
 *   · the money columns render `Money` (which owns `RM ` + grouping); the ▽
 *     lists the printed text, export writes the raw figure.
 * Module-scope + static, so the engine's memo actually hits.
 */
function toGridColumn(f: RegisterField): DataGridColumn<RegisterRow> {
  const base: DataGridColumn<RegisterRow> = {
    key: f.key,
    label: f.label,
    width: Math.round(parseFloat(f.width)),
    align: f.align,
    sortable: true,
    defaultHidden: !f.on,
    accessor: (r) => f.text(r),
    searchValue: (r) => f.text(r),
    filterValue: (r) => f.text(r),
    ...(f.sortBy
      ? {
          sortFn: (a: RegisterRow, b: RegisterRow) => {
            const x = f.sortBy!(a);
            const y = f.sortBy!(b);
            return typeof x === "number" && typeof y === "number"
              ? x - y
              : String(x).localeCompare(String(y));
          },
        }
      : {}),
    ...(f.kind === "date" ? { filterType: "date" as const, dateValue: (r: RegisterRow) => f.iso?.(r) ?? null } : {}),
    ...(f.kind === "number"
      ? { filterType: "number" as const, numberValue: (r: RegisterRow) => f.num?.(r) ?? null }
      : {}),
  };
  if (f.key === "so") {
    /* Doc codes get 2990's type-to-find list. */
    return { ...base, filterType: "numbering" };
  }
  if (f.key === "customer") {
    return {
      ...base,
      accessor: (r) => (
        <span className="block truncate" title={r.phone ? `${r.customer} · ${r.phone}` : r.customer}>
          {r.customer}
          {r.phone ? <span className="text-base-500"> · {r.phone}</span> : null}
        </span>
      ),
      /* The digits ride the search so `0162389…` finds the row however the
         phone was punctuated. */
      searchValue: (r) => `${r.customer} ${r.phone} ${r.phoneDigits}`,
      filterValue: (r) => r.customer,
      exportValue: (r) => (r.phone ? `${r.customer} · ${r.phone}` : r.customer),
    };
  }
  if (f.key === "phone") {
    return { ...base, searchValue: (r) => `${r.phone} ${r.phoneDigits}` };
  }
  if (f.key === "items") {
    return {
      ...base,
      accessor: (r) => (
        <span className="block truncate" title={r.items}>
          {r.items}
        </span>
      ),
    };
  }
  if (f.key === "value" || f.key === "paid" || f.key === "outstanding") {
    const state = (r: RegisterRow) => r[f.key as "value" | "paid" | "outstanding"];
    return {
      ...base,
      accessor: (r) => moneyCell(state(r)),
      searchValue: (r) => moneyText(state(r)),
      filterValue: (r) => moneyText(state(r)),
      exportValue: (r) => moneyExport(state(r)),
    };
  }
  return base;
}

const GRID_COLUMNS: DataGridColumn<RegisterRow>[] = REGISTER_FIELDS.map(toGridColumn);

/** Is this event already someone's typing? Then the register keeps its hands off. */
function inFormField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export default function SalesOrdersRegister() {
  /* `?order=<id>` opens the PANEL beside the register; `?view=document` swaps
     to the full-page printable Sales Order. Service Cases' existing `?order=`
     deep link (J2) still lands on this order. RG-2: the URL carries the panel
     and nothing else — filters live in the engine. */
  const [params, setParams] = useSearchParams();
  const [scope, setScope] = useState<"live" | "all">("live");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /* The engine reports the rows visible after search + ▽s + sort — this is
     the order ↑↓ walks and the `n of N` the panel header states. */
  const [visibleRows, setVisibleRows] = useState<RegisterRow[]>([]);

  const openOrderId = params.get("order");
  const documentMode = params.get("view") === "document";
  const setOpen = useCallback(
    (id: string | null, view?: "document") => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set("order", id);
          else next.delete("order");
          if (view) next.set("view", view);
          else next.delete("view");
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const { data, isLoading, isError, error, refetch } = useOperationOrders({});

  const all = useMemo<RegisterRow[]>(
    () => (data?.orders ?? []).filter((o) => !isRental(o)).map(buildRegisterRow),
    [data],
  );

  /* The scope is the register's population; the engine's search and ▽s narrow
     WITHIN it. Newest first — the engine applies its own sort on top when a
     header is clicked. */
  const rows = useMemo(
    () =>
      all
        .filter((r) => scope !== "live" || !isDelivered(r.o))
        .sort((a, b) => b.ordered.localeCompare(a.ordered)),
    [all, scope],
  );

  /* ── SELECTION — the REGISTER LAW's clause: ticks feed Export and nothing
     else. Header checkbox = select all visible / clear (the engine says which). */
  const toggleRow = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const toggleAll = useCallback((keys: string[], allSelected: boolean) => {
    setSelected((prev) => (allSelected ? new Set<string>() : new Set([...prev, ...keys])));
  }, []);

  const position = openOrderId ? visibleRows.findIndex((r) => r.id === openOrderId) : -1;
  const step = useCallback(
    (delta: -1 | 1) => {
      if (position < 0) return;
      const next = visibleRows[position + delta];
      if (next) setOpen(next.id);
    },
    [position, visibleRows, setOpen],
  );

  /* ↑ ↓ walk the register and Esc closes the panel FROM ANYWHERE on the page
     while the panel is open — except inside a form field, whose keystrokes are
     the operator's own. */
  useEffect(() => {
    if (!openOrderId) return;
    const onKey = (e: KeyboardEvent) => {
      if (inFormField(e.target)) return;
      if (e.key === "Escape") {
        setOpen(null);
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        step(e.key === "ArrowDown" ? 1 : -1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openOrderId, step, setOpen]);

  const onRowClick = useCallback((r: RegisterRow) => setOpen(r.id), [setOpen]);
  const onRowDoubleClick = useCallback((r: RegisterRow) => setOpen(r.id, "document"), [setOpen]);

  /* THE FULL DOCUMENT IS ITS OWN SCREEN. It is the printable Sales Order and it
     is what `⤢` opens; the register is unmounted while it is open, exactly as
     SO-1 shipped it, because a document you print is not a panel. */
  if (openOrderId && documentMode) {
    return <SalesOrderDocument orderId={openOrderId} onClose={() => setOpen(openOrderId)} />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModuleHeader
        testId="sales-orders-header"
        icon={ClipboardList}
        word="Sales Orders"
        docTitle="Sales Orders — Carres"
        /* No Refresh. The query refetches itself on focus and after every
           mutation; a button that re-asks for what arrives by itself is a
           control that teaches operators to distrust the screen (SO-4). */
      />

      {/* ── REGISTER (left) + DETAIL PANEL (right, fixed 480px) — RG-2. The
          panel REFLOWS the grid: a flex sibling, never an overlay. The grid
          keeps every column — they shrink, ellipsize, and the engine's own
          horizontal scroll takes the rest. */}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="register-column">
          {isError ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-white">
              <p className="text-body text-base-700">The register could not be loaded</p>
              {(error as Error | undefined)?.message ? (
                <p className="text-meta text-base-500">{(error as Error).message}</p>
              ) : null}
              <button
                type="button"
                className="rounded-md border border-base-200 bg-white px-3 py-1.5 text-meta font-medium text-base-700 hover:bg-base-50"
                onClick={() => void refetch()}
              >
                Try again
              </button>
            </div>
          ) : (
            <DataGrid<RegisterRow>
              rows={rows}
              columns={GRID_COLUMNS}
              storageKey={GRID_STORE}
              rowKey={(r) => r.id}
              exportName="Sales Orders"
              searchPlaceholder="SO number, customer, phone or item…"
              isLoading={isLoading}
              emptyMessage={rows.length === 0 ? "No orders yet" : "No matching sales orders."}
              groupBanner={false}
              onRowClick={onRowClick}
              onRowDoubleClick={onRowDoubleClick}
              onFilteredRowsChange={setVisibleRows}
              selectable={{
                selectedKeys: selected,
                onToggle: toggleRow,
                onToggleAll: toggleAll,
              }}
              toolbar={
                <span className="w-36 shrink-0">
                  <Select
                    id="sales-orders-scope"
                    value={scope}
                    onValueChange={(v) => setScope(v as "live" | "all")}
                    options={[
                      { value: "live", label: "Not delivered" },
                      { value: "all", label: "All orders" },
                    ]}
                  />
                </span>
              }
            />
          )}
        </div>

        {openOrderId && (
          /* RG-2 — a FIXED 480px side panel (owner ruling A: not resizable).
             Below a 1200px viewport it clamps to max(400px, 40%) so the grid
             is never crushed to nothing. No overlay: the register column
             already gave up this width, so nothing is ever covered. */
          <div
            className="w-[480px] min-w-0 shrink-0 max-[1199px]:w-[max(400px,40%)]"
            data-testid="detail-pane"
          >
            <SalesOrderPanel
              orderId={openOrderId}
              position={position >= 0 ? position + 1 : 0}
              total={visibleRows.length}
              onStep={step}
              onOpenDocument={() => setOpen(openOrderId, "document")}
              onClose={() => setOpen(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
