/**
 * Finance → Reports → Forecast, at `/finance/reports/forecast` (migration
 * 0646; Chew 2026-10-03, docs/finance/MASTER.md §3.6, after Houzs Part 10 §18).
 *
 * One month at a time: the plan for each profit-and-loss account, beside what
 * the ledger shows for that month. An income account is planned as an amount;
 * a cost or an expense as an amount or as a % of the month's planned income,
 * and the other box shows what it works out to. The whole month saves at once.
 *
 * Every figure is the shared forecast arithmetic's (Law D); the actual is the
 * Profit and Loss's own read for the month. Nothing posts from a plan.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  copyPlan,
  forecastReport,
  readTypedAmount,
  readTypedShare,
  shareWord,
  type ForecastAccount,
  type ForecastActualInput,
  type ForecastAnswer,
  type ForecastBlock,
  type ForecastCell,
  type ForecastFigure,
  type ForecastLine,
  type ForecastReport,
  type ForecastSaved,
} from "@carres/shared/forecast";
import Button from "@/components/kit/Button";
import DataTable, { type Column, type GroupRowCell } from "@/components/kit/DataTable";
import { FieldError } from "@/components/kit/FieldFrame";
import Input from "@/components/kit/Input";
import Select from "@/components/kit/Select";
import { apiFetch } from "@/lib/api";
import { appTodayIso, fmtDate, fmtMonth } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import { ReadFailed } from "../payables/PayablesParts";
import { refusal } from "../payables/payables-words";
import { profitAndLossQuery, type ProfitAndLoss } from "./report-queries";
import { monthEnd, nextMonth } from "./period";

const BLOCK_WORD: Record<ForecastBlock, string> = {
  income: "Income",
  cost: "Cost of sales",
  expense: "Expense",
};

/** One box per account, as typed: the amount box or the % box, never both. */
type Draft = Record<string, { kind: "amount" | "share"; text: string }>;

type Row =
  | { id: string; kind: "line"; line: ForecastLine }
  | { id: string; kind: "gross" };

const money = (sen: number | null) => (sen === null ? "" : rm(sen / 100));
const amountText = (ringgit: number) => ringgit.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const shareText = (bp: number) => (bp / 100).toFixed(2);

export const forecastKey = (month: string) => ["finance", "ledger", "forecast", month] as const;

/** This month, the twelve before and the twelve after, every planned month
 *  and the month on screen; newest first. */
export function forecastMonths(today: string, planned: readonly string[], shown: string): string[] {
  let ym = today.slice(0, 7);
  for (let i = 0; i < 12; i += 1) {
    const [y, m] = ym.split("-").map(Number) as [number, number];
    ym = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  }
  const out = new Set<string>([...planned, shown]);
  for (let i = 0; i < 25; i += 1) {
    out.add(ym);
    ym = nextMonth(ym);
  }
  return [...out].sort().reverse();
}

/** `?month=` when it is a month, else this month. */
export function readForecastMonth(v: string | null, today: string): string {
  return v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : today.slice(0, 7);
}

function draftOf(cells: Record<string, ForecastCell>): Draft {
  const out: Draft = {};
  for (const [code, c] of Object.entries(cells)) {
    out[code] = "amount" in c ? { kind: "amount", text: amountText(Number(c.amount)) } : { kind: "share", text: shareText(c.share) };
  }
  return out;
}

/** The draft as cells, and the words for every box that cannot be read. */
function cellsOf(draft: Draft, accounts: readonly ForecastAccount[]): { cells: Record<string, ForecastCell>; bad: Record<string, string> } {
  const income = new Set(accounts.filter((a) => a.kind === "INCOME").map((a) => a.code));
  const cells: Record<string, ForecastCell> = {};
  const bad: Record<string, string> = {};
  for (const [code, box] of Object.entries(draft)) {
    if (box.kind === "share" && income.has(code)) continue;
    const typed = box.kind === "amount" ? readTypedAmount(box.text) : readTypedShare(box.text);
    if (typed === null) continue;
    if (!typed.ok) bad[code] = typed.words;
    else cells[code] = box.kind === "amount" ? { amount: typed.value } : { share: typed.value };
  }
  return { cells, bad };
}

