/**
 * THE MONITOR TWO-LINE CELL — one primary fact in its text colour, one
 * supporting line beneath (Delivery MASTER §8.3; Payment MASTER §3, owner
 * ruling 2026-09-16). Shared by the Delivery Monitor work list and the Payment
 * Monitor so the two 72px listings print a cell the same way. Colour never
 * replaces the word; no icon ever enters a status fact.
 *
 * `reveal` — owner ruling 2026-09-16: a long value (a customer's name, a
 * reference) may be cut to fit the fixed row, but its COMPLETE value must be
 * reachable by click and keyboard, never by hover alone. The two lines become
 * one plain focusable control that opens the kit Popover with every word.
 */
import Popover from "@/components/kit/Popover";
import type { DeliveryWorkStatusTone } from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";
import { STATUS_TONE_TEXT } from "./DeliveryBrief";
import { MONITOR_COPY } from "../delivery-monitor";

const LINE2_TEXT: Record<"none" | "orange" | "red", string> = {
  none: "text-kit-slate-11",
  orange: "text-kit-amber-11",
  red: "text-kit-red-11",
};

export function TwoLines({
  line1,
  line2 = null,
  tone = "none",
  line2Tone = "none",
  line1Title,
  line2TestId,
  reveal = false,
}: {
  line1: string;
  line2?: string | null;
  tone?: DeliveryWorkStatusTone;
  line2Tone?: "none" | "orange" | "red";
  line1Title?: string;
  line2TestId?: string;
  reveal?: boolean;
}) {
  const lines = (
    <span className="block min-w-0">
      <span className={`block truncate ${STATUS_TONE_TEXT[tone]}`} title={line1Title ?? line1}>
        {line1}
      </span>
      {line2 ? (
        <span
          className={`block truncate text-label ${LINE2_TEXT[line2Tone]}`}
          title={line2}
          data-testid={line2TestId}
        >
          {line2}
        </span>
      ) : null}
    </span>
  );
  if (!reveal) return lines;
  const full = joinLines(line1, line2);
  return (
    <Popover
      label={full}
      trigger={
        <button
          type="button"
          className="block w-full min-w-0 text-left font-[inherit] focus-visible:outline focus-visible:outline-2 focus-visible:outline-kit-blue-9"
          aria-label={full}
          onClick={(event) => event.stopPropagation()}
        >
          {lines}
        </button>
      }
    >
      <span className="block max-w-xs break-words text-body" data-testid="monitor-full-value">
        <span className={`block ${STATUS_TONE_TEXT[tone]}`}>{line1}</span>
        {line2 ? <span className="block text-kit-slate-11">{line2}</span> : null}
      </span>
    </Popover>
  );
}

/** The sheet's own spelling of a two-line cell — never an em dash. What Search
 *  reads and what Excel prints, so the sheet and the screen agree. */
export function joinLines(a: string, b: string | null | undefined): string {
  return b ? `${a} · ${b}` : a;
}

/**
 * ⭐ `Confirmed Delivery` (COPY-STANDARD, Delivery Monitor words): `Confirmed`
 * over the day and window once BOTH are agreed; `Not confirmed` over
 * `{day} · No time agreed` when only the day is; `Not confirmed` and NOTHING
 * beneath while no day is agreed. The one spelling for both Monitors.
 */
export function confirmedDeliveryLines(c: { dateIso: string | null; time: string | null }): {
  line1: string;
  tone: DeliveryWorkStatusTone;
  line2: string | null;
  line2Tone: "none" | "orange" | "red";
} {
  if (c.dateIso && c.time) {
    return { line1: MONITOR_COPY.confirmed, tone: "green", line2: `${fmtDate(c.dateIso)} · ${c.time}`, line2Tone: "none" };
  }
  if (c.dateIso) {
    return {
      line1: MONITOR_COPY.notConfirmed,
      tone: "orange",
      line2: `${fmtDate(c.dateIso)} · ${MONITOR_COPY.noTimeAgreed}`,
      line2Tone: "none",
    };
  }
  return { line1: MONITOR_COPY.notConfirmed, tone: "orange", line2: null, line2Tone: "none" };
}
