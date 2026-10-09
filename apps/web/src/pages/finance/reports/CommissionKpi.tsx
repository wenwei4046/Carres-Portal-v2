/**
 * Reports → Dealer commission → KPI allowance (dealer commission step 4, 0665;
 * Finance MASTER §3.2, rules 8.1–8.4, Chew and management 2026-10-05 to
 * 2026-10-07).
 *
 * The 15-year guarantee KPI allowance, each rule from its day: the guarantee it
 * counts, the amount per guarantee, the tier bonuses (the highest tier reached
 * pays; tiers do not add up) and whether the count starts again each month or
 * each year. Finance keeps the amounts here; they are never in the code. A rule
 * is never changed: `Add a KPI allowance` adds a new one from its day, and one
 * added by mistake is removed from its window.
 */
import { useMemo, useState } from "react";
import type { DcKpiRuleAddInput, DcKpiRuleRow, DcKpiRulesRead } from "@carres/shared/dealer-commission";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Button from "@/components/kit/Button";
import DatePicker from "@/components/kit/DatePicker";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import Select from "@/components/kit/Select";
import { FieldError } from "@/components/kit/FieldFrame";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import { LoadFailed } from "../other-money-in/parts";
import { kpiPeriodWord, kpiTiersWord } from "./commission-words";

const BASE = "/api/finance/dealer-commission";

// PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), dealer commission step 4).
const STATE_WORD: Record<DcKpiRuleRow["state"], string> = {
  in_use: "In use",
  replaced: "Replaced",
  later: "Starts later",
};

const addedWord = (r: Pick<DcKpiRuleRow, "createdAt" | "createdBy">) =>
  `${fmtDate(r.createdAt)}${r.createdBy ? ` · ${r.createdBy}` : ""}`;
const guaranteeWord = (r: Pick<DcKpiRuleRow, "modelName">) => r.modelName ?? "Product not available";

export default function CommissionKpi({ toolbarStart }: { toolbarStart: React.ReactNode }) {
  const query = useQuery({
    queryKey: ["finance", "dealer-commission", "kpi-rules"],
    queryFn: () => apiFetch<DcKpiRulesRead>(`${BASE}/kpi-rules`),
  });
  const [open, setOpen] = useState<DcKpiRuleRow | "new" | null>(null);
  const rules = query.data?.rules ?? [];

  const columns = useMemo<DataGridColumn<DcKpiRuleRow>[]>(
    () => [
      { key: "from", label: "From", width: 140, sortable: false, accessor: (r) => fmtDate(r.startsOn), exportValue: (r) => r.startsOn },
      { key: "per", label: "Per guarantee", width: 150, align: "right", sortable: false, filterable: false,
        accessor: (r) => rm(Number(r.perUnit)), exportValue: (r) => Number(r.perUnit) },
      { key: "tiers", label: "Tier bonus", width: 340, sortable: false, filterable: false, accessor: kpiTiersWord, exportValue: kpiTiersWord },
      { key: "period", label: "Count starts again", width: 170, sortable: false, filterType: "enum", accessor: (r) => kpiPeriodWord(r.period) },
      { key: "guarantee", label: "Guarantee", width: 200, sortable: false, accessor: guaranteeWord, searchValue: guaranteeWord },
      { key: "state", label: "Status", width: 130, sortable: false, filterType: "enum", accessor: (r) => STATE_WORD[r.state] },
      { key: "memo", label: "Memo", width: 260, sortable: false, accessor: (r) => r.memo ?? "No memo", searchValue: (r) => r.memo ?? "" },
      { key: "added", label: "Added", width: 200, sortable: false, filterable: false, accessor: addedWord },
    ],
    [],
  );

  if (query.isError) return <LoadFailed what="The KPI allowance" onRetry={() => void query.refetch()} />;
  return (
    <ListPageShell register>
      <div className="flex min-h-0 flex-1 flex-col" data-testid="commission-kpi-page">
        <DataGrid
          rows={rules}
          columns={columns}
          rowKey={(r) => r.id}
          storageKey="carres.finance.commission-kpi.v1"
          appearance="reference"
          groupBanner={false}
          allowColumnGrouping={false}
          exportName="KPI allowance"
          isLoading={!query.isSuccess}
          onRowClick={(r) => setOpen(r)}
          wrapToolbar
          toolbarStart={toolbarStart}
          toolbarEnd={
            // PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), dealer commission step 4).
            <Button variant="neutral" onClick={() => setOpen("new")} disabled={!query.isSuccess}>
              Add a KPI allowance
            </Button>
          }
          statusSummary={(visible) => (
            <span data-testid="commission-kpi-summary">
              {visible.length} of {rules.length} rows · Each guarantee counts on its order&apos;s day. The highest tier reached pays its bonus.
            </span>
          )}
        />
      </div>
      {open === "new" && query.data && <AddKpiModal data={query.data} onClose={() => setOpen(null)} />}
      {open && open !== "new" && <KpiModal key={open.id} rule={open} onClose={() => setOpen(null)} />}
    </ListPageShell>
  );
}

function useKpiMutation<T>(fn: (v: T) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    // The rules, and every month's report and statement, read them.
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance", "dealer-commission"] }),
  });
}

interface Tier { units: string; bonus: string }
interface Draft {
  modelId: string;
  perUnit: string;
  tiers: Tier[];
  period: "month" | "year";
  startsOn: string | null;
  memo: string;
}

const isNumber = (s: string) => s.trim() !== "" && Number.isFinite(Number(s));

