/**
 * Finance → Reports → Collection, at `/finance/reports/collection` (migration
 * 0644; Chew 2026-10-03, docs/finance/MASTER.md §3.6, after Houzs Part 10 §6).
 *
 * Per salesperson, for the orders placed in a period: the deposit taken with
 * them and its share of the order value, and how many fell below a chosen
 * share (`Deposit`); and for the delivered ones, the balance due, paid and
 * still owed (`Balance`). Opening a row lists the orders.
 *
 * Every figure is the shared collection arithmetic's (Law D); this page only
 * prints it. It reads Orders' and Payment's records and changes none.
 */
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  bp,
  collectionReport,
  pctWord,
  type CollectionAnswer,
  type CollectionOrder,
  type CollectionReport,
  type CollectionRow,
} from "@carres/shared/collection";
import DataTable, { type Column } from "@/components/kit/DataTable";
import DatePicker from "@/components/kit/DatePicker";
import Input from "@/components/kit/Input";
import Select from "@/components/kit/Select";
import Tabs from "@/components/kit/Tabs";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { REGISTER_FIELD_WIDTH as W } from "@/components/register/register-field-widths";
import { apiFetch } from "@/lib/api";
import { appTodayIso, fmtDate, fmtMonth } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import { ReadFailed } from "../payables/PayablesParts";
import { monthEnd, readPeriod, recentMonths, wholeMonth } from "./period";

type View = "deposit" | "balance";
const amount = (sen: number) => rm(sen / 100);
const who = (r: CollectionRow) => r.name ?? "No salesperson";

/** The threshold in the address: above 0 and at most 100, else 50. */
export function readBelow(v: string | null): number {
  const n = Number(v);
  return v !== null && v.trim() !== "" && Number.isFinite(n) && n > 0 && n <= 100 ? n : 50;
}

function Orders({ row, view }: { row: CollectionRow; view: View }) {
  const list = view === "balance" ? row.list.filter((o) => o.delivered) : row.list;
  const cols: readonly Column<CollectionOrder>[] = [
    // Plain words: the Sales Order page is Orders', and Finance does not open it from here.
    { key: "so", label: "SO No", width: "100px", cell: (o) => `SO-${o.so}` },
    { key: "placed", label: "SO Doc Date", width: "120px", cell: (o) => fmtDate(o.placedOn) },
    { key: "customer", label: "Customer", width: "220px", cell: (o) => o.customer ?? "" },
    { key: "value", label: "Order value", width: "130px", align: "right", numeric: true, cell: (o) => amount(o.value) },
    { key: "deposit", label: "Deposit", width: "120px", align: "right", numeric: true, cell: (o) => amount(o.deposit) },
    { key: "share", label: "Deposit %", width: "100px", align: "right", numeric: true, cell: (o) => pctWord(o.depositBp) },
    { key: "invoice", label: "Invoice", width: "160px", cell: (o) => o.invoiceNo ?? "" },
    { key: "paid", label: "Balance paid", width: "130px", align: "right", numeric: true, cell: (o) => (o.delivered ? amount(o.balancePaid) : "") },
    { key: "owed", label: "Outstanding", width: "130px", align: "right", numeric: true, cell: (o) => (o.delivered ? amount(o.outstanding) : "") },
  ];
  return <div className="p-4 text-body" data-testid={`collection-orders-${row.key}`}>
    <DataTable label={`${who(row)} orders`} testId="collection-orders" rows={list} columns={cols} rowId={(o) => o.id} sizing="content"
      empty={view === "balance" ? "No order of theirs placed in the period is delivered yet." : "No order."} />
  </div>;
}

