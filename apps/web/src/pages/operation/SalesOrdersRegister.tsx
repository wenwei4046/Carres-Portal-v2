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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GOODS_CATEGORY_WORDS, goodsCategoryWordOf } from "@carres/shared";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  DataGrid,
  type DataGridColumn,
  type DataGridContextMenuItem,
} from "@/components/register/DataGrid";
import Money from "@/components/Money";
import Button from "@/components/kit/Button";
import EmptyState from "@/components/kit/EmptyState";
import Popover from "@/components/kit/Popover";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { renderCombinedSalesOrderPdf, renderSalesOrderPdf } from "@/lib/pdf/render";
import type { SalesOrderTemplateData } from "@/lib/pdf/types";
import {
  useCatalog,
  useOperationOrders,
  useSalesOrderExpansion,
} from "@/lib/queries";
import CancelSalesOrderDialog from "./CancelSalesOrderDialog";
import DestinationHeader from "./DestinationHeader";
import ConnectedSections, { CONNECT_AT_TABLE_HEADER } from "./components/ConnectedSections";
import GoodsMiniTable, { UnitEvidence, goodsCategoryOf, type GoodsMiniLine } from "./components/GoodsMiniTable";
import { lineConfigBits } from "../dealer/new-order/special-addons-picker";
import { isRental, lineName, type MoneyState } from "./sales-order-facts";
import {
  buildRegisterRow,
  defaultOnFor,
  moneyText,
  MUTED_ABSENCES,
  NO_DO_YET,
  NO_PO_YET,
  NOT_IN_CATALOG,
  REGISTER_FIELDS,
  type RegisterField,
  type RegisterRow,
} from "./sales-order-columns";

/**
 * The two long headers print on the shared two-line header (UI MASTER §6.8),
 * split exactly as SO Batch Purchase splits the same words. The label stays
 * the column's accessible, filter and export name.
 */
const HEADER_LINES: Partial<Record<string, readonly [string, string]>> = {
  customer_delivery: ["Customer Requested", "Delivery Date"],
  delivery_location: ["Customer Delivery", "Location"],
};

/** The free-text defaults that may be longer than their registry width. */
const ONE_LINE_TEXT = new Set(["sales_location", "salesperson", "delivery_location", "items"]);

