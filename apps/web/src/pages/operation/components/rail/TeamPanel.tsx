import { useOperationPoDuty } from "@/lib/queries";
import { monthKeyMYT, nextPoDayMYT } from "@carres/shared";
import { fmtDateShort } from "@/lib/fmt-date";
import { avatarColor, personInitials, personLabel } from "@/lib/staff-avatar";

/**
 * TeamPanel — the DUTY & ROLES board (Jess B+C, 2026-07-19). Lives in the
 * right rail where Notes used to sit (Notes shipped 6/12, held exactly ONE
 * note ever — dead feature, slot repurposed with Jess's sign-off).
 *
 * The roster is a NOTICE BOARD for the whole team: whose PO-duty month it is
 * now, who's next, and — written out, not implied — what the duty covers vs
 * what every PIC keeps (the C chase-split). Read-only; management changes the
 * holder via the API (and the pool via the TEAM ⚙).
 */
const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
function fmtMonth(month: string): string {
  const m = Number(month.slice(5, 7));
  return MONTH_SHORT[m - 1] ?? month;
}

export default function TeamPanel() {
  const dutyQ = useOperationPoDuty();
  const roster = dutyQ.data?.roster ?? [];
  const currentMonth = dutyQ.data?.month ?? monthKeyMYT();
  const nextPoIso = nextPoDayMYT();
  const nextPoLabel = `${new Date(`${nextPoIso}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" })} ${fmtDateShort(nextPoIso)}`;

  return (
    <div className="flex flex-col gap-3 p-3" data-testid="team-panel">
      <div>
        <div className="t-micro text-base-500 mb-1.5">PO DUTY</div>
        {roster.length === 0 ? (
          <div className="text-[12px] text-base-400 py-2">
            Duty roster not live yet — it appears once the rotation table is
            deployed.
          </div>
        ) : (
          <div className="rounded-lg border border-base-200 overflow-hidden bg-white">
            {roster.map((r, i) => {
              const isNow = r.month === currentMonth;
              const c = avatarColor(r.userId);
              return (
                <div
                  key={r.month}
                  className={`flex items-center gap-2 px-3 h-9 text-[13px] ${i > 0 ? "border-t border-base-100" : ""}`}
                >
                  <span
                    className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[11px] font-bold leading-none shrink-0"
                    style={{ background: c.bg, color: c.fg }}
                  >
                    {personInitials(r.name, r.email)}
                  </span>
                  <span className={isNow ? "font-semibold text-base-900" : "text-base-700"}>
                    {fmtMonth(r.month)} — {personLabel(r.name, r.email)}
                  </span>
                  {isNow && (
                    <span className="ml-auto text-[11px] font-semibold rounded-full px-1.5 py-0.5 bg-success-soft text-success">
                      now
                    </span>
                  )}
                </div>
              );
            })}
            <div className="px-3 py-1.5 text-[11px] text-base-400 border-t border-base-100">
              PO day = Mon &amp; Thu · next: {nextPoLabel}
            </div>
          </div>
        )}
      </div>

      {/* The chase split, written out — nobody guesses (Jess 2026-07-19:
          "duty only po? others? also need to write out"). */}
      <div>
        <div className="t-micro text-base-500 mb-1.5">WHO CHASES WHAT</div>
        <div className="rounded-lg border border-base-200 bg-white px-3 py-2 text-[12px] leading-relaxed text-base-700">
          <div className="mb-1.5">
            <span className="font-semibold">Duty holder</span> — goods line:{" "}
            <span className="font-semibold">Order PO · Chase supplier</span>. The ONE
            voice to every supplier; ask her for stock dates, don&rsquo;t chase
            suppliers yourself.
          </div>
          <div>
            <span className="font-semibold">Every PIC</span> — your own customers:{" "}
            <span className="font-semibold">Chase logistic · Owing</span>. Use bulk
            Chase — one counterparty, one message a day.
          </div>
        </div>
      </div>
    </div>
  );
}
