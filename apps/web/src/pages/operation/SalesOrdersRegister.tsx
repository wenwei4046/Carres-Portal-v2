/**
 * SalesOrdersRegister — STAGE 1 (BUILD-QUEUE): the page RUNS THE REGISTER
 * ENGINE, and nothing on it writes to the database.
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
 * STAGE 1's shape (standing ruling: **COPY 2990**, Carres supplies the data):
 *
 * ```
 * ENGINE      components/register/DataGrid — 2990's shipped grid, COPIED not
 *             re-implemented (Law 13: one engine, never forked). It owns
 *             search · header ▽ filters · the GROUPED Columns chooser ·
 *             resize/reorder/layout persistence · virtualization · Export
 *             Excel (current view / N selected) · FOOTER TOTALS over the
 *             filtered list · the row context menu.
 * THIS PAGE   owns only what the engine cannot know: the rows (Carres
 *             orders), the column catalog, the scope, and where a row opens.
 * ▸ EXPAND    ships (2990's register expands; SO-1's "never expands" came
 *             from a docs-only commit). ONE job: the order's own lines.
 * ROW OPENS   double-click → the WORKSPACE ROUTE, a full page — the panel is
 *             superseded (closed ruling). Right-click: Open · Edit ·
 *             Print PDF · Copy SO No — nothing else.
 * ROLES       Operations opens with money hidden (openable); Finance /
 *             Principal open with money visible. defaultHidden is NOT
 *             permission — a restricted fact is removed from the API
 *             response, never merely hidden here.
 * ```
 *
 * SEARCH IS STILL CLIENT-SIDE, AND IT IS STILL ONE DEBT WITH THE 200-ROW CAP.
 * See `docs/MIGRATION-MAP.md` D-A · D-B.
 */
// design-standard: not-a-list-page — this page runs THE REGISTER ENGINE
// (components/register/DataGrid, 2990's grid copied per the standing COPY-2990
// ruling), full-bleed as SO-4 shipped it. The engine owns the toolbar, search,
// filters, chooser and footer; ListPageShell would wrap a second chrome
// around the one the engine already draws.
import { useCallback, useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  DataGrid,
  type DataGridColumn,
  type DataGridContextMenuItem,
} from "@/components/register/DataGrid";
import Select from "@/components/kit/Select";
import Money from "@/components/Money";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { renderSalesOrderPdf } from "@/lib/pdf/render";
import type { SalesOrderTemplateData } from "@/lib/pdf/types";
import { useOperationOrders } from "@/lib/queries";
import ModuleHeader from "./components/ModuleHeader";
import { isDelivered, isRental, lineName, type MoneyState } from "./sales-order-facts";
import {
  buildRegisterRow,
  defaultOnFor,
  moneyText,
  REGISTER_FIELDS,
  type RegisterField,
  type RegisterRow,
} from "./sales-order-columns";

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
 *   · Customer — name black + phone gray, SAME line; the ▽ still lists the
 *     NAME alone, export writes `Name · phone`.
 *   · the money columns render `Money` (which owns `RM ` + grouping); the ▽
 *     lists the printed text, export writes the raw figure, and the engine's
 *     footer sums them over the FILTERED list.
 */
