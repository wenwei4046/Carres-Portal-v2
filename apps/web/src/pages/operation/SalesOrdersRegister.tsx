/**
 * SalesOrdersRegister — SO-1 FINAL, the Sales Orders register (Loo, 2026-08-09).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THE REGISTER LAW, AND EVERY DECISION IN THIS FILE COMES FROM IT
 *
 *   "Forget web applications. Build this page as if you were building Microsoft
 *    Excel. Every order is exactly ONE row. Every column is exactly ONE fact.
 *    No cell may contain another layout, card, table, chip, icon, pill or
 *    workflow. A row may NEVER be taller than another row. If information does
 *    not fit in one row, it does not belong in the register. The register never
 *    expands and never explains."
 *
 *   "Every register answers only: what records exist?  Never: what should I do?"
 *
 * **What that removed from the previous build, and it is most of it:**
 * ```
 * ✗ the row expansion       "the register never expands"  → the document lists every line
 * ✗ rental orders            the Rental module owns them  → excluded at the source
 * ✗ Import from AutoCount    an ACTION, and a register has none
 * ✗ the drawer               a cockpit is workflow        → a Sales Order DOCUMENT
 * ✗ the right rail           Team · Calendar · Activity   → NOT MOUNTED on this route
 * ```
 * No cell in this file renders an element with children of its own. Every cell
 * returns one string, or one `Money`, and that is the whole vocabulary.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE COLUMNS ARE THE CARD'S SIX, AND MY EARLIER OBJECTION TO ONE OF THEM WAS WRONG
 *
 *     SO No · Customer · Items · Value · Promised · Ordered
 *
 * SO-1's first round proposed replacing `Value` with `Outstanding` and dropping
 * `Ordered`. The card was re-issued with both kept and `Outstanding` moved to
 * the hidden columns, so that is what ships — and one half of the objection was
 * simply wrong on the law: I argued `Ordered` collided with `COPY-STANDARD.md`
 * line 943, where it names a Purchasing QUANTITY column. Lines 872-873 of that
 * same file answer it: *"A Purchase Order and a customer order are two different
 * subjects; a word banned on one is not automatically banned on the other."*
 * There is no collision. `Ordered` is the right word for the day the customer
 * ordered.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FACTS LIVE IN `sales-order-facts.ts`
 *
 * Rental exclusion, the item names, the money states and the search haystack
 * are pure functions with their own tests. This file arranges them; it decides
 * nothing. Money goes through `@carres/shared`'s `orderMoney` and nothing else.
 *
 * **A blank may never carry two meanings.** `Value` and `Outstanding` each
 * print one of three sentences — the amount, `Paid in full`, or `No price yet`
 * — so an empty-looking cell can never mean both "settled" and "nobody priced
 * it". Measured 2026-08-09: 29 of 32 native orders are priced, and every one of
 * the 37 AutoCount rows is not.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SEARCH IS CLIENT-SIDE, AND IT IS ONE DEBT WITH THE 200-ROW CAP
 *
 * The server searches customer name, imported ref and SO number — not phone,
 * not item (`apps/api/src/routes/operation/orders.ts`). Passing `search` would
 * make two of the card's four fields silently dead, so this page filters the
 * fetched page itself: all four work, and they expire at exactly the row count
 * the server's `.limit(200)` already imposes. See `docs/MIGRATION-MAP.md`.
 */
import { useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import DataTable, {
  type Column,
  type TableSort,
} from "@/components/kit/DataTable";
import PageShell, { type ActiveChip } from "@/components/kit/PageShell";
import SearchInput from "@/components/kit/SearchInput";
import Button from "@/components/kit/Button";
import Popover from "@/components/kit/Popover";
import Checkbox from "@/components/kit/Checkbox";
import Select from "@/components/kit/Select";
import DatePicker from "@/components/kit/DatePicker";
import EmptyState from "@/components/kit/EmptyState";
import Money from "@/components/Money";
import { fmtDate } from "@/lib/fmt-date";
/* `cjkClassName` is deliberately NOT imported here, and it is a decision rather
   than an omission. It would wrap a cell's text in a `<span>` to switch to Noto
   Sans SC, and the law says no cell may contain another layout. Measured
   2026-08-09: **0 of 77 live customer names carry a CJK character** — Malaysian
   Chinese customers are romanised in this data (`Tan Ah Kow`, `Chen Chee
   Cheong`), so the exposure today is nil. If a CJK name ever arrives, the font
   belongs on the kit's `<td>`, which is where every other cell would get it
   too — not on a wrapper this page smuggles into one column. Recorded in
   `docs/MIGRATION-MAP.md`. */
import { useOperationOrders, type operationOrderListRow } from "@/lib/queries";
import ModuleHeader from "./components/ModuleHeader";
import SalesOrderDocument from "./SalesOrderDocument";
import {
  digits,
  isDelivered,
  isRental,
  itemsSummary,
  moneyOfOrder,
  outstandingState,
  searchHaystack,
  valueState,
  type MoneyState,
} from "./sales-order-facts";

/* ── MEASURED COLUMN WIDTHS ────────────────────────────────────────────────────
 *
 * Every number is the text's INK, canvas-measured against the cell's own
 * computed font in real Chromium at 1440×900 with Inter and JetBrains Mono
 * confirmed loaded, `+16` for the kit's uniform `px-2` (measured on the
 * rendered `<td>`, not assumed).
 *
 *   column       ink    width   the string that sets it
 *   SO No       68.9       85   `SO-100257` — six digits, not today's four
 *   Customer   169.3      188   `MyHouse Management PLT`
 *   Items      342.6      361   `Breeze FirmCare · King ×1 · Lyyar · 1A(LHF) ×1 · +2 more`
 *   Value       92.8      109   `RM 1,234,567` (marker 18.6 + gap 4 + digits 70.2)
 *   Promised    96.4      113   `Wed, 19 Aug 26` — this cell may NEVER truncate
 *   Ordered     96.4      113   the same date family
 *
 *   hidden
 *   Phone       86.4      103   `012-345 6789`
 *   Salesperson 150.5     167   `Nur Aisyah binti Rahman`
 *   Outlet      109.8     126   `Carres Setia Alam`
 *   Outstanding  96.3     109   the HEADER is the wider claim here, not the cell
 *
 * **A truncating column carries +2 over its measurement.** `ink + 16` is the
 * exact fit and an exact fit still ellipsises: the browser rounds the content
 * box and the text run independently. `Customer` and `Items` truncate; the
 * other four do not and take the measurement flat.
 *
 * **`SO No` and `Value` are sized to a FUTURE string, on purpose.** S3.3's
 * finding is why: sizing a composed cell to the widest value that happens to be
 * in the database today is how the old `Actions` column was sized off nearly
 * the narrowest string in its family. Six SO digits arrive inside a decade at
 * 1,000 orders/month, and a money column's family is digits — 109 costs 16px
 * once instead of a re-measure later.
 *
 * **`Items` is the one column whose content is unbounded**, so it is sized to
 * the widest LIVE two-name-plus-tail composition and truncates beyond it. That
 * truncation is what the law asks for: *"if information does not fit in one
 * row, it does not belong in the register"* — the document lists every line.
 *
 * Table 807px with the six defaults. Verified on the rendered page: every
 * column holds its declared pixel and ZERO cells clip at 1440 AND at 1130.
 */
const W = {
  so: "85px",
  customer: "188px",
  items: "361px",
  value: "109px",
  promised: "113px",
  ordered: "113px",
  /* The hidden fact columns, measured the same way and on the same day. */
  phone: "103px",
  salesperson: "167px",
  outlet: "126px",
  outstanding: "109px",
} as const;

/** The hidden fact columns, in the order the card names them. */
const EXTRA_COLUMNS = [
  { key: "phone", label: "Phone" },
  { key: "salesperson", label: "Salesperson" },
  { key: "outlet", label: "Outlet" },
  { key: "outstanding", label: "Outstanding" },
] as const;
type ExtraKey = (typeof EXTRA_COLUMNS)[number]["key"];

/** ONE cell, ONE fact. A money state is a number or a sentence, never both and
 *  never nothing — SO-1: *"a blank may never carry two meanings."* */
function moneyCell(state: MoneyState) {
  if (state.kind === "amount") return <Money value={state.value} />;
  return state.kind === "settled" ? "Paid in full" : "No price yet";
}

interface RegisterRow {
  o: operationOrderListRow;
  id: string;
  so: number;
  customer: string;
  phone: string;
  salesperson: string;
  outlet: string;
  items: string;
  promised: string | null;
  promisedLabel: string;
  ordered: string;
  value: MoneyState;
  outstanding: MoneyState;
  sortValue: number;
  sortOutstanding: number;
  needle: string;
  phoneDigits: string;
}

export default function SalesOrdersRegister() {
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [scope, setScope] = useState<"live" | "all">("live");
  const [shown, setShown] = useState<ReadonlySet<ExtraKey>>(
    () => new Set<ExtraKey>(),
  );
  const [sort, setSort] = useState<TableSort | null>(null);

  /* `?order=<id>` opens the document. The param is not decoration: Service
     Cases already deep-link an order this way (J2), so the register keeps the
     door that exists rather than minting a second one. */
  const [params, setParams] = useSearchParams();
  const openOrderId = params.get("order");
  const openDocument = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("order", id);
    else next.delete("order");
    setParams(next, { replace: true });
  };

  const { data, isLoading, isError, error, refetch } = useOperationOrders({});

  const all = useMemo<RegisterRow[]>(() => {
    const orders = data?.orders ?? [];
    return orders.filter((o) => !isRental(o)).map((o) => {
      const money = moneyOfOrder(o);
      const value = valueState(money);
      const outstanding = outstandingState(money);
      const phone = o.customer_phone ?? "";
      const promised = o.delivery_date_tbd ? null : (o.delivery_date ?? null);
      return {
        o,
        id: o.id,
        so: o.so,
        customer: o.customer_name,
        phone,
        salesperson: o.salespersons?.name ?? "",
        outlet: o.outlets?.name ?? "",
        items: itemsSummary(o),
        promised,
        /* `TBD` is a banned word (COPY-STANDARD: no to-do word; and it is
           listed as a rejected spelling). `No date yet` is the approved shape. */
        promisedLabel: promised ? fmtDate(promised) : "No date yet",
        ordered: o.placed_at,
        value,
        outstanding,
        sortValue: value.kind === "amount" ? value.value : -1,
        sortOutstanding: outstanding.kind === "amount" ? outstanding.value : -1,
        needle: searchHaystack(o),
        phoneDigits: digits(phone),
      };
    });
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = digits(q);
    return all.filter((r) => {
      if (scope === "live" && isDelivered(r.o)) return false;
      /* The range reads the ORDERED date — the register's own spine. What the
         promise DOES is a question for the module that owns the promise. */
      const day = r.ordered.slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (!q) return true;
      if (r.needle.includes(q)) return true;
      if (qDigits.length >= 3 && r.phoneDigits.includes(qDigits)) return true;
      return false;
    });
  }, [all, search, from, to, scope]);

  const rows = useMemo(() => {
    const out = [...filtered];
    const dir = sort?.dir === "asc" ? 1 : -1;
    const cmp: Record<string, (a: RegisterRow, b: RegisterRow) => number> = {
      so: (a, b) => a.so - b.so,
      customer: (a, b) => a.customer.localeCompare(b.customer),
      items: (a, b) => a.items.localeCompare(b.items),
      value: (a, b) => a.sortValue - b.sortValue,
      promised: (a, b) => (a.promised ?? "").localeCompare(b.promised ?? ""),
      ordered: (a, b) => a.ordered.localeCompare(b.ordered),
      phone: (a, b) => a.phone.localeCompare(b.phone),
      salesperson: (a, b) => a.salesperson.localeCompare(b.salesperson),
      outlet: (a, b) => a.outlet.localeCompare(b.outlet),
      outstanding: (a, b) => a.sortOutstanding - b.sortOutstanding,
    };
    const by = sort ? cmp[sort.key] : undefined;
    if (!by) return out.sort((a, b) => b.ordered.localeCompare(a.ordered));
    return out.sort((a, b) => by(a, b) * dir);
  }, [filtered, sort]);

  const columns = useMemo<readonly Column<RegisterRow>[]>(() => {
    const defaults: Column<RegisterRow>[] = [
      {
        key: "so",
        label: "SO No",
        width: W.so,
        sortable: true,
        cell: (r) => `SO-${r.so}`,
      },
      {
        key: "customer",
        label: "Customer",
        width: W.customer,
        sortable: true,
        cell: (r) => r.customer,
      },
      {
        key: "items",
        label: "Items",
        width: W.items,
        sortable: true,
        cell: (r) => r.items,
      },
      {
        key: "value",
        label: "Value",
        width: W.value,
        align: "right",
        numeric: true,
        sortable: true,
        cell: (r) => moneyCell(r.value),
      },
      {
        key: "promised",
        label: "Promised",
        width: W.promised,
        sortable: true,
        cell: (r) => r.promisedLabel,
      },
      {
        key: "ordered",
        label: "Ordered",
        width: W.ordered,
        sortable: true,
        cell: (r) => fmtDate(r.ordered),
      },
    ];

    const extras: Record<ExtraKey, Column<RegisterRow>> = {
      /* `Not given` = the CUSTOMER did not provide it. `Not recorded` = WE never
         captured it. Two different facts, and COPY-STANDARD keeps them apart:
         one is chaseable and the other never was. */
      phone: {
        key: "phone",
        label: "Phone",
        width: W.phone,
        sortable: true,
        cell: (r) => r.phone || "Not given",
      },
      salesperson: {
        key: "salesperson",
        label: "Salesperson",
        width: W.salesperson,
        sortable: true,
        cell: (r) => r.salesperson || "Not recorded",
      },
      outlet: {
        key: "outlet",
        label: "Outlet",
        width: W.outlet,
        sortable: true,
        cell: (r) => r.outlet || "Not recorded",
      },
      outstanding: {
        key: "outstanding",
        label: "Outstanding",
        width: W.outstanding,
        align: "right",
        numeric: true,
        sortable: true,
        cell: (r) => moneyCell(r.outstanding),
      },
    };

    return [
      ...defaults,
      ...EXTRA_COLUMNS.filter((c) => shown.has(c.key)).map((c) => extras[c.key]),
    ];
  }, [shown]);

  const chips: ActiveChip[] = [];
  if (search.trim())
    chips.push({ label: `Search: ${search.trim()}`, onClear: () => setSearch("") });
  if (from)
    chips.push({ label: `Ordered from ${fmtDate(from)}`, onClear: () => setFrom(null) });
  if (to) chips.push({ label: `Ordered to ${fmtDate(to)}`, onClear: () => setTo(null) });
  if (scope === "all")
    chips.push({ label: "All orders", onClear: () => setScope("live") });

  /* The register hands over to the DOCUMENT and stops. It passes no signals,
     no journey and no derivation — a register answers "what records exist",
     and the document answers "what did this customer commit to". */
  if (openOrderId) {
    return (
      <SalesOrderDocument
        orderId={openOrderId}
        onClose={() => openDocument(null)}
      />
    );
  }

  const narrowed = rows.length !== all.length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModuleHeader
        testId="sales-orders-header"
        icon={ClipboardList}
        word="Sales Orders"
        docTitle="Sales Orders — Carres"
        right={
          <Button size="sm" variant="ghost" onClick={() => void refetch()}>
            Refresh
          </Button>
        }
      />

      <div className="min-h-0 flex-1">
        <PageShell
          variant="list"
          chips={chips}
          toolbar={
            <>
              {/* Search is the primary element of the toolbar (SO-1 FINAL). */}
              <span className="w-80 shrink-0">
                <SearchInput
                  id="sales-orders-search"
                  pill
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="SO number, customer, phone or item…"
                />
              </span>
              <span className="flex items-center gap-1">
                <span className="text-label text-base-500">Ordered</span>
                <span className="w-36">
                  <DatePicker
                    id="sales-orders-from"
                    value={from}
                    onChange={setFrom}
                    placeholder="From"
                  />
                </span>
                <span className="w-36">
                  <DatePicker
                    id="sales-orders-to"
                    value={to}
                    onChange={setTo}
                    placeholder="To"
                  />
                </span>
              </span>
              <span className="w-40">
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
            </>
          }
          toolbarRight={
            <Popover
              label="Choose columns"
              align="end"
              trigger={
                <Button size="sm" variant="neutral" data-testid="columns-button">
                  Columns
                </Button>
              }
            >
              <div className="flex w-56 flex-col gap-3">
                <p className="text-label text-base-500">
                  Extra facts. Cleared on reload.
                </p>
                {EXTRA_COLUMNS.map((c) => (
                  <Checkbox
                    key={c.key}
                    id={`column-${c.key}`}
                    label={c.label}
                    checked={shown.has(c.key)}
                    onCheckedChange={(on) =>
                      setShown((prev) => {
                        const next = new Set(prev);
                        if (on) next.add(c.key);
                        else next.delete(c.key);
                        return next;
                      })
                    }
                  />
                ))}
              </div>
            </Popover>
          }
          footer={
            <span data-testid="register-count">
              {narrowed
                ? `${rows.length} of ${all.length} orders`
                : `${all.length} orders`}
            </span>
          }
        >
          {isError ? (
            <div className="flex min-h-0 flex-1 flex-col rounded-card border border-kit-slate-5 bg-white">
              <EmptyState
                title="The register could not be loaded"
                detail={(error as Error | undefined)?.message}
                action={
                  <Button variant="neutral" onClick={() => void refetch()}>
                    Try again
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col [container-type:inline-size]">
              <DataTable
                rows={rows}
                columns={columns}
                rowId={(r) => r.id}
                testId="sales-orders-table"
                rowTestId="sales-order-row"
                label="Sales orders"
                loading={isLoading}
                sizing="content"
                sort={sort}
                onSortChange={setSort}
                /* The whole row opens the document. There is no second control
                   on the row, because a register has no actions. */
                onRowOpen={(r) => openDocument(r.id)}
                empty={
                  <div className="w-[100cqi]">
                    <EmptyState
                      title={
                        search.trim() || from || to
                          ? "No order matches this search"
                          : "No orders yet"
                      }
                    />
                  </div>
                }
              />
            </div>
          )}
        </PageShell>
      </div>
    </div>
  );
}
