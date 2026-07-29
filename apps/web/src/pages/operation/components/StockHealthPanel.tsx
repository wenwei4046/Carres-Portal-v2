import { useState } from "react";
import { Activity } from "lucide-react";
import {
  ACCURACY_WITHHELD_LABEL,
  STOCK_HEALTH_LABEL,
  STOCK_HEALTH_STATES,
  type OpsMonthAccuracy,
  type OpsStockHealthResponse,
  type StockHealthState,
} from "@carres/shared";
import { useStockHealth } from "@/lib/queries";
import { fmtDate, fmtMonth } from "@/lib/fmt-date";

/**
 * Stock health + proposal accuracy — Ready Stock card K5 (no migration).
 *
 * The card's Done-when is the whole design: "COO opens one tab and knows what
 * needs attention today — WITHOUT READING SKU ROWS." So this opens with one
 * sentence and five counts. The rows exist, but behind a click each — a review
 * layer that starts by showing 49 rows has re-created the thing it reviews.
 *
 * WHY IT SAYS "SET A NUMBER" INSTEAD OF SHOWING A HEALTHY WAREHOUSE
 * Live prod carries 49 warehouse SKUs and NOT ONE configured reorder point or
 * reserve level, so a ladder that treated "no number" as healthy would open
 * with 49 green ticks on a warehouse nobody has looked at. K1's law.
 *
 * WHY THE SLOW-MOVING ALERT IS SILENT TODAY
 * Real sales records go back seven days. "No sales in 90 days" is true of every
 * SKU in the building, and a list that names everything names nothing — so the
 * alert states how far the records go instead, and switches itself on when they
 * reach 90 days. Nothing to configure.
 *
 * Every judgement — the ladder, the headline sentence, the coverage gates, the
 * accuracy figures — is made SERVER-side by the shared engine. This file
 * renders the answer.
 */

/** Status tone per rung. Red for the breached floor, green for enough, and a
 *  distinct (not alarming) tone for holding too much — money sitting still is
 *  a fact to see, not an alarm. UI-KIT: colour carries status here. */
const HEALTH_PILL: Record<StockHealthState, string> = {
  critical: "pill-overdue",
  low: "pill-warning",
  over: "pill-collected",
  healthy: "pill-confirmed",
  unrated: "pill-neutral",
};

export default function StockHealthPanel() {
  const { data, isLoading, isError } = useStockHealth();
  const [openRung, setOpenRung] = useState<StockHealthState | null>(null);

  // A browser on this build can reach a Worker that predates /health (the
  // deploy is never atomic) — that must degrade to "no digest", never take the
  // Ready stock tab down with it. The 0265 lesson.
  if (isLoading || isError || !data || !Array.isArray(data.rows)) return null;

  const counts = data.counts ?? {
    critical: 0,
    low: 0,
    over: 0,
    healthy: 0,
    unrated: 0,
  };
  const rows = openRung ? data.rows.filter((r) => r.state === openRung) : [];

  return (
    <section
      className="rounded border border-base-200 bg-white mb-4"
      data-testid="stock-health"
    >
      <header className="px-4 py-3 border-b border-base-100">
        <div className="flex items-center gap-1.5">
          <Activity size={16} strokeWidth={2} className="text-base-400" />
          <span className="text-strong text-base-900">Stock health</span>
        </div>
        <div className="text-body text-base-900 mt-1" data-testid="health-headline">
          {data.headline}
        </div>
      </header>

      <div className="px-4 py-3 flex flex-wrap gap-1.5">
        {STOCK_HEALTH_STATES.map((state) => (
          <button
            key={state}
            type="button"
            onClick={() => setOpenRung((v) => (v === state ? null : state))}
            aria-pressed={openRung === state}
            className={`pill ${HEALTH_PILL[state]} ${
              counts[state] === 0 ? "opacity-45" : ""
            } ${openRung === state ? "ring-1 ring-base-400" : ""}`}
            data-testid={`health-count-${state}`}
          >
            <span className="font-mono tabular-nums">{counts[state]}</span>{" "}
            {STOCK_HEALTH_LABEL[state]}
          </button>
        ))}
      </div>

      {openRung ? (
        <div className="px-4 pb-3" data-testid={`health-rows-${openRung}`}>
          {rows.length === 0 ? (
            <div className="text-meta text-base-500 py-1">
              No item is {STOCK_HEALTH_LABEL[openRung].toLowerCase()}.
            </div>
          ) : (
            rows.map((r) => (
              <div
                key={r.sku}
                className="flex items-baseline justify-between gap-3 text-meta py-1 border-t border-base-100 first:border-t-0"
                data-testid={`health-row-${r.sku}`}
              >
                <span className="text-base-900 truncate" title={r.sku}>
                  {r.sku}
                </span>
                <span className="shrink-0 text-base-500">
                  <span className="font-mono tabular-nums text-base-900">{r.free}</span>{" "}
                  free
                  {r.incoming > 0 ? (
                    <>
                      {" "}
                      · <span className="font-mono tabular-nums">{r.incoming}</span>{" "}
                      coming
                    </>
                  ) : null}
                  {r.reorderPoint != null ? (
                    <>
                      {" "}
                      · reorder at{" "}
                      <span className="font-mono tabular-nums">{r.reorderPoint}</span>
                    </>
                  ) : null}
                  {r.keepLevel != null ? (
                    <>
                      {" "}
                      · keep{" "}
                      <span className="font-mono tabular-nums">{r.keepLevel}</span>
                    </>
                  ) : null}
                </span>
              </div>
            ))
          )}
          {openRung === "unrated" && rows.length > 0 ? (
            <div className="text-meta text-base-600 pt-2">
              Set when to buy on the Reorder card under On hand, and how low it
              may go under &ldquo;How low it may go&rdquo; below.
            </div>
          ) : null}
        </div>
      ) : null}

      <NotSelling data={data} />
      <PlanAccuracy months={data.accuracy ?? []} />
    </section>
  );
}