function toGridColumn(f: RegisterField, role: string | null): DataGridColumn<RegisterRow> {
  const base: DataGridColumn<RegisterRow> = {
    key: f.key,
    label: f.label,
    width: Math.round(parseFloat(f.width)),
    align: f.align,
    sortable: true,
    defaultHidden: !defaultOnFor(f, role),
    chooserGroup: f.group,
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
    ...(f.kind === "date"
      ? { filterType: "date" as const, dateValue: (r: RegisterRow) => f.iso?.(r) ?? null }
      : {}),
    ...(f.kind === "number"
      ? { filterType: "number" as const, numberValue: (r: RegisterRow) => f.num?.(r) ?? null }
      : {}),
    ...(f.footerSum
      ? {
          footerTotal: (rows: RegisterRow[]) => (
            <Money value={rows.reduce((s, r) => s + f.footerSum!(r), 0)} />
          ),
        }
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
        <span
          className="block truncate"
          title={r.phone ? `${r.customer} · ${r.phone}` : r.customer}
        >
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
  if (f.key === "total" || f.key === "paid" || f.key === "balance") {
    const state = (r: RegisterRow) => r[f.key as "total" | "paid" | "balance"];
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

/**
 * ▸ EXPAND HAS EXACTLY ONE JOB (CLAUDE.md §2): the order's own lines, each
 * with its name, quantity and price — a fixed sub-table, not a second grid
 * engine. The reader who needs more opens the document.
 */
function ExpandedLines({ row }: { row: RegisterRow }) {
  const lines = row.o.order_lines ?? [];
  const addons = row.o.order_addons ?? [];
  if (lines.length === 0 && addons.length === 0) {
    return <div className="px-10 py-2 text-meta text-base-500">No items on this order</div>;
  }
  const money = (n: number) => (n > 0 ? <Money value={n} /> : "No price yet");
  return (
    <table className="text-body my-1 ml-10" data-testid="row-expansion">
      <thead>
        <tr className="text-label text-base-500">
          <th className="py-1 pr-6 text-left font-medium">Item</th>
          <th className="py-1 pr-6 text-right font-medium">Qty</th>
          <th className="py-1 pr-6 text-right font-medium">Unit price</th>
          <th className="py-1 pr-6 text-right font-medium">Total</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l, i) => (
          <tr key={`l-${i}`}>
            <td className="py-0.5 pr-6">{lineName(l)}</td>
            <td className="py-0.5 pr-6 text-right tabular-nums">{l.qty}</td>
            <td className="py-0.5 pr-6 text-right">{money(Number(l.unit_price ?? 0))}</td>
            <td className="py-0.5 pr-6 text-right">
              {money(Number(l.unit_price ?? 0) * Number(l.qty ?? 0))}
            </td>
          </tr>
        ))}
        {addons.map((a, i) => (
          <tr key={`a-${i}`}>
            <td className="py-0.5 pr-6">Add-on</td>
            <td className="py-0.5 pr-6 text-right tabular-nums">{a.qty}</td>
            <td className="py-0.5 pr-6 text-right">{money(Number(a.unit_price ?? 0))}</td>
            <td className="py-0.5 pr-6 text-right">
              {money(Number(a.unit_price ?? 0) * Number(a.qty ?? 0))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Print PDF — the SAME renderer output as the workspace's right pane
 * (`renderSalesOrderPdf`, DONE-WHEN's own clause). Data is assembled
 * server-side (`/sales-order-data`, RLS-scoped); the browser renders and
 * opens the blob. READ-ONLY: nothing is written anywhere.
 */
async function openSalesOrderPdf(orderId: string, so: number): Promise<void> {
  try {
    const data = await apiFetch<SalesOrderTemplateData>(
      `/api/orders/${orderId}/sales-order-data`,
    );
    const blob = await renderSalesOrderPdf(data);
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : String(e);
    toast.error(`Sales Order SO-${so} PDF failed: ${msg}`);
  }
}

export default function SalesOrdersRegister() {
  const navigate = useNavigate();
  const role = useAuth((s) => s.role);
  const [scope, setScope] = useState<"live" | "all">("live");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /* FIX 1 — SERVER SEARCH. The engine emits its debounced trimmed term and
     the SAME words go to the API (`?search=`), so a match beyond the loaded
     page is found on the server, not missed in the browser. The engine still
     filters the rows it holds for instant feedback; `keepPreviousData` in the
     query hook keeps the list on screen while the server answers. */
  const [serverSearch, setServerSearch] = useState("");

  const { data, isLoading, isError, error, refetch } = useOperationOrders(
    serverSearch ? { search: serverSearch } : {},
  );

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

  /* Role decides the FIRST PAINT only (money hidden for Operations, visible
     for Finance/Principal); the chooser opens every column either way.
     Memoized per role so the engine's memo actually hits; the layout store is
     per-role so one machine's Finance login does not restyle Operations'. */
  const columns = useMemo(
    () => REGISTER_FIELDS.map((f) => toGridColumn(f, role)),
    [role],
  );
  const storageKey = `carres.salesOrders.register.v1.${role ?? "anon"}`;

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

  /* ROW OPENS A FULL PAGE (closed ruling — the panel is superseded).
     Double-click and the menu's Open both land on the workspace VIEW route;
     Edit lands on the same route with `?edit=1`, which Stage 1's workspace
     reads as nothing (read-only stage) and Stage 2 wires to the form. */
  const openWorkspace = useCallback(
    (r: RegisterRow, edit?: boolean) =>
      navigate(`/operation/orders/so/${r.id}${edit ? "?edit=1" : ""}`),
    [navigate],
  );
  const onRowDoubleClick = useCallback((r: RegisterRow) => openWorkspace(r), [openWorkspace]);

  /* Right-click: Open · Edit · Print PDF · Copy SO No — nothing else (STAGE 1,
     verbatim). Every item is view-oriented; none writes. */
  const contextMenu = useCallback(
    (r: RegisterRow): DataGridContextMenuItem[] => [
      { label: "Open", onClick: () => openWorkspace(r) },
      { label: "Edit", onClick: () => openWorkspace(r, true) },
      { label: "Print PDF", onClick: () => void openSalesOrderPdf(r.id, r.so) },
      {
        label: "Copy SO No",
        onClick: () => {
          void navigator.clipboard
            .writeText(`SO-${r.so}`)
            .then(() => toast.success(`SO-${r.so} copied`))
            .catch(() => toast.error("Could not copy"));
        },
      },
    ],
    [openWorkspace],
  );

  const expandable = useMemo(
    () => ({ renderExpansion: (r: RegisterRow) => <ExpandedLines row={r} /> }),
    [],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModuleHeader
        testId="sales-orders-header"
        icon={ClipboardList}
        word="Sales Orders"
        docTitle="Sales Orders — Carres"
      />

      <div className="flex min-h-0 flex-1 flex-col" data-testid="register-column">
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
            columns={columns}
            storageKey={storageKey}
            rowKey={(r) => r.id}
            exportName="Sales Orders"
            searchPlaceholder="SO number, customer, phone or item…"
            isLoading={isLoading}
            emptyMessage={rows.length === 0 ? "No orders yet" : "No matching sales orders."}
            groupBanner={false}
            chooserGroupOrder={[
              "Document",
              "Customer",
              "Source",
              "Items",
              "Money",
              "Dates",
              "Delivery",
              "Operation",
            ]}
            onRowDoubleClick={onRowDoubleClick}
            onSearchChange={setServerSearch}
            contextMenu={contextMenu}
            expandable={expandable}
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
    </div>
  );
}