/** The Receiving button law: the disabled Save names its gap. */
export function kpiDraftGap(d: Draft): string | null {
  // PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), dealer commission step 4).
  if (!d.modelId) return "Save: pick the guarantee";
  if (!isNumber(d.perUnit)) return "Save: type the amount per guarantee";
  if (d.tiers.some((t) => !isNumber(t.units) || !isNumber(t.bonus))) return "Save: complete each tier";
  if (!d.startsOn) return "Save: pick the day it starts";
  return null;
}

/** The body the add door takes, from a draft with no gap. */
export function kpiDraftBody(d: Draft): DcKpiRuleAddInput {
  return {
    startsOn: d.startsOn!,
    modelId: d.modelId,
    perUnit: Number(d.perUnit),
    tiers: d.tiers.map((t) => ({ units: Number(t.units), bonus: Number(t.bonus) })),
    period: d.period,
    memo: d.memo.trim() || null,
  };
}

function AddKpiModal({ data, onClose }: { data: DcKpiRulesRead; onClose: () => void }) {
  const [d, setD] = useState<Draft>({
    // One guarantee on sale: it is the one counted.
    modelId: data.guarantees.length === 1 ? data.guarantees[0].id : "",
    perUnit: "", tiers: [], period: "month", startsOn: null, memo: "",
  });
  const [refusal, setRefusal] = useState<string | null>(null);
  const save = useKpiMutation((body: DcKpiRuleAddInput) =>
    apiFetch(`${BASE}/kpi-rules`, { method: "POST", body: JSON.stringify(body) }));
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const setTier = (i: number, patch: Partial<Tier>) =>
    set({ tiers: d.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const gap = kpiDraftGap(d);
  return (
    <Modal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      // PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), dealer commission step 4).
      title="Add a KPI allowance"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={gap !== null}
            onClick={() => {
              setRefusal(null);
              if (gap) return;
              save.mutate(kpiDraftBody(d), { onSuccess: onClose, onError: (e) => setRefusal(e.message) });
            }}
          >
            {gap ?? "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3" data-testid="commission-kpi-form">
        <Select id="kpi-guarantee" label="Guarantee" required value={d.modelId || undefined} placeholder="Choose"
          onValueChange={(v) => set({ modelId: v })} options={data.guarantees.map((g) => ({ value: g.id, label: g.name }))} />
        <Input id="kpi-per-unit" type="number" label="Per guarantee (RM)" required min={0} step="0.01"
          value={d.perUnit} onChange={(e) => set({ perUnit: e.target.value })} />
        <div className="flex flex-col gap-2">
          <p className="text-body text-kit-slate-11">Tier bonus: the highest tier reached pays its bonus. Tiers do not add up.</p>
          {d.tiers.map((t, i) => (
            <div key={i} className="flex items-end gap-2" data-testid="commission-kpi-tier">
              <div className="w-40">
                <Input id={`kpi-tier-units-${i}`} type="number" label="From guarantees" required min={1} step="1"
                  value={t.units} onChange={(e) => setTier(i, { units: e.target.value })} />
              </div>
              <div className="w-40">
                <Input id={`kpi-tier-bonus-${i}`} type="number" label="Bonus (RM)" required min={0} step="0.01"
                  value={t.bonus} onChange={(e) => setTier(i, { bonus: e.target.value })} />
              </div>
              <Button iconOnly variant="ghost" icon="delete" aria-label={`Remove tier ${i + 1}`}
                onClick={() => set({ tiers: d.tiers.filter((_, j) => j !== i) })} />
            </div>
          ))}
          <div>
            <Button size="sm" icon="add" onClick={() => set({ tiers: [...d.tiers, { units: "", bonus: "" }] })}>Add a tier</Button>
          </div>
        </div>
        <Select id="kpi-period" label="Count starts again" required value={d.period}
          onValueChange={(v) => set({ period: v as Draft["period"] })}
          options={[{ value: "month", label: "Each month" }, { value: "year", label: "Each year" }]} />
        <DatePicker id="kpi-starts" label="Starts on" required value={d.startsOn} onChange={(v) => set({ startsOn: v })} />
        <Input id="kpi-memo" label="Memo" hint="The rule it comes from, like the memo's name and date."
          maxLength={200} value={d.memo} onChange={(e) => set({ memo: e.target.value })} />
        <p className="text-body text-kit-slate-11">
          Guarantees sold from this day count under it. Each order counts on its own day; a cancelled order&apos;s do not count.
        </p>
        {refusal && <FieldError>{refusal}</FieldError>}
      </div>
    </Modal>
  );
}

function KpiModal({ rule, onClose }: { rule: DcKpiRuleRow; onClose: () => void }) {
  const [refusal, setRefusal] = useState<string | null>(null);
  const remove = useKpiMutation(() => apiFetch(`${BASE}/kpi-rules/${rule.id}`, { method: "DELETE" }));
  return (
    <Modal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      // PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), dealer commission step 4).
      title="KPI allowance"
      description={guaranteeWord(rule)}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={remove.isPending}
            onClick={() => {
              setRefusal(null);
              remove.mutate(undefined, { onSuccess: onClose, onError: (e) => setRefusal(e.message) });
            }}
          >
            Remove
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2 text-body" data-testid="commission-kpi-detail">
        <p>Per guarantee: {rm(Number(rule.perUnit))}</p>
        <p>Tier bonus: {kpiTiersWord(rule)}</p>
        <p>Count starts again: {kpiPeriodWord(rule.period)}</p>
        <p>From: {fmtDate(rule.startsOn)}</p>
        <p>Status: {STATE_WORD[rule.state]}</p>
        <p>Memo: {rule.memo ?? "No memo"}</p>
        <p>Added: {addedWord(rule)}</p>
        <p className="text-kit-slate-11">Removing it gives the months from {fmtDate(rule.startsOn)} the allowance before it, if there is one.</p>
        {refusal && <FieldError>{refusal}</FieldError>}
      </div>
    </Modal>
  );
}
