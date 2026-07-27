import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BarChart3 } from "lucide-react";
import {
  CASE_NUMBERS_CATEGORIES,
  CASE_SLA_WORKING_DAYS,
  caseCategoryBucketLabel,
  type ServiceCaseNumbersResponse,
} from "@carres/shared";
import { apiFetch } from "@/lib/api";
import { fmtMonth } from "@/lib/fmt-date";

/**
 * Service Case numbers — card S5 (`docs/service-case-execution-queue.md`).
 *
 * THE CARD'S DONE-WHEN: "'which supplier / which issue type causes the most
 * cases' is one glance." So the panel opens with ONE sentence and the two
 * rankings; the month grid — Jess's own hand count, per category per month —
 * sits above them and doubles as the only control on the page.
 *
 * WHY NOTHING HERE IS COMPUTED IN THE BROWSER
 * Every figure, every ranking and every withheld reason is decided server-side
 * by `computeCaseNumbers`. This file renders the answer, so the tab and any
 * later reader of the same endpoint cannot reach different arithmetic.
 *
 * WHY FIGURES GO MISSING INSTEAD OF READING ZERO
 * The live database holds one case: closed, and filed before the guided
 * questions existed. It has no category, no issue type and no confirmed finish
 * date — so an average taken off it would be invented and an on-time rate would
 * be a coin toss. Both withhold themselves and say why, and a case nobody was
 * ever asked about reads "Filed before the questions" rather than joining the
 * "Other" a human actually picks.
 */

const CASES_QK = ["ops", "service-cases", "numbers"] as const;

