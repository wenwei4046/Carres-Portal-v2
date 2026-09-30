/**
 * Reports → Card charges. Read-only: per month and card company, what the card
 * sales came to, what the card company kept, and what reached the bank.
 *
 * One read of `card_charges_source` (migration 0623): every APPROVED card payout
 * linked to a Card settlement day, one slice per department of its matched
 * sales. A day whose payout is not approved has no posted money, so it is not
 * here; a card payout made on Money moves with no settlement day has no card
 * company, so it is not here either. Every figure is `cardChargesReport` below.
 *
 * Frame: the Dealer commission report's (ModuleHeader + ListPageShell register
 * + DataGrid); the export is the engine's, the money leaves as numbers.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CARD_ACQUIRERS, CARD_ACQUIRER_WORD, type CardAcquirer } from "@carres/shared/card-settlement";
import Select from "@/components/kit/Select";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import { apiFetch } from "@/lib/api";
import { fmtMonth } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import { cents } from "../payables/payables-words";
import { decodeDepartment, DepartmentFilter, useDepartmentParam } from "../department";
import { LoadFailed } from "../other-money-in/parts";

/** One approved payout's share for one department, as the database sends it. */
export interface CardChargeSlice {
  move_date: string;
  acquirer: CardAcquirer;
  department_type: string | null;
  department_id: string | null;
  gross: number | string;
  fee: number | string;
}

export interface CardChargeRow {
  month: string;
  acquirer: CardAcquirer;
  gross: number;
  fee: number;
  net: number;
  /** fee ÷ gross as a percent, to two places; 0 when there were no sales. */
  feePct: number;
}

export const feePercent = (fee: number, gross: number) =>
  gross > 0 ? Math.round((fee * 10000) / gross) / 100 : 0;

/** Month × card company, newest month first, card companies in the Card settlement order.
 *  `dept` is the page filter ("", "TYPE" or "TYPE:id"); a slice with no department
 *  counts only when no department is picked. */
export function cardChargesReport(slices: readonly CardChargeSlice[], dept = ""): CardChargeRow[] {
  const want = decodeDepartment(dept);
  const byKey = new Map<string, { month: string; acquirer: CardAcquirer; gross: number; fee: number }>();
  for (const s of slices) {
    if (want.departmentType && s.department_type !== want.departmentType) continue;
    if (want.departmentId && s.department_id !== want.departmentId) continue;
    const month = s.move_date.slice(0, 7);
    const key = `${month}|${s.acquirer}`;
    const b = byKey.get(key) ?? { month, acquirer: s.acquirer, gross: 0, fee: 0 };
    b.gross += Number(s.gross);
    b.fee += Number(s.fee);
    byKey.set(key, b);
  }
  return [...byKey.values()]
    .map((b) => {
      const gross = cents(b.gross);
      const fee = cents(b.fee);
      return { month: b.month, acquirer: b.acquirer, gross, fee, net: cents(gross - fee), feePct: feePercent(fee, gross) };
    })
    .sort((a, b) => b.month.localeCompare(a.month) || CARD_ACQUIRERS.indexOf(a.acquirer) - CARD_ACQUIRERS.indexOf(b.acquirer));
}

/** This month and the 23 before it, newest first (YYYY-MM). */
function lastMonths(): string[] {
  const d = new Date();
  return Array.from({ length: 24 }, (_, i) => {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`;
  });
}

function monthEnd(ym: string): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

const sum = (rows: CardChargeRow[], k: "gross" | "fee" | "net") => cents(rows.reduce((t, r) => t + r[k], 0));

export default function CardCharges() {
  const months = useMemo(lastMonths, []);
  const [from, setFrom] = useState(months[11]!);
  const [to, setTo] = useState(months[0]!);
  const [dept, setDept] = useDepartmentParam();
  const q = useQuery({
    queryKey: ["finance", "card-charges", from, to],
    queryFn: () => apiFetch<CardChargeSlice[]>(`/api/finance/card-settlement/charges?from=${from}-01&to=${monthEnd(to)}`),
  });
  const rows = useMemo(() => cardChargesReport(q.data ?? [], dept), [q.data, dept]);

  const columns = useMemo<DataGridColumn<CardChargeRow>[]>(() => [
    { key: "month", label: "Month", width: 120, accessor: (r) => fmtMonth(r.month), sortFn: (a, b) => a.month.localeCompare(b.month), exportValue: (r) => r.month },
    { key: "acquirer", label: "Card company", width: 160, accessor: (r) => CARD_ACQUIRER_WORD[r.acquirer] },
    { key: "gross", label: "Sales total", width: 150, align: "right", accessor: (r) => rm(r.gross), numberValue: (r) => r.gross, exportValue: (r) => r.gross, footerTotal: (v) => rm(sum(v, "gross")) },
    { key: "fee", label: "Fee", width: 140, align: "right", accessor: (r) => rm(r.fee), numberValue: (r) => r.fee, exportValue: (r) => r.fee, footerTotal: (v) => rm(sum(v, "fee")) },
    { key: "net", label: "Paid into bank", width: 150, align: "right", accessor: (r) => rm(r.net), numberValue: (r) => r.net, exportValue: (r) => r.net, footerTotal: (v) => rm(sum(v, "net")) },
    { key: "pct", label: "Fee %", width: 100, align: "right", accessor: (r) => `${r.feePct.toFixed(2)}%`, numberValue: (r) => r.feePct, exportValue: (r) => r.feePct, footerTotal: (v) => `${feePercent(sum(v, "fee"), sum(v, "gross")).toFixed(2)}%` },
  ], []);

  const monthOptions = months.map((m) => ({ value: m, label: fmtMonth(m) }));
  return <div className="flex h-full min-h-0 flex-col" data-testid="card-charges">
    <ModuleHeader destinationHeader testId="card-charges-header" word="Card charges" docTitle="Card charges · Carres" />
    <ListPageShell register>
      <DataGrid rows={rows} columns={columns} rowKey={(r) => `${r.month}|${r.acquirer}`} storageKey="carres.finance.card-charges.v1"
        appearance="reference" exportName={`Card charges ${from} to ${to}`} groupBanner={false} stickyIdentity
        isLoading={q.isPending} wrapToolbar
        errorState={q.isError ? <LoadFailed what="Card charges" onRetry={() => void q.refetch()} /> : undefined}
        emptyMessage="No approved card payout in these months. Only card settlement days whose payout is approved are counted."
        toolbarStart={<div className="flex flex-wrap items-end gap-2">
          <div className="w-[160px]"><Select id="cc-from" label="From" value={from} options={monthOptions}
            onValueChange={(v) => { setFrom(v); if (v > to) setTo(v); }} /></div>
          <div className="w-[160px]"><Select id="cc-to" label="Up to" value={to} options={monthOptions}
            onValueChange={(v) => { setTo(v); if (v < from) setFrom(v); }} /></div>
          <DepartmentFilter value={dept} onChange={setDept} />
        </div>}
        statusSummary={(visible) => <span data-testid="card-charges-summary">
          {visible.length} of {rows.length} rows · Only card settlement days whose payout is approved are counted.
          {dept ? " A Maybank fee is shared across departments by their sales." : ""}
        </span>} />
    </ListPageShell>
  </div>;
}
