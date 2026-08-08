/**
 * SalesOrdersRegister — SO-1, the Sales Orders register (Loo, 2026-08-08).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS PAGE IS, AND WHAT IT DELIBERATELY IS NOT
 *
 * `docs/orders/MASTER.md` §0 froze the charter: *"Sales Order is the operational
 * home of the customer order: find any order, see what needs attention,
 * understand the whole journey — while EXECUTION stays with the module that owns
 * it."* SO-1 builds the FIRST half of that and states plainly that it is the
 * first half:
 *
 *   REGISTER          find any order, ever                        ← THIS FILE
 *   PROMISE MONITOR   is the promise still good, is anything          V2, and it
 *                     blocking it                                      arrives as
 *                                                                      ONE shared
 *                                                                      read model
 *
 * **THE RED LINE, and it is enforced by what this file imports.** Every column
 * reads a fact the CUSTOMER ORDER owns — the SO number, the customer, the lines
 * they bought, the date we promised, the money. There is no stock column, no
 * delivery column, no next-action column and no health dot, because every one of
 * those is another module's record and `../../../../docs/ERP-ARCHITECTURE.md`
 * Law B makes a cross-module display READ-ONLY forever. The cheapest way to keep
 * a boundary is to not import across it: this file imports NO stock, delivery,
 * purchasing, booking or action module.
 *
 * **`journey` is deliberately NOT passed to the drawer.** Its own prop doc says
 * absent means *"the journey strip renders nothing rather than run a second
 * derivation that could disagree with the row it came from"* — which is exactly
 * the behaviour a register wants. The drawer keeps every one of its own powers.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO FUNCTIONS ARE IMPORTED FROM THE OLD PAGE, AND THAT IS LAW D, NOT LAZINESS
 *
 * `moneyOf` and `stageOf` are pure, already exported, and `OperationDelivery`
 * already imports exactly this way with the reason written above its import:
 * *"the same computed actions the Orders list shows, so the two pages can never
 * disagree"*. Re-composing `orderMoney` + `storageHold` here would be a SECOND
 * arithmetic for one number — `ERP-ARCHITECTURE.md` Law D's named failure. The
 * card also says the old implementation may not be touched, so the function
 * cannot move today. When `OperationOrdersControl` is finally retired, both move
 * to `@carres/shared` — recorded in `docs/MIGRATION-MAP.md`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SEARCH IS CLIENT-SIDE ON PURPOSE, AND IT IS ONE DEBT, NOT TWO
 *
 * The card's first screen searches SO · customer · phone · item. The server
 * (`apps/api/src/routes/operation/orders.ts:184`) searches customer name, the
 * imported ref and the SO number — **not phone, not item.** Passing `search` to
 * the server would therefore make two of the four fields silently dead. So this
 * page passes no `search` and filters the fetched page itself: all four fields
 * work today, and they stop working at exactly the same row count as the
 * server's `.limit(200)` (`orders.ts:192`). ONE debt with one fix — a thin
 * server-paged list endpoint — instead of two that expire at different times.
 * Recorded in `docs/MIGRATION-MAP.md`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE COLUMN CHOOSER DOES NOT PERSIST, AND THAT IS A RULING BEING HONOURED
 *
 * SO-1 asks for extra fact columns behind a picker. `docs/orders/MASTER.md` §3
 * records that `carres.orders.hiddenCols` — a localStorage store of column
 * visibility — was RULED AGAINST by Loo on 2026-08-04 (grid-findings F58 · F61)
 * and deleted in S1, and `docs/ui/MASTER.md` §7 carries *"Layout memory —
 * REFUSED, not deferred."* Both hold. This chooser is session state and nothing
 * else: a reload restores the company's shape, exactly as `DataTable`'s own
 * column drag already behaves. Whether a NAMED layout with a company default
 * (AutoCount's own answer, grid-findings F44) should exist is the owner's call
 * and is parked, not decided here.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WIDTHS ARE MEASURED, NOT CHOSEN
 *
 * `docs/orders/MASTER.md` §10: *"Widths are MEASURED in a real browser. jsdom
 * has no widths. A guessed number is never written down."* Every number in
 * `W` below was read from `getBoundingClientRect()` in real Chromium at
 * 1440×900, with Inter and JetBrains Mono actually loaded (`document.fonts`
 * checked, not assumed), against each cell's own markup — and `+16` for the
 * kit's uniform `px-2`, the four-pixel-per-side loss S1 recorded and S3.1 paid.
 * The harness reproduced `CR0925 +2` at 70.2px, byte-for-byte the number S3.1
 * recorded, which is the control proving the conditions match.
 */
import { useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
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
import { cjkClassName } from "@/lib/cjk";
import { useOperationOrders, type operationOrderListRow } from "@/lib/queries";
import ModuleHeader from "./components/ModuleHeader";
import OrderDetailDrawer from "./components/OrderDetailDrawer";
import { moneyOf, stageOf } from "./OperationOrdersControl";

/* ── MEASURED COLUMN WIDTHS ────────────────────────────────────────────────────
 *
 * Every number is the INK width of the real cell, read with a `Range` over the
 * cell's contents in real Chromium at 1440×900 against this app's own built
 * stylesheet, with Inter and JetBrains Mono confirmed loaded. `+16` is the kit's
 * uniform `px-2`, measured as 16 on the rendered `<td>`, not assumed.
 *
 *   column        cell ink   header ink   width   the string that sets it
 *   SO No             54.6         33.4      87   `SO-100257` (70.2 + 16)
 *   Customer         169.3         51.4     188   `MyHouse Management PLT`
 *   Items            440.5         28.9     459   two live lines, below
 *   Promised          96.4         49.5     113   `Wed, 19 Aug 26`
 *   Outstanding       61.6         64.3     109   `RM 1,234,567` (93 + 16)
 *
 * **A TRUNCATING COLUMN GETS +2, AND THAT IS NOT A FUDGE.** `ink + 16` is the
 * exact fit, and an exact fit still ellipsises: the browser rounds the content
 * box and the text run independently, so `MyHouse Management PLT` at 169.3 in a
 * 170.0 box drew as `MyHouse Management P…` on the first screenshot while every
 * arithmetic check said it fitted. `Customer` and `Items` are the two cells that
 * TRUNCATE, so both carry 2px over the measurement. `SO No`, `Promised` and
 * `Outstanding` do not truncate and take the measurement flat.
 *
 * ⚠ **A STANDALONE HARNESS IS NOT THE REAL CELL, AND THIS CARD PROVED IT AGAIN.**
 * The first pass measured these strings in a hand-built page with the same
 * font-family, size and weight. Every MONO number came out identical to the real
 * cell to the tenth of a pixel (`SO-1272` 54.6 = 54.6, `CR0925 +2` 70.2 = 70.2,
 * which is also the number S3.1 recorded). Every INTER number came out 3–6px
 * NARROW — `MyHouse Management PLT` 165.6 against a real 169.3, `Wed, 22 Jul 26`
 * 90.8 against a real 96.4 — because the app's own base stylesheet tracks its
 * sans text and a bare `font-family: Inter` does not. Shipping the harness's
 * numbers would have clipped `Customer` on the widest live name and the MONTH
 * off every date. The numbers above are the rendered page's; the harness is kept
 * only for the strings that do not exist in the data yet.
 *
 * `SO No` is sized to **SO-100257**, not to today's `SO-1257`. At the 1,000
 * orders/month this card is designed for, six digits arrive inside a decade and
 * the sixth costs 16px once instead of a re-measure later.
 *
 * `Outstanding` is sized to **RM 1,234,567**, not to today's largest live order
 * (RM 11,246). S3.3's finding is the reason: sizing a composed cell to the widest
 * value that happens to be in the database today is how `Actions` was sized off
 * nearly the narrowest string in its family. A money column's family is digits.
 * Its HEADER is the wider claim here (92 + 16 = 108), which is why 109 holds both.
 *
 * `Promised` deliberately carries no `truncate`. §3 records why on the old
 * Deadline cell: an ellipsis costs the MONTH to signal something already
 * visible. So this column must never be short, and 113 is the measured date at
 * its widest month.
 *
 * `Items` is the one UNBOUNDED column and it is sized to the widest LIVE
 * two-line composition — `1× 1013Jager/Fab3-King/PC151-01 · 1× 1013Jager/Fab3-
 * Queen/PC151-01`, 440.5 + 16. Longer orders truncate, and that truncation is
 * ACCEPTED for one reason only: the row expansion holds every line in full, so
 * nothing is unreachable. (Those SKU strings are the 16 free-text SKUs
 * `docs/ui/MASTER.md` §6.5 still owes real names; when they get them this column
 * gets narrower, not wider.)
 *
 * Table total = 87 + 188 + 459 + 113 + 109 + 42 (the kit's expansion gutter at
 * `sizing="content"`) = **998px**. Verified on the rendered page: every column
 * holds its declared pixel and ZERO cells clip at BOTH 1440 and 1130 — the
 * ~1130px window where S1's regression was found. Above the sum the kit's FILLER
 * takes the slack and no column inflates: S3.1's rule, unchanged.
 */
const W = {
  so: "87px",
  customer: "188px",
  items: "459px",
  promised: "113px",
  outstanding: "109px",
  /* The chooser's columns, measured the same way and on the same day.
     `phone` and `ref` are MONO, so the harness figure is exact (proved above);
     `ordered` is the same Inter date as `promised`; `value` the same money. */
  phone: "110px",
  ordered: "113px",
  ref: "87px",
  value: "109px",
} as const;

/** The extra fact columns, hidden until the operator asks for one. */
const EXTRA_COLUMNS = [
  { key: "phone", label: "Phone" },
  { key: "ordered", label: "Ordered" },
  { key: "ref", label: "Ref" },
  { key: "value", label: "Value" },
] as const;
type ExtraKey = (typeof EXTRA_COLUMNS)[number]["key"];

/** Digits only, so `012-345 6789` and `0123456789` are one customer. */
function digits(s: string): string {
  return s.replace(/\D+/g, "");
}

/** The order's lines as one line of text: `2× SKU · 1× SKU`. A FACT — no
 *  category, no catalog join, no classification. `lineCategory` is deliberately
 *  not called: "what kind of product is this" is Catalog's question and
 *  `ERP-ARCHITECTURE.md` §0 records it as the D9 defect. */
function itemsLine(o: operationOrderListRow): string {
  const lines = o.order_lines ?? [];
  return lines
    .map((l) => `${l.qty}× ${l.sku}`)
    .join(" · ");
}

/** Delivered is the only completion fact the ORDER itself carries. It is not
 *  "settled" — `docs/orders/MASTER.md` §2.4: *"Delivered is not paid."* The
 *  filter says `Not delivered`, which is what it actually selects. */
function isDelivered(o: operationOrderListRow): boolean {
  return stageOf(o) === "delivered";
}

/** Everything one row of the register needs, computed once. */
interface RegisterRow {
  o: operationOrderListRow;
  id: string;
  so: number;
  customer: string;
  phone: string;
  items: string;
  refs: string;
  promised: string | null;
  promisedLabel: string;
  ordered: string;
  outstanding: number;
  value: number | null;
  /** Lowercased haystack for the four search fields. */
  needle: string;
  phoneDigits: string;
}

export default function SalesOrdersRegister({
  onImport,
}: {
  onImport?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [scope, setScope] = useState<"live" | "all">("live");
  const [shown, setShown] = useState<ReadonlySet<ExtraKey>>(
    () => new Set<ExtraKey>(),
  );
  const [sort, setSort] = useState<TableSort | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  /* No `search` param — see the file header. The server would answer for two of
     the four fields and silently drop the other two. */
  const { data, isLoading, isError, error, refetch } = useOperationOrders({});

  const all = useMemo<RegisterRow[]>(() => {
    const orders = data?.orders ?? [];
    return orders.map((o) => {
      const money = moneyOf(o);
      const items = itemsLine(o);
      const refs = (o.source_ref ?? []).filter(Boolean).join(" ");
      const phone = o.customer_phone ?? "";
      const promised = o.delivery_date_tbd ? null : (o.delivery_date ?? null);
      return {
        o,
        id: o.id,
        so: o.so,
        customer: o.customer_name,
        phone,
        items,
        refs,
        promised,
        /* `TBD` is a banned word (COPY-STANDARD §"no to-do word"; it is also
           listed as a REJECTED spelling beside "No logistics picked"). The
           approved shape for an unfixed date is "no date yet". */
        promisedLabel: promised ? fmtDate(promised) : "No date yet",
        ordered: o.placed_at,
        outstanding: money.outstanding,
        value: money.known ? money.total : null,
        needle: [`so-${o.so}`, String(o.so), o.customer_name, refs, items]
          .join(" ")
          .toLowerCase(),
        phoneDigits: digits(phone),
      };
    });
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = digits(q);
    return all.filter((r) => {
      if (scope === "live" && isDelivered(r.o)) return false;
      /* The date range reads the ORDERED date — the register's own spine. What
         the promise does is the Promise Monitor's question, not the register's,
         and filtering a register by a date it does not sort on hides orders for
         a reason the operator cannot see. */
      const day = r.ordered.slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (!q) return true;
      if (r.needle.includes(q)) return true;
      /* A phone matches on digits, so `012-345 6789` answers `0123456789`. */
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
      promised: (a, b) => (a.promised ?? "").localeCompare(b.promised ?? ""),
      outstanding: (a, b) => a.outstanding - b.outstanding,
      ordered: (a, b) => a.ordered.localeCompare(b.ordered),
      phone: (a, b) => a.phone.localeCompare(b.phone),
      ref: (a, b) => a.refs.localeCompare(b.refs),
      value: (a, b) => (a.value ?? -1) - (b.value ?? -1),
    };
    const by = sort ? cmp[sort.key] : undefined;
    /* No sort, or a sort on a column with no comparator: the register's own
       order — newest order first, the way a register reads. */
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
        cell: (r) => (
          <span className="font-mono tabular-nums font-semibold">
            SO-{r.so}
          </span>
        ),
      },
      {
        key: "customer",
        label: "Customer",
        width: W.customer,
        sortable: true,
        cell: (r) => (
          <span className={`block truncate ${cjkClassName(r.customer)}`} title={r.customer}>
            {r.customer}
          </span>
        ),
      },
      {
        key: "items",
        label: "Items",
        width: W.items,
        /* Not sortable: a composed sentence has no order an operator means. */
        cell: (r) =>
          r.items ? (
            <span className={`block truncate ${cjkClassName(r.items)}`} title={r.items}>
              {r.items}
            </span>
          ) : (
            "—"
          ),
      },
      {
        key: "promised",
        label: "Promised",
        width: W.promised,
        sortable: true,
        cell: (r) => r.promisedLabel,
      },
      {
        key: "outstanding",
        label: "Outstanding",
        width: W.outstanding,
        align: "right",
        numeric: true,
        sortable: true,
        /* `—` = nothing is owed. A BLANK cell = nobody has priced this order.
           Two different facts, and the live page spells both as empty. */
        cell: (r) =>
          r.value == null ? (
            <span aria-label="not priced" />
          ) : r.outstanding > 0 ? (
            <Money value={r.outstanding} />
          ) : (
            "—"
          ),
      },
    ];

    const extras: Record<ExtraKey, Column<RegisterRow>> = {
      phone: {
        key: "phone",
        label: "Phone",
        width: W.phone,
        sortable: true,
        cell: (r) =>
          r.phone ? (
            <span className="font-mono tabular-nums">{r.phone}</span>
          ) : (
            "—"
          ),
      },
      ordered: {
        key: "ordered",
        label: "Ordered",
        width: W.ordered,
        sortable: true,
        cell: (r) => fmtDate(r.ordered),
      },
      ref: {
        key: "ref",
        label: "Ref",
        width: W.ref,
        sortable: true,
        cell: (r) =>
          r.refs ? (
            <span className="font-mono truncate block" title={r.refs}>
              {r.refs}
            </span>
          ) : (
            "—"
          ),
      },
      value: {
        key: "value",
        label: "Value",
        width: W.value,
        align: "right",
        numeric: true,
        sortable: true,
        cell: (r) => (r.value == null ? <span aria-label="not priced" /> : <Money value={r.value} />),
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
  if (from) chips.push({ label: `Ordered from ${fmtDate(from)}`, onClear: () => setFrom(null) });
  if (to) chips.push({ label: `Ordered to ${fmtDate(to)}`, onClear: () => setTo(null) });
  if (scope === "all")
    chips.push({ label: "All orders", onClear: () => setScope("live") });

  /* §8.2 — the drawer REPLACES the register, which is what the live page does
     today and what `grid-findings` F31 files as a structural question. SO-1's
     instruction is to reuse the drawer as it stands, so the behaviour is
     reused as it stands and the question is recorded, not answered here. */
  if (openOrderId) {
    const idx = rows.findIndex((r) => r.id === openOrderId);
    return (
      <OrderDetailDrawer
        orderId={openOrderId}
        onClose={() => setOpenOrderId(null)}
        nav={
          idx >= 0
            ? {
                index: idx + 1,
                total: rows.length,
                onPrev: idx > 0 ? () => setOpenOrderId(rows[idx - 1].id) : undefined,
                onNext:
                  idx < rows.length - 1
                    ? () => setOpenOrderId(rows[idx + 1].id)
                    : undefined,
              }
            : undefined
        }
      />
    );
  }

  const narrowed = rows.length !== all.length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* The fixed header row. `word` is the sidebar's word and SO-1 names it:
          the page is Sales Orders. */}
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
              <span className="w-72 shrink-0">
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
            <>
              <span data-testid="register-count">
                {narrowed
                  ? `${rows.length} of ${all.length} orders`
                  : `${all.length} orders`}
              </span>
              {onImport && (
                <Button size="sm" variant="ghost" onClick={onImport}>
                  Import from AutoCount
                </Button>
              )}
            </>
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
                /* S3.1's rule: every column is its measured pixel and the
                   leftover goes to a filler that holds nothing. */
                sizing="content"
                sort={sort}
                onSortChange={setSort}
                onRowOpen={(r) => setOpenOrderId(r.id)}
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
                /* Expand has exactly ONE job: the lines of THIS order, in full,
                   because the Items column is the one column whose content is
                   unbounded. Nothing else may move in here. */
                expansion={{
                  expanded,
                  onToggle: (id) =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    }),
                  label: (r) =>
                    expanded.has(r.id) ? "Hide items" : "Show items",
                  expandable: (r) => (r.o.order_lines ?? []).length > 0,
                  render: (r) => <OrderLines row={r} />,
                }}
              />
            </div>
          )}
        </PageShell>
      </div>
    </div>
  );
}

/** The order's own lines, in full. Order-owned facts only: what was bought, how
 *  many, at what price. No stock state, no PO, no receiving — those are other
 *  modules' records and this panel may not grow one. */
function OrderLines({ row }: { row: RegisterRow }) {
  const lines = row.o.order_lines ?? [];
  return (
    <div className="px-3 py-2" data-testid="order-lines">
      <table className="w-full text-body">
        <thead>
          <tr className="text-label text-base-500">
            <th className="py-1 text-left font-medium">Item</th>
            <th className="py-1 text-right font-medium">Qty</th>
            <th className="py-1 text-right font-medium">Unit price</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={`${l.sku}-${i}`} className="border-t border-base-100">
              <td className={`py-1 ${cjkClassName(l.sku)}`}>{l.sku}</td>
              <td className="py-1 text-right tabular-nums">{l.qty}</td>
              <td className="py-1 text-right">
                {l.unit_price == null || Number(l.unit_price) === 0 ? (
                  "—"
                ) : (
                  <Money value={Number(l.unit_price)} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
