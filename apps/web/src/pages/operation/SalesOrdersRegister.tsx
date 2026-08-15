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
import { accShort, lineClass, lineKind } from "@carres/shared";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  DataGrid,
  type DataGridColumn,
  type DataGridContextMenuItem,
} from "@/components/register/DataGrid";
import Money from "@/components/Money";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { renderCombinedSalesOrderPdf, renderDoPdf, renderSalesOrderPdf } from "@/lib/pdf/render";
import type { DoTemplateData, SalesOrderTemplateData } from "@/lib/pdf/types";
import { useOperationOrders, useSalesOrderExpansion } from "@/lib/queries";
import CancelSalesOrderDialog from "./CancelSalesOrderDialog";
import DestinationHeader from "./DestinationHeader";
import GoodsMiniTable, { categoryWord, type GoodsMiniLine } from "./components/GoodsMiniTable";
import { lineConfigBits } from "../dealer/new-order/special-addons-picker";
import { isRental, lineName, type MoneyState } from "./sales-order-facts";
import {
  deliveryDateToBeConfirmedGuidance,
  missingDeliveryDateGuidance,
} from "./sales-order-guidance";
import {
  buildRegisterRow,
  defaultOnFor,
  moneyText,
  MUTED_ABSENCES,
  REGISTER_FIELDS,
  type RegisterField,
  type RegisterRow,
} from "./sales-order-columns";

/**
 * ⭐ AN ABSENCE IS QUIETER THAN A FACT — owner ruling 2026-08-15 (Chai).
 *
 * `Not recorded` / `Not given` keep their words — a blank may never carry two
 * meanings — and lose their weight. A `PO No` column of eight absences and two
 * real documents used to read as ten facts; muted, the two documents are the
 * only things the eye lands on. Everything else prints exactly as before, so
 * this is presentation, not a second string.
 */
