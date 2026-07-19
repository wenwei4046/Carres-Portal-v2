import { useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  useOperationPoDuty,
  useOperationStaff,
  useUpdatePoDuty,
} from "@/lib/queries";
import {
  monthKeyMYT,
  nextPoDayMYT,
  isPoDutyEditor,
  isOpsManager,
  isOpsGenericAccount,
} from "@carres/shared";
import { useAuth } from "@/lib/auth";
import { fmtDateShort } from "@/lib/fmt-date";
import { avatarColor, personInitials, personLabel } from "@/lib/staff-avatar";

/**
 * TeamPanel — PO DUTY board, design B3-final (Jess 2026-07-19).
 *
 * Hero = WHO + on PO duty + UNTIL <handover date> (PagerDuty pattern — the
 * decision-ready fact, never the month name) with a green now-dot on the
 * avatar and the duty verbs as chips. Succession rows live INSIDE the duty
 * card (roster list law: avatar+name glued left, "from 1 Aug 26" metadata
 * right — mirrors the hero's "until"; no dashes). Below: a two-week mini
 * calendar with Mon/Thu tinted + the next PO day green; the PIC scope as one
 * chip row. ZERO sentences — explanations live in tooltips. Replaced the
 * dead Notes slot (1 note ever, from build day; Jess sign-off).
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

/** Inline holder picker (Jess option A, 2026-07-19): the month's name turns
 *  into a select of plain-staff candidates; picking saves immediately (the
 *  server stamps assigned_by = the manager). Managers only ever see this. */
function DutySelect({
  month,
  currentUserId,
  candidates,
  onDone,
}: {
  month: string;
  currentUserId: string;
  candidates: { user_id: string; name: string | null; email: string }[];
  onDone: () => void;
}) {
  const mut = useUpdatePoDuty({
    onSuccess: (r) => {
      toast.success(`PO duty updated — ${fmtMonth(r.month)}`);
      onDone();
    },
    onError: (e) => {
      toast.error(`PO duty update failed — ${e.message}`);
      onDone();
    },
  });
  return (
    <select
      autoFocus
      defaultValue={currentUserId}
      disabled={mut.isPending}
      onChange={(e) => {
        if (e.target.value !== currentUserId)
          mut.mutate({ month, userId: e.target.value });
        else onDone();
      }}
      onBlur={() => {
        if (!mut.isPending) onDone();
      }}
      className="border border-base-200 rounded-md text-[12px] px-1.5 py-1 bg-white text-base-900"
      aria-label={`PO duty holder for ${fmtMonth(month)}`}
    >
      {candidates.map((s) => (
        <option key={s.user_id} value={s.user_id}>
          {personLabel(s.name, s.email)}
        </option>
      ))}
    </select>
  );
}

export default function TeamPanel() {
  const dutyQ = useOperationPoDuty();
  const holder = dutyQ.data?.holder ?? null;
  const currentMonth = dutyQ.data?.month ?? monthKeyMYT();
  const nextUp = (dutyQ.data?.roster ?? []).filter((r) => r.month > currentMonth);

  // Roster edit = JESS-ONLY (+principal) — STRICTER than isOpsManager: the
  // shared operation@ login must never rewrite the rotation (Jess 2026-07-19
  // "can edit roster only me"). Hover ✎ on the hero / click a NEXT UP entry
  // → candidate select; everyone else never sees it, the API 403s anyway.
  const authRole = useAuth((s) => s.role);
  const authEmail = useAuth((s) => s.user?.email ?? null);
  const isEditor = isPoDutyEditor(authRole, authEmail);
  const staffQ = useOperationStaff({ enabled: isEditor });
  const candidates = useMemo(
    () =>
      (staffQ.data?.staff ?? []).filter(
        (s) => !isOpsManager("operation", s.email) && !isOpsGenericAccount(s.email),
      ),
    [staffQ.data],
  );
  const [editingMonth, setEditingMonth] = useState<string | null>(null);

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
      <div className="rounded-lg border border-base-200 overflow-hidden">
      <div className="group bg-base-50 p-3">
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
          {editingMonth === currentMonth ? (
            <DutySelect
              month={currentMonth}
              currentUserId={holder.userId}
              candidates={candidates}
              onDone={() => setEditingMonth(null)}
            />
          ) : (
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-base-900 truncate">
                {personLabel(holder.name, holder.email)}
              </span>
              <span className="block text-[11px] text-base-500">
                on PO duty · until {untilLabel}
              </span>
            </span>
          )}
          {isEditor && editingMonth !== currentMonth && (
            <button
              type="button"
              onClick={() => setEditingMonth(currentMonth)}
              title="Change this month's PO duty holder"
              aria-label="Change this month's PO duty holder"
              className="ml-auto p-1 rounded text-base-400 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-base-800 hover:bg-base-100"
            >
              <Pencil size={14} strokeWidth={2} />
            </button>
          )}
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
      {/* Succession rows INSIDE the duty card (Jess 2026-07-19: "NEXT UP"
          answered nothing). Roster list law: avatar + name stay GLUED (the
          person is the subject, left); the date is metadata, right-aligned;
          "from 1 Aug 26" mirrors the hero's "until 31 Jul 26". No dashes. */}
      {nextUp.map((r) => {
        const rc = avatarColor(r.userId);
        return (
          <div
            key={r.month}
            className="flex items-center gap-2 px-3 h-9 bg-white border-t border-base-100 text-[12.5px] text-base-800"
          >
            {editingMonth === r.month ? (
              <DutySelect
                month={r.month}
                currentUserId={r.userId}
                candidates={candidates}
                onDone={() => setEditingMonth(null)}
              />
            ) : (
              <>
                <span
                  className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[11px] font-bold leading-none shrink-0"
                  style={{ background: rc.bg, color: rc.fg }}
                >
                  {personInitials(r.name, r.email)}
                </span>
                {isEditor ? (
                  <button
                    type="button"
                    onClick={() => setEditingMonth(r.month)}
                    title={`Change ${fmtMonth(r.month)}'s PO duty holder`}
                    className="truncate rounded hover:bg-base-50 px-0.5 text-left"
                  >
                    {personLabel(r.name, r.email)}
                  </button>
                ) : (
                  <span className="truncate">{personLabel(r.name, r.email)}</span>
                )}
              </>
            )}
            <span className="ml-auto text-[11px] text-base-500 tabular-nums shrink-0">
              from {fmtDateShort(`${r.month}-01`)}
            </span>
          </div>
        );
      })}
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

      <div className="t-micro text-base-500 mt-3 mb-1.5">EVERYONE — YOUR OWN ORDERS</div>
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
