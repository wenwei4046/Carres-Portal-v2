/**
 * Reports → Dealer commission (migration 0544). Read-only: nothing here is
 * owed or posted (CLAUDE.md §7); a payout still goes through a payment voucher.
 *
 * One read of `dealer_commission_source(month)`; every figure is the shared
 * `dealerCommissionReport` (Law D). Below the report, Finance keeps the rates:
 * the default commission rate, products with their own rate, and each dealer's
 * renovation quota.
 */
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dealerCommissionReport, type DcReportRow, type DcSource } from "@carres/shared/dealer-commission";
import Button from "@/components/kit/Button";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import Select from "@/components/kit/Select";
import { FieldError } from "@/components/kit/FieldFrame";
import { SectionCard } from "@/components/SectionPanel";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import { apiFetch } from "@/lib/api";
import { fmtMonth } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import { LoadFailed } from "../other-money-in/parts";

const BASE = "/api/finance/dealer-commission";
const ALL = "all";

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
  const [month, setMonth] = useState(months[0]);
  const [dealerId, setDealerId] = useState(ALL);
  const [outletId, setOutletId] = useState(ALL);
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
    { key: "earned", label: "Commission on collected", width: 200, align: "right", accessor: (r) => rm(r.earned), numberValue: (r) => r.earned },
    { key: "still", label: "Commission still to collect", width: 220, align: "right", accessor: (r) => rm(r.stillToCollect), numberValue: (r) => r.stillToCollect },
    { key: "rebate", label: "Rebate this month", width: 170, align: "right", accessor: (r) => (r.rebate === null ? "No quota" : rm(r.rebate)), numberValue: (r) => r.rebate ?? 0 },
    { key: "left", label: "Quota left", width: 160, align: "right", accessor: (r) => (r.quotaLeft === null ? "No quota" : rm(r.quotaLeft)), numberValue: (r) => r.quotaLeft ?? 0 },
  ], []);

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.map((r) => ({
      Dealer: r.dealer, "Commission on collected": r.earned, "Commission still to collect": r.stillToCollect,
      "Rebate this month": r.rebate ?? "", "Quota left": r.quotaLeft ?? "",
    }))), "Dealer commission");
    XLSX.writeFile(wb, `Dealer commission ${month}.xlsx`);
  };

  return <div className="flex h-full min-h-0 flex-col" data-testid="dealer-commission">
    <ModuleHeader destinationHeader testId="dealer-commission-header" word="Dealer commission" docTitle="Dealer commission — Carres" />
    {q.isError ? <LoadFailed what="The report" onRetry={() => void q.refetch()} /> :
    <div className="min-h-0 flex-1 overflow-auto p-6 flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-[180px]"><Select id="dc-month" label="Month" value={month} onValueChange={setMonth}
          options={months.map((m) => ({ value: m, label: fmtMonth(m) }))} /></div>
        <div className="w-[220px]"><Select id="dc-dealer" label="Dealer" value={dealerId}
          onValueChange={(v) => { setDealerId(v); setOutletId(ALL); }}
          options={[{ value: ALL, label: "All" }, ...(src?.dealers ?? []).map((d) => ({ value: d.id, label: d.name }))]} /></div>
        <div className="w-[220px]"><Select id="dc-outlet" label="Showroom" value={outletId} onValueChange={setOutletId}
          options={[{ value: ALL, label: "All" }, ...outlets.map((o) => ({ value: o.id, label: o.name }))]} /></div>
        <Button variant="neutral" onClick={exportExcel} disabled={!src}>Export Excel</Button>
      </div>
      <p className="text-label text-base-500">Commission is earned only on money collected. The rebate is the dealer's whole collections, whatever showroom is picked.</p>
      <div className="h-[420px]">
        <DataGrid rows={rows} columns={columns} rowKey={(r) => r.dealerId} storageKey="carres.finance.dealer-commission.v1"
          appearance="reference" groupBanner={false} stickyIdentity isLoading={!q.isSuccess} />
      </div>
      {src && <Rates src={src} />}
    </div>}
  </div>;
}

