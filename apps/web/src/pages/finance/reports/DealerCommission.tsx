/**
 * Reports → Dealer commission (migration 0544). Read-only: nothing here is
 * owed or posted (CLAUDE.md §7); a payout still goes through a payment voucher.
 *
 * One read of `dealer_commission_source(month)`; every figure is the shared
 * arithmetic (Law D), each line at the rate the database read for its order
 * day (0661). Six views on the toolbar switch:
 *   By dealer          `dealerCommissionReport`: one row per dealer; a row
 *                      opens that dealer's orders
 *   `?view=orders`     By order (CommissionOrders.tsx, step 2): the month order
 *                      by order, and taking a cancelled order's commission back
 *   `?view=statement`  one dealer's statement (CommissionStatement.tsx, step 3,
 *                      0664): what Carres owes it month by month, the payments
 *                      made to it and the balance; a month opens its orders
 *   `?view=rates`      the dated rates and switches (CommissionRates.tsx)
 *   `?view=quotas`     each dealer's renovation quota. A dealer with no quota
 *                      opens the quota form from its own `Quota left` cell.
 *                      The total can be left empty: no limit until it is filled
 *                      in (0665, rule 7.3).
 *   `?view=kpi`        the 15-year guarantee KPI allowance, each rule from its
 *                      day (CommissionKpi.tsx, 0665)
 * By dealer also shows each dealer's guarantees and KPI allowance this month.
 * The month, dealer and showroom chosen stay the same on every report view;
 * the statement takes the dealer only (it runs from the dealer's first order).
 *
 * Frame: `ModuleHeader` + `<ListPageShell register>` + the Register engine, the
 * shape every other Finance register draws (Trial Balance, Unpaid by Supplier,
 * Journal, Money moves). The month/dealer/showroom scope sits in the Register's
 * own toolbar and the note in its 32px status footer, so nothing page-owned is
 * drawn above the table (UI MASTER §6.7). Export is the engine's — the columns
 * carry `exportValue` so the money leaves as numbers.
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dealerCommissionReport, type DcReportRow, type DcSource } from "@carres/shared/dealer-commission";
import Button from "@/components/kit/Button";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import Select from "@/components/kit/Select";
import { FieldError } from "@/components/kit/FieldFrame";
import ListPageShell from "@/components/ListPageShell";
import { SectionCard } from "@/components/SectionPanel";
import { SegmentedLinks } from "@/components/Segmented";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import { apiFetch } from "@/lib/api";
import { fmtMonth } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import { LoadFailed } from "../other-money-in/parts";
import CommissionOrders from "./CommissionOrders";
import CommissionRates from "./CommissionRates";
import CommissionKpi from "./CommissionKpi";
import CommissionStatement from "./CommissionStatement";

const BASE = "/api/finance/dealer-commission";
const ALL = "all";
type QuotaDraft = { dealerId: string; quota: string; rebateRate: string; startsOn: string };
type View = "report" | "orders" | "statement" | "rates" | "quotas" | "kpi";
const VIEWS: readonly View[] = ["report", "orders", "statement", "rates", "quotas", "kpi"];

/** What a dealer's rebate has left: its total less every rebate given, or no limit
 *  while the total is not filled in (0665, rule 7.3). */
// PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), dealer commission step 4).
const quotaLeftWord = (r: Pick<DcReportRow, "rebate" | "quotaLeft">) =>
  r.rebate === null ? "No quota" : r.quotaLeft === null ? "No limit yet" : rm(r.quotaLeft);