// ---------------------------------------------------------------------------

/**
 * The card's "slow-moving alert (no sales 90/180 days)".
 *
 * Deliberately NOT called slow-moving on screen: it is warehouse jargon a
 * low-English operator has to guess at, and what the screen means is simply
 * that the item is not selling. The alert never fires off records that are
 * shorter than the window it names — see the module header.
 */
function NotSelling({ data }: { data: OpsStockHealthResponse }) {
  const rows = data.slowMovers ?? [];
  const windows = data.slowWindows ?? [];

  return (
    <div className="px-4 py-3 border-t border-base-100" data-testid="not-selling">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-label uppercase tracking-[0.05em] text-base-400">Not selling</div>
        {windows.some((w) => w.ready) ? (
          <div className="text-meta text-base-600">
            {windows
              .filter((w) => w.ready)
              .map((w) => `${w.count} over ${w.days} days`)
              .join(" · ")}
          </div>
        ) : null}
      </div>

      {data.slowWithheldReason ? (
        <div className="text-meta text-base-600 mt-1" data-testid="not-selling-withheld">
          {data.slowWithheldReason}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-meta text-base-600 mt-1">
          Everything on the floor has sold recently.
        </div>
      ) : (
        <div className="mt-1">
          {rows.slice(0, 8).map((r) => (
            <div
              key={r.sku}
              className="flex items-baseline justify-between gap-3 text-meta py-1 border-t border-base-100 first:border-t-0"
              data-testid={`not-selling-${r.sku}`}
            >
              <span className="text-base-900 truncate" title={r.sku}>
                {r.sku}
              </span>
              <span className="shrink-0 text-base-500">
                <span className="font-mono tabular-nums text-base-900">{r.free}</span>{" "}
                free ·{" "}
                {r.lastSoldOn
                  ? `last sold ${fmtDate(r.lastSoldOn)}`
                  : `no sale in ${r.quietDays} days`}
              </span>
            </div>
          ))}
          {rows.length > 8 ? (
            <div className="text-meta text-base-500 pt-1">
              and {rows.length - 8} more
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * "Per-month proposal accuracy (requested vs sold vs remaining) so planning
 * improves instead of repeating."
 *
 * A month still running is withheld rather than printed: part of a month of
 * sales against a whole month of ordering reads as a failed plan, which is the
 * exact failure HR-P7's cost ratio refuses. The ask and the order still show —
 * those are already decided facts.
 */
function PlanAccuracy({ months }: { months: OpsMonthAccuracy[] }) {
  return (
    <div className="px-4 py-3 border-t border-base-100" data-testid="plan-accuracy">
      <div className="text-label uppercase tracking-[0.05em] text-base-400">Did the plan work?</div>
      {months.length === 0 ? (
        <div className="text-meta text-base-600 mt-1" data-testid="accuracy-empty">
          No month has been approved yet. Once one is, this compares what was
          asked for against what actually sold.
        </div>
      ) : (
        months.slice(0, 6).map((m) => (
          <div
            key={m.period}
            className="text-meta py-1.5 border-t border-base-100 first:border-t-0"
            data-testid={`accuracy-${m.period}`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-base-900">{fmtMonth(m.period)}</span>
              <span className="shrink-0 text-base-500">
                asked{" "}
                <span className="font-mono tabular-nums text-base-900">
                  {m.askedQty}
                </span>{" "}
                · ordered{" "}
                <span className="font-mono tabular-nums text-base-900">
                  {m.orderedQty}
                </span>
                {m.reported ? (
                  <>
                    {" "}
                    · sold{" "}
                    <span className="font-mono tabular-nums text-base-900">
                      {m.soldQty}
                    </span>{" "}
                    · still on the floor{" "}
                    <span className="font-mono tabular-nums">{m.leftOnFloor}</span>
                  </>
                ) : null}
              </span>
            </div>
            {m.reported ? (
              m.movedPct == null ? (
                <div className="text-base-500 mt-0.5">
                  Every line was cut to zero — nothing was ordered.
                </div>
              ) : (
                <div className="text-base-700 mt-0.5">
                  <span className="font-mono tabular-nums text-base-900 font-semibold">
                    {m.movedPct}%
                  </span>{" "}
                  of what was ordered sold that month
                  {m.movedPct > 100 ? " — we ordered too little" : ""}
                </div>
              )
            ) : (
              <div className="text-base-500 mt-0.5" data-testid={`accuracy-withheld-${m.period}`}>
                {m.withheld ? ACCURACY_WITHHELD_LABEL[m.withheld] : null}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
