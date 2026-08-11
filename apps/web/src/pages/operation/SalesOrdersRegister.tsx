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
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  DataGrid,
  type DataGridColumn,
  type DataGridContextMenuItem,
  type DataGridViewMatrix,
} from "@/components/register/DataGrid";
import Select from "@/components/kit/Select";
import Money from "@/components/Money";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { renderRegisterListPdf, renderSalesOrderPdf } from "@/lib/pdf/render";
import type { SalesOrderTemplateData } from "@/lib/pdf/types";
import { useOperationOrders } from "@/lib/queries";
import DestinationHeader from "./DestinationHeader";
import {
  isDelivered,
  isRental,
  lineName,
  onPoOf,
  promiseBroken,
  type MoneyState,
} from "./sales-order-facts";
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
 *   · `Promised` keeps its words and changes only its TONE when the promise
 *     is broken — see `promiseBroken`. `text` still prints the date, the ▽
 *     still filters on it, the sort still compares it, Export still writes
 *     it. Colour is doing its `status` job (§2.2), not spelling a state.
 */
function toGridColumn(
  f: RegisterField,
  role: string | null,
  today: string,
): DataGridColumn<RegisterRow> {
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
  if (f.key === "promised") {
    return {
      ...base,
      accessor: (r) =>
        promiseBroken(r.o, today) ? (
          <span className="text-danger" title="The promised day has passed and the goods have not gone">
            {f.text(r)}
          </span>
        ) : (
          f.text(r)
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
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AMENDMENT 2026-08-11 — THE ONE JOB IS UNCHANGED; IT IS DONE PROPERLY.
 *
 * The expansion answered *"what did they buy"* and stopped. The register's own
 * question has always had a second half — **and is it bought?** — and the
 * answer was already on this wire and had ZERO readers:
 *
 * ```
 * On PO   D1's `po_skus` (the SKUs a REAL purchase order covers) and the
 *         line's own `source_po`. `On PO` is the DICTIONARY's word for
 *         exactly this fact (COPY-STANDARD, card T3 2026-08-06); `PO issued`
 *         is the string `currentOf` already ships in this very file. NOTHING
 *         WAS MINTED, and no business status was invented.
 * the SKU rides the hover — §6.4 ruling ③, which the parent row honours and
 *         the expansion never did. `Jager · King` is the word; `M1401F-K` is
 *         the code the printed order carries, and now the hover carries it too.
 * ```
 *
 * **This does NOT duplicate the Workspace and it does not become My Work.**
 * It states a fact about a line. What to DO when a line is not on a PO is
 * Purchasing's, through Work (SO V2 Cards 9/10) — no verb reaches this table.
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
          <th className="py-1 pr-6 text-left font-medium">On PO</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l, i) => {
          const name = lineName(l);
          return (
            <tr key={`l-${i}`}>
              {/* The SKU rides the hover — and only when it is a DIFFERENT
                  string, so an AutoCount line (whose "sku" IS the name the
                  salesperson typed) never gets a tooltip repeating itself. */}
              <td className="py-0.5 pr-6" title={name === l.sku ? undefined : l.sku}>
                {name}
              </td>
              <td className="py-0.5 pr-6 text-right tabular-nums">{l.qty}</td>
              <td className="py-0.5 pr-6 text-right">{money(Number(l.unit_price ?? 0))}</td>
              <td className="py-0.5 pr-6 text-right">
                {money(Number(l.unit_price ?? 0) * Number(l.qty ?? 0))}
              </td>
              <td className="py-0.5 pr-6 text-base-700">{onPoOf(row.o, l)}</td>
            </tr>
          );
        })}
        {addons.map((a, i) => (
          <tr key={`a-${i}`}>
            <td className="py-0.5 pr-6">Add-on</td>
            <td className="py-0.5 pr-6 text-right tabular-nums">{a.qty}</td>
            <td className="py-0.5 pr-6 text-right">{money(Number(a.unit_price ?? 0))}</td>
            <td className="py-0.5 pr-6 text-right">
              {money(Number(a.unit_price ?? 0) * Number(a.qty ?? 0))}
            </td>
            {/* An add-on is not a catalogued SKU, so no purchase order can
                cover it. The cell is blank because nothing proves one does —
                the same one meaning the line cells carry. */}
            <td className="py-0.5 pr-6" />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Preview / Print — the SAME renderer output as the workspace's right pane
 * (`renderSalesOrderPdf`, DONE-WHEN's own clause). Data is assembled
 * server-side (`/sales-order-data`, RLS-scoped); the browser renders and
 * opens the blob. READ-ONLY: nothing is written anywhere.
 *
 * `Preview` opens the document. `Print` opens the SAME document and asks the
 * browser to print it — one renderer, two verbs, never a second layout
 * (Law D applied to paper: a printed order and a previewed one may not be
 * two arithmetics of the same page).
 */
async function openSalesOrderPdf(
  orderId: string,
  so: number,
  mode: "preview" | "print" = "preview",
): Promise<void> {
  try {
    const data = await apiFetch<SalesOrderTemplateData>(
      `/api/orders/${orderId}/sales-order-data`,
    );
    const blob = await renderSalesOrderPdf(data);
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (mode === "print" && w) {
      /* The blob is a PDF in a new tab; ask for the print dialog once it has
         painted. A blocked pop-up leaves the operator with the document and
         no dialog, which is a degraded print, never a wrong one. */
      w.addEventListener("load", () => w.print(), { once: true });
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : String(e);
    toast.error(`Sales Order SO-${so} PDF failed: ${msg}`);
  }
}

/**
 * ⛔ THE APPROVED-BUT-UNBUILT ENTRIES — owner ruling 2026-08-11, verbatim:
 * *"只保留已批准入口；未完成的入口可使用明确的受控占位/feature gate，不得虚构
 * 业务数据."*
 *
 * Each of these is a RULED entry in the ruled order, and each is gated
 * because the SO V2 door behind it does not exist yet:
 *
 * ```
 * View Flow                the route and its engine are explicitly out of
 *                          scope in the same ruling
 * Issue Delivery Order     the act lives on the LEGACY Old Orders drawer;
 *                          the Sales Order Workspace has no approved door,
 *                          and a register may not grow one (REGISTER LAW +
 *                          ERP-ARCHITECTURE Law C: a door, never a duplicate)
 * Copy to new Sales Order  no copy-from engine exists on any surface
 * Cancel SO                `POST /api/orders/:id/cancel` exists, but only the
 *                          OWNING workspace may execute it. Firing a cancel
 *                          from a register would be exactly D2 — one module
 *                          writing another's record — so this waits for the
 *                          workspace's door, not for an API
 * ```
 *
 * **The gate is the honest state, not a placeholder for a demo.** Nothing
 * here fabricates a status, a number or a document.
 */
const NOT_BUILT = "Not available yet";

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
  /* One clock read per mount, so every row on the sheet judges its promise
     against the SAME day — a per-cell `new Date()` would let a paint that
     straddles midnight tone two rows differently. */
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const columns = useMemo(
    () => REGISTER_FIELDS.map((f) => toGridColumn(f, role, today)),
    [role, today],
  );
  /* ⚠️ v1 → v2, AND THE BUMP IS THE AMENDMENT, NOT HOUSEKEEPING.
     The engine persists `hidden` under this key (DataGrid: `{ order, hidden,
     widths, groupBy, sort }`). Every operator who has ever opened this
     register carries a saved row, so a change to the DEFAULT row reaches
     exactly nobody until the key moves — the amendment would have been true
     in the catalog and invisible on every real screen.
     THE COST, stated rather than hidden: one-time, each operator's own
     resizes and reorders reset. §6.5 preserved "the existing storage key" to
     protect that memory; a default-row change is the one edit that cannot
     honour it and still exist. */
  const storageKey = `carres.salesOrders.register.v2.${role ?? "anon"}`;

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

  /* ⭐ THE ROW MENU — owner ruling 2026-08-11, "严格使用以下项目和顺序".
     Nine entries, this order, no additions and no re-ordering:

       Edit · View · Preview · Print
       ─────
       Issue Delivery Order · Copy to new Sales Order
       ─────
       Cancel SO

     The first four are LIVE. The last three are ruled entries whose SO V2
     doors are not built, so they render visible and inert (see NOT_BUILT). */
  const contextMenu = useCallback(
    (r: RegisterRow): DataGridContextMenuItem[] => [
      { label: "Edit", onClick: () => openWorkspace(r, true) },
      { label: "View", onClick: () => openWorkspace(r) },
      { label: "Preview", onClick: () => void openSalesOrderPdf(r.id, r.so, "preview") },
      { label: "Print", onClick: () => void openSalesOrderPdf(r.id, r.so, "print") },
      { divider: true },
      { label: "Issue Delivery Order", disabled: true, note: NOT_BUILT },
      { label: "Copy to new Sales Order", disabled: true, note: NOT_BUILT },
      { divider: true },
      { label: "Cancel SO", danger: true, disabled: true, note: NOT_BUILT },
    ],
    [openWorkspace],
  );

  const expandable = useMemo(
    () => ({ renderExpansion: (r: RegisterRow) => <ExpandedLines row={r} /> }),
    [],
  );

  /* ── THE WORK TOOLBAR — owner ruling 2026-08-11 ──────────────────────────
     Normal    View · Search · Export ▾ · Columns · + New Sales Order · …
     Selected  1 selected · Clear │ View Flow · Export Excel (1) · Export PDF (1)
               N selected · Clear │ Export Excel (N) · Export PDF (N)          */

  const scopeWord = scope === "live" ? "Not delivered" : "All orders";

  /** The list PDF, from the grid's OWN resolved view — never a second read of
   *  the data (Law D). `Print` renders the same document and prints it. */
  const openListPdf = useCallback(
    async (view: DataGridViewMatrix, count: number, print: boolean, label: string) => {
      if (count === 0) {
        toast.error("No rows to export");
        return;
      }
      try {
        const blob = await renderRegisterListPdf({
          title: "Sales Orders",
          subtitle: `${label} · ${count} ${count === 1 ? "order" : "orders"}`,
          headers: view.headers,
          rows: view.rows,
          rightAlign: view.rightAlign,
          printedAt: new Date().toLocaleString("en-GB", {
            day: "numeric", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit",
          }),
        });
        const url = URL.createObjectURL(blob);
        const w = window.open(url, "_blank");
        if (print && w) w.addEventListener("load", () => w.print(), { once: true });
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } catch (e) {
        toast.error(`Sales Orders PDF failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [],
  );

  /* `Export ▾` — Excel · PDF · Print, all three over the CURRENT VIEW.
     Excel keeps the engine's own writer (`__excel__` is its reserved key);
     PDF and Print share one renderer and differ by one boolean. */
  const exportMenu = useMemo(
    () => [
      { label: "Excel", excel: true },
      {
        label: "PDF",
        onSelect: (rows: RegisterRow[], v: DataGridViewMatrix) =>
          void openListPdf(v, rows.length, false, scopeWord),
      },
      {
        label: "Print",
        onSelect: (rows: RegisterRow[], v: DataGridViewMatrix) =>
          void openListPdf(v, rows.length, true, scopeWord),
      },
    ],
    [openListPdf, scopeWord],
  );

  /* `…` — the overflow. `Scan Order` is a RULED entry with no engine behind
     it on any surface, so it is visible and gated (see NOT_BUILT). The
     engine puts its own `Filter a column` door above these. */
  const overflowMenu = useMemo(
    () => [{ label: "Scan Order", onSelect: () => {}, disabled: true, disabledReason: NOT_BUILT }],
    [],
  );

  /* `View Flow` — ruled to appear at EXACTLY ONE selected row, and ruled OUT
     of scope in the same breath ("不要实施尚未解决的 View Flow route/business
     engine"). It is therefore an approved, visible, inert entry. */
  const selectionActions = useCallback(
    (sel: RegisterRow[]) =>
      sel.length === 1 ? (
        <button
          type="button"
          data-testid="view-flow"
          disabled
          title={NOT_BUILT}
          className="inline-flex h-7 shrink-0 cursor-default items-center gap-1.5 rounded-control border border-base-200 bg-white px-2.5 text-meta font-medium text-base-400"
        >
          View Flow
        </button>
      ) : null,
    [],
  );

  const selectionExports = useMemo(
    () => [
      { label: (n: number) => `Export Excel (${n})`, excel: true },
      {
        label: (n: number) => `Export PDF (${n})`,
        onSelect: (rows: RegisterRow[], v: DataGridViewMatrix) =>
          void openListPdf(v, rows.length, false, `${rows.length} selected`),
      },
    ],
    [openListPdf],
  );

  /* THE FOOTER STATES THE TRUE TOTAL OF WHAT THIS VIEW HOLDS — and says so in
     the register's own words, never a bare "N of M". */
  const footerSummary = useCallback(
    (viewRows: RegisterRow[], allRows: RegisterRow[]) =>
      viewRows.length === allRows.length
        ? `${allRows.length} ${allRows.length === 1 ? "order" : "orders"} · ${scopeWord}`
        : `${viewRows.length} of ${allRows.length} orders · ${scopeWord}`,
    [scopeWord],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DestinationHeader />

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
            appearance="reference"
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
            exportMenu={exportMenu}
            overflowMenu={overflowMenu}
            selectionActions={selectionActions}
            selectionExports={selectionExports}
            footerSummary={footerSummary}
            toolbarStart={
              /* `View` — the register's POPULATION, and the ruled first
                 control on the Work Toolbar. The engine's Search and header
                 ▽s narrow WITHIN whatever this chooses; it is not a filter. */
              <span className="flex shrink-0 items-center gap-1.5">
                <span className="text-label uppercase tracking-[0.05em] text-base-500">View</span>
                <span className="w-36">
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
              </span>
            }
            toolbarEnd={
              /* STAGE 2 — the office birth door. Everyone who can open this
                 page (operation / principal) may use it; normal orders are
                 still born in the Sales Portal. */
              <button
                type="button"
                data-testid="new-sales-order"
                onClick={() => navigate("/operation/orders/so/new")}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-control bg-base-900 px-3 text-meta font-semibold text-white hover:bg-base-700"
              >
                <Plus size={14} strokeWidth={2.25} /> New Sales Order
              </button>
            }
          />
        )}
      </div>
    </div>
  );
}