/** This month and the 23 before it, newest first (YYYY-MM). */
function lastMonths(): string[] {
  const d = new Date();
  return Array.from({ length: 24 }, (_, i) => {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`;
  });
}

export default function DealerCommission() {
  const months = useMemo(lastMonths, []);
  const [params, setParams] = useSearchParams();
  const v = params.get("view");
  const view: View = VIEWS.find((x) => x === v) ?? "report";
  const [month, setMonth] = useState(months[0]);
  const [dealerId, setDealerId] = useState(ALL);
  const [outletId, setOutletId] = useState(ALL);
  const [quota, setQuota] = useState<QuotaDraft | null>(null);
  const q = useQuery({
    queryKey: ["finance", "dealer-commission", month],
    queryFn: () => apiFetch<DcSource>(`${BASE}?month=${month}`),
  });
  const src = q.data;
  const rows = useMemo(
    () => (src ? dealerCommissionReport(src, month, {
      dealerId: dealerId === ALL ? undefined : dealerId,
      outletId: outletId === ALL ? undefined : outletId,
    }) : []),
    [src, month, dealerId, outletId]);
  const outlets = (src?.outlets ?? []).filter((o) => dealerId === ALL || o.dealerId === dealerId);
  // A statement month older than the list still shows as itself.
  const monthChoices = months.includes(month) ? months : [...months, month];

  const columns = useMemo<DataGridColumn<DcReportRow>[]>(() => [
    { key: "dealer", label: "Dealer", width: 240, accessor: (r) => r.dealer, searchValue: (r) => r.dealer },
    { key: "earned", label: "Commission this month", width: 200, align: "right", accessor: (r) => rm(r.earned), numberValue: (r) => r.earned, exportValue: (r) => r.earned,
      footerTotal: (rs) => rm(rs.reduce((s, r) => s + r.earned, 0)) },
    { key: "still", label: "Commission still to collect", width: 220, align: "right", accessor: (r) => rm(r.stillToCollect), numberValue: (r) => r.stillToCollect, exportValue: (r) => r.stillToCollect,
      footerTotal: (rs) => rm(rs.reduce((s, r) => s + r.stillToCollect, 0)) },
    { key: "rebate", label: "Rebate this month", width: 170, align: "right", accessor: (r) => (r.rebate === null ? "No quota" : rm(r.rebate)), numberValue: (r) => r.rebate ?? 0, exportValue: (r) => r.rebate ?? "" },
    { key: "left", label: "Quota left", width: 160, align: "right", numberValue: (r) => r.quotaLeft ?? 0, exportValue: (r) => r.quotaLeft ?? "",
      searchValue: quotaLeftWord,
      // No quota yet: the words open the quota form with this dealer chosen
      // (and not the row's own door to its orders).
      accessor: (r) => (r.rebate === null
        ? <button type="button" className="hover:underline"
            onClick={(e) => { e.stopPropagation(); setQuota({ dealerId: r.dealerId, quota: "", rebateRate: "5", startsOn: months[0] }); setParams({ view: "quotas" }); }}>No quota</button>
        : quotaLeftWord(r)) },
    // 0665: the 15-year guarantee KPI allowance (rules 8.1–8.4).
    { key: "guarantees", label: "Guarantees this month", width: 190, align: "right", accessor: (r) => String(r.kpiUnits),
      numberValue: (r) => r.kpiUnits, exportValue: (r) => r.kpiUnits },
    { key: "kpi", label: "KPI allowance this month", width: 210, align: "right", accessor: (r) => (r.kpi === null ? "Not set up" : rm(r.kpi)),
      numberValue: (r) => r.kpi ?? 0, exportValue: (r) => r.kpi ?? "",
      footerTotal: (rs) => rm(rs.reduce((s, r) => s + (r.kpi ?? 0), 0)) },
  ], [months, setParams]);

  /** The month, dealer and showroom, the same on both report views. */
  const scope = (current: View) => <div className="flex flex-wrap items-end gap-2">
    <Views current={current} />
    <div className="w-[180px]"><Select id="dc-month" label="Month" value={month} onValueChange={setMonth}
      options={monthChoices.map((m) => ({ value: m, label: fmtMonth(m) }))} /></div>
    <div className="w-[220px]"><Select id="dc-dealer" label="Dealer" value={dealerId}
      onValueChange={(v) => { setDealerId(v); setOutletId(ALL); }}
      options={[{ value: ALL, label: "All" }, ...(src?.dealers ?? []).map((d) => ({ value: d.id, label: d.name }))]} /></div>
    <div className="w-[220px]"><Select id="dc-outlet" label="Showroom" value={outletId} onValueChange={setOutletId}
      options={[{ value: ALL, label: "All" }, ...outlets.map((o) => ({ value: o.id, label: o.name }))]} /></div>
  </div>;

  /** The statement is one dealer's, from its first order: the dealer only. */
  const statementScope = <div className="flex flex-wrap items-end gap-2">
    <Views current="statement" />
    <div className="w-[220px]"><Select id="dc-statement-dealer" label="Dealer" value={dealerId === ALL ? undefined : dealerId}
      placeholder="Choose" onValueChange={(v) => { setDealerId(v); setOutletId(ALL); }}
      options={(src?.dealers ?? []).map((d) => ({ value: d.id, label: d.name }))} /></div>
  </div>;

  return <div className="flex h-full min-h-0 flex-col" data-testid="dealer-commission">
    <ModuleHeader destinationHeader testId="dealer-commission-header" word="Dealer commission" docTitle="Dealer commission · Carres" />
    {view === "rates" ? <CommissionRates toolbarStart={<Views current="rates" />} /> :
    view === "kpi" ? <CommissionKpi toolbarStart={<Views current="kpi" />} /> :
    q.isError ? <LoadFailed what="The report" onRetry={() => void q.refetch()} /> :
    view === "quotas" ? <ListPageShell register toolbar={<Views current={view} />}>
      {src && <div className="min-h-0 overflow-y-auto"><Quotas src={src} quota={quota} setQuota={setQuota} /></div>}
    </ListPageShell> :
    view === "orders" ? <CommissionOrders src={src} loading={!q.isSuccess} month={month}
      filter={{ dealerId: dealerId === ALL ? undefined : dealerId, outletId: outletId === ALL ? undefined : outletId }}
      toolbarStart={scope("orders")} /> :
    view === "statement" ? <CommissionStatement dealerId={dealerId === ALL ? null : dealerId} toolbarStart={statementScope}
      // A month's row opens that month's orders for this dealer.
      onOpenMonth={(m) => { setMonth(m); setOutletId(ALL); setParams({ view: "orders" }); }} /> :
    <ListPageShell register>
      <DataGrid rows={rows} columns={columns} rowKey={(r) => r.dealerId} storageKey="carres.finance.dealer-commission.v1"
        appearance="reference" exportName={`Dealer commission ${month}`} groupBanner={false} stickyIdentity
        isLoading={!q.isSuccess} wrapToolbar
        // A dealer's row opens its orders for the same month.
        onRowClick={(r) => { setDealerId(r.dealerId); setOutletId(ALL); setParams({ view: "orders" }); }}
        toolbarStart={scope("report")}
        statusSummary={(visible) => <span data-testid="dealer-commission-summary">
          {visible.length} of {rows.length} rows · Commission is earned only on money collected. The rebate and the KPI allowance are the dealer's whole, whatever showroom is picked.
        </span>} />
    </ListPageShell>}
  </div>;
}

/** The three report views and the three settings views, on the app's one segmented link switch. */
function Views({ current }: { current: View }) {
  // PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), dealer commission steps 2 to 4).
  const views = [
    { value: "report", to: "/finance/reports/dealer-commission", label: "By dealer" },
    { value: "orders", to: "/finance/reports/dealer-commission?view=orders", label: "By order" },
    { value: "statement", to: "/finance/reports/dealer-commission?view=statement", label: "Statement" },
    { value: "rates", to: "/finance/reports/dealer-commission?view=rates", label: "Commission rates" },
    { value: "quotas", to: "/finance/reports/dealer-commission?view=quotas", label: "Renovation quotas" },
    { value: "kpi", to: "/finance/reports/dealer-commission?view=kpi", label: "KPI allowance" },
  ] as const;
  return <SegmentedLinks options={views} value={current} ariaLabel="Dealer commission" testId="dealer-commission-switch" />;
}

/** The renovation quotas view: one card, and the quota form. */
function Quotas({ src, quota, setQuota }: { src: DcSource; quota: QuotaDraft | null; setQuota: (q: QuotaDraft | null) => void }) {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (v: { path: string; body: unknown }) =>
      apiFetch(`${BASE}${v.path}`, { method: "PUT", body: JSON.stringify(v.body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance", "dealer-commission"] }),
  });
  const [refusal, setRefusal] = useState<string | null>(null);
  const months = useMemo(lastMonths, []);
  const dealerName = (id: string) => src.dealers.find((d) => d.id === id)?.name ?? "Dealer not available";
  const send = (path: string, body: unknown, done?: () => void) => {
    setRefusal(null);
    save.mutate({ path, body }, { onSuccess: done, onError: (e) => setRefusal(e.message) });
  };
  const close = () => { setQuota(null); setRefusal(null); };

  return <>
    <SectionCard><div className="p-3 flex flex-col gap-3">
      <h2 className="text-strong">Renovation quotas</h2>
      {src.quotas.map((q) => <div key={q.dealerId} className="flex items-center justify-between gap-3 border-b border-base-200 py-1">
        <span className="text-body">{dealerName(q.dealerId)}</span>
        <span className="flex items-center gap-2"><span className="tabular-nums">{q.quota === null ? "No limit yet" : rm(Number(q.quota))} · {q.rebateRate}% from {fmtMonth(q.startsOn)}</span>
          <Button size="sm" onClick={() => setQuota({ dealerId: q.dealerId, quota: q.quota === null ? "" : String(q.quota), rebateRate: String(q.rebateRate), startsOn: q.startsOn.slice(0, 7) })}>Edit</Button></span>
      </div>)}
      <div><Button size="sm" icon="add" onClick={() => setQuota({ dealerId: "", quota: "", rebateRate: "5", startsOn: months[0] })}>Add a renovation quota</Button></div>
    </div></SectionCard>

    {quota && <Modal open onOpenChange={(o) => { if (!o) close(); }} title="Renovation quota"
      footer={<><Button variant="ghost" onClick={close}>Cancel</Button>
        <Button variant="primary" loading={save.isPending} disabled={!quota.dealerId || quota.rebateRate === ""}
          onClick={() => send(`/quotas/${quota.dealerId}`,
            { quota: quota.quota.trim() === "" ? null : Number(quota.quota), rebateRate: Number(quota.rebateRate), startsOn: `${quota.startsOn}-01` }, close)}>Save</Button></>}>
      <div className="flex flex-col gap-3">
        <Select id="dc-quota-dealer" label="Dealer" value={quota.dealerId || undefined} onValueChange={(v) => setQuota({ ...quota, dealerId: v })}
          options={src.dealers.map((d) => ({ value: d.id, label: d.name }))} />
        <Input id="dc-quota" type="number" label="Quota (RM)" min={0} hint="Leave it empty to fill in later. Until then there is no limit."
          value={quota.quota} onChange={(e) => setQuota({ ...quota, quota: e.target.value })} />
        <Input id="dc-rebate-rate" type="number" label="Rebate rate (%)" min={0} max={100} value={quota.rebateRate}
          onChange={(e) => setQuota({ ...quota, rebateRate: e.target.value })} />
        <Select id="dc-quota-from" label="Counts from" value={quota.startsOn} onValueChange={(v) => setQuota({ ...quota, startsOn: v })}
          options={months.map((m) => ({ value: m, label: fmtMonth(m) }))} />
        {refusal && <FieldError>{refusal}</FieldError>}
      </div>
    </Modal>}
    {!quota && refusal && <FieldError>{refusal}</FieldError>}
  </>;
}