const sameCell = (a: ForecastCell, b: ForecastCell) =>
  "amount" in a ? "amount" in b && Number(a.amount) === Number(b.amount) : "share" in b && a.share === b.share;
const samePlan = (a: Record<string, ForecastCell>, b: Record<string, ForecastCell>) =>
  Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, c]) => b[k] !== undefined && sameCell(c, b[k]!));

/** The Profit and Loss as the forecast reads it: every account line and the net. */
function actualOf(pl: ProfitAndLoss | undefined): ForecastActualInput | null {
  if (!pl || pl.status !== "ok") return null;
  return {
    lines: pl.sections.flatMap((s) => s.groups.flatMap((g) => g.lines.map((l) => ({ code: l.code, name: l.name, kind: s.kind, amount: l.amount })))),
    net: pl.net,
  };
}

const strong = (text: string) => <span className="font-semibold tabular-nums">{text}</span>;

function figureCells(word: string, f: ForecastFigure): readonly GroupRowCell[] {
  return [
    { content: <span className="font-semibold">{word}</span> },
    { align: "right", content: strong(money(f.plan)) },
    { align: "right", content: strong(shareWord(f.share)) },
    { align: "right", content: strong(money(f.actual)) },
    { align: "right", content: strong(money(f.difference)) },
  ];
}

