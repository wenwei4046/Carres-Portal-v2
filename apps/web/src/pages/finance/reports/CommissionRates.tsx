/**
 * Reports → Dealer commission → Commission rates (0661, Chew 2026-10-05 to
 * 2026-10-07, docs/finance/MASTER.md §3.2 "Dealer commission rules").
 *
 * Every rate has a start day, and an order takes the rate in force on its
 * order day, so a new rate never changes a month already worked out. One
 * list, five groups, each row a rate or switch from its day:
 *   Standard rate      the rate every product takes
 *   Dealer rates       a dealer's own rate
 *   Product rates      a product's own rate (it wins over the dealer's)
 *   Promotion items    a product that takes points off the rate that applies
 *   Kinds of product   whether mattresses, bedframes, sofas and accessories
 *                      earn; service and the guarantee never do
 * A row is never changed: `Add a rate` adds the new one from its day, and a
 * row added by mistake is removed from its window. The first rows are from
 * the start and stay.
 */
import { useMemo, useState } from "react";
import { categoryLabel } from "@carres/shared";
import type { DcRule, DcRuleAddInput, DcRuleKind, DcRulesRead } from "@carres/shared/dealer-commission";
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
import { LoadFailed } from "../other-money-in/parts";

const BASE = "/api/finance/dealer-commission";
export const RULES_QUERY_KEY = ["finance", "dealer-commission", "rules"] as const;

// PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), 0661).
export const RULE_GROUPS: readonly { key: DcRuleKind; label: string; emptyLabel: string }[] = [
  { key: "standard", label: "Standard rate", emptyLabel: "No standard rate" },
  { key: "dealer", label: "Dealer rates", emptyLabel: "No dealer has its own rate" },
  { key: "product", label: "Product rates", emptyLabel: "No product has its own rate" },
  { key: "promotion", label: "Promotion items", emptyLabel: "No promotion item" },
  { key: "category", label: "Kinds of product", emptyLabel: "No kind of product" },
];

const FOR_OPTIONS: readonly { value: DcRuleKind; label: string }[] = [
  { value: "standard", label: "Standard rate" },
  { value: "dealer", label: "A dealer's rate" },
  { value: "product", label: "A product's rate" },
  { value: "promotion", label: "A promotion item" },
  { value: "category", label: "A kind of product" },
];

const STATE_WORD: Record<DcRule["state"], string> = {
  in_use: "In use",
  replaced: "Replaced",
  later: "Starts later",
};

/** What a rule applies to, in the words the page prints. */
export function appliesTo(r: Pick<DcRule, "kind" | "dealerName" | "modelName" | "category">): string {
  if (r.kind === "standard") return "Every product";
  if (r.kind === "dealer") return r.dealerName ?? "Dealer not available";
  if (r.kind === "category") return r.category ? categoryLabel(r.category) : "Kind not available";
  return r.modelName ?? "Product not available";
}

const pct = (n: number | null) => `${Number(n ?? 0)}%`;

/** The rate or switch a rule sets. */
export function ruleWord(r: Pick<DcRule, "kind" | "rate" | "isOn">): string {
  if (r.kind === "promotion") return r.isOn ? `${Number(r.rate ?? 0)} points off` : "Not a promotion item";
  if (r.kind === "category") return r.isOn ? "Earns commission" : "Earns nothing";
  return pct(r.rate);
}

const fromWord = (r: Pick<DcRule, "startsOn">) => (r.startsOn ? fmtDate(r.startsOn) : "From the start");
const addedWord = (r: Pick<DcRule, "createdAt" | "createdBy">) => `${fmtDate(r.createdAt)}${r.createdBy ? ` · ${r.createdBy}` : ""}`;