/**
 * ⭐ AN ABSENCE IS QUIETER THAN A FACT — owner ruling 2026-08-15 (Chai),
 * and it stays READABLE — Listing Standard 2026-09-16: `slate-11`, never the
 * disabled `slate-9` grey (3.3:1 on white, below the 4.5:1 text floor).
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
    <span className="text-kit-slate-11" data-absence="true">
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
    headerLines: HEADER_LINES[f.key],
    /* The shared registry number, carried by the catalog (UI MASTER §6.8). */
    width: f.width,
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
          className="font-medium text-kit-blue-11 underline-offset-2 hover:underline"
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
          absenceAware(NO_PO_YET)
        ) : r.poNumbers.length === 1 ? (
          <button type="button" className="font-medium text-kit-blue-11 underline-offset-2 hover:underline" onClick={(event) => {
            event.stopPropagation();
            navigate(`/operation/procurement?po=${encodeURIComponent(r.poNumbers[0]!)}`);
          }}>{r.poNumbers[0]}</button>
        ) : (
          <Popover label="Purchase Orders" trigger={<Button variant="ghost" size="sm">{r.poNumbers.length} Purchase Orders</Button>}>
          <div className="flex flex-col gap-2">
            {r.poNumbers.map((po) => (
              <button
                key={po}
                type="button"
                className="font-medium text-kit-blue-11 underline-offset-2 hover:underline"
                onClick={(event) => {
                  event.stopPropagation();
                  navigate(`/operation/procurement?po=${encodeURIComponent(po)}`);
                }}
              >
                {po}
              </button>
            ))}
          </div>
          </Popover>
        ),
    };
  }
  if (f.key === "do_number") {
    return {
      ...base,
      /* The SO-to-DO relationship comes from the Delivery document ledger,
         never the one-number mirror on `orders`. One document opens its
         object; many open Delivery's register filtered to this SO. */
      accessor: (r) => {
        if (r.deliveryOrders.length === 0) {
          return absenceAware(NO_DO_YET);
        }
        if (r.deliveryOrders.length === 1) {
          const deliveryOrder = r.deliveryOrders[0]!;
          return (
            <button
              type="button"
              className="font-medium text-kit-blue-11 underline-offset-2 hover:underline"
              onClick={(event) => {
                event.stopPropagation();
                navigate(
                  `/operation/delivery-orders/${encodeURIComponent(deliveryOrder.do_number)}`,
                );
              }}
            >
              {deliveryOrder.do_number}
            </button>
          );
        }
        return (
          <button
            type="button"
            className="font-medium text-kit-blue-11 underline-offset-2 hover:underline"
            onClick={(event) => {
              event.stopPropagation();
              navigate(`/operation/delivery-orders?order=${encodeURIComponent(r.id)}`);
            }}
          >
            {r.deliveryOrders.length} Delivery Orders
          </button>
        );
      },
    };
  }
  if (f.key === "customer") {
    return {
      ...base,
      /* A cut name opens whole by click or keyboard (engine `overflowText`,
         Listing Standard 2026-09-16) — a hover title is not a way to read. */
      overflowText: (r) => r.customer,
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
  if (ONE_LINE_TEXT.has(f.key)) {
    /* ⭐ ONE LINE, 40px — owner ruling 2026-09-21. A value longer than its
       registry width ends in `…` and opens whole through the engine's
       `overflowText`; the row never grows and the column stays resizable. */
    return { ...base, overflowText: (r) => f.text(r) };
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
/** One SKU spelling for a catalog lookup — trimmed, case-folded. */
function skuKey(sku: string): string {
  return sku.trim().toUpperCase();
}

/**
 * SKU → the product's NAME and its recorded variant, from the one catalog
 * read (`useCatalog`). The expansion's `Item` and the Register's `Items`
 * both read it, so a product is named once and never by its code when the
 * catalog knows it (orders MASTER, 2026-09-21: `Cody` / `Super King`).
 */
function useCatalogNames(): Map<string, { name: string; variant: string }> {
  const catalogQ = useCatalog();
  return useMemo(() => {
    const modelName = new Map((catalogQ.data?.models ?? []).map((m) => [m.id, m.name]));
    const out = new Map<string, { name: string; variant: string }>();
    for (const sku of catalogQ.data?.skus ?? []) {
      const name = modelName.get(sku.modelId);
      if (name) out.set(skuKey(sku.sku), { name, variant: sku.variant });
    }
    return out;
  }, [catalogQ.data]);
}

/**
 * Whether the Register's own canvas is under 768px — the width below which
 * UI MASTER §6.7 rule 2 pins identity alone. Measured on the page's work
 * surface, not the window, because the shell's nav and rail take their share.
 */
function useNarrowCanvas(): [React.RefObject<HTMLDivElement>, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    /* The work surface's 8px padding each side is not grid canvas. */
    const measure = () => setNarrow(el.clientWidth > 0 && el.clientWidth - 16 < 768);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, narrow];
}

function ExpandedLines({ row }: { row: RegisterRow }) {
  const lines = row.o.order_lines ?? [];
  const addons = row.o.order_addons ?? [];
  const expansion = useSalesOrderExpansion(row.o.id);
  /* An add-on's HUMAN NAME comes from the catalog, never from its key. The
   * key is a storage identifier: `STAIR_CARRY` de-underscored reads
   * "STAIR CARRY", which is not a word anybody chose and not what the two
   * surfaces that already resolve it print (`SalesOrderWorkspace.tsx` and
   * `SalesOrderAddons.tsx`, both `addonNameByKey.get(key) ?? key`). One fact
   * may not be spelled two ways (Law D), so this reads the same map from the
   * same bundle they do. React Query dedupes by key, so expanding ten rows is
   * one catalog read, and `staleTime` keeps it off the wire on later opens. */
  const catalogQ = useCatalog();
  const addonNameByKey = useMemo(
    () => new Map((catalogQ.data?.addons ?? []).map((a) => [a.key, a.name])),
    [catalogQ.data],
  );
  const catalogNames = useCatalogNames();
  if (lines.length === 0 && addons.length === 0) {
    return <div className="px-2 py-2 text-body text-base-500">No items on this order</div>;
  }
  const configOf = (line: (typeof lines)[number]) => {
    const attrs = line.attrs ?? {};
    const facts = lineConfigBits(attrs).map((fact) => fact === "gap KIV" ? "Mattress gap: Confirm later" : fact);
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
  const unavailable = expansion.isError ? "Could not load goods details" : expansion.isLoading ? "Loading…" : null;
  /* The goods lines, then the services — the same order the document prints. */
  const miniLines: GoodsMiniLine[] = [
    ...lines.map((line, index): GoodsMiniLine => {
      const fact = factsByLine.get(line.id ?? "");
      /* ⭐ `Item` IS THE PRODUCT, NOT ITS CODE (owner ruling 2026-09-21): the
         catalog name on line one, the variant and the line's own recorded
         configuration on line two — `Cody` / `Super King`. SKU has its own
         column. A code the catalog does not know prints as itself. */
      const product = catalogNames.get(skuKey(line.sku));
      const variant = product?.variant ?? "";
      const detail = [
        ...(variant ? [variant] : []),
        ...configOf(line).filter((f) => f !== variant && !f.endsWith(`: ${variant}`)),
      ];
      return {
        key: line.id ?? `${line.sku}-${index}`,
        testId: `expanded-good-${line.sku}`,
        /* The shared ladder says `Other goods` for a line with no catalog row;
           this page prints the dictionary's `Not in catalog`, muted (owner
           ruling 2026-09-22). Other pages keep their own word. */
        ...(goodsCategoryOf(line) === "Other goods"
          ? { category: NOT_IN_CATALOG, categoryNode: absenceAware(NOT_IN_CATALOG) }
          : { category: goodsCategoryOf(line) }),
        unitIds: fact?.verifiedUnitIds ?? fact?.unitIds ?? [],
        unitNode: unavailable ? <span role={expansion.isError ? "alert" : "status"}>{unavailable}</span> : (
          <UnitEvidence singleLineCodes ids={fact?.verifiedUnitIds ?? fact?.unitIds ?? []} unverified={fact?.unverifiedUnitIds ?? []} mismatch={Boolean(fact?.unitQuantityMismatch)} />
        ),
        unitAbsence: "Not allocated",
        /* A single destination prints its name alone; only a SPLIT earns the
           quantity, because `×1` on a one-route line is noise. */
        deliverTo: (fact?.deliverTo ?? []).map((d) =>
          (fact?.deliverTo.length ?? 0) > 1 || d.qty !== line.qty ? `${d.name} ×${d.qty}` : d.name,
        ),
        deliverToNode: unavailable ? <span>{unavailable}</span> : undefined,
        /* Before any PO line there is no supplier destination yet. */
        deliverToAbsence: NO_PO_YET,
        sku: line.sku,
        qty: line.qty,
        item: product?.name ?? lineName(line),
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
      item: addon.addon_key
        ? (addonNameByKey.get(addon.addon_key) ?? addon.addon_key)
        : "Add-on",
      selectable: false,
    })),
  ];
  /* ⭐ THE PURCHASING REFERENCE GEOMETRY (UI MASTER §6.8–§6.9, owner ruling
     2026-09-21): the shared `ConnectedSections` draws the 1px line from under
     the SO row's caret to the goods table's bordered frame. One section, so
     the line ends at it and structurally cannot run into the next order. */
  return (
    <div data-testid="row-expansion">
      {expansion.isError && <Button variant="ghost" size="sm" onClick={() => void expansion.refetch()}>Retry</Button>}
      <ConnectedSections
        testId={`so-sections-${row.o.id}`}
        sections={[
          {
            key: "goods",
            connectAt: CONNECT_AT_TABLE_HEADER,
            node: <GoodsMiniTable label={`Goods on SO-${row.o.so}`} lines={miniLines} salesOrderLayout />,
          },
        ]}
      />
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

  /* ⭐ POPULATION — owner ruling 2026-09-21: only orders Sales has handed to
     Operation. A `Placed` order is not on this Register, so the server is
     asked for the `proceeded` stage and counts its total the same way. */
  const { data, isLoading, isError, refetch } = useOperationOrders(
    serverSearch ? { stage: "proceeded", search: serverSearch } : { stage: "proceeded" },
  );
  /* The product NAME behind a SKU — the same catalog read the expansion makes
     (React Query dedupes it), so `Items` prints `Cody + 1 more`, not a code. */
  const catalogNames = useCatalogNames();
  /* ▸ D4 · EACH ORDER CARRIES ITS OWN DELIVERY ORDERS NOW.
   *
   * This used to fetch the whole delivery REGISTER and group it by order id.
   * That route is `.order("issued_at", desc).limit(500)`, so an order whose DO
   * was not among the newest 500 grouped to `[]` — and the `DO No` cell reads
   * an empty array as the positive claim "No delivery order yet". A register
   * asserting absence from a read that was merely truncated is the shape
   * `claims-facet-counts-a-truncated-page` names in carry-forwards.md.
   *
   * The list read embeds `ops_delivery_orders(do_number)` per order, so there
   * is no cap to fall outside of — and the page makes one fewer network read
   * than it did. The SO-to-DO relationship still comes from the delivery
   * document ledger and never from `orders.do_number`, the one-number mirror
   * the `do_number` column's own comment forbids. */
  const all = useMemo<RegisterRow[]>(
    () =>
      (data?.orders ?? [])
        .filter((o) => !isRental(o))
        .map((o) =>
          buildRegisterRow(o, o.ops_delivery_orders ?? [], (sku) => catalogNames.get(skuKey(sku))?.name),
        ),
    [data, catalogNames],
  );

  /* The scope is the register's population; the engine's search and ▽s narrow
     WITHIN it. Newest first — the engine applies its own sort on top when a
     header is clicked. */
  const rows = useMemo(
    () => [...all].sort((a, b) => (b.proceeded ?? "").localeCompare(a.proceeded ?? "")),
    [all],
  );
  /* `{n} of {m}` — `m` is the SERVER's count of the Sales Orders this user may
     read (rentals excluded, search not applied), carried on every list answer,
     so a search answered before any unsearched load still has it and a created
     or cancelled order moves it on the next read. Unknown → `null` → no `of`. */
  const population = typeof data?.salesOrderTotal === "number" ? data.salesOrderTotal : null;

  /* Role decides the FIRST PAINT only (money hidden for Operations, visible
     for Finance/Principal); the chooser opens every column either way.
     Memoized per role so the engine's memo actually hits; the layout store is
     per-role so one machine's Finance login does not restyle Operations'. */
  const columns = useMemo(
    () => REGISTER_FIELDS.map((f) => toGridColumn(f, role, navigate)),
    [navigate, role],
  );
  /* The version resets a SUPERSEDED default. v2 dropped Stage A's nine
     columns; v3 was the owner's eight (2026-08-15); v4 (owner ruling
     2026-08-18) retires the duplicate `Promised` column and brings every
     saved layout back to the ruled eight — a browser that had hidden
     `DO No` or opened `Promised` would otherwise replay that layout
     forever on the one machine that matters. v5 (Jess 2026-09-17) puts
     `SO Date` before `SO No`; a v4 order saved identity-first is retired.
     v6 (Jess 2026-09-21) is the eleven-column composition led by Proceed
     Date · SO Doc Date · SO No, so no saved v5 order can resurrect the old one. */
  const storageKey = `carres.salesOrders.register.v6.${role ?? "anon"}`;
  /* Below a 768px canvas the three locked columns and the control gutter need
     ~400px, so SO No started off-screen at 390 and pinned only after a scroll.
     There SO No leads alone — on first paint — and the two dates follow it. */
  const [canvasRef, narrowCanvas] = useNarrowCanvas();

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
     ⛔ `?edit=1` IS RETIRED — owner ruling 2026-08-15. The object page has one
     state with its fields already editable, so there is no second URL to send
     the operator to: View and Edit are the same destination, and the menu keeps
     both words only because 2990's operators reach for both. */
  const openWorkspace = useCallback(
    (r: RegisterRow) => navigate(`/operation/orders/so/${r.id}`),
    [navigate],
  );
  const onRowDoubleClick = useCallback((r: RegisterRow) => openWorkspace(r), [openWorkspace]);

  /* Right-click document actions. Copy opens the authoritative create form as
     a draft; the register still writes nothing. */
  const contextMenu = useCallback(
    (r: RegisterRow): DataGridContextMenuItem[] => [
      { label: "View", onClick: () => openWorkspace(r) },
      { label: "Edit", onClick: () => openWorkspace(r) },
      /* ONE ACT, ONE NAME (YH, 2026-08-28). `Preview PDF` sat here calling
         `openSalesOrderPdf(r.id, r.so)` — byte-identical to the line below
         it. Two menu rows, one behaviour, so the reader was asked to choose
         between names that could not differ. The MASTER's locked menu had
         meant them as separate acts (a preview door and a document output);
         the implementation never built the first. Retiring the duplicate
         label loses no capability. If Carres later wants a real preview act,
         it is a BUILD, not a restoration of this line. */
      { label: "Print PDF", onClick: () => void openSalesOrderPdf(r.id, r.so) },
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
    () => ({
      /* The Purchasing reference (UI MASTER §6.8–§6.9): the expansion sits flush
         under its row and draws its own 1px connector to the goods frame. */
      flush: true,
      renderExpansion: (r: RegisterRow) => <ExpandedLines row={r} />,
    }),
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

      {/* 8px work-surface breathing room — REGISTER STATUS FOOTER law, docs/ui/MASTER.md. */}
      <div ref={canvasRef} className="flex min-h-0 flex-1 flex-col p-2" data-testid="register-column">
          <DataGrid<RegisterRow>
            appearance="reference"
            palette="slate"
            searchPresentation="responsive"
            labelledToolbar
            /* ONE kit error INSIDE the work surface: the toolbar — and New
               Sales Order with it — stays, because creating an order does not
               depend on the list loading. No raw transport message. */
            errorState={
              isError ? (
                <div role="alert">
                  <EmptyState
                    title="Sales orders could not be loaded"
                    action={
                      <Button variant="neutral" onClick={() => void refetch()}>
                        Try again
                      </Button>
                    }
                  />
                </div>
              ) : undefined
            }
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
            emptyMessage={rows.length === 0 && !serverSearch ? "No sales orders yet" : "No sales orders match these filters"}
            noMatchMessage="No sales orders match these filters"
            groupBanner={false}
            /* ⭐ The one-line listing row is 40px, adopted on this page only
               (ui MASTER §6.0 rule 5, owner ruling 2026-09-21). Text stays
               13/18 with 8px padding; the engine default (38px) is untouched. */
            rowHeight={40}
            /* ⭐ Proceed Date · SO Doc Date · SO No lead and cannot be hidden
               or moved (owner ruling 2026-09-21). At a canvas ≥768px the
               engine pins SO Doc Date · SO No and Proceed Date scrolls under
               them; below it SO No leads and pins alone, visible on first paint. */
            leadingColumns={
              narrowCanvas
                ? /* All three stay locked (cannot be hidden or moved); SO No
                     leads, and the engine pins it alone below 768px. */
                  { before: ["so", "proceeded"], date: "ordered", identity: "so" }
                : { before: ["proceeded"], date: "ordered", identity: "so" }
            }
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
              /* The kit primary control (32px, kit `add` glyph at the governed
                 stroke) — never a raw page-local capsule. */
              <Button
                variant="primary"
                size="md"
                icon="add"
                data-testid="new-sales-order"
                onClick={() => navigate("/operation/orders/so/new")}
              >
                New Sales Order
              </Button>
            }
            statusSummary={(filtered, selectedRows) => (
              <RegisterResultSummary
                filtered={filtered}
                selected={selectedRows}
                loaded={rows.length}
                searching={serverSearch !== ""}
                total={population}
              />
            )}
          />
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
 * Anything not positively recognised is `Other goods` in the shared ladder —
 * and this footer never prints it (owner ruling 2026-09-22): an unclassified
 * line is a catalogue data error, reported for correction.
 */
const FOOTER_WORDS = GOODS_CATEGORY_WORDS;

/**
 * ⭐ THE FOOTER READS THE SAME LADDER AS THE DOCUMENT (2026-08-24).
 *
 * Jess: "Other goods 44 — the number doesn't tally." It didn't, and the
 * arithmetic was never the problem: this classifier read the SKU TEXT ALONE
 * while the SO detail reads recorded `attrs.category`, then the catalog, then
 * the SKU. A product the document names `MATTRESS` counted here as
 * `Other goods`, so the footer's number could not be reproduced from the
 * open orders. Same ladder now, then the footer's own dictionary mapping —
 * the recognised accessory TYPE where one exists, the ruled word `Accessory`
 * where only the category is known, `Other goods` ONLY for a line neither the
 * order, the catalog, nor the classifier recognises. That word now means what
 * it says: genuinely unclassified goods — a data-quality fact, not a
 * classifier gap.
 *
 * A recorded category outside this footer's vocabulary (e.g. `guarantee`)
 * falls through to the SKU path unchanged — the footer prints ONLY the words
 * above, by construction, and inventing a new word here would be writing
 * dictionary. numbers are QUANTITIES (`line.qty`), not row counts — unchanged.
 */
/** The ladder itself moved to `@carres/shared` (2026-09-06) when the Receiving
 *  rail needed the same answer — one rule, two registers (Law D). */
const footerWord = goodsCategoryWordOf;

function RegisterResultSummary({
  filtered,
  selected,
  loaded,
  searching,
  total,
}: {
  filtered: RegisterRow[];
  selected: RegisterRow[];
  /** Every row the page holds before the engine's search and header filters. */
  loaded: number;
  /** A server search is narrowing the rows. */
  searching: boolean;
  /** The server's authoritative total; `null` when unknown. */
  total: number | null;
}) {
  const navigate = useNavigate();
  const scope = selected.length > 0 ? selected : filtered;
  const counts = new Map<string, number>();
  /* The lines behind `Not in catalog {n}` — what the click lists. */
  const uncatalogued: { id: string; so: number; sku: string; name: string; qty: number }[] = [];
  for (const row of scope) {
    for (const line of row.o.order_lines ?? []) {
      const word = footerWord(line);
      counts.set(word, (counts.get(word) ?? 0) + Number(line.qty || 0));
      if (word === "Other goods") {
        uncatalogued.push({ id: row.id, so: row.so, sku: line.sku, name: lineName(line), qty: Number(line.qty || 0) });
      }
    }
    for (const addon of row.o.order_addons ?? []) {
      counts.set("Service", (counts.get("Service") ?? 0) + Number(addon.qty || 0));
    }
  }
  /* Listing Standard 2026-09-16: the footer names the document —
     `{n} of {m} sales orders`, singular `1 sales order`. */
  const salesOrders = (n: number) => (n === 1 ? "sales order" : "sales orders");
  /* An unknown total prints the count alone — never a guessed `of`. */
  /* ⭐ `of` ONLY WHEN THE LIST IS NARROWED (card 12, 2026-09-21): a search, a
     header filter, or the server's row cap. Unfiltered it is the plain count. */
  const narrowed = searching || filtered.length < loaded || (total != null && loaded < total);
  const countWord = selected.length > 0
    ? `${selected.length} selected ${salesOrders(selected.length)}`
    : total == null || !narrowed
      ? `${filtered.length} ${salesOrders(filtered.length)}`
      : `${filtered.length} of ${total} ${salesOrders(total)}`;
  /* ⭐ OWNER RULING 2026-09-22 (COPY-STANDARD, SO category footer): `Qty:`
     names GOODS categories only. Services never enter it — they print apart
     as `Services {n}`. And there is no `Other goods`: a line the ladder
     cannot name is a catalogue data error, reported for correction, never
     printed to staff as a kind of goods. */
  const parts = FOOTER_WORDS.filter(
    (label) => label !== "Service" && label !== "Other goods" && (counts.get(label) ?? 0) > 0,
  ).map((label) => `${label} ${counts.get(label)}`);
  const services = counts.get("Service") ?? 0;
  /* ⭐ NEVER A SILENT UNDER-COUNT (owner ruling 2026-09-22, Jess): a goods
     line the ladder cannot name stays out of `Qty:` but is counted apart
     under the dictionary's `Not in catalog {n}` — {n} is the PHYSICAL
     QUANTITY, never an order or line count — and only when there is one.
     Clicking it lists SO No · original SKU · product name · qty. No typo is
     inferred and nothing is written to the catalogue. */
  const notInCatalog = counts.get("Other goods") ?? 0;
  /* One unwrapped line by law (REGISTER STATUS FOOTER), so a long tally on a
     narrow window truncates instead of pushing a second row into the frame —
     and the full sentence rides the title. */
  const head = [
    countWord,
    ...(parts.length ? [`Qty: ${parts.join(" · ")}`] : []),
    ...(services > 0 ? [`Services ${services}`] : []),
  ].join(" · ");
  const exception = `${NOT_IN_CATALOG} ${notInCatalog}`;
  const line = notInCatalog > 0 ? `${head} · ${exception}` : head;
  if (notInCatalog === 0) return <span className="block truncate" title={line}>{line}</span>;
  return (
    <span className="flex min-w-0 items-center" title={line}>
      <span className="min-w-0 truncate">{head} ·&nbsp;</span>
      <Popover
        label={NOT_IN_CATALOG}
        trigger={
          <button
            type="button"
            data-testid="footer-not-in-catalog"
            className="flex-none text-kit-blue-11 underline-offset-2 hover:underline"
          >
            {exception}
          </button>
        }
      >
        <table className="text-body" data-testid="not-in-catalog-list">
          <thead>
            <tr className="text-left text-label font-semibold text-kit-slate-11">
              <th className="px-2 py-1">SO No</th>
              <th className="px-2 py-1">SKU</th>
              <th className="px-2 py-1">Item</th>
              <th className="px-2 py-1 text-right">Qty</th>
            </tr>
          </thead>
          <tbody>
            {uncatalogued.map((u, i) => (
              <tr key={`${u.id}-${u.sku}-${i}`}>
                <td className="px-2 py-1">
                  <button
                    type="button"
                    className="text-kit-blue-11 underline-offset-2 hover:underline"
                    onClick={() => navigate(`/operation/orders/so/${u.id}`)}
                  >
                    SO-{u.so}
                  </button>
                </td>
                <td className="whitespace-nowrap px-2 py-1">{u.sku}</td>
                <td className="px-2 py-1">{u.name}</td>
                <td className="px-2 py-1 text-right tabular-nums">{u.qty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Popover>
    </span>
  );
}