export default function Forecast() {
  const [params, setParams] = useSearchParams();
  const today = appTodayIso();
  const month = readForecastMonth(params.get("month"), today);
  const future = month > today.slice(0, 7);

  const read = useQuery({
    queryKey: forecastKey(month),
    queryFn: () => apiFetch<ForecastAnswer>(`/api/finance/ledger/forecast?${new URLSearchParams({ month }).toString()}`),
    refetchOnWindowFocus: false,
  });
  const pl = useQuery({ ...profitAndLossQuery(`${month}-01`, monthEnd(month)), enabled: !future });

  // The plan the boxes started from, and the boxes as typed. A read that
  // comes back again never touches what is being typed.
  const [base, setBase] = useState<ForecastAnswer | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const reset = (answer: ForecastAnswer) => {
    setBase(answer);
    setDraft(draftOf(answer.lines));
  };
  useEffect(() => {
    if (read.data && (base === null || base.month !== read.data.month)) reset(read.data);
  }, [read.data, base]);
  const answer = base && base.month === month ? base : null;

  const typed = useMemo(() => (answer ? cellsOf(draft, answer.accounts) : null), [answer, draft]);
  const bad = typed ? Object.keys(typed.bad).length > 0 : false;
  const dirty = answer !== null && typed !== null && (bad || !samePlan(typed.cells, answer.lines));

  // Leaving the page with a plan not saved asks first, as the Sales Order does.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const actual = useMemo(() => actualOf(pl.data), [pl.data]);
  const built = useMemo((): { report: ForecastReport; actualRead: boolean } | null => {
    if (!answer || !typed) return null;
    try {
      return { report: forecastReport(answer.accounts, typed.cells, actual), actualRead: actual !== null };
    } catch {
      try {
        return { report: forecastReport(answer.accounts, typed.cells, null), actualRead: false };
      } catch {
        return null;
      }
    }
  }, [answer, typed, actual]);
  const report = built?.report ?? null;
  const actualUnreadable = built !== null && actual !== null && !built.actualRead;
  // The kit's table keeps every row one line high, so a box that cannot be
  // read is named once above it, the way the database names a wrong cell.
  const badLine = report && typed ? report.lines.find((l) => typed.bad[l.account.code]) : undefined;
  const badWords = badLine ? typed!.bad[badLine.account.code]! : "";
  const firstBad = badLine ? `${badLine.account.code} ${badLine.account.name}: ${badWords.charAt(0).toLowerCase()}${badWords.slice(1)}` : null;

  const reload = async () => {
    const fresh = await read.refetch();
    if (fresh.data) reset(fresh.data);
  };
  const save = useMutation({
    mutationFn: () => apiFetch<ForecastSaved>(`/api/finance/ledger/forecast/${month}`, {
      method: "PUT",
      body: JSON.stringify({ lines: typed!.cells, was: answer!.updated_at }),
    }),
    onSuccess: async () => {
      toast.success("Forecast saved");
      await reload();
    },
    onError: (e) => {
      toast.error(refusal(e));
      // Someone else saved the month: read it again so Discard shows their plan.
      if ((e as { status?: number }).status === 409) void read.refetch();
    },
  });

  const previous = answer?.previous ?? null;
  // What the earlier plan adds: only boxes left blank, never one being typed in.
  const toCopy = previous && answer && typed
    ? Object.entries(copyPlan(answer.accounts, typed.cells, previous.lines))
      .filter(([code]) => !typed.cells[code] && (draft[code]?.text.trim() ?? "") === "")
    : [];
  const copy = () => {
    if (!previous || toCopy.length === 0) return;
    setDraft((d) => {
      const next = { ...d };
      for (const [code, c] of toCopy) {
        next[code] = "amount" in c ? { kind: "amount", text: amountText(Number(c.amount)) } : { kind: "share", text: shareText(c.share) };
      }
      return next;
    });
    toast.success(`Plan copied from ${fmtMonth(previous.month)}. Save to keep it.`);
  };
  const type = (code: string, kind: "amount" | "share", text: string) => setDraft((d) => ({ ...d, [code]: { kind, text } }));

  const rows = useMemo((): Row[] => {
    if (!report) return [];
    const of = (b: ForecastBlock) => report.lines.filter((l) => l.account.block === b).map((line): Row => ({ id: line.account.code, kind: "line", line }));
    return [...of("income"), ...of("cost"), { id: "gross", kind: "gross" }, ...of("expense")];
  }, [report]);

  const columns: Column<Row>[] = [
    {
      key: "account", label: "Account", width: "280px",
      cell: (r) => (r.kind === "gross" ? <span className="font-semibold">Gross profit</span> : `${r.line.account.code} ${r.line.account.name}`),
    },
    {
      key: "plan", label: "Plan", width: "160px", align: "right",
      cell: (r) => {
        if (r.kind === "gross") return strong(money(report?.gross.plan ?? null));
        const { account: a, cell, plan } = r.line;
        const box = draft[a.code];
        return <Input id={`forecast-plan-${a.code}`} aria-label={`Plan for ${a.code} ${a.name}`} inputMode="decimal"
          value={box?.kind === "amount" ? box.text : ""}
          placeholder={cell && "share" in cell && plan !== null ? amountText(plan / 100) : ""}
          aria-invalid={box?.kind === "amount" && typed?.bad[a.code] ? true : undefined} aria-describedby={typed?.bad[a.code] ? "forecast-error" : undefined}
          onChange={(e) => type(a.code, "amount", e.target.value)} />;
      },
    },
    {
      key: "share", label: "% of income", width: "130px", align: "right",
      cell: (r) => {
        if (r.kind === "gross") return strong(shareWord(report?.gross.share ?? null));
        const { account: a, cell, share } = r.line;
        // Income is planned as an amount; its share of the whole is only shown.
        if (a.kind === "INCOME") return <span className="text-kit-slate-11 tabular-nums">{shareWord(share)}</span>;
        const box = draft[a.code];
        return <Input id={`forecast-share-${a.code}`} aria-label={`% of income for ${a.code} ${a.name}`} inputMode="decimal"
          value={box?.kind === "share" ? box.text : ""}
          placeholder={cell && "amount" in cell && share !== null ? shareText(share) : ""}
          aria-invalid={box?.kind === "share" && typed?.bad[a.code] ? true : undefined} aria-describedby={typed?.bad[a.code] ? "forecast-error" : undefined}
          onChange={(e) => type(a.code, "share", e.target.value)} />;
      },
    },
    {
      key: "actual", label: "Actual", width: "140px", align: "right", numeric: true,
      cell: (r) => (r.kind === "gross" ? strong(money(report?.gross.actual ?? null)) : money(r.line.actual)),
    },
    {
      key: "difference", label: "Difference", width: "140px", align: "right", numeric: true,
      cell: (r) => (r.kind === "gross" ? strong(money(report?.gross.difference ?? null)) : money(r.line.difference)),
    },
  ];

  const plNote = future ? "This month has not started, so it has no actual yet."
    : pl.data?.status === "before_go_live" ? `The ledger starts on ${fmtDate(pl.data.goLiveOn)}, so this month has no actual.`
      : (pl.error as { status?: number } | null)?.status === 409 ? "The ledger has no start date yet, so there is no actual."
        : null;

  return <div className="flex h-full min-h-0 flex-col">
    <ModuleHeader destinationHeader testId="forecast-destination-header" word="Forecast" docTitle="Forecast · Carres" />
    {read.isError || (answer && !report) ? <ReadFailed what="The forecast" onRetry={() => void reload()} /> : (
      <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-40">
              <Select id="forecast-month" label="Month" value={month} disabled={dirty}
                onValueChange={(ym) => setParams((before) => { const next = new URLSearchParams(before); next.set("month", ym); return next; })}
                options={forecastMonths(today, answer?.planned_months ?? [], month).map((m) => ({ value: m, label: fmtMonth(m) }))} />
            </div>
            {previous && <Button variant="neutral" disabled={toCopy.length === 0} onClick={copy}>Copy plan from {fmtMonth(previous.month)}</Button>}
            <span className="ml-auto flex items-center gap-3">
              {dirty && <span className="text-body text-kit-slate-11" data-testid="forecast-not-saved">Not saved</span>}
              {dirty && <Button variant="neutral" disabled={save.isPending} onClick={() => void reload()}>Discard</Button>}
              <Button variant="primary" disabled={!dirty || bad} loading={save.isPending} onClick={() => save.mutate()}>Save</Button>
            </span>
          </div>
          <p className="text-label text-kit-slate-11" data-testid="forecast-note">
            Plan income as an amount. Plan a cost as an amount or as a % of the month's planned income; the other box shows what it works out to.
            Difference is actual less plan.
            {answer?.updated_at ? ` Saved by ${answer.updated_by_name ?? "Finance"} on ${fmtDate(answer.updated_at, { time: true })}.` : ""}
          </p>
          {plNote && <p className="text-body" data-testid="forecast-no-actual">{plNote}</p>}
          {firstBad && <FieldError id="forecast-error" testId="forecast-error">{firstBad}</FieldError>}
          {(actualUnreadable || (pl.isError && !plNote)) && <ReadFailed what="The month's actual" onRetry={() => void pl.refetch()} />}
          <DataTable label={`Forecast for ${fmtMonth(month)}`} testId="forecast" rowTestId="forecast-row"
            rows={rows} columns={columns} rowId={(r) => r.id} sizing="content" loading={!answer}
            empty={answer ? "No income or expense account is in the chart." : "Loading the forecast…"}
            rowMuted={(r) => r.kind === "line" && !r.line.account.active}
            group={{
              keyOf: (r) => (r.kind === "gross" ? "cost" : r.line.account.block),
              cells: (r) => {
                const b: ForecastBlock = r.kind === "gross" ? "cost" : r.line.account.block;
                return report ? figureCells(BLOCK_WORD[b], report.blocks[b]) : [];
              },
            }}
            totals={report ? { label: "Net result", cells: () => figureCells("Net result", report.net) } : undefined} />
        </div>
      </div>
    )}
  </div>;
}