export default function Collection() {
  const [params, setParams] = useSearchParams();
  const today = appTodayIso();
  const { from, to } = readPeriod(params, today);
  const month = wholeMonth(from, to);
  const view: View = params.get("view") === "balance" ? "balance" : "deposit";
  const below = readBelow(params.get("below"));
  const edit = (change: (next: URLSearchParams) => void) => setParams((before) => {
    const next = new URLSearchParams(before);
    change(next);
    return next;
  });

  const query = useQuery({
    queryKey: ["finance", "ledger", "collection", from, to],
    queryFn: () => apiFetch<CollectionAnswer>(`/api/finance/ledger/collection?${new URLSearchParams({ from, to }).toString()}`),
  });
  const report = useMemo((): CollectionReport | "unreadable" | null => {
    if (!query.data) return null;
    try {
      return collectionReport(query.data, below);
    } catch {
      return "unreadable";
    }
  }, [query.data, below]);
  const ready = report !== null && report !== "unreadable" ? report : null;

  const columns = useMemo<DataGridColumn<CollectionRow>[]>(() => {
    const money = (key: string, label: string, pick: (r: CollectionRow) => number, lines?: readonly [string, string]): DataGridColumn<CollectionRow> => ({
      key, label, headerLines: lines, width: W.amount + 14, align: "right", accessor: (r) => amount(pick(r)),
      numberValue: (r) => pick(r) / 100, exportValue: (r) => pick(r) / 100,
      footerTotal: (rows) => amount(rows.reduce((s, r) => s + pick(r), 0)),
    });
    const name: DataGridColumn<CollectionRow> = { key: "who", label: "Salesperson", width: 220, accessor: who,
      searchValue: who, exportValue: who };
    if (view === "deposit") {
      return [
        name,
        { key: "orders", label: "Orders", width: W.qty + 16, align: "right", accessor: (r) => String(r.orders), numberValue: (r) => r.orders,
          footerTotal: (rows) => String(rows.reduce((s, r) => s + r.orders, 0)) },
        money("value", "Order value", (r) => r.value),
        money("deposit", "Deposit", (r) => r.deposit),
        { key: "share", label: "Deposit %", width: 100, align: "right", accessor: (r) => pctWord(r.depositBp),
          numberValue: (r) => (r.depositBp === null ? null : r.depositBp / 100), exportValue: (r) => (r.depositBp === null ? "" : r.depositBp / 100),
          footerTotal: (rows) => pctWord(bp(rows.reduce((s, r) => s + r.deposit, 0), rows.reduce((s, r) => s + r.value, 0))) },
        { key: "below", label: `Below ${below}%`, width: 110, align: "right", accessor: (r) => (r.below === 0 ? "" : String(r.below)),
          numberValue: (r) => r.below, footerTotal: (rows) => String(rows.reduce((s, r) => s + r.below, 0)) },
      ];
    }
    return [
      name,
      { key: "delivered", label: "Delivered", width: 100, align: "right", accessor: (r) => String(r.delivered.orders),
        numberValue: (r) => r.delivered.orders, footerTotal: (rows) => String(rows.reduce((s, r) => s + r.delivered.orders, 0)) },
      money("billed", "Invoiced value", (r) => r.delivered.billed, ["Invoiced", "value"]),
      money("ddeposit", "Deposit", (r) => r.delivered.deposit),
      money("due", "Balance due", (r) => r.delivered.balanceDue, ["Balance", "due"]),
      money("paid", "Balance paid", (r) => r.delivered.balancePaid, ["Balance", "paid"]),
      { key: "bshare", label: "Balance %", width: 100, align: "right", accessor: (r) => pctWord(r.delivered.balanceBp),
        numberValue: (r) => (r.delivered.balanceBp === null ? null : r.delivered.balanceBp / 100),
        footerTotal: (rows) => pctWord(bp(rows.reduce((s, r) => s + r.delivered.balancePaid, 0), rows.reduce((s, r) => s + r.delivered.balanceDue, 0))) },
      money("owed", "Outstanding", (r) => r.delivered.outstanding),
    ];
  }, [view, below]);

  return <div className="flex h-full min-h-0 flex-col">
    <ModuleHeader destinationHeader testId="collection-destination-header" word="Collection" docTitle="Collection · Carres" />
    {query.isError || report === "unreadable" ? <ReadFailed what="The Collection report" onRetry={() => void query.refetch()} /> : <>
      <div className="flex shrink-0 flex-col gap-3 px-4 pt-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <Select id="collection-month" label="Month" value={month ?? ""} placeholder="Custom Date Range"
              onValueChange={(ym) => edit((next) => { next.set("from", `${ym}-01`); next.set("to", monthEnd(ym)); })}
              options={recentMonths(today, month).map((m) => ({ value: m, label: fmtMonth(m) }))} />
          </div>
          <div className="w-40"><DatePicker id="collection-from" label="From" value={from}
            onChange={(iso) => iso && edit((next) => { next.set("from", iso); next.set("to", iso > to ? iso : to); })} /></div>
          <div className="w-40"><DatePicker id="collection-to" label="Up to" value={to} minDate={from}
            onChange={(iso) => iso && edit((next) => { next.set("to", iso); next.set("from", iso < from ? iso : from); })} /></div>
          <div className="w-32"><Input id="collection-below" label="Below (%)" type="number" inputMode="decimal" value={String(below)}
            onChange={(e) => edit((next) => { const v = e.target.value; if (v === "" || readBelow(v) === 50) next.delete("below"); else next.set("below", v); })} /></div>
        </div>
        <Tabs label="Collection view" value={view}
          onValueChange={(v) => edit((next) => { if (v === "balance") next.set("view", "balance"); else next.delete("view"); })}
          tabs={[{ value: "deposit", label: "Deposit" }, { value: "balance", label: "Balance" }]} />
      </div>
      <ListPageShell register>
        <DataGrid key={view} rows={ready?.rows ?? []} columns={columns} rowKey={(r) => r.key}
          rowTestId={(r) => `collection-row-${r.key}`}
          storageKey={`carres.finance.collection.${view}.v1`} appearance="reference" exportName={`Collection ${view} ${from} to ${to}`}
          groupBanner={false} stickyIdentity isLoading={!query.isSuccess} wrapToolbar
          searchPlaceholder="Search salespeople…" expandTitle="Show orders"
          expandable={{ renderExpansion: (r) => <Orders row={r} view={view} /> }}
          emptyMessage={`No order was placed from ${fmtDate(from)} to ${fmtDate(to)}.`}
          // The money is the footer row's; this line only counts, so it fits a phone.
          statusSummary={(visible) => {
            const orders = visible.reduce((s, r) => s + r.orders, 0);
            const under = visible.reduce((s, r) => s + r.below, 0);
            const delivered = visible.reduce((s, r) => s + r.delivered.orders, 0);
            return <span data-testid="collection-summary">
              {ready ? `${visible.length} ${visible.length === 1 ? "salesperson" : "salespeople"} · ${view === "deposit"
                ? `${orders} ${orders === 1 ? "order" : "orders"} · ${under} below ${below}%`
                : `${delivered} delivered`}` : ""}
            </span>;
          }} />
      </ListPageShell>
    </>}
  </div>;
}
