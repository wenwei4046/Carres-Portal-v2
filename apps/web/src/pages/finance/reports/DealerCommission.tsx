/**
 * Reports → Dealer commission (migration 0544). Read-only: nothing here is
 * owed or posted (CLAUDE.md §7); a payout still goes through a payment voucher.
 *
 * One read of `dealer_commission_source(month)`; every figure is the shared
 * `dealerCommissionReport` (Law D), each line at the rate the database read
 * for its order day (0661). Finance keeps the rates on two sibling views of
 * the same page, picked from the toolbar switch: `?view=rates` (the dated
 * rates and switches, CommissionRates.tsx) and `?view=quotas` (each dealer's
 * renovation quota). A dealer with no quota opens the quota form, on the
 * quotas view, from its own `Quota left` cell.
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
import CommissionRates from "./CommissionRates";

const BASE = "/api/finance/dealer-commission";
const ALL = "all";
type QuotaDraft = { dealerId: string; quota: string; rebateRate: string; startsOn: string };
type View = "report" | "rates" | "quotas";

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
  const view: View = v === "rates" || v === "quotas" ? v : "report";
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

  const columns = useMemo<DataGridColumn<DcReportRow>[]>(() => [
    { key: "dealer", label: "Dealer", width: 240, accessor: (r) => r.dealer, searchValue: (r) => r.dealer },
    { key: "earned", label: "Commission on collected", width: 200, align: "right", accessor: (r) => rm(r.earned), numberValue: (r) => r.earned, exportValue: (r) => r.earned },
    { key: "still", label: "Commission still to collect", width: 220, align: "right", accessor: (r) => rm(r.stillToCollect), numberValue: (r) => r.stillToCollect, exportValue: (r) => r.stillToCollect },
    { key: "rebate", label: "Rebate this month", width: 170, align: "right", accessor: (r) => (r.rebate === null ? "No quota" : rm(r.rebate)), numberValue: (r) => r.rebate ?? 0, exportValue: (r) => r.rebate ?? "" },
    { key: "left", label: "Quota left", width: 160, align: "right", numberValue: (r) => r.quotaLeft ?? 0, exportValue: (r) => r.quotaLeft ?? "",
      searchValue: (r) => (r.quotaLeft === null ? "No quota" : rm(r.quotaLeft)),
      // No quota yet: the words open the quota form with this dealer chosen.
      accessor: (r) => (r.quotaLeft === null
        ? <button type="button" className="hover:underline"
            onClick={() => { setQuota({ dealerId: r.dealerId, quota: "", rebateRate: "5", startsOn: months[0] }); setParams({ view: "quotas" }); }}>No quota</button>
        : rm(r.quotaLeft)) },
  ], [months, setParams]);

  return <div className="flex h-full min-h-0 flex-col" data-testid="dealer-commission">
    <ModuleHeader destinationHeader testId="dealer-commission-header" word="Dealer commission" docTitle="Dealer commission · Carres" />
    {view === "rates" ? <CommissionRates toolbarStart={<Views current="rates" />} /> :
    q.isError ? <LoadFailed what="The report" onRetry={() => void q.refetch()} /> :
    view === "quotas" ? <ListPageShell register toolbar={<Views current={view} />}>
      {src && <div className="min-h-0 overflow-y-auto"><Quotas src={src} quota={quota} setQuota={setQuota} /></div>}
    </ListPageShell> :
    <ListPageShell register>
      <DataGrid rows={rows} columns={columns} rowKey={(r) => r.dealerId} storageKey="carres.finance.dealer-commission.v1"
        appearance="reference" exportName={`Dealer commission ${month}`} groupBanner={false} stickyIdentity
        isLoading={!q.isSuccess} wrapToolbar
        toolbarStart={<div className="flex flex-wrap items-end gap-2">
          <Views current="report" />
          <div className="w-[180px]"><Select id="dc-month" label="Month" value={month} onValueChange={setMonth}
            options={months.map((m) => ({ value: m, label: fmtMonth(m) }))} /></div>
          <div className="w-[220px]"><Select id="dc-dealer" label="Dealer" value={dealerId}
            onValueChange={(v) => { setDealerId(v); setOutletId(ALL); }}
            options={[{ value: ALL, label: "All" }, ...(src?.dealers ?? []).map((d) => ({ value: d.id, label: d.name }))]} /></div>
          <div className="w-[220px]"><Select id="dc-outlet" label="Showroom" value={outletId} onValueChange={setOutletId}
            options={[{ value: ALL, label: "All" }, ...outlets.map((o) => ({ value: o.id, label: o.name }))]} /></div>
        </div>}
        statusSummary={(visible) => <span data-testid="dealer-commission-summary">
          {visible.length} of {rows.length} rows · Commission is earned only on money collected. The rebate is the dealer's whole collections, whatever showroom is picked.
        </span>} />
    </ListPageShell>}
  </div>;
}

/** The report and its two settings views, on the app's one segmented link switch. */
function Views({ current }: { current: View }) {
  const views = [
    { value: "report", to: "/finance/reports/dealer-commission", label: "Dealer commission" },
    { value: "rates", to: "/finance/reports/dealer-commission?view=rates", label: "Commission rates" },
    { value: "quotas", to: "/finance/reports/dealer-commission?view=quotas", label: "Renovation quotas" },
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
        <span className="flex items-center gap-2"><span className="tabular-nums">{rm(Number(q.quota))} · {q.rebateRate}% from {fmtMonth(q.startsOn)}</span>
          <Button size="sm" onClick={() => setQuota({ dealerId: q.dealerId, quota: String(q.quota), rebateRate: String(q.rebateRate), startsOn: q.startsOn.slice(0, 7) })}>Edit</Button></span>
      </div>)}
      <div><Button size="sm" icon="add" onClick={() => setQuota({ dealerId: "", quota: "", rebateRate: "5", startsOn: months[0] })}>Add a renovation quota</Button></div>
    </div></SectionCard>

    {quota && <Modal open onOpenChange={(o) => { if (!o) close(); }} title="Renovation quota"
      footer={<><Button variant="ghost" onClick={close}>Cancel</Button>
        <Button variant="primary" loading={save.isPending} disabled={!quota.dealerId || quota.quota === "" || quota.rebateRate === ""}
          onClick={() => send(`/quotas/${quota.dealerId}`,
            { quota: Number(quota.quota), rebateRate: Number(quota.rebateRate), startsOn: `${quota.startsOn}-01` }, close)}>Save</Button></>}>
      <div className="flex flex-col gap-3">
        <Select id="dc-quota-dealer" label="Dealer" value={quota.dealerId || undefined} onValueChange={(v) => setQuota({ ...quota, dealerId: v })}
          options={src.dealers.map((d) => ({ value: d.id, label: d.name }))} />
        <Input id="dc-quota" type="number" label="Quota (RM)" min={0} value={quota.quota} onChange={(e) => setQuota({ ...quota, quota: e.target.value })} />
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