export default function CommissionRates({ toolbarStart }: { toolbarStart: React.ReactNode }) {
  const query = useQuery({
    queryKey: RULES_QUERY_KEY,
    queryFn: () => apiFetch<DcRulesRead>(`${BASE}/rules`),
  });
  const [open, setOpen] = useState<DcRule | "new" | null>(null);
  const rules = query.data?.rules ?? [];

  const columns = useMemo<DataGridColumn<DcRule>[]>(
    () => [
      { key: "applies", label: "Applies to", width: 260, sortable: false, accessor: appliesTo, searchValue: appliesTo },
      { key: "rate", label: "Rate", width: 170, sortable: false, accessor: ruleWord, searchValue: ruleWord },
      { key: "from", label: "From", width: 140, sortable: false, accessor: fromWord, exportValue: (r) => r.startsOn ?? "" },
      { key: "state", label: "Status", width: 130, sortable: false, filterType: "enum", accessor: (r) => STATE_WORD[r.state] },
      { key: "memo", label: "Memo", width: 320, sortable: false, accessor: (r) => r.memo ?? "No memo", searchValue: (r) => r.memo ?? "" },
      { key: "added", label: "Added", width: 200, sortable: false, filterable: false, accessor: addedWord },
    ],
    [],
  );

  if (query.isError) return <LoadFailed what="The commission rates" onRetry={() => void query.refetch()} />;
  return (
    <ListPageShell register>
      <div className="flex min-h-0 flex-1 flex-col" data-testid="commission-rates-page">
        <DataGrid
          rows={rules}
          columns={columns}
          rowKey={(r) => r.id}
          storageKey="carres.finance.commission-rates.v1"
          appearance="reference"
          groupBanner={false}
          allowColumnGrouping={false}
          exportName="Commission rates"
          fixedGroups={{
            groups: RULE_GROUPS.map((g) => ({ key: g.key, label: g.label, alwaysOpen: true, emptyLabel: g.emptyLabel })),
            groupOf: (r) => r.kind,
            revealMatches: true,
          }}
          isLoading={!query.isSuccess}
          onRowClick={(r) => setOpen(r)}
          wrapToolbar
          toolbarStart={toolbarStart}
          toolbarEnd={
            // PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), 0661).
            <Button variant="neutral" onClick={() => setOpen("new")} disabled={!query.isSuccess}>
              Add a rate
            </Button>
          }
          statusSummary={(visible) => (
            <span data-testid="commission-rates-summary">
              {visible.length} of {rules.length} rows · An order takes the rates in force on its order day.
            </span>
          )}
        />
      </div>
      {open === "new" && query.data && <AddRuleModal data={query.data} onClose={() => setOpen(null)} />}
      {open && open !== "new" && <RuleModal key={open.id} rule={open} onClose={() => setOpen(null)} />}
    </ListPageShell>
  );
}

function useRuleMutation<T>(fn: (v: T) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    // The rules and every month's report read them.
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance", "dealer-commission"] }),
  });
}

interface Draft {
  kind: DcRuleKind | "";
  dealerId: string;
  modelId: string;
  category: string;
  rate: string;
  promotion: "on" | "off";
  points: string;
  earns: "on" | "off";
  startsOn: string | null;
  memo: string;
}

const EMPTY: Draft = {
  kind: "", dealerId: "", modelId: "", category: "", rate: "",
  promotion: "on", points: "5", earns: "on", startsOn: null, memo: "",
};

/** The Receiving button law: the disabled Save names its gap. */
export function draftGap(d: Draft): string | null {
  // PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), 0661).
  if (!d.kind) return "Save: pick what the rate is for";
  if (d.kind === "dealer" && !d.dealerId) return "Save: pick the dealer";
  if ((d.kind === "product" || d.kind === "promotion") && !d.modelId) return "Save: pick the product";
  if (d.kind === "category" && !d.category) return "Save: pick the kind of product";
  if ((d.kind === "standard" || d.kind === "dealer" || d.kind === "product") && !isNumber(d.rate)) return "Save: type the rate";
  if (d.kind === "promotion" && d.promotion === "on" && !isNumber(d.points)) return "Save: type the points off";
  if (!d.startsOn) return "Save: pick the day it starts";
  return null;
}

const isNumber = (s: string) => s.trim() !== "" && Number.isFinite(Number(s));

/** The body the add door takes, from a draft with no gap. */
export function draftBody(d: Draft): DcRuleAddInput {
  const base = { startsOn: d.startsOn!, memo: d.memo.trim() || null };
  switch (d.kind) {
    case "standard": return { kind: "standard", rate: Number(d.rate), ...base };
    case "dealer": return { kind: "dealer", dealerId: d.dealerId, rate: Number(d.rate), ...base };
    case "product": return { kind: "product", modelId: d.modelId, rate: Number(d.rate), ...base };
    case "promotion":
      return { kind: "promotion", modelId: d.modelId, isOn: d.promotion === "on",
        points: d.promotion === "on" ? Number(d.points) : null, ...base };
    default: return { kind: "category", category: d.category, isOn: d.earns === "on", ...base };
  }
}

