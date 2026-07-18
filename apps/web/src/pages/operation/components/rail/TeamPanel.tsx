import { useMemo } from "react";
import { useOperationPoDuty } from "@/lib/queries";
import { monthKeyMYT, nextPoDayMYT } from "@carres/shared";
import { fmtDateShort } from "@/lib/fmt-date";
import { avatarColor, personInitials, personLabel } from "@/lib/staff-avatar";

/**
 * TeamPanel — PO DUTY board, design B3-final (Jess 2026-07-19).
 *
 * Hero = WHO + on PO duty + UNTIL <handover date> (PagerDuty pattern — the
 * decision-ready fact, never the month name) with a green now-dot on the
 * avatar and the duty verbs as chips. Below: a two-week mini calendar with
 * Mon/Thu tinted + the next PO day green; NEXT UP as ONE line; the PIC scope
 * as one chip row. ZERO sentences — explanations live in tooltips. Replaced
 * the dead Notes slot (1 note ever, from build day; Jess sign-off).
 */
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
function fmtMonth(month: string): string {
  const m = Number(month.slice(5, 7));
  return MONTH_SHORT[m - 1] ?? month;
}

const VERB_CHIP =
  "text-[11px] leading-4 border border-base-300 rounded-full px-2 py-0.5 text-base-800 bg-white whitespace-nowrap";

export default function TeamPanel() {
  const dutyQ = useOperationPoDuty();
  const holder = dutyQ.data?.holder ?? null;
  const currentMonth = dutyQ.data?.month ?? monthKeyMYT();
  const nextUp = (dutyQ.data?.roster ?? []).filter((r) => r.month > currentMonth);

  // Handover date = the last day of the duty month ("until 31 Jul 26").
  const untilLabel = useMemo(() => {
    const y = Number(currentMonth.slice(0, 4));
    const m = Number(currentMonth.slice(5, 7));
    return fmtDateShort(ymd(new Date(y, m, 0)));
  }, [currentMonth]);

  // Two-week strip from this week's Sunday; Mon/Thu are PO days, the next
  // one is green (matches the title-row chip's date).
  const nextPoIso = nextPoDayMYT();
  const nextPoLabel = `${new Date(`${nextPoIso}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" })} ${fmtDateShort(nextPoIso)}`;
  const cells = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return {
        key: ymd(d),
        day: d.getDate(),
        poDay: d.getDay() === 1 || d.getDay() === 4,
        past: d < today,
      };
    });
  }, []);

  if (!holder) {
    return (
      <div className="p-1 text-[12px] text-base-400" data-testid="team-panel">
        Duty roster not live yet — it appears once the rotation table is
        deployed.
      </div>
    );
  }

  const c = avatarColor(holder.userId);
  return (
    <div className="flex flex-col" data-testid="team-panel">
      <div className="t-micro text-base-500 mb-1.5">PO DUTY</div>
      <div className="rounded-lg border border-base-200 bg-base-50 p-3">
        <div className="flex items-center gap-2.5">
          <span
            className="relative w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold leading-none shrink-0"
            style={{ background: c.bg, color: c.fg }}
            title="On duty now"
          >
            {personInitials(holder.name, holder.email)}
            <span
              className="absolute -right-px -bottom-px w-2 h-2 rounded-full bg-success border-2 border-base-50"
              aria-hidden
            />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-base-900 truncate">
              {personLabel(holder.name, holder.email)}
            </span>
            <span className="block text-[11px] text-base-500">
              on PO duty · until {untilLabel}
            </span>
          </span>
        </div>
        <div className="flex gap-1.5 mt-2">
          <span className={VERB_CHIP} title="Raises every consolidated PO — the one voice to suppliers">
            Order PO
          </span>
          <span className={VERB_CHIP} title="Chases every open PO until the goods land">
            Chase supplier
          </span>
        </div>
      </div>

      <div className="t-micro text-base-500 mt-3 mb-1.5">PO DAYS · MON &amp; THU</div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((w, i) => (
          <span key={`w${i}`} className="text-[11px] text-base-400 py-0.5">
            {w}
          </span>
        ))}
        {cells.map((d) => (
          <span
            key={d.key}
            className={`text-[11px] tabular-nums py-1 rounded ${
              d.key === nextPoIso
                ? "bg-success-soft text-success font-semibold"
                : d.poDay
                  ? "bg-base-100 text-base-700 font-semibold"
                  : d.past
                    ? "text-base-300"
                    : "text-base-400"
            }`}
            title={d.key === nextPoIso ? "Next PO day" : d.poDay ? "PO day" : undefined}
          >
            {d.day}
          </span>
        ))}
      </div>
      <div className="text-[11px] text-base-400 mt-1">
        next: <span className="text-success font-semibold">{nextPoLabel}</span>
      </div>

      {nextUp.length > 0 && (
        <>
          <div className="t-micro text-base-500 mt-3 mb-1.5">NEXT UP</div>
          <div className="flex items-center gap-1.5 flex-wrap rounded-lg border border-base-200 bg-white px-2.5 h-9 text-[12px] text-base-700">
            {nextUp.map((r, i) => {
              const rc = avatarColor(r.userId);
              return (
                <span key={r.month} className="inline-flex items-center gap-1.5">
                  {i > 0 && <span className="text-base-300">·</span>}
                  <span
                    className="w-[15px] h-[15px] rounded-full flex items-center justify-center text-[11px] font-bold leading-none shrink-0"
                    style={{ background: rc.bg, color: rc.fg, fontSize: 9 }}
                  >
                    {personInitials(r.name, r.email)}
                  </span>
                  {fmtMonth(r.month)} — {personLabel(r.name, r.email)}
                </span>
              );
            })}
          </div>
        </>
      )}

      <div className="t-micro text-base-500 mt-3 mb-1.5">EVERY PIC · OWN ORDERS</div>
      <div className="flex items-center gap-1.5 rounded-lg border border-base-200 bg-white px-2.5 h-9">
        <span
          className="text-[11px] leading-4 border border-base-200 rounded-full px-1.5 text-base-500 bg-white"
          title="Each PIC chases their own orders — one counterparty, one REF-first message"
        >
          PIC
        </span>
        <span className={VERB_CHIP} title="Partner assigned but no slot booked — chase your own REF">
          Chase logistic
        </span>
        <span className={VERB_CHIP} title="Your customer still owes money — bulk Chase, one message a day">
          Owing
        </span>
      </div>
    </div>
  );
}