export default function ServiceCaseNumbersPanel() {
  const [period, setPeriod] = useState<string | null>(null);

  const q = useQuery<ServiceCaseNumbersResponse>({
    queryKey: [...CASES_QK, period],
    queryFn: () => {
      const params = new URLSearchParams();
      if (period) params.set("period", period);
      return apiFetch(`/api/ops/service-cases/numbers?${params}`);
    },
    staleTime: 60_000,
    // The month strip IS the control. Without this, clicking a month blanks the
    // panel back to "Loading…" — including the strip you just clicked — and the
    // next click has nothing to aim at.
    placeholderData: keepPreviousData,
  });

  if (q.isLoading) return <p className="text-sm text-base-500">Loading…</p>;

  // A browser on this build can reach a Worker that predates /numbers (the
  // deploy is never atomic). That must degrade to a plain sentence, never take
  // the Service Cases page down with it — the 0265 lesson.
  if (q.isError || !q.data || !Array.isArray(q.data.byMonth)) {
    return (
      <div className="rounded border border-base-200 bg-white p-12 text-center">
        <p className="text-base-700 font-medium">The numbers are not available yet.</p>
        <p className="text-sm text-base-500 mt-1">
          Open the Cases tab to work on cases while this catches up.
        </p>
      </div>
    );
  }

  const d = q.data;

  return (
    <div className="space-y-4" data-testid="case-numbers">
      {/* The one line the card asks for. */}
      <section className="rounded border border-base-200 bg-white">
        <header className="px-4 py-3 border-b border-base-100">
          <div className="flex items-center gap-1.5">
            <BarChart3 size={16} strokeWidth={2} className="text-base-400" />
            <span className="t-h4 text-base-900">
              {d.period ? fmtMonth(d.period) : "Last 6 months"}
            </span>
          </div>
          <div className="text-[13px] text-base-900 mt-1" data-testid="numbers-headline">
            {d.headline}
          </div>
        </header>

        {/* Jess's hand count, and the only control: click a month to narrow. */}
        <div className="px-4 py-3">
          <div className="t-tiny uppercase tracking-wider text-base-500 mb-2">
            Cases by month
          </div>
          {d.byMonth.map((m) => {
            const on = d.period === m.period;
            return (
              <button
                key={m.period}
                type="button"
                onClick={() => setPeriod(on ? null : m.period)}
                aria-pressed={on}
                data-testid={`numbers-month-${m.period}`}
                className={`w-full flex items-baseline gap-3 text-left px-2 py-1.5 rounded border-t border-base-100 first:border-t-0 hover:bg-hovertint ${
                  on ? "bg-hovertint ring-1 ring-base-300" : ""
                }`}
              >
                <span className="text-[13px] text-base-700 w-24 shrink-0">
                  {fmtMonth(m.period)}
                </span>
                <span className="font-mono tabular-nums text-sm text-base-900 w-8 shrink-0 text-right">
                  {m.total}
                </span>
                <span className="text-[12px] text-base-500 truncate">
                  {CASE_NUMBERS_CATEGORIES.filter((cat) => (m.byCategory?.[cat] ?? 0) > 0)
                    .map(
                      (cat) => `${caseCategoryBucketLabel(cat)} ${m.byCategory[cat]}`,
                    )
                    .join(" · ") || "—"}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* The two rankings, side by side — the card's "one glance". */}
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded border border-base-200 bg-white" data-testid="numbers-issues">
          <header className="px-4 py-3 border-b border-base-100">
            <span className="t-h4 text-base-900">What is going wrong</span>
          </header>
          <div className="px-4 py-2">
            {d.byIssue.length === 0 ? (
              <Empty>No case in this period.</Empty>
            ) : (
              d.byIssue.map((i) => (
                <div
                  key={i.key}
                  className="py-1.5 border-t border-base-100 first:border-t-0"
                  data-testid={`numbers-issue-${i.key}`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] text-base-900 truncate">{i.label}</span>
                    <span className="font-mono tabular-nums text-sm text-base-900 shrink-0">
                      {i.count}
                    </span>
                  </div>
                  {/* The card's "issues by type PER CATEGORY". */}
                  <div className="text-[12px] text-base-500">
                    {CASE_NUMBERS_CATEGORIES.filter((c) => (i.byCategory?.[c] ?? 0) > 0)
                      .map((c) => `${caseCategoryBucketLabel(c)} ${i.byCategory[c]}`)
                      .join(" · ")}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded border border-base-200 bg-white" data-testid="numbers-suppliers">
          <header className="px-4 py-3 border-b border-base-100">
            <span className="t-h4 text-base-900">Which factory</span>
          </header>
          <div className="px-4 py-2">
            {d.bySupplier.length === 0 ? (
              <Empty>No case in this period.</Empty>
            ) : (
              d.bySupplier.map((s) => (
                <div
                  key={s.name}
                  className="flex items-baseline justify-between gap-3 py-1.5 border-t border-base-100 first:border-t-0"
                  data-testid={`numbers-supplier-${s.name}`}
                >
                  <span className="text-[13px] text-base-900 truncate" title={s.name}>
                    {s.name}
                  </span>
                  <span className="shrink-0 text-[12px] text-base-500">
                    {s.lateCount > 0 && (
                      <span className="text-error-700 mr-2 tabular-nums">
                        {s.lateCount} late
                      </span>
                    )}
                    <span className="font-mono tabular-nums text-sm text-base-900">
                      {s.count}
                    </span>
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* How long it takes, and how often the promise was kept. */}
      <section className="rounded border border-base-200 bg-white" data-testid="numbers-time">
        <header className="px-4 py-3 border-b border-base-100">
          <span className="t-h4 text-base-900">How long it takes</span>
        </header>
        <div className="px-4 py-3 grid gap-4 md:grid-cols-2">
          <Figure
            label="Average working days to finish"
            testId="numbers-avg-days"
            value={
              d.finish.avgWorkingDays === null ? null : String(d.finish.avgWorkingDays)
            }
            note={
              d.finish.avgWorkingDays === null
                ? d.finish.withheldReason
                : `From ${d.finish.measured} finished ${d.finish.measured === 1 ? "case" : "cases"}. The promise is ${CASE_SLA_WORKING_DAYS} working days.`
            }
          />
          <Figure
            label="Finished on time"
            testId="numbers-on-time"
            value={d.onTime.pct === null ? null : `${d.onTime.pct}%`}
            note={
              d.onTime.pct === null
                ? d.onTime.withheldReason
                : `${d.onTime.onTime} of ${d.onTime.measured} met the deadline.`
            }
          />
        </div>

        <div className="px-4 pb-3 text-[12px] text-base-600 border-t border-base-100 pt-3">
          {d.totals.stillOpen > 0 && (
            <span data-testid="numbers-still-open">
              <span className="font-mono tabular-nums text-base-900">
                {d.totals.stillOpen}
              </span>{" "}
              still running
              {d.totals.stillOpenLate > 0 && (
                <span className="text-error-700">
                  {" "}
                  ·{" "}
                  <span className="font-mono tabular-nums">{d.totals.stillOpenLate}</span>{" "}
                  past the deadline
                </span>
              )}
              {". "}
            </span>
          )}
          {d.totals.closedWithoutFinishDate > 0 && (
            <span data-testid="numbers-unmeasured">
              <span className="font-mono tabular-nums text-base-900">
                {d.totals.closedWithoutFinishDate}
              </span>{" "}
              closed before the portal recorded a finish date, so they are left out of
              both figures.{" "}
            </span>
          )}
          {/* S4 files a hidden responsibility on every delay reason precisely so
              this needs no second tagging pass. Silent until one is recorded. */}
          {d.delayReasonsRecorded > 0 && (
            <span data-testid="numbers-responsibility">
              Why they ran long — factory{" "}
              <span className="font-mono tabular-nums text-base-900">
                {d.byResponsibility.supplier}
              </span>
              , us{" "}
              <span className="font-mono tabular-nums text-base-900">
                {d.byResponsibility.carres}
              </span>
              , customer{" "}
              <span className="font-mono tabular-nums text-base-900">
                {d.byResponsibility.customer}
              </span>
              .
            </span>
          )}
        </div>
      </section>
    </div>
  );
}

/** One figure, or the reason there is no figure. Never a zero standing in for
 *  an answer nobody can give. */
function Figure({
  label,
  value,
  note,
  testId,
}: {
  label: string;
  value: string | null;
  note: string | null;
  testId: string;
}) {
  return (
    <div data-testid={testId}>
      <div className="t-tiny uppercase tracking-wider text-base-500">{label}</div>
      <div
        className={`tabular-nums ${
          value === null ? "t-h4 text-base-400" : "t-h2 text-base-900"
        }`}
      >
        {value ?? "—"}
      </div>
      {note && <div className="text-[12px] text-base-500 mt-1">{note}</div>}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-[12px] text-base-500 py-2">{children}</div>;
}
