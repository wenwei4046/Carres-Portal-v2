import SalesOrderCompactView from "./components/SalesOrderCompactView";
import StatusPill from "@/components/kit/StatusPill";
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
 * ROW OPENS   click → the quick card; double-click → the WORKSPACE ROUTE, a
 *             full page. Right-click (one row menu, owner 2026-10-05):
 *             View · Print · ─ Cancel SO — Edit is reached through View,
 *             and nothing of Delivery's.
 * ROLES       Operations opens with money hidden (openable); Finance /
 *             Principal open with money visible. defaultHidden is NOT
 *             permission — a restricted fact is removed from the API
 *             response, never merely hidden here.
 * ```
 *
 * THE WHOLE POPULATION (SO A3-3, 2026-10-06): the list reads every permitted
 * order page by page (`useSalesOrderRegisterOrders`) and shows nothing until
 * the last page is in, so the rail summary, the footer, the groups, Cards and
 * Export all count the same complete list — never a 500-order sample.
 */
// design-standard: not-a-list-page — this page runs THE REGISTER ENGINE
// (components/register/DataGrid, 2990's grid copied per the standing COPY-2990
// ruling), full-bleed as SO-4 shipped it. The engine owns the toolbar, search,
// filters, chooser and footer; ListPageShell would wrap a second chrome
// around the one the engine already draws.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GOODS_CATEGORY_WORDS,
  MONTHLY_DEMAND_CATEGORIES,
  REGISTER_DELIVERY_CONDITIONS,
  goodsCategoryWordOf,
  registerDeliveryConditionOf,
  type RegisterDeliveryCondition,
  monthlyDemandOf,
  monthlyDemandCategoryOf,
  monthlyDemandWindowOf,
  type MonthlyDemandCategory,
  type MonthlyDemandRow,
} from "@carres/shared";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  DataGrid,
  type DataGridColumn,
  type DataGridContextMenuItem,
} from "@/components/register/DataGrid";
import { documentRowMenu } from "@/components/register/row-menu";
import Drawer from "@/components/kit/Drawer";
import Block from "@/components/kit/Block";
import Checkbox from "@/components/kit/Checkbox";
import { fmtDate } from "@/lib/fmt-date";
import Money from "@/components/Money";
import Button from "@/components/kit/Button";
import Tabs from "@/components/kit/Tabs";
import SalesOrderReadFailure from "./SalesOrderReadFailure";
import CancelSalesOrderDialog from "./CancelSalesOrderDialog";
import { printSalesOrdersOrSay } from "./record-print";
import Popover from "@/components/kit/Popover";
import { useAuth } from "@/lib/auth";
import { appTodayIso, fmtMonth } from "@/lib/fmt-date";
import {
  useCatalog,
  useMonthlyDemandFacts,
  useSalesOrderRegisterFacts,
  useSalesOrderRegisterOrders,
  useSalesOrderExpansion,
} from "@/lib/queries";
import DestinationHeader from "./DestinationHeader";
import ConnectedSections, { CONNECT_AT_TABLE_HEADER } from "./components/ConnectedSections";
import GoodsMiniTable, { UnitEvidence, goodsCategoryOf, type GoodsMiniLine } from "./components/GoodsMiniTable";
import {
  FILTER_RAIL_FLOAT_BELOW_PX,
  FilterRail,
  FilterRailGroup,
  FilterRailRow,
  FilterRailSelect,
  ShowFiltersButton,
  useFilterRailOpen,
} from "./components/workspace-rail";
import SalesOrderMonthlyDemand from "./SalesOrderMonthlyDemand";
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
  NOT_RECORDED,
  REGISTER_FIELDS,
  salesLocationOf,
  type RegisterField,
  type RegisterRow,
} from "./sales-order-columns";

/**
 * The two long headers print on the shared two-line header (UI MASTER §6.8),
 * split exactly as SO Batch Purchase splits the same words. The label stays
 * the column's accessible, filter and export name.
 */
const HEADER_LINES: Partial<Record<string, readonly [string, string]>> = {
  customer_delivery: ["Customer’s original", "requested delivery"],
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
  navigate: (path: string) => void,
  inspectGoods: (row: RegisterRow) => void,
  inspectOrder: (row: RegisterRow) => void,
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
    accessor: (r) => ["stock_status", "delivery_status", "payment_status"].includes(f.key)
      ? <StatusPill tone={salesOrderStatusTone(f.text(r))}>{f.text(r)}</StatusPill>
      : absenceAware(f.text(r)),
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
  if (f.key === "items") return { ...base, accessor: (row) => <GoodsSummary row={row} onOpen={inspectGoods} compact /> };
  if (f.key === "so") {
    return {
      ...base,
      filterType: "numbering",
      accessor: (r) => (
        <button
          type="button"
          className="font-medium text-kit-slate-12 underline-offset-2 hover:underline"
          onClick={(event) => {
            event.stopPropagation();
            inspectOrder(r);
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
          <Popover label="Purchase Orders" trigger={<Button variant="ghost" size="sm" onClick={event => event.stopPropagation()}>{r.poNumbers.length} Purchase Orders</Button>}>
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
  if (f.key === "receipt_no" || f.key === "invoice_no") {
    return { ...base, accessor: (r) => {
      const docs = f.key === "receipt_no"
        ? r.receipts?.map(p => ({ id: p.id, number: p.receipt_no, url: `/finance/payments?payment=${encodeURIComponent(p.id)}` }))
        : r.invoices?.map(i => ({ id: i.id, number: i.invoice_no, url: `/finance/monitor?invoice=${encodeURIComponent(i.id)}` }));
      if (docs === undefined) return absenceAware(f.text(r));
      const legacyInvoice = f.key === "invoice_no" && r.o.invoice_no && !docs.some(d => d.number === r.o.invoice_no) ? r.o.invoice_no : null;
      if (!docs.length) return absenceAware(legacyInvoice || f.text(r));
      const links = docs.map(d => d.number ? <button key={d.id} type="button" className="font-medium text-kit-blue-11 underline-offset-2 hover:underline" onClick={event => { event.stopPropagation(); navigate(d.url); }}>{d.number}</button> : <span key={d.id}>{NOT_RECORDED}</span>);
      if (docs.length === 1 && !legacyInvoice) return links[0];
      return <Popover label={f.label} trigger={<Button variant="ghost" size="sm" onClick={event => event.stopPropagation()}>{docs[0]?.number || NOT_RECORDED} +{docs.length - 1 + (legacyInvoice ? 1 : 0)}</Button>}><div className="flex flex-col gap-2">{links}{legacyInvoice && <span>{legacyInvoice}</span>}</div></Popover>;
    } };
  }
  if (f.key === "do_number") {
    return {
      ...base,
      /* The SO-to-DO relationship comes from the Delivery document ledger,
         never the one-number mirror on `orders`. One document opens its
         object; many expose every exact document door in a menu. */
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
        return <Popover label="Delivery Orders" trigger={<Button variant="ghost" size="sm" onClick={event => event.stopPropagation()}>{r.deliveryOrders.length} Delivery Orders</Button>}><div className="flex flex-col gap-2">{r.deliveryOrders.map(d => <button key={d.do_number} type="button" className="font-medium text-kit-blue-11 underline-offset-2 hover:underline" onClick={event => { event.stopPropagation(); navigate(`/operation/delivery-orders/${encodeURIComponent(d.do_number)}`); }}>{d.do_number}</button>)}</div></Popover>;
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
function useNarrowCanvas(): [(node: HTMLDivElement | null) => void, boolean] {
  /* A callback ref: the list's canvas is absent while Monthly demand shows,
     and must be measured when the operator returns to the Order list. */
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (!el || typeof ResizeObserver === "undefined") return;
    /* The work surface's 8px padding each side is not grid canvas. */
    const measure = () => setNarrow(el.clientWidth > 0 && el.clientWidth - 16 < 768);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return [setEl, narrow];
}

/**
 * ── THE RAIL AND ITS TWO VIEWS — owner rulings 2026-09-22 / 26 / 27 ─────────
 * (Orders MASTER, Monthly demand; COPY-STANDARD, Monthly demand words.)
 *
 * The chosen view and Monthly demand's filters live in the URL, so a link
 * reproduces what the operator saw. Monthly demand's filters are read only in
 * that view. Switching views clears them; an explicit month drill-down preserves its contributing scope.
 */
const MONTHLY_PARAMS = ["start", "months", "dealer", "state", "city", "category"] as const;
/* The Order list's own rail (Orders MASTER §Left rail, owner approved
   2026-09-22). Read-only FACT filters: none is a status or a work queue. */
/* Requested delivery presets approved by the owner on 2026-10-01. */
const LIST_PARAMS = ["dealer", "state", "city", "delivery", "completion", "obligations", "cases", "requested", "payment", "stock", "category"] as const;
/** SO receipt, delivery and payment presentation; no business calculations. */
function salesOrderStatusTone(label: string): "success" | "info" | "warning" | "neutral" {
  if (["Fully received", "Fully delivered", "Paid in full"].includes(label)) return "success";
  if (["Partially received", "Partially delivered", "Partially paid"].includes(label)) return "info";
  return label === "Received with issue" ? "warning" : "neutral";
}

const STOCK_STATUSES = [
  { key: "pending", label: "Awaiting receipt" },
  { key: "partial", label: "Partially received" },
  { key: "received", label: "Fully received" },
  { key: "issue", label: "Received with issue" },
  { key: "unknown", label: "Receipt unconfirmed" },
] as const;
function stockStatusOf(row: RegisterRow, sku?: string): string {
  const facts = row.stockFacts;
  const keys = [...new Set((row.o.order_lines ?? []).filter(line => !sku || line.sku === sku).map(line => line.sku))];
  const values = keys.map(key => facts?.[key] ?? "unknown");
  if (!values.length) return "unknown";
  if (values.includes("issue")) return "issue";
  if (values.includes("unknown")) return "unknown";
  if (values.every(v => v === "received")) return "received";
  if (values.some(v => v === "received" || v === "partial")) return "partial";
  return "pending";
}

const PAYMENT_STATUSES = [
  { key: "unpaid", label: "Unpaid" },
  { key: "partial", label: "Partially paid" },
  { key: "paid", label: "Paid in full" },
  { key: "unknown", label: "Amount unconfirmed" },
] as const;
function paymentStatusOf(row: RegisterRow): string {
  if (row.balance.kind === "settled") return "paid";
  if (row.balance.kind !== "amount" || row.total.kind !== "amount") return "unknown";
  if (row.balance.value <= 0) return "paid";
  return row.paid.kind === "amount" && row.paid.value > 0 ? "partial" : "unpaid";
}

const LIST_OBLIGATIONS = [
  { key: "outstanding", label: "In progress" },
  { key: "none", label: "Completed" },
] as const;
type ListObligations = (typeof LIST_OBLIGATIONS)[number]["key"];
const LIST_CASES = [
  { key: "open", label: "Has open cases" },
  { key: "closed", label: "Closed cases only" },
  { key: "none", label: "No cases" },
] as const;
type ListCases = (typeof LIST_CASES)[number]["key"];
const registerSelections = new Map<string, Set<string>>();
// Return context belongs to this application session, never another query/auth lifetime.
const registerClients = new WeakMap<QueryClient, number>();
let nextRegisterClient = 0;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DEFAULT_MONTHS = 6;

/** `YYYY-MM` moved by a number of months. */
function shiftMonth(month: string, by: number): string {
  const at = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + by;
  return `${Math.floor(at / 12)}-${String((at % 12) + 1).padStart(2, "0")}`;
}

/** The Order list narrowed by a month door: one month, or beyond a window edge. */
type RequestedNarrowing = { kind: "month" | "before" | "after" | "range" | "overdue" | "unconfirmed"; month: string };

function requestedNarrowingOf(value: string | null): RequestedNarrowing | null {
  if (!value) return null;
  if (value === "overdue" || value === "unconfirmed") return { kind: value, month: "" };
  if (/^range:\d{4}-\d{2}-\d{2}:\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [, from, to] = value.split(":");
    if (from! <= to! && [from, to].every(d => !Number.isNaN(Date.parse(d!)))) return { kind: "range", month: `${from}:${to}` };
    return null;
  }
  const match = /^(?:(before|after):)?(\d{4}-(?:0[1-9]|1[0-2]))$/.exec(value);
  if (!match) return null;
  return { kind: (match[1] as "before" | "after" | undefined) ?? "month", month: match[2]! };
}

function requestedNarrowingWord(n: RequestedNarrowing): string {
  if (n.kind === "overdue") return "Overdue";
  if (n.kind === "unconfirmed") return "Date not confirmed";
  if (n.kind === "range") return n.month.split(":").map(d => fmtDate(d)).join(" – ");
  const month = fmtMonth(n.month);
  return n.kind === "before" ? `Before ${month}` : n.kind === "after" ? `After ${month}` : month;
}

function inRequestedNarrowing(iso: string | null, n: RequestedNarrowing, fullyDelivered = false): boolean {
  if (n.kind === "unconfirmed") return !iso;
  if (n.kind === "overdue") return Boolean(iso && iso.slice(0, 10) < todayMYT() && !fullyDelivered);
  if (n.kind === "range") { const [from, to] = n.month.split(":"); return Boolean(iso && iso.slice(0, 10) >= from! && iso.slice(0, 10) <= to!); }
  const month = iso?.slice(0, 7) ?? "";
  if (!MONTH_RE.test(month)) return false;
  return n.kind === "before" ? month < n.month : n.kind === "after" ? month > n.month : month === n.month;
}

function todayMYT(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function requestedPresets() {
  const today = todayMYT();
  const date = new Date(`${today}T00:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  const day = (by: number) => { const d = new Date(date); d.setUTCDate(d.getUTCDate() + by); return d.toISOString().slice(0, 10); };
  const month = today.slice(0, 7);
  const end = new Date(`${shiftMonth(month, 3)}-01T00:00:00Z`); end.setUTCDate(0);
  return [
    { label: "Overdue", value: "overdue" },
    { label: "This week", value: `range:${day(-offset)}:${day(6-offset)}` },
    { label: "Next week", value: `range:${day(7-offset)}:${day(13-offset)}` },
    { label: "This month", value: month },
    { label: "Next month", value: shiftMonth(month, 1) },
    { label: "Next two months", value: `range:${shiftMonth(month, 1)}-01:${end.toISOString().slice(0,10)}` },
  ];
}

