/**
 * SalesOrdersRegister — SO-1 FINAL, upgraded in place by SO-3 (Loo 2026-08-09).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THE REGISTER LAW STILL RULES THE GRID, AND SO-3 CHANGES ONE CLAUSE OF IT
 *
 *   "Forget web applications. Build this page as if you were building Microsoft
 *    Excel. Every order is exactly ONE row. Every column is exactly ONE fact.
 *    A row may NEVER be taller than another row. The register never expands and
 *    never explains."
 *
 * Everything in that law still holds — no expansion, no workflow column, no
 * action, rentals excluded at the source, one height for every row. **What
 * SO-3 changes is the Customer cell**, which now carries the phone under the
 * name, and that is the owner's newer ruling on his own law rather than a
 * chat's exception:
 *
 * ```
 * SO-1  "no cell may contain another layout"        → one string per cell
 * SO-3  "Customer cell: phone under the name"       → ONE cell, TWO lines
 * ```
 * It survives the clause the law is actually FOR: *a row may never be taller
 * than another row.* `text-body` is 18px of line-height and `text-meta` is 16 —
 * the stack is 34px, which is exactly the row height the same card asks for
 * (`density: −15%`, `tokens.ts` `ROW_HEIGHT`). **The two halves of that
 * instruction are one decision, and they arrive in one row height.**
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THE SEVEN GRID CAPABILITIES, AND WHERE EACH ONE LIVES
 *
 * ```
 * sortable every column      kit  DataTable.sort            (SO-1 wired it)
 * filter row under header    kit  Column.filterInput        SO-3, new to the kit
 * freeze SO No + Customer    kit  DataTable.freeze          SO-3, new to the kit
 * resize                     kit  DataTable.layout          existed, now wired
 * show / hide columns        page the chooser + Reset
 * keyboard ↑ ↓               kit  DataTable.activeRow       SO-3, new to the kit
 * instant panel update       page the panel reads the row the grid is ON
 * ```
 * **Four are kit powers because a grid capability drawn inside one page is a
 * capability the next register has to redraw.** Every one is an OPTIONAL prop:
 * the three frozen pages that render `DataTable` pass none of them and emit the
 * markup they emitted before (`ui/MASTER.md` §4).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PANEL DOES NOT REPLACE THE REGISTER — and that is the F31 defect closed.
 * `?order=<id>` opens the **Sales Order panel** beside the grid; the grid stays
 * mounted, the arrows keep working, and `?view=document` is the full-page
 * printable Sales Order, kept as its own screen because it is the thing you
 * print. SO-1's debt D-G recorded exactly this.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SEARCH IS STILL CLIENT-SIDE, AND IT IS STILL ONE DEBT WITH THE 200-ROW CAP.
 * The server searches customer name, imported ref and SO number — not phone,
 * not item. Passing `search` would make two of the four fields silently dead.
 * See `docs/MIGRATION-MAP.md` D-A · D-B.
 */
import { useCallback, useMemo, useState } from "react";
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
/* `cjkClassName` is deliberately NOT imported for the CELLS, and it is a
   decision rather than an omission — see `docs/MIGRATION-MAP.md` D-H. Measured
   2026-08-09: 0 of 77 live customer names carry a CJK character. When one
   arrives the font belongs on the kit's `<td>`, where every column gets it. */
import { useOperationOrders } from "@/lib/queries";
import ModuleHeader from "./components/ModuleHeader";
import SalesOrderDocument from "./SalesOrderDocument";
import SalesOrderPanel from "./SalesOrderPanel";
import { digits, isDelivered, isRental, type MoneyState } from "./sales-order-facts";
import {
  buildRegisterRow,
  DEFAULT_COLUMNS,
  FIELD_GROUPS,
  fieldByKey,
  FROZEN_COLUMNS,
  passesColumnFilters,
  REGISTER_FIELDS,
  toCsv,
  type RegisterRow,
} from "./sales-order-columns";

/** ONE cell, ONE fact. A money state is a number or a sentence, never nothing. */
function moneyCell(state: MoneyState) {
  if (state.kind === "amount") return <Money value={state.value} />;
  return state.kind === "settled" ? "Paid in full" : "No price yet";
}

/**
 * The only two cells that are not their own `text` string.
 *
 * `customer` is the card's stacked cell; the three money columns render
 * `Money`, which owns the `RM ` and the grouping. Everything else prints the
 * catalog's string, so a column's filter and its cell can never disagree.
 */
const CELL: Record<string, (r: RegisterRow) => React.ReactNode> = {
  customer: (r) => (
    /* TWO LINES, ONE ROW HEIGHT. `leading-none`-free on purpose: the two type
       tokens already carry their line-heights, and 18 + 16 = the 34px row. */
    <span className="flex flex-col justify-center">
      <span className="text-body truncate text-kit-slate-12">{r.customer}</span>
      <span className="text-meta truncate text-kit-slate-11">
        {r.phone || "Not given"}
      </span>
    </span>
  ),
  value: (r) => moneyCell(r.value),
  paid: (r) => moneyCell(r.paid),
  outstanding: (r) => moneyCell(r.outstanding),
};

