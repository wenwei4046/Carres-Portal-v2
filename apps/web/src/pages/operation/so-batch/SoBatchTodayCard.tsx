/**
 * THE TODAY CARD (owner's 12 Oct 2026 package, Summary · Today; 01 §4 Summary).
 *
 * One headline tile with its breakdown rows under it: how many pieces must be
 * ordered now, then why. Read-only: it only prints numbers the page already
 * holds (`by-supplier.ts` `todayNumbers`) and two counts of Sales Orders the
 * page passes in. Amber marks only a row that needs action.
 */
import { BY_SUPPLIER as B, type TodayNumbers } from "./by-supplier";

function Row({ label, value, warn = false, testId }: { label: string; value: string; warn?: boolean; testId: string }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3" data-testid={testId}>
      <span className="min-w-0 text-body text-c-tab">{label}</span>
      <span className={`shrink-0 text-body font-medium ${warn ? "text-c-warn-fg" : "text-c-ink"}`}>{value}</span>
    </div>
  );
}

export default function SoBatchTodayCard({ numbers, tooLate, partlyOrdered, timeWord }: {
  numbers: TodayNumbers;
  /** Sales Orders whose goods cannot be made in time for the customer's date. */
  tooLate: number;
  /** Sales Orders with some goods on a PO and some still to buy. */
  partlyOrdered: number;
  /** `11:00` to `11:00 AM`, the page's own spelling. */
  timeWord: (time: string) => string;
}) {
  const now = numbers.toOrderNow;
  return (
    <section aria-label={B.today} className="mx-2 mb-2 rounded-lg border border-c-card-border bg-white px-3 py-2.5" data-testid="so-batch-today">
      <h3 className="text-label uppercase tracking-[.06em] text-c-secondary">{B.today}</h3>
      <div className={`mt-1.5 rounded-lg px-3 py-2 ${now > 0 ? "bg-c-warn-bg" : "bg-c-ground"}`} data-testid="so-batch-today-now">
        <div className={`text-page ${now > 0 ? "text-c-warn-fg" : "text-c-ink"}`}>{B.qty(null, now)}</div>
        <div className={`text-meta ${now > 0 ? "text-c-warn-fg" : "text-c-secondary"}`}>{B.toOrderNow}</div>
      </div>
      <div className="mt-1 flex flex-col">
        <Row testId="so-batch-today-past" label={B.pastOrderBy} value={B.qty(null, numbers.pastOrderBy)} warn={numbers.pastOrderBy > 0} />
        {numbers.windows.map((w) => (
          <Row key={w.key} testId={`so-batch-today-window-${w.time}`} label={B.windowToday(timeWord(w.time))}
            value={w.passed ? (w.qty > 0 ? B.passed(null, w.qty) : B.allOrdered) : B.toOrder(null, w.qty)}
            warn={w.passed && w.qty > 0} />
        ))}
        <Row testId="so-batch-today-too-late" label={B.tooLate} value={String(tooLate)} warn={tooLate > 0} />
        <Row testId="so-batch-today-partly" label={B.partlyOrdered} value={String(partlyOrdered)} />
      </div>
    </section>
  );
}