function absenceAware(text: string) {
  if (!MUTED_ABSENCES.has(text)) return text;
  return (
    <span className="text-kit-slate-9" data-absence="true">
      {text}
    </span>
  );
}

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
function toGridColumn(
  f: RegisterField,
  role: string | null,
  navigate: ReturnType<typeof useNavigate>,
): DataGridColumn<RegisterRow> {
  const base: DataGridColumn<RegisterRow> = {
    key: f.key,
    label: f.label,
    width: Math.round(parseFloat(f.width)),
    align: f.align,
    sortable: true,
    defaultHidden: !defaultOnFor(f, role),
    chooserGroup: f.group,
    accessor: (r) => absenceAware(f.text(r)),
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
    return {
      ...base,
      filterType: "numbering",
      accessor: (r) => (
        <button
          type="button"
          className="font-medium text-blue-700 underline-offset-2 hover:underline"
          onClick={(event) => {
            event.stopPropagation();
            navigate(`/operation/orders/so/${r.id}`);
          }}
        >
          SO-{r.so}
        </button>
      ),
    };
  }
  if (f.key === "po_number") {
    return {
      ...base,
      accessor: (r) =>
        r.poNumbers.length === 0 ? (
          absenceAware(f.text(r))
        ) : (
          <span className="inline-flex gap-1.5">
            {r.poNumbers.map((po) => (
              <button
                key={po}
                type="button"
                className="font-medium text-blue-700 underline-offset-2 hover:underline"
                onClick={(event) => {
                  event.stopPropagation();
                  navigate(`/operation/procurement?po=${encodeURIComponent(po)}`);
                }}
              >
                {po}
              </button>
            ))}
          </span>
        ),
    };
  }
  if (f.key === "do_number") {
    return {
      ...base,
      accessor: (r) =>
        r.o.do_number ? (
          <button
            type="button"
            className="font-medium text-blue-700 underline-offset-2 hover:underline"
            onClick={(event) => {
              event.stopPropagation();
              void openDeliveryOrderPdf(r.id, r.o.do_number!);
            }}
          >
            {r.o.do_number}
          </button>
        ) : (
          absenceAware(f.text(r))
        ),
    };
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
        </span>
      ),
      /* The digits ride the search so `0162389…` finds the row however the
         phone was punctuated. */
      searchValue: (r) => `${r.customer} ${r.phone} ${r.phoneDigits}`,
      filterValue: (r) => r.customer,
      exportValue: (r) => (r.phone ? `${r.customer} · ${r.phone}` : r.customer),
    };
  }
  if (f.key === "customer_delivery") {
    return {
      ...base,
      accessor: (r) => {
        if (r.customerDelivery) return f.text(r);
        /* THE 8 vs THE 3 — owner ruling 2026-08-15, docs/orders/MASTER.md.
           `delivery_date_tbd` already records that the customer WAS asked and
           answered *not yet*; the screen was discarding it and printing the
           same warning on all eleven. A customer who has answered is not work
           to do, so this reads as a plain fact: one line, no action clause and
           no amber — amber is reserved for the three nobody has asked. */
        if (r.o.delivery_date_tbd) {
          const tbd = deliveryDateToBeConfirmedGuidance({
            customer: r.customer,
            salesperson: r.o.salespersons?.name,
            phone: r.phone,
          });
          return (
            <span className="block min-w-0 truncate text-base-600" title={tbd.detail}>
              {tbd.fact}
            </span>
          );
        }
        const guidance = missingDeliveryDateGuidance({
          so: r.so,
          customer: r.customer,
          salesperson: r.o.salespersons?.name,
          phone: r.phone,
        });
        /* FACT first, then ONE clause that fits the governed 148px whole.
           Who must act, whose phone to call, what to ask and what to write
           down ride the hover (`guidance.detail`) and the Sales Order
           workspace panel — they are not cell-sized facts, and the expand
           has exactly one job (CLAUDE.md §2: the order's own goods).

           ⭐ 13 / 11 — owner ruling 2026-08-15. Line 1 keeps the governed body
           13 semibold; line 2 moves from `text-meta` (12) to `text-label` (11)
           at regular weight. One point of separation was not enough to read as
           a second RANK — the two lines looked like one wrapped sentence, and
           the whole point of the grammar is that the eye takes the fact first
           and the instruction second. the colour token is unchanged, and
           `text-base-600` measures 8.6:1 on the white row — so the quieter line
           stays well clear of the §5 lock's accessible contrast floor at the
           smaller size rather than being rescued by it. */
        return (
          <span className="block min-w-0" title={guidance.detail}>
            <span data-attention="warning" className="block truncate font-semibold text-kit-amber-11">
              {guidance.problem}
            </span>
            <span className="block truncate text-label font-normal text-base-600">
              {guidance.action}
            </span>
          </span>
        );
      },
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
 *
 * The BOX is `GoodsMiniTable`, written once and shared; this function's whole
 * job is turning one order into the strings that box prints. A truth register
 * passes no `selection`, so the ☑ column does not exist here (owner ruling
 * 2026-08-15: a register selects nothing).
 */
function ExpandedLines({ row }: { row: RegisterRow }) {
  const lines = row.o.order_lines ?? [];
  const addons = row.o.order_addons ?? [];
  const expansion = useSalesOrderExpansion(row.o.id);
  if (lines.length === 0 && addons.length === 0) {
    return <div className="px-2 py-2 text-body text-base-500">No items on this order</div>;
  }
  const categoryOf = (line: (typeof lines)[number]) => {
    const fromAttrs = typeof line.attrs?.category === "string" ? line.attrs.category : "";
    const fromSku = line.sku.includes(":") ? line.sku.split(":", 1)[0] : "";
    const classified = lineClass(line.sku);
    const classifiedLabel = classified === "acc" ? "Accessory" : classified === "unknown" ? "Other goods" : classified;
    return categoryWord(fromAttrs || fromSku || classifiedLabel);
  };
  const configOf = (line: (typeof lines)[number]) => {
    const attrs = line.attrs ?? {};
    const facts = lineConfigBits(attrs);
    // The register is an operational identification surface, not a raw attrs
    // inspector. Keep only governed, human-readable product facts here; sofa
    // builder coordinates/keys and pricing metadata remain with their owners.
    const operationalFacts: Record<string, string> = {
      size: "Size",
      firmness: "Firmness",
      colour: "Colour",
      fabric_code: "Fabric code",
      seat_height: "Seat height",
      sofa_height: "Sofa height",
      configuration: "Configuration",
      sofa_configuration: "Sofa configuration",
    };
    for (const [key, label] of Object.entries(operationalFacts)) {
      const value = attrs[key];
      if (value == null || value === "" || typeof value === "object") continue;
      facts.push(`${label}: ${String(value)}`);
    }
    return facts;
  };
  const factsByLine = new Map((expansion.data?.lines ?? []).map((l) => [l.lineId, l]));
  /* The goods lines, then the services — the same order the document prints. */
  const miniLines: GoodsMiniLine[] = [
    ...lines.map((line, index): GoodsMiniLine => {
      const fact = factsByLine.get(line.id ?? "");
      const detail = configOf(line);
      return {
        key: line.id ?? `${line.sku}-${index}`,
        testId: `expanded-good-${line.sku}`,
        category: categoryOf(line),
        unitIds: fact?.unitIds ?? [],
        unitAbsence: "Not allocated",
        /* A single destination prints its name alone; only a SPLIT earns the
           quantity, because `×1` on a one-route line is noise. */
        deliverTo: (fact?.deliverTo ?? []).map((d) =>
          (fact?.deliverTo.length ?? 0) > 1 ? `${d.name} ×${d.qty}` : d.name,
        ),
        deliverToAbsence: expansion.isLoading ? "Loading…" : "Not recorded",
        sku: line.sku,
        qty: line.qty,
        item: lineName(line),
        ...(detail.length ? { itemDetail: detail.join(" · ") } : {}),
        selectable: true,
      };
    }),
    /* A Service buys nothing from a factory and allocates no Unit — the
       dash is the shipped ruling here, not an invented `Not applicable`. */
    ...addons.map((addon, index): GoodsMiniLine => ({
      key: `addon-${index}`,
      category: "Service",
      unitIds: [],
      unitAbsence: "—",
      deliverTo: [],
      deliverToAbsence: "—",
      sku: addon.addon_key ?? "",
      qty: addon.qty,
      item: addon.addon_key?.replace(/[_-]+/g, " ") ?? "Add-on",
      selectable: false,
    })),
  ];
  return (
    <div data-testid="row-expansion">
      <GoodsMiniTable label={`Goods on SO-${row.o.so}`} lines={miniLines} />
    </div>
  );
}

/**
 * Print PDF — the SAME renderer output as the workspace's right pane
 * (`renderSalesOrderPdf`, DONE-WHEN's own clause). Data is assembled
 * server-side (`/sales-order-data`, RLS-scoped); the browser renders and
 * opens the blob. READ-ONLY: nothing is written anywhere.
 */
/**
 * The batch behind `Print N sales orders` — the 2990 shape, in Carres terms:
 * the operator ticks rows and gets the REAL documents, not a picture of the
 * list. Each order's data is assembled server-side under RLS exactly as the
 * single-order print does, so a row the user may not read cannot enter the
 * file; the browser then renders one PDF carrying one governed page per order.
 * READ-ONLY.
 */
async function printSalesOrders(rows: Array<{ id: string; so: number }>): Promise<void> {
  if (rows.length === 0) return;
  try {
    const bundles: SalesOrderTemplateData[] = [];
    for (const r of rows) {
      bundles.push(
        await apiFetch<SalesOrderTemplateData>(`/api/orders/${r.id}/sales-order-data`),
      );
    }
    const blob = await renderCombinedSalesOrderPdf(bundles);
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    const message = error instanceof ApiError ? error.message : String(error);
    toast.error(`Printing ${rows.length} sales orders failed: ${message}`);
  }
}

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

async function openDeliveryOrderPdf(orderId: string, doNumber: string): Promise<void> {
  try {
    const data = await apiFetch<DoTemplateData>(
      `/api/operation/orders/${orderId}/print-do-data`,
    );
    const blob = await renderDoPdf(data);
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    const message = error instanceof ApiError ? error.message : String(error);
    toast.error(`Delivery Order ${doNumber} PDF failed: ${message}`);
  }
}

export default function SalesOrdersRegister() {
  const navigate = useNavigate();
  const role = useAuth((s) => s.role);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /* FIX 1 — SERVER SEARCH. The engine emits its debounced trimmed term and
     the SAME words go to the API (`?search=`), so a match beyond the loaded
     page is found on the server, not missed in the browser. The engine still
     filters the rows it holds for instant feedback; `keepPreviousData` in the
     query hook keeps the list on screen while the server answers. */
  const [serverSearch, setServerSearch] = useState("");
  /* The register still writes nothing itself. `Cancel SO` opens the ONE
     governed cancellation door and that door owns the act — the row is only
     naming which Sales Order the dialog is about. */
  const [cancelTarget, setCancelTarget] = useState<{ id: string; so: number } | null>(null);

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
    () => [...all].sort((a, b) => b.ordered.localeCompare(a.ordered)),
    [all],
  );

  /* Role decides the FIRST PAINT only (money hidden for Operations, visible
     for Finance/Principal); the chooser opens every column either way.
     Memoized per role so the engine's memo actually hits; the layout store is
     per-role so one machine's Finance login does not restyle Operations'. */
  const columns = useMemo(
    () => REGISTER_FIELDS.map((f) => toGridColumn(f, role, navigate)),
    [navigate, role],
  );
  /* The version resets a SUPERSEDED default. v2 dropped Stage A's nine
     columns; v3 is the owner's eight (2026-08-15) — without the bump a
     returning browser would replay its saved seven-column order and the
     re-ruled default would never paint on the one machine that matters. */
  const storageKey = `carres.salesOrders.register.v3.${role ?? "anon"}`;

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

  /* Right-click document actions. Copy opens the authoritative create form as
     a draft; the register still writes nothing. */
  const contextMenu = useCallback(
    (r: RegisterRow): DataGridContextMenuItem[] => [
      { label: "View", onClick: () => openWorkspace(r) },
      { label: "Edit", onClick: () => openWorkspace(r, true) },
      { label: "Preview PDF", onClick: () => void openSalesOrderPdf(r.id, r.so) },
      { label: "Print PDF", onClick: () => void openSalesOrderPdf(r.id, r.so) },
      {
        label: "Copy to new Sales Order",
        onClick: () => navigate(`/operation/orders/so/new?copyFrom=${r.id}`),
      },
      /* The MASTER's locked menu ends with the one destructive entry, alone
         below a divider so it is never reached by a slipped click. */
      { divider: true },
      {
        label: "Cancel SO",
        danger: true,
        onClick: () => setCancelTarget({ id: r.id, so: r.so }),
      },
    ],
    [navigate, openWorkspace],
  );

  const expandable = useMemo(
    () => ({ renderExpansion: (r: RegisterRow) => <ExpandedLines row={r} /> }),
    [],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DestinationHeader />

      {cancelTarget && (
        <CancelSalesOrderDialog
          orderId={cancelTarget.id}
          so={cancelTarget.so}
          open
          onOpenChange={(next) => {
            if (!next) setCancelTarget(null);
          }}
          onCancelled={() => {
            setCancelTarget(null);
            void refetch();
          }}
        />
      )}

      {/* 8px outer frame gap — REGISTER STATUS FOOTER law, docs/ui/MASTER.md. */}
      <div className="flex min-h-0 flex-1 flex-col p-2" data-testid="register-column">
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
            /* The search box is a governed 200px at EVERY width (REGISTER LAW
               2), so the old four-item placeholder clipped to `SO number,
               custome…` on a narrow window and on a wide one alike — it was
               never a breakpoint problem. A placeholder that fits is the fix;
               the search itself still matches SO number, customer, phone and
               item, and the ▽ per-column filters say so column by column. */
            searchPlaceholder="Search sales orders…"
            isLoading={isLoading}
            emptyMessage={rows.length === 0 ? "No orders yet" : "No matching sales orders."}
            groupBanner={false}
            /* Optional columns may widen the sheet (MASTER §0.1), so the row's
               identity pins: ☐ · ▸ · SO No stay against the left edge while
               the rest scrolls under them. An engine capability, never a
               page-local hack (`docs/ui/MASTER.md` §4). */
            stickyIdentity
            chooserGroupOrder={[
              "Document",
              "Customer",
              "Sales ownership",
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
            outputActions={[{ label: "Print", onClick: () => window.print() }]}
            selectionActions={[
              {
                label: (n) => `Print ${n} sales order${n === 1 ? "" : "s"}`,
                onClick: (picked) => {
                  void printSalesOrders(picked as unknown as RegisterRow[]);
                },
              },
            ]}
            toolbarStart={
              <button
                type="button"
                data-testid="new-sales-order"
                onClick={() => navigate("/operation/orders/so/new")}
                className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-kit-blue-9 px-3 text-meta font-semibold text-white hover:opacity-90"
              >
                <Plus size={14} strokeWidth={2.25} /> New Sales Order
              </button>
            }
            statusSummary={(filtered, selectedRows) => (
              <RegisterResultSummary
                filtered={filtered}
                selected={selectedRows}
                total={rows.length}
              />
            )}
          />
        )}
      </div>
    </div>
  );
}

/**
 * ⭐ THE FOOTER SPEAKS THE DICTIONARY, AND IT COUNTS EVERYTHING IT SEES.
 *
 * Owner ruling 2026-08-15: no unruled abbreviation may print here. The old
 * shape had TWO defects and only one of them was the abbreviation:
 *
 * · `accShort`'s fallback capitalises the SKU's first word, so a line nothing
 *   recognised could print a supplier's code — `M.P`, `Leg`, `Mp001`. The
 *   words below are the ONLY ones that reach the screen, so an unruled string
 *   is now impossible by construction rather than by luck.
 * · the previous ORDER array was ALSO the filter, so any label outside it was
 *   silently DROPPED — a `Disposal` line and every unrecognised accessory
 *   vanished from a tally that claims to describe the filtered result. A
 *   footer that under-counts is worse than one that abbreviates: it is a
 *   number the operator trusts and cannot reproduce.
 *
 * Anything not positively recognised is `Other goods` — governed, honest, and
 * still counted.
 */
const FOOTER_WORDS = [
  "Mattress",
  "Bedframe",
  "Sofa",
  "Pillow",
  "Mattress protector",
  "Topper",
  "Footrest",
  "Service",
  "Other goods",
] as const;

function footerWord(sku: string): (typeof FOOTER_WORDS)[number] {
  if (lineKind(sku) === "service") return "Service";
  const cls = lineClass(sku);
  if (cls === "mattress") return "Mattress";
  if (cls === "bedframe") return "Bedframe";
  if (cls === "sofa") return "Sofa";
  const short = accShort(sku);
  return (FOOTER_WORDS as readonly string[]).includes(short)
    ? (short as (typeof FOOTER_WORDS)[number])
    : "Other goods";
}

function RegisterResultSummary({
  filtered,
  selected,
  total,
}: {
  filtered: RegisterRow[];
  selected: RegisterRow[];
  total: number;
}) {
  const scope = selected.length > 0 ? selected : filtered;
  const counts = new Map<string, number>();
  for (const row of scope) {
    for (const line of row.o.order_lines ?? []) {
      counts.set(footerWord(line.sku), (counts.get(footerWord(line.sku)) ?? 0) + Number(line.qty || 0));
    }
    for (const addon of row.o.order_addons ?? []) {
      counts.set("Service", (counts.get("Service") ?? 0) + Number(addon.qty || 0));
    }
  }
  const orderWord = scope.length === 1 ? "order" : "orders";
  const countWord = selected.length > 0
    ? `${selected.length} selected ${orderWord}`
    : filtered.length === total
      ? `${filtered.length} ${orderWord}`
      : `${filtered.length} of ${total} orders`;
  const parts = FOOTER_WORDS.filter((label) => (counts.get(label) ?? 0) > 0).map(
    (label) => `${label} ${counts.get(label)}`,
  );
  /* One unwrapped line by law (REGISTER STATUS FOOTER), so a long tally on a
     narrow window truncates instead of pushing a second row into the frame —
     and the full sentence rides the title. */
  const line = [countWord, ...parts].join(" · ");
  return <span className="block truncate" title={line}>{line}</span>;
}