function Rates({ src }: { src: DcSource }) {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (v: { path: string; method: "PUT" | "DELETE"; body?: unknown }) =>
      apiFetch(`${BASE}${v.path}`, { method: v.method, body: v.body === undefined ? undefined : JSON.stringify(v.body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance", "dealer-commission"] }),
  });
  const [rate, setRate] = useState(String(src.settings.defaultRate));
  const [product, setProduct] = useState<{ modelId: string; rate: string } | null>(null);
  const [quota, setQuota] = useState<{ dealerId: string; quota: string; rebateRate: string; startsOn: string } | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const months = useMemo(lastMonths, []);
  const dealerName = (id: string) => src.dealers.find((d) => d.id === id)?.name ?? "Dealer not available";
  const send = (path: string, method: "PUT" | "DELETE", body?: unknown, done?: () => void) => {
    setRefusal(null);
    save.mutate({ path, method, body }, { onSuccess: done, onError: (e) => setRefusal(e.message) });
  };
  const close = () => { setProduct(null); setQuota(null); setRefusal(null); };

  return <>
    <SectionCard><div className="p-3 flex flex-col gap-3">
      <h2 className="text-strong">Commission rates</h2>
      <div className="flex items-end gap-2">
        <div className="w-[180px]"><Input id="dc-default-rate" type="number" label="Default rate (%)" min={0} max={100}
          value={rate} onChange={(e) => setRate(e.target.value)} /></div>
        <Button variant="primary" loading={save.isPending} onClick={() => send("/settings", "PUT", { defaultRate: Number(rate) })}>Save</Button>
      </div>
      {src.rates.map((r) => <div key={r.modelId} className="flex items-center justify-between gap-3 border-b border-base-200 py-1">
        <span className="text-body">{r.modelName}</span>
        <span className="flex items-center gap-2"><span className="tabular-nums">{r.rate}%</span>
          <Button size="sm" onClick={() => setProduct({ modelId: r.modelId, rate: String(r.rate) })}>Edit</Button>
          <Button size="sm" variant="ghost" onClick={() => send(`/rates/${r.modelId}`, "DELETE")}>Remove</Button></span>
      </div>)}
      <div><Button size="sm" icon="add" onClick={() => setProduct({ modelId: "", rate: "20" })}>Add a product rate</Button></div>
    </div></SectionCard>

    <SectionCard><div className="p-3 flex flex-col gap-3">
      <h2 className="text-strong">Renovation quotas</h2>
      {src.quotas.map((q) => <div key={q.dealerId} className="flex items-center justify-between gap-3 border-b border-base-200 py-1">
        <span className="text-body">{dealerName(q.dealerId)}</span>
        <span className="flex items-center gap-2"><span className="tabular-nums">{rm(Number(q.quota))} · {q.rebateRate}% from {fmtMonth(q.startsOn)}</span>
          <Button size="sm" onClick={() => setQuota({ dealerId: q.dealerId, quota: String(q.quota), rebateRate: String(q.rebateRate), startsOn: q.startsOn.slice(0, 7) })}>Edit</Button></span>
      </div>)}
      <div><Button size="sm" icon="add" onClick={() => setQuota({ dealerId: "", quota: "", rebateRate: "5", startsOn: months[0] })}>Add a renovation quota</Button></div>
    </div></SectionCard>

    {product && <Modal open onOpenChange={(o) => { if (!o) close(); }} title="Product rate"
      footer={<><Button variant="ghost" onClick={close}>Cancel</Button>
        <Button variant="primary" loading={save.isPending} disabled={!product.modelId || product.rate === ""}
          onClick={() => send(`/rates/${product.modelId}`, "PUT", { rate: Number(product.rate) }, close)}>Save</Button></>}>
      <div className="flex flex-col gap-3">
        <Select id="dc-product" label="Product" value={product.modelId || undefined} onValueChange={(v) => setProduct({ ...product, modelId: v })}
          options={src.models.map((m) => ({ value: m.id, label: m.name }))} />
        <Input id="dc-product-rate" type="number" label="Rate (%)" min={0} max={100} value={product.rate}
          onChange={(e) => setProduct({ ...product, rate: e.target.value })} />
        {refusal && <FieldError>{refusal}</FieldError>}
      </div>
    </Modal>}

    {quota && <Modal open onOpenChange={(o) => { if (!o) close(); }} title="Renovation quota"
      footer={<><Button variant="ghost" onClick={close}>Cancel</Button>
        <Button variant="primary" loading={save.isPending} disabled={!quota.dealerId || quota.quota === "" || quota.rebateRate === ""}
          onClick={() => send(`/quotas/${quota.dealerId}`, "PUT",
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
    {!product && !quota && refusal && <FieldError>{refusal}</FieldError>}
  </>;
}