export default function SalesOrdersRegister() {
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [scope, setScope] = useState<"live" | "all">("live");
  const [shown, setShown] = useState<readonly string[]>(DEFAULT_COLUMNS);
  const [filters, setFilters] = useState<ReadonlyMap<string, string>>(new Map());
  const [sort, setSort] = useState<TableSort | null>(null);

  /* `?order=<id>` opens the PANEL beside the register; `?view=document` swaps
     to the full-page printable Sales Order. Both are on the URL, so Back works
     and Service Cases' existing `?order=` deep link (J2) still lands on this
     order — it now lands on the panel instead of replacing the page. */
  const [params, setParams] = useSearchParams();
  const openOrderId = params.get("order");
  const documentMode = params.get("view") === "document";
  const setOpen = useCallback(
    (id: string | null, view?: "document") => {
      const next = new URLSearchParams(params);
      if (id) next.set("order", id);
      else next.delete("order");
      if (view) next.set("view", view);
      else next.delete("view");
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const { data, isLoading, isError, error, refetch } = useOperationOrders({});

  const all = useMemo<RegisterRow[]>(
    () => (data?.orders ?? []).filter((o) => !isRental(o)).map(buildRegisterRow),
    [data],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = digits(q);
    return all.filter((r) => {
      if (scope === "live" && isDelivered(r.o)) return false;
      /* The range reads the ORDERED date — the register's own spine. */
      const day = r.ordered.slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (!passesColumnFilters(r, filters)) return false;
      if (!q) return true;
      if (r.needle.includes(q)) return true;
      if (qDigits.length >= 3 && r.phoneDigits.includes(qDigits)) return true;
      return false;
    });
  }, [all, search, from, to, scope, filters]);

  const rows = useMemo(() => {
    const out = [...filtered];
    const field = sort ? fieldByKey(sort.key) : undefined;
    if (!field) return out.sort((a, b) => b.ordered.localeCompare(a.ordered));
    const dir = sort?.dir === "asc" ? 1 : -1;
    const key = field.sortBy ?? field.text;
    return out.sort((a, b) => {
      const x = key(a);
      const y = key(b);
      const cmp =
        typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y));
      return cmp * dir;
    });
  }, [filtered, sort]);

  const setFilter = useCallback((key: string, value: string) => {
    setFilters((prev) => {
      const next = new Map(prev);
      if (value === "") next.delete(key);
      else next.set(key, value);
      return next;
    });
  }, []);

  const columns = useMemo<readonly Column<RegisterRow>[]>(
    () =>
      shown
        .map(fieldByKey)
        .filter((f): f is NonNullable<typeof f> => f != null)
        .map((f) => ({
          key: f.key,
          label: f.label,
          width: f.width,
          align: f.align,
          numeric: f.numeric,
          /* EVERY column sorts and EVERY column filters — the card's first two
             capabilities, and they are properties of the catalog rather than of
             a hand-maintained list that can fall behind it. */
          sortable: true,
          filterInput: {
            value: filters.get(f.key) ?? "",
            onChange: (v: string) => setFilter(f.key, v),
            label: `Filter ${f.label}`,
          },
          cell: CELL[f.key] ?? ((r: RegisterRow) => f.text(r)),
        })),
    [shown, filters, setFilter],
  );

  const chips: ActiveChip[] = [];
  if (search.trim())
    chips.push({ label: `Search: ${search.trim()}`, onClear: () => setSearch("") });
  if (from)
    chips.push({ label: `Ordered from ${fmtDate(from)}`, onClear: () => setFrom(null) });
  if (to) chips.push({ label: `Ordered to ${fmtDate(to)}`, onClear: () => setTo(null) });
  if (scope === "all")
    chips.push({ label: "All orders", onClear: () => setScope("live") });
  for (const [key, value] of filters) {
    const f = fieldByKey(key);
    if (f && value.trim())
      chips.push({ label: `${f.label}: ${value}`, onClear: () => setFilter(key, "") });
  }

  const position = openOrderId ? rows.findIndex((r) => r.id === openOrderId) : -1;
  const step = useCallback(
    (delta: -1 | 1) => {
      if (position < 0) return;
      const next = rows[position + delta];
      if (next) setOpen(next.id);
    },
    [position, rows, setOpen],
  );

  const exportCsv = () => {
    const csv = toCsv(shown, rows);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "sales-orders.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  /* THE FULL DOCUMENT IS ITS OWN SCREEN. It is the printable Sales Order and it
     is what `⤢` opens; the register is unmounted while it is open, exactly as
     SO-1 shipped it, because a document you print is not a panel. */
  if (openOrderId && documentMode) {
    return (
      <SalesOrderDocument
        orderId={openOrderId}
        onClose={() => setOpen(openOrderId)}
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

      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <PageShell
            variant="list"
            chips={chips}
            toolbar={
              <>
                {/* ⭐ SEARCH IS THE PAGE'S LOUDEST CONTROL (SO-3). It is the
                    first thing an operator with a customer on the phone reaches
                    for, so it is 384px against the 128 its neighbours get —
                    three times the next widest control on the band.
                    **The number is a measurement, not a preference.** Measured
                    on the rendered page at 1440: the sidebar takes 288, the
                    shell's own padding 48, and the right cluster (Columns +
                    Export) 168. A 448px search overflowed that budget and the
                    scope Select rendered UNDER the Columns button — caught by
                    looking, not by a test. 384 + 56 + 128 + 128 + 144 + gaps
                    lands inside it with room, and the search is still dominant.

                    **AND IT IS THE CONTROL THAT ABSORBS THE SQUEEZE**, which is
                    the second thing looking at it taught: with the panel open
                    the band loses another 420px, and a `shrink-0` search pushed
                    the scope Select back under the Columns button. So the
                    search is `flex-1` up to its 384 cap — widest when there is
                    room, narrowest when there is not — and the two date fields
                    and the scope keep their size, because a date field that
                    shrinks stops showing a date. One line, always. */}
                <span className="min-w-0 max-w-96 flex-1">
                  <SearchInput
                    id="sales-orders-search"
                    pill
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="SO number, customer, phone or item…"
                  />
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <span className="text-label text-base-500">Ordered</span>
                  <span className="w-32">
                    <DatePicker
                      id="sales-orders-from"
                      value={from}
                      onChange={setFrom}
                      placeholder="From"
                    />
                  </span>
                  <span className="w-32">
                    <DatePicker
                      id="sales-orders-to"
                      value={to}
                      onChange={setTo}
                      placeholder="To"
                    />
                  </span>
                </span>
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
              </>
            }
            toolbarRight={
              <>
                <Popover
                  label="Choose columns"
                  align="end"
                  trigger={
                    <Button size="sm" variant="neutral" data-testid="columns-button">
                      Columns
                    </Button>
                  }
                >
                  <div className="flex max-h-96 w-64 flex-col gap-3 overflow-y-auto">
                    <p className="text-label text-base-500">
                      Extra facts. Cleared on reload.
                    </p>
                    {FIELD_GROUPS.map((group) => (
                      <div key={group} className="flex flex-col gap-1.5">
                        <span className="text-label text-base-500">{group}</span>
                        {REGISTER_FIELDS.filter((f) => f.group === group).map((f) => (
                          <Checkbox
                            key={f.key}
                            id={`column-${f.key}`}
                            label={f.label}
                            checked={shown.includes(f.key)}
                            onCheckedChange={(on) =>
                              setShown((prev) => {
                                if (on) {
                                  /* A column re-appears where the CATALOG puts
                                     it, never at the end — otherwise ticking
                                     Phone twice moves it. */
                                  const next = new Set([...prev, f.key]);
                                  return REGISTER_FIELDS.filter((x) =>
                                    next.has(x.key),
                                  ).map((x) => x.key);
                                }
                                setFilter(f.key, "");
                                return prev.filter((k) => k !== f.key);
                              })
                            }
                          />
                        ))}
                      </div>
                    ))}
                    <Button
                      size="sm"
                      variant="ghost"
                      data-testid="columns-reset"
                      onClick={() => {
                        setShown(DEFAULT_COLUMNS);
                        setFilters(new Map());
                      }}
                    >
                      Reset columns
                    </Button>
                  </div>
                </Popover>
                <Button
                  size="sm"
                  variant="neutral"
                  data-testid="export-button"
                  disabled={rows.length === 0}
                  onClick={exportCsv}
                >
                  Export
                </Button>
              </>
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
                  density="compact"
                  freeze={FROZEN_COLUMNS}
                  sort={sort}
                  onSortChange={setSort}
                  layout={{
                    resizeLabel: "Drag to resize",
                    reorderLabel: "Drag to reorder",
                  }}
                  activeRow={{
                    id: openOrderId,
                    label: "Sales orders",
                    /* ↑ ↓ CHANGE THE PANEL. There is no second press: the row
                       the operator is on IS the order the panel shows. */
                    onChange: (id) => setOpen(id),
                    onOpen: (id) => setOpen(id, "document"),
                  }}
                  onRowOpen={(r) => setOpen(r.id)}
                  empty={
                    <div className="w-[100cqi]">
                      <EmptyState
                        title={
                          search.trim() || from || to || filters.size > 0
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

        {openOrderId && (
          <SalesOrderPanel
            orderId={openOrderId}
            position={position >= 0 ? position + 1 : 0}
            total={rows.length}
            onStep={step}
            onOpenDocument={() => setOpen(openOrderId, "document")}
            onClose={() => setOpen(null)}
          />
        )}
      </div>
    </div>
  );
}