function AddRuleModal({ data, onClose }: { data: DcRulesRead; onClose: () => void }) {
  const [d, setD] = useState<Draft>(EMPTY);
  const [refusal, setRefusal] = useState<string | null>(null);
  const save = useRuleMutation((body: DcRuleAddInput) =>
    apiFetch(`${BASE}/rules`, { method: "POST", body: JSON.stringify(body) }));
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const gap = draftGap(d);
  const takesRate = d.kind === "standard" || d.kind === "dealer" || d.kind === "product";
  return (
    <Modal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      // PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), 0661).
      title="Add a rate"
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
              save.mutate(draftBody(d), { onSuccess: onClose, onError: (e) => setRefusal(e.message) });
            }}
          >
            {gap ?? "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3" data-testid="commission-rate-form">
        <Select id="rule-for" label="For" required value={d.kind || undefined} placeholder="Choose"
          onValueChange={(v) => set({ kind: v as DcRuleKind })} options={FOR_OPTIONS} />
        {d.kind === "dealer" && (
          <Select id="rule-dealer" label="Dealer" required value={d.dealerId || undefined} placeholder="Choose"
            onValueChange={(v) => set({ dealerId: v })}
            options={data.dealers.map((x) => ({ value: x.id, label: x.name }))} />
        )}
        {(d.kind === "product" || d.kind === "promotion") && (
          <Select id="rule-product" label="Product" required value={d.modelId || undefined} placeholder="Choose"
            onValueChange={(v) => set({ modelId: v })}
            options={data.models.map((m) => ({ value: m.id, label: `${m.name} · ${categoryLabel(m.category)}` }))} />
        )}
        {d.kind === "category" && (
          <>
            <Select id="rule-category" label="Kind of product" required value={d.category || undefined} placeholder="Choose"
              onValueChange={(v) => set({ category: v })}
              options={data.categories.map((c) => ({ value: c, label: categoryLabel(c) }))} />
            <Select id="rule-earns" label="Commission" required value={d.earns}
              onValueChange={(v) => set({ earns: v as Draft["earns"] })}
              options={[{ value: "on", label: "Earns commission" }, { value: "off", label: "Earns nothing" }]} />
          </>
        )}
        {takesRate && (
          <Input id="rule-rate" type="number" label="Rate (%)" required min={0} max={100} step="0.01"
            value={d.rate} onChange={(e) => set({ rate: e.target.value })} />
        )}
        {d.kind === "promotion" && (
          <>
            <Select id="rule-promotion" label="Promotion" required value={d.promotion}
              onValueChange={(v) => set({ promotion: v as Draft["promotion"] })}
              options={[{ value: "on", label: "Promotion item" }, { value: "off", label: "Not a promotion item" }]} />
            {d.promotion === "on" && (
              <Input id="rule-points" type="number" label="Points off" required min={0} max={100} step="0.01"
                value={d.points} onChange={(e) => set({ points: e.target.value })} />
            )}
          </>
        )}
        <DatePicker id="rule-starts" label="Starts on" required value={d.startsOn} onChange={(v) => set({ startsOn: v })} />
        <Input id="rule-memo" label="Memo" hint="The rule it comes from, like the memo's name and date."
          maxLength={200} value={d.memo} onChange={(e) => set({ memo: e.target.value })} />
        <p className="text-body text-kit-slate-11">Orders placed from this day take it. Earlier orders keep what they had.</p>
        {refusal && <FieldError>{refusal}</FieldError>}
      </div>
    </Modal>
  );
}

function RuleModal({ rule, onClose }: { rule: DcRule; onClose: () => void }) {
  const [refusal, setRefusal] = useState<string | null>(null);
  const remove = useRuleMutation(() => apiFetch(`${BASE}/rules/${rule.id}`, { method: "DELETE" }));
  const fromTheStart = rule.startsOn === null;
  return (
    <Modal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      // PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), 0661).
      title="Commission rate"
      description={appliesTo(rule)}
      footer={
        fromTheStart ? (
          <Button variant="neutral" onClick={onClose}>Close</Button>
        ) : (
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
        )
      }
    >
      <div className="flex flex-col gap-2 text-body" data-testid="commission-rate-detail">
        <p>Rate: {ruleWord(rule)}</p>
        <p>From: {fromWord(rule)}</p>
        <p>Status: {STATE_WORD[rule.state]}</p>
        <p>Memo: {rule.memo ?? "No memo"}</p>
        <p>Added: {addedWord(rule)}</p>
        <p className="text-kit-slate-11">
          {fromTheStart
            ? "A rate from the start stays. Add a new one from a day instead."
            : `Removing it gives the orders from ${fmtDate(rule.startsOn!)} the one before it.`}
        </p>
        {refusal && <FieldError>{refusal}</FieldError>}
      </div>
    </Modal>
  );
}