/** Whether the work area is narrower than the width below which the rail floats. */
function useFloatingRail(ref: React.RefObject<HTMLDivElement>): boolean {
  const [floats, setFloats] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setFloats(el.clientWidth > 0 && el.clientWidth < FILTER_RAIL_FLOAT_BELOW_PX);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return floats;
}

/** A select's visible name and, for a group's first control, its supporting line. */
/** A select's own label inside a group (a group carries no description line,
 *  owner ruling 2026-09-28). */
function RailFieldWords({ label }: { label: string }) {
  return <p className="px-2 pt-1 text-meta text-kit-slate-11">{label}</p>;
}


function ExpandedLines({ row, inspection = false, compact = false }: { row: RegisterRow; inspection?: boolean; compact?: boolean }) {
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
      unitAbsence: "",
      deliverTo: [],
      deliverToAbsence: "",
      sku: addon.addon_key ?? "",
      qty: addon.qty,
      item: addon.addon_key
        ? (addonNameByKey.get(addon.addon_key) ?? addon.addon_key)
        : "Add-on",
      selectable: false,
    })),
  ];
  if (compact) return <div className="max-h-64 overflow-auto"><table className="w-full text-body" aria-label={`Items on SO-${row.so}`}>
    <thead className="sticky top-0 bg-kit-slate-3 text-label text-kit-slate-11"><tr><th className="p-2 text-left">Item</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Unit price</th><th className="p-2 text-right">Amount</th><th className="p-2 text-left">Stock Status</th></tr></thead>
    <tbody>{miniLines.map((line, index) => {
      const source = index < lines.length ? lines[index] : addons[index - lines.length];
      const stock = line.selectable === false ? "Service" : STOCK_STATUSES.find(status => status.key === stockStatusOf(row, line.sku))!.label;
      return <tr key={line.key} className="border-b border-kit-slate-5"><td className="p-2">{line.item}{line.itemDetail && <div className="text-meta text-kit-slate-11">{line.itemDetail}</div>}</td><td className="p-2 text-right">{line.qty}</td><td className="p-2 text-right whitespace-nowrap">{source.unit_price == null ? "Not recorded" : Number(source.unit_price).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td className="p-2 text-right whitespace-nowrap">{source.unit_price == null ? "Not recorded" : (Number(source.unit_price) * line.qty).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td className="p-2"><StatusPill tone={salesOrderStatusTone(stock)}>{stock}</StatusPill></td></tr>;
    })}</tbody>
  </table></div>;
  if (inspection) return <div className="space-y-3" data-testid="goods-side-inspection">
    {expansion.isError && <Button variant="ghost" size="sm" onClick={() => void expansion.refetch()}>Retry</Button>}
    {miniLines.map((line) => <Block key={line.key} title={line.item} note={`Qty ${line.qty}`}>
      {line.itemDetail && <p className="break-words text-body text-kit-slate-11">{line.itemDetail}</p>}
      <dl className="mt-3 grid grid-cols-1 gap-3 text-body">
        <div><dt className="text-label text-kit-slate-11">SKU</dt><dd className="break-all">{line.sku}</dd></div>
        <div><dt className="text-label text-kit-slate-11">Category</dt><dd>{line.categoryNode ?? line.category}</dd></div>
        <div><dt className="text-label text-kit-slate-11">Unit ID</dt><dd className="break-words">{line.unitNode ?? (line.unitIds.join(" · ") || (line.selectable === false ? "Not applicable" : line.unitAbsence))}</dd></div>
        <div><dt className="text-label text-kit-slate-11">Deliver To</dt><dd className="break-words">{line.deliverToNode ?? (line.deliverTo.join(" · ") || (line.selectable === false ? "Not applicable" : line.deliverToAbsence))}</dd></div>
      </dl>
    </Block>)}
  </div>;
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

function GoodsSummary({ row, onOpen, compact = false }: { row: RegisterRow; onOpen: (row: RegisterRow) => void; compact?: boolean }) {
  const extra = Math.max(0, (row.o.order_lines?.length ?? 0) - 1);
  const suffix = extra ? ` + ${extra} more` : "";
  const first = suffix && row.items.endsWith(suffix) ? row.items.slice(0, -suffix.length) : row.items;
  return <button type="button" className={`flex min-h-10 md:min-h-8 w-full min-w-0 items-center gap-1 text-left text-body hover:text-kit-blue-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9 ${compact ? "-my-px" : ""}`}
    aria-label={`Items · SO-${row.so}`} title={row.items} onClick={(event) => { event.stopPropagation(); onOpen(row); }}>
    <span className="min-w-0 truncate">{first}</span>{extra > 0 && <span className="shrink-0 font-medium">+{extra}</span>}
  </button>;
}

export default function SalesOrdersRegister() {
  const routerNavigate = useNavigate();
  const [urlParams, setUrlParams] = useSearchParams();
  const returnTo = `/operation/orders${urlParams.size ? `?${urlParams}` : ""}`;
  const navigate = useCallback((path: string) => routerNavigate(path, { state: { salesOrderRegisterReturn: returnTo } }), [routerNavigate, returnTo]);
  const cards = urlParams.get("view") === "cards";
  const userId = useAuth((s) => s.user?.id ?? "anon");
  const queryClient = useQueryClient();
  if (!registerClients.has(queryClient)) registerClients.set(queryClient, ++nextRegisterClient);
  const registerSession = `${userId}.${registerClients.get(queryClient)}`;
  const seededSearch = urlParams.get("search") ?? "";
  const role = useAuth((s) => s.role);
  const [goodsTarget, setGoodsTarget] = useState<RegisterRow | null>(null);

  /* ── THE RAIL: ONE VIEW SELECTOR, EACH VIEW ITS OWN GROUPS ─────────────── */
  const view: "list" | "monthly" = urlParams.get("view") === "monthly" ? "monthly" : "list";
  const areaRef = useRef<HTMLDivElement>(null);
  const [railOpen, setRailOpen] = useFilterRailOpen("carres.salesOrders.rail", areaRef);
  const railFloats = useFloatingRail(areaRef);
  const [narrowRailOpen, setNarrowRailOpen] = useState(false);
  const visibleRail = railFloats ? narrowRailOpen : railOpen;
  const showRail = () => { if (railFloats) setNarrowRailOpen(true); else setRailOpen(true); };
  const hideRail = () => { setNarrowRailOpen(false); if (!railFloats) setRailOpen(false); requestAnimationFrame(() => areaRef.current?.querySelector<HTMLElement>('[data-testid="sales-orders-show-filters"]')?.focus()); };
  useEffect(() => { setNarrowRailOpen(false); }, [railFloats]);
  useEffect(() => {
    if (narrowRailOpen) areaRef.current?.querySelector<HTMLElement>('[data-testid="sales-orders-rail"] button')?.focus();
  }, [narrowRailOpen]);
  const writeParams = useCallback(
    (change: (next: URLSearchParams) => void) => {
      setUrlParams(
        (current) => {
          const next = new URLSearchParams(current);
          change(next);
          return next;
        },
        { replace: true },
      );
    },
    [setUrlParams],
  );
  const setParam = useCallback(
    (key: string, value: string | null) =>
      writeParams((next) => {
        if (value == null || value === "") next.delete(key);
        else next.set(key, value);
      }),
    [writeParams],
  );
  const chooseView = useCallback(
    (next: "list" | "monthly") =>
      writeParams((params) => {
        if (next === "monthly") {
          params.set("view", "monthly");
          /* The Order list's narrowing is the Order list's: nothing carries
             over between the two views. */
          for (const key of LIST_PARAMS) params.delete(key);
        } else {
          params.delete("view");
          for (const key of MONTHLY_PARAMS) params.delete(key);
        }
      }),
    [writeParams],
  );

  /* Monthly demand's own filters — read only in that view. */
  const monthly = view === "monthly";
  const currentMonth = appTodayIso().slice(0, 7);
  const startParam = monthly ? urlParams.get("start") : null;
  const startMonth = startParam && MONTH_RE.test(startParam) ? startParam : currentMonth;
  const monthsParam = monthly ? Number(urlParams.get("months")) : NaN;
  const monthCount = Number.isInteger(monthsParam) && monthsParam >= 1 && monthsParam <= 6 ? monthsParam : DEFAULT_MONTHS;
  const dealer = monthly ? urlParams.get("dealer") : null;
  const deliveryState = monthly ? urlParams.get("state") : null;
  const deliveryCity = monthly ? urlParams.get("city") : null;
  const categoryParam = monthly ? urlParams.get("category") : null;
  const category = (MONTHLY_DEMAND_CATEGORIES as readonly string[]).includes(categoryParam ?? "")
    ? (categoryParam as MonthlyDemandCategory)
    : null;
  const demandWindow = useMemo(() => monthlyDemandWindowOf(startMonth, monthCount), [startMonth, monthCount]);
  const focusMonth = demandWindow.months.includes(currentMonth) ? currentMonth : demandWindow.first;
  const demandQ = useMonthlyDemandFacts(monthly);
  const demandView = useMemo(
    () =>
      demandQ.data
        ? monthlyDemandOf({
            orders: demandQ.data.orders,
            startMonth,
            months: monthCount,
            toBuyByLine: demandQ.data.toBuyByLine,
            filters: { salesLocation: dealer, state: deliveryState, city: deliveryCity, category },
            focusMonth,
          })
        : null,
    [demandQ.data, startMonth, monthCount, dealer, deliveryState, deliveryCity, category, focusMonth],
  );
  /* The current month, the twelve before it and the eleven after it. */
  const startChoices = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => shiftMonth(currentMonth, i - 12))
        .filter((month) => month !== currentMonth)
        .map((month) => ({ value: month, label: fmtMonth(month) })),
    [currentMonth],
  );
  const chooseState = useCallback(
    (next: string | null) =>
      writeParams((params) => {
        if (next) params.set("state", next);
        else params.delete("state");
        const city = params.get("city");
        const stillThere = !next || (demandQ.data?.orders ?? []).some(
          (o) => o.state?.trim() === next && o.city?.trim() === city,
        );
        if (city && !stillThere) params.delete("city");
      }),
    [writeParams, demandQ.data],
  );
  /* A month is an explicit drill-down, distinct from switching views: keep
     the report scope and drop stale list search/presentation conditions. */
  const openMonth = useCallback(
    (row: MonthlyDemandRow) => {
      if (!row.month) return;
      const value = row.kind === "month" ? row.month : `${row.kind}:${row.month}`;
      const params = new URLSearchParams({ requested: value });
      for (const [key, selected] of [["dealer", dealer], ["state", deliveryState], ["city", deliveryCity], ["category", category]] as const) {
        if (selected) params.set(key, selected);
      }
      navigate(`/operation/orders?${params}`);
    },
    [navigate, dealer, deliveryState, deliveryCity, category],
  );
  const requested = view === "list" ? requestedNarrowingOf(urlParams.get("requested")) : null;
  /* `Select month` lists the span `Starting month` lists (twelve months back,
     this month, eleven ahead). A linked month outside it is still listed, so
     the select never hides a filter that is on. */
  const requestedMonth = requested?.kind === "month" ? requested.month : null;
  const requestedMonthChoices = useMemo(() => {
    const months = Array.from({ length: 24 }, (_, i) => shiftMonth(currentMonth, i - 12));
    if (requestedMonth && !months.includes(requestedMonth)) months.push(requestedMonth);
    return months.sort().map((month) => ({ value: month, label: fmtMonth(month) }));
  }, [currentMonth, requestedMonth]);
  const [requestedRange, setRequestedRange] = useState<[string, string]>(["", ""]);
  /* The Order list's rail facts, read only in that view. */
  const listDealer = useMemo(() => monthly ? [] : urlParams.getAll("dealer"), [monthly, urlParams]);
  const listState = useMemo(() => monthly ? [] : urlParams.getAll("state"), [monthly, urlParams]);
  const listCity = useMemo(() => monthly ? [] : urlParams.getAll("city"), [monthly, urlParams]);
  const listDelivery: RegisterDeliveryCondition | null = monthly
    ? null
    : REGISTER_DELIVERY_CONDITIONS.find((c) => c.key === urlParams.get("delivery"))?.key ?? null;
  const listCategory = !monthly && (MONTHLY_DEMAND_CATEGORIES as readonly string[]).includes(urlParams.get("category") ?? "")
    ? urlParams.get("category") as MonthlyDemandCategory : null;
  const listStock = monthly ? null : STOCK_STATUSES.find(p => p.key === urlParams.get("stock"))?.key ?? null;
  const listPayment = monthly ? null : PAYMENT_STATUSES.find(p => p.key === urlParams.get("payment"))?.key ?? null;
  const listObligations: ListObligations | null = null;
  const listCases: ListCases | null = null;
  /* Obligations and cases are the SERVER's facts (the object page's completion
     and Service's own statuses); the list never guesses them. */
  const registerFactsQ = useSalesOrderRegisterFacts(!monthly);
  const registerFacts = registerFactsQ.data?.facts ?? null;
  /* A facet row clicked again is deselected (no Clear button in the rail). */
  const toggleParam = useCallback(
    (key: string, value: string) =>
      writeParams((params) => {
        if (params.get(key) === value) params.delete(key);
        else params.set(key, value);
      }),
    [writeParams],
  );


  const [selected, setSelected] = useState<Set<string>>(() => registerSelections.get(registerSession) ?? new Set());
  const selectionSession = useRef(registerSession);
  useEffect(() => {
    if (selectionSession.current !== registerSession) {
      selectionSession.current = registerSession;
      setSelected(registerSelections.get(registerSession) ?? new Set());
    } else registerSelections.set(registerSession, selected);
  }, [registerSession, selected]);
  /* FIX 1 — SERVER SEARCH. The engine emits its debounced trimmed term and
     the SAME words go to the API (`?search=`), so a match beyond the loaded
     page is found on the server, not missed in the browser. The engine still
     filters the rows it holds for instant feedback; `keepPreviousData` in the
     query hook keeps the list on screen while the server answers. */
  const [serverSearch, setServerSearch] = useState(seededSearch);
  // A URL-owned blank (including monthly drill-down) clears an old server search.
  useEffect(() => { setServerSearch(seededSearch); }, [seededSearch]);
  const searchChanged = useCallback((query: string) => { setServerSearch(query); if (query !== seededSearch) setParam("search", query); }, [setParam, seededSearch]);
  /* The register still writes nothing itself. `Cancel SO` opens the ONE
     governed cancellation door and that door owns the act — the row is only
     naming which Sales Order the dialog is about. */
  const [cancelTarget, setCancelTarget] = useState<{ id: string; so: number } | null>(null);


  /* ⭐ POPULATION — owner ruling 2026-09-21: only orders Sales has handed to
     Operation. A `Placed` order is not on this Register, so the server is
     asked for the `proceeded` stage and counts its total the same way.
     EVERY page of it (SO A3-3): `isLoading` holds until the last page is in,
     so a partial list never prints a count, a total or a group as complete. */
  const { data, isLoading, isError, error, refetch } = useSalesOrderRegisterOrders(
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
        /* The SERVER owns the population (`?stage=proceeded` excludes
           rentals, Placed and Cancelled through one predicate). This filter
           changes nothing against the current Worker; it stays only so a
           page served beside an OLDER Worker still shows no rental. */
        .filter((o) => !isRental(o))
        .map((o) =>
          ({ ...buildRegisterRow(o, o.ops_delivery_orders ?? [], (sku) => catalogNames.get(skuKey(sku))?.name), stockFacts: registerFacts?.[o.id]?.stock }),
        ),
    [data, catalogNames, registerFacts],
  );

  const chooseListValues = useCallback((key: string, values: string[]) => writeParams(params => {
    params.delete(key); values.forEach(value => params.append(key,value));
    if (key === "state") {
      const allowed = new Set(all.filter(r=>!values.length || values.includes(r.o.customer_address_state?.trim() ?? "")).map(r=>r.o.customer_address_city?.trim()));
      const cities=params.getAll("city").filter(city=>allowed.has(city));
      params.delete("city"); cities.forEach(city=>params.append("city",city));
    }
  }),[writeParams,all]);
  const chooseListState = useCallback((next:string|null)=>chooseListValues("state",next?[next]:[]),[chooseListValues]);

  /* The scope is the register's population; the engine's search and ▽s narrow
     WITHIN it. Newest first — the engine applies its own sort on top when a
     header is clicked. */
  const rows = useMemo(
    () =>
      [...all]
        /* A month door's narrowing, on the customer's requested date. */
        .filter((r) => !requested || inRequestedNarrowing(r.customerDelivery, requested, registerDeliveryConditionOf(r.o.order_lines ?? [], r.o.allocated_units ?? []) === "fully_delivered"))
        /* The Order list rail: read-only facts, each answered by its owner's
           one arithmetic. */
        .filter((r) => !listDealer.length || listDealer.includes(salesLocationOf(r.o)))
        .filter((r) => !listState.length || listState.includes(r.o.customer_address_state?.trim() ?? ""))
        .filter((r) => !listCity.length || listCity.includes(r.o.customer_address_city?.trim() ?? ""))
        .filter((r) => !listCategory || (r.o.order_lines ?? []).some(line => monthlyDemandCategoryOf(line) === listCategory && Number(line.qty) > 0))
        .filter(
          (r) =>
            !listDelivery ||
            registerDeliveryConditionOf(r.o.order_lines ?? [], r.o.allocated_units ?? []) === listDelivery,
        )
        /* An unknown fact matches no chosen value: never classified. */
        .filter((r) => !listObligations || registerFacts?.[r.id]?.obligations === listObligations)
        .filter((r) => !listCases || registerFacts?.[r.id]?.cases === listCases)
        .filter(r => !listPayment || paymentStatusOf(r) === listPayment)
        .filter(r => !listStock || stockStatusOf(r) === listStock)
        .sort((a, b) => (b.proceeded ?? "").localeCompare(a.proceeded ?? "")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, requested?.kind, requested?.month, listDealer, listState, listCity, listDelivery, listObligations, listCases, listPayment, listStock, listCategory, registerFacts],
  );
  const activeConditions = useMemo(() => {
    const list = [
      listCategory && { key: "category", label: `Product category: ${listCategory}`, onClear: () => setParam("category", null) },
      listStock && { key: "stock", label: `Stock Status: ${STOCK_STATUSES.find(p => p.key === listStock)!.label}`, onClear: () => setParam("stock", null) },
      listPayment && { key: "payment", label: `Payment Status: ${PAYMENT_STATUSES.find(p => p.key === listPayment)!.label}`, onClear: () => setParam("payment", null) },
      requested && {
        key: "requested",
        label: `Customer’s original requested delivery: ${requestedNarrowingWord(requested)}`,
        onClear: () => setParam("requested", null),
      },
      listDealer.length > 0 && { key: "dealer", label: `Sales Location: ${listDealer.join(", ")}`, onClear: () => setParam("dealer", null) },
      listState.length > 0 && { key: "state", label: `State: ${listState.join(", ")}`, onClear: () => chooseListState(null) },
      listCity.length > 0 && { key: "city", label: `City: ${listCity.join(", ")}`, onClear: () => setParam("city", null) },
      listDelivery && {
        key: "delivery",
        label: REGISTER_DELIVERY_CONDITIONS.find((c) => c.key === listDelivery)!.label,
        onClear: () => setParam("delivery", null),
      },
      listObligations && {
        key: "completion",
        label: LIST_OBLIGATIONS.find((o) => o.key === listObligations)!.label,
        onClear: () => setParam("completion", null),
      },
      listCases && {
        key: "cases",
        label: LIST_CASES.find((o) => o.key === listCases)!.label,
        onClear: () => setParam("cases", null),
      },
    ].filter((c): c is { key: string; label: string; onClear: () => void } => Boolean(c));
    return list.length > 0 ? list : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested?.kind, requested?.month, setParam, chooseListState, listDealer, listState, listCity, listDelivery, listObligations, listCases, listPayment, listStock, listCategory]);
  /* `{n} of {m}` — `m` is the SERVER's count of the Sales Orders this user may
     read (rentals excluded, search not applied), carried on every list answer,
     so a search answered before any unsearched load still has it and a created
     or cancelled order moves it on the next read. Unknown → `null` → no `of`. */
  const population = typeof data?.salesOrderTotal === "number" ? data.salesOrderTotal : null;
  /* `No sales orders yet` is a claim about the POPULATION, never about what a
     rail choice or a search left on screen: the rail narrows `rows` before
     the grid sees them, so an empty `rows` alone cannot tell the two apart.
     The server's count says it; unknown, the unsearched load does. */
  const populationEmpty = population !== null ? population === 0 : all.length === 0 && !serverSearch;

  /* Role decides the FIRST PAINT only (money hidden for Operations, visible
     for Finance/Principal); the chooser opens every column either way.
     Memoized per role so the engine's memo actually hits; the layout store is
     per-role so one machine's Finance login does not restyle Operations'. */
  const [filteredSummaryRows, setFilteredSummaryRows] = useState<RegisterRow[] | null>(null);
  const receiveSummaryRows = useCallback((next: RegisterRow[]) => setFilteredSummaryRows(previous => previous && previous.length === next.length && previous.every((row, index) => row.id === next[index].id && JSON.stringify([row.total, row.paid, row.balance]) === JSON.stringify([next[index].total, next[index].paid, next[index].balance])) ? previous : next), []);
  const summaryRows = filteredSummaryRows ?? rows;
  const [quickOrderSnapshot, setQuickOrder] = useState<RegisterRow | null>(null);
  const quickOrder = quickOrderSnapshot ? all.find(row => row.id === quickOrderSnapshot.id) ?? quickOrderSnapshot : null;
  const columns = useMemo(
    () => [
      { key: "stock_status", label: "Stock Status", width: REGISTER_FIELDS.find(f => f.key === "salesperson")!.width, group: "Operation" as const, on: true as const, text: (r: RegisterRow) => STOCK_STATUSES.find(status => status.key === stockStatusOf(r))!.label },
      ...REGISTER_FIELDS.filter(f => f.key !== "delivery_location"),
      { key: "category", label: "Category", width: REGISTER_FIELDS.find(f => f.key === "items")!.width, group: "Items" as const, on: true as const, text: (r: RegisterRow) => [...new Set((r.o.order_lines ?? []).map(goodsCategoryOf))].join(" · ") || "Not recorded" },
      { key: "payment_status", label: "Payment Status", width: REGISTER_FIELDS.find(f => f.key === "salesperson")!.width, group: "Operation" as const, on: true as const, text: (r: RegisterRow) => PAYMENT_STATUSES.find(status => status.key === paymentStatusOf(r))!.label },
    ].map((f) => toGridColumn(f, role, navigate, setGoodsTarget, setQuickOrder)),
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
  /* ONE ROW MENU (owner ruling 2026-10-05): `View · Print · ─ Cancel SO`.
     View opens the full read-first Sales Order page — Edit is a button there,
     pressed on purpose; Print is the same governed SO paper the page prints. */
  const contextMenu = useCallback(
    (r: RegisterRow): DataGridContextMenuItem[] =>
      documentRowMenu({
        view: () => openWorkspace(r),
        print: () => void printSalesOrdersOrSay([r]),
        more: [{ label: "Cancel SO", danger: true, onClick: () => setCancelTarget({ id: r.id, so: r.so }) }],
      }),
    [openWorkspace],
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

  const rail = (
    <FilterRail
      className="so-template-rail"
      testId="sales-orders-rail"
      ariaLabel="Sales Orders filters"
      onHide={hideRail}
      header={(
        <div className="so-rail-navigation">
          <Tabs fill orientation="vertical" label="Sales Orders view" value={view}
            onValueChange={(next) => chooseView(next === "monthly" ? "monthly" : "list")}
            tabs={[{ value: "list", label: "Listing", icon: "order" }, { value: "monthly", label: "Monthly demand", icon: "date" }]} />
        </div>
      )}
    >
      {monthly ? (
        <>
          {/* The window is printed in the group and on the table's own heading; a
              bare month count (`1`) on the header said nothing (Jess, 2026-09-28). */}
          <FilterRailGroup title="Period" icon="date" chosen={null}>
            <RailFieldWords label="Starting month" />
            <FilterRailSelect
              label="Starting month"
              value={startMonth === currentMonth ? null : startMonth}
              options={startChoices}
              onChange={(next) => setParam("start", next)}
              testId="monthly-demand-start"
              allLabel={fmtMonth(currentMonth)}
            />
            <RailFieldWords label="Months" />
            <FilterRailSelect
              label="Months"
              value={monthCount === DEFAULT_MONTHS ? null : String(monthCount)}
              options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
              onChange={(next) => setParam("months", next)}
              testId="monthly-demand-months"
              allLabel={String(DEFAULT_MONTHS)}
            />
            <p className="px-2 pt-1 text-label text-base-600" data-testid="monthly-demand-window">
              {demandWindow.first === demandWindow.last
                ? fmtMonth(demandWindow.first)
                : `${fmtMonth(demandWindow.first)} to ${fmtMonth(demandWindow.last)}`}
            </p>
          </FilterRailGroup>
          <FilterRailGroup title="Sales Location" icon="people">
            <FilterRailSelect
              label="Sales Location"
              value={dealer}
              options={[...new Set([...(demandView?.choices.salesLocations ?? []), ...(dealer ? [dealer] : [])])].map((name) => ({ value: name, label: name }))}
              onChange={(next) => setParam("dealer", next)}
              testId="monthly-demand-dealer"
              allLabel="All sales locations"
            />
          </FilterRailGroup>
          <FilterRailGroup title="Customer Delivery Location" icon="delivery">
            <RailFieldWords label="State" />
            <FilterRailSelect
              label="State"
              value={deliveryState}
              options={[...new Set([...(demandView?.choices.states ?? []), ...(deliveryState ? [deliveryState] : [])])].map((name) => ({ value: name, label: name }))}
              onChange={chooseState}
              testId="monthly-demand-state"
              allLabel="All states"
            />
            <RailFieldWords label="City" />
            <FilterRailSelect
              label="City"
              value={deliveryCity}
              options={[...new Set([...(demandView?.choices.cities ?? []), ...(deliveryCity ? [deliveryCity] : [])])].map((name) => ({ value: name, label: name }))}
              onChange={(next) => setParam("city", next)}
              testId="monthly-demand-city"
              allLabel="All cities"
            />
          </FilterRailGroup>
          <FilterRailGroup title="Product category" icon="goods">
            <FilterRailSelect
              label="Product category"
              value={category}
              options={MONTHLY_DEMAND_CATEGORIES.map((word) => ({ value: word, label: word }))}
              onChange={(next) => setParam("category", next)}
              testId="monthly-demand-category"
              allLabel="All categories"
            />
          </FilterRailGroup>
        </>
      ) : (
        <>
          <FilterRailGroup title="Order summary" icon="money" defaultOpen>
            <dl className="space-y-2 px-2 py-2" data-testid="sales-orders-summary">
              <div className="grid grid-cols-[1fr_auto] items-center gap-x-2"><dt className="text-meta text-kit-slate-11">Sales orders</dt><dd className="text-strong text-right tabular-nums">{isLoading ? "Loading" : isError ? "Unavailable" : summaryRows.length}</dd></div>
              {(["total", "paid", "balance"] as const).map((key, index) => {
                const missing = summaryRows.filter(row => row[key].kind !== "amount" && row[key].kind !== "settled").length;
                const value = summaryRows.reduce((sum, row) => sum + ((() => { const amount = row[key]; return amount.kind === "amount" ? amount.value : 0; })()), 0);
                return <div key={key} className="grid grid-cols-[1fr_auto] items-center gap-x-2"><dt className="text-meta text-kit-slate-11">{["Total payable", "Paid to date", "Balance due"][index]}</dt><dd className="text-strong text-right whitespace-nowrap tabular-nums">{isLoading ? "Loading" : isError ? "Unavailable" : <Money value={value} />}</dd>{!isLoading && !isError && missing > 0 && <p className="col-span-2 text-meta text-kit-slate-11">{missing} orders without a confirmed amount</p>}</div>;
              })}
            </dl>
          </FilterRailGroup>
          <FilterRailGroup title="Customer’s original requested delivery" icon="date" defaultOpen>
            <FilterRailRow testId="requested-all" label="All dates" resets active={!requested} onClick={() => setParam("requested", null)} />
            {requestedPresets().map(option => <FilterRailRow key={option.label} testId={`requested-${option.label}`} label={option.label} active={urlParams.get("requested") === option.value} onClick={() => toggleParam("requested", option.value)} />)}
            {/* The rail's own select, as `Starting month` is: a native month
                input printed `--------- ----` when empty, and no dash may reach
                a screen. Its empty option reads the control's label. */}
            <FilterRailSelect
              label="Select month"
              value={requestedMonth}
              options={requestedMonthChoices}
              onChange={(next) => setParam("requested", next)}
              testId="requested-month"
              allLabel="Select month"
            />
            <details className="px-2 py-2 text-meta text-kit-slate-11"><summary className="cursor-pointer">Custom range</summary>
              {(["From", "To"] as const).map((label, i) => <label key={label} className="mt-1 block">{label}<input aria-label={`Requested delivery ${label.toLowerCase()}`} type="date" className="mt-1 h-8 w-full rounded-md border border-kit-slate-6 bg-white px-2 text-body text-kit-slate-12" value={requestedRange[i]} onChange={event => { const values: [string, string] = [...requestedRange]; values[i] = event.target.value; setRequestedRange(values); if (values[0] && values[1] && values[0] <= values[1]) setParam("requested", `range:${values[0]}:${values[1]}`); }} /></label>)}
            </details>
          </FilterRailGroup>



        </>
      )}
    </FilterRail>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DestinationHeader />
      {quickOrder && <Drawer variant="compact-card" open onOpenChange={(open) => { if (!open) setQuickOrder(null); }} title={`SO-${quickOrder.so} · ${quickOrder.customer}`}>
        <SalesOrderCompactView row={quickOrder} salesLocation={salesLocationOf(quickOrder.o)} items={<div className="min-w-0 overflow-x-auto"><ExpandedLines row={quickOrder} compact /></div>} onOpen={() => openWorkspace(quickOrder)} onClose={() => setQuickOrder(null)} />
      </Drawer>}
      {cancelTarget && (
        <CancelSalesOrderDialog
          orderId={cancelTarget.id}
          so={cancelTarget.so}
          open
          onOpenChange={(open) => { if (!open) setCancelTarget(null); }}
          onCancelled={() => void refetch()}
        />
      )}
      {goodsTarget && <Drawer open onOpenChange={(open) => { if (!open) setGoodsTarget(null); }} title={`SO-${goodsTarget.so} · Items`}>
        <div className="min-w-0 max-w-full overflow-x-auto"><ExpandedLines row={goodsTarget} inspection /></div>
      </Drawer>}



      {/* The rail runs from the header to the bottom, beside the chosen view.
          Below 896px of work area it floats over the content; hidden, it
          leaves the 44px strip that brings it back. */}
      <div ref={areaRef} className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden" data-testid="sales-orders-area">
      {visibleRail ? (
        railFloats ? <div className="absolute inset-0 z-20 flex" onKeyDown={(event) => { if (event.key === "Escape") hideRail(); }}><div className="relative z-10 flex shadow-lg">{rail}</div><button type="button" className="flex-1 bg-kit-slate-12/40" aria-label="Hide filters" onClick={hideRail} /></div> : rail
      ) : (
        <aside className="flex w-11 shrink-0 flex-col items-center gap-2 border-r border-kit-slate-5 bg-white py-2" data-testid="sales-orders-rail-collapsed">
          <ShowFiltersButton onShow={showRail} testId="sales-orders-show-filters" />
          <span className="text-label text-kit-slate-11 [writing-mode:vertical-rl]">Show filters</span>
        </aside>
      )}
      {monthly ? (
        <SalesOrderMonthlyDemand
          view={demandView}
          focusMonth={focusMonth}
          onOpenMonth={openMonth}
          loading={demandQ.isLoading}
          error={demandQ.isError ? demandQ.error : undefined}
          onRetry={() => void demandQ.refetch()}
        />
      ) : (
      /* 8px work-surface breathing room — REGISTER STATUS FOOTER law, docs/ui/MASTER.md. */
      <div ref={canvasRef} className="flex min-h-0 min-w-0 flex-1 flex-col p-2" data-testid="register-column">
          <DataGrid<RegisterRow>
            key={registerSession}
            appearance="reference"
            sessionKey={`${storageKey}.${registerSession}`}
            presentationTools
            allowColumnGrouping={false}
            pageToolsItems={[
              { key: "group-none", label: `Group by: None${!urlParams.get("group") ? " ✓" : ""}`, separatorBefore: true, onSelect: () => setParam("group", null) },
              ...(["delivery", "stock", "payment"] as const).map(group => ({
                key: `group-${group}`, label: `Group by: ${group === "delivery" ? "Delivery Status" : group === "stock" ? "Stock Status" : "Payment Status"}${urlParams.get("group") === group ? " ✓" : ""}`,
                onSelect: () => setParam("group", group),
              })),
            ]}
            fixedGroups={urlParams.get("group") === "delivery" ? {
              groups: [...REGISTER_DELIVERY_CONDITIONS, { key: "not_applicable", label: "Not applicable" }],
              groupOf: row => registerDeliveryConditionOf(row.o.order_lines ?? [], row.o.allocated_units ?? []) ?? "not_applicable",
            } : urlParams.get("group") === "stock" ? {
              groups: STOCK_STATUSES.map(c => ({ key: c.key, label: c.label })), groupOf: stockStatusOf,
            } : urlParams.get("group") === "payment" ? {
              groups: PAYMENT_STATUSES.map(c => ({ key: c.key, label: c.label })), groupOf: paymentStatusOf,
            } : undefined}
            searchScope="Search sales orders by SO number, customer, phone, imported reference or linked document number"
            presentationKey={cards ? "cards" : "table"}
            toolbarEnd={<Tabs variant="segmented" label="Sales Orders view" value={cards ? "cards" : "table"}
              onValueChange={(next) => setParam("view", next === "cards" ? "cards" : null)}
              tabs={[{ value: "table", label: "Table", icon: "table" }, { value: "cards", label: "Cards", icon: "cards" }]} />}
            selectionPrimary={<Tabs variant="segmented" label="Sales Orders view" value={cards ? "cards" : "table"}
              onValueChange={(next) => setParam("view", next === "cards" ? "cards" : null)}
              tabs={[{ value: "table", label: "Table", icon: "table" }, { value: "cards", label: "Cards", icon: "cards" }]} />}
            renderResults={cards ? (visible) => (
              <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-2 2xl:grid-cols-3" data-testid="sales-orders-cards">
                {visible.map((row) => {
                  // Both views use the existing register delivery projection;
                  // scope-card readiness remains a separate final-leg fact.
                  return <div key={row.id} data-row-key={row.id} tabIndex={-1} className="min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9" data-testid={`sales-order-card-${row.so}`}>
                    <Block title={`SO-${row.so}`} headerSlot={<div className="flex items-center gap-3">
                      <Checkbox id={`card-select-${row.id}`} ariaLabel={`Select SO-${row.so}`} checked={selected.has(row.id)} onCheckedChange={() => toggleRow(row.id)} />
                      <Button size="touch" variant="ghost" onClick={() => setQuickOrder(row)}>View</Button>
                    </div>}>
                      <dl className="grid min-w-0 grid-cols-2 gap-3 text-body">
                        <div className="col-span-2"><dt className="text-label text-kit-slate-11">Customer</dt><dd className="break-words">{row.customer}</dd></div>
                        <div><dt className="text-label text-kit-slate-11">Customer’s original requested delivery</dt><dd>{row.customerDelivery ? fmtDate(row.customerDelivery) : ""}</dd></div>
                        <div className="col-span-2 order-last"><dt className="text-label text-kit-slate-11">Items</dt><dd className="min-w-0"><GoodsSummary row={row} onOpen={setGoodsTarget} /></dd></div>
                        <div><dt className="text-label text-kit-slate-11">Delivery</dt><dd>{REGISTER_DELIVERY_CONDITIONS.find(condition => condition.key === registerDeliveryConditionOf(row.o.order_lines ?? [], row.o.allocated_units ?? []))?.label ?? "Not recorded"}</dd></div>
                        <div><dt className="text-label text-kit-slate-11">Total payable</dt><dd>{moneyCell(row.total)}</dd></div>
                        <div><dt className="text-label text-kit-slate-11">Balance due</dt><dd>{moneyCell(row.balance)}</dd></div>
                      </dl>
                    </Block>
                  </div>;
                })}
              </div>
            ) : undefined}
            palette="slate"
            searchPresentation="responsive"
            labelledToolbar
            /* ONE kit error INSIDE the work surface: the toolbar — and New
               Sales Order with it — stays, because creating an order does not
               depend on the list loading. No raw transport message. */
            errorState={
              isError ? (
                <SalesOrderReadFailure
                  error={error}
                  surface="sales-orders-register"
                  onRetry={() => void refetch()}
                />
              ) : undefined
            }
            rows={rows}
            facetRows={all}
            onFilteredRowsChange={receiveSummaryRows}
            columns={columns}
            activeConditions={activeConditions}
            onClearConditions={() => writeParams((params) => { for (const key of LIST_PARAMS) params.delete(key); params.delete("search"); })}
            storageKey={storageKey}
            rowKey={(r) => r.id}
            exportName="Sales Orders"
            /* The search box is a governed 200px at EVERY width (REGISTER LAW
               2), so the old four-item placeholder clipped to `SO number,
               custome…` on a narrow window and on a wide one alike — it was
               never a breakpoint problem. A placeholder that fits is the fix;
               the search itself still matches SO number, customer, phone and
               item, and the ▽ per-column filters say so column by column. */
            /* ⭐ A DOOR MAY ARRIVE WITH ITS QUESTION ALREADY ASKED (owner
               ruling, Jess 2026-09-21): the Sales Order page's
               `Existing customer · {n} orders ›` opens this register searched
               by that phone. `?search=` seeds the engine's own search — no new
               page, no new writer, no second list. */
            initialSearch={seededSearch}
            searchPlaceholder="Search orders…"
            isLoading={isLoading}
            emptyMessage={populationEmpty ? "No sales orders yet" : "No sales orders match these filters"}
            noMatchMessage="No sales orders match these filters"
            groupBanner={false}
            /* Accepted shared template:32px desktop row,12/18 text; generic defaults stay scoped. */
            rowHeight={32}
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
            onRowClick={setQuickOrder}
            onRowDoubleClick={onRowDoubleClick}
            onSearchChange={searchChanged}
            contextMenu={contextMenu}
            expandable={expandable}
            selectable={{
              selectedKeys: selected,
              onToggle: toggleRow,
              onToggleAll: toggleAll,
            }}
            outputActions={[{ label: "Print sales orders", onClick: () => { const picked = rows.filter(row => selected.has(row.id)); if (!picked.length) { toast.error("Select sales orders to print"); return; } void printSalesOrdersOrSay(picked); } }]}
            selectionActions={[
              {
                label: (n) => `Print ${n} sales order${n === 1 ? "" : "s"}`,
                onClick: (picked) => {
                  void printSalesOrdersOrSay(picked as unknown as RegisterRow[]);
                },
              },
            ]}
            /* ⭐ NO `New Sales Order` — owner ruling 2026-09-27 (Jess). A customer
               order is the dealer's or showroom's act in the Sales Portal and
               nowhere else; Operation receives it and never creates it. */
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
