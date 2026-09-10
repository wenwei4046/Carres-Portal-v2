/**
 * DatePicker — the one calendar (UI-KIT §6 · §2.4, card D0.5b).
 *
 * §11 pins it to `react-day-picker` because **Radix has no calendar primitive**,
 * and `Input type="date"` is deliberately not allowed: it opens the OS's own
 * picker, which is a different control on every machine and spells the date in
 * the machine's locale — the exact thing §2.4 forbids.
 *
 * **It speaks ISO in and ISO out, and prints `fmtDate()`.** The value is a
 * `YYYY-MM-DD` string, which is what every route, every column and every zod
 * schema in the portal already carries; the trigger renders it through
 * `fmtDate()`, so the canonical `Sun, 19 Jul 26` reaches one more surface
 * without anybody choosing a format. §2.4's Human-Review debt shrinks by one
 * control: this one cannot hand a date to the locale even if it wanted to.
 *
 * **The parsing is local, on purpose.** `new Date("2026-07-19")` is midnight
 * UTC, which is the 18th in the Americas and would show the wrong day; the
 * parts are read and rebuilt in local time, the same trick `fmt-date.ts` uses.
 *
 * The calendar lives in a kit `Popover` (§1.2's Contextual Surface — a calendar
 * that held permanent height would cost four orders on every screen), and the
 * trigger wears the field skin so it lines up with an `Input` beside it.
 */
import { useState } from "react";
import { DayPicker } from "react-day-picker";
import FieldFrame from "./FieldFrame";
import Icon from "./Icon";
import Popover from "./Popover";
import { controlClass } from "./field-recipe";
import { fmtDate } from "@/lib/fmt-date";

/** `YYYY-MM-DD` → a Date at LOCAL midnight. Anything else → undefined. */
function fromIso(iso: string | null | undefined): Date | undefined {
  if (!iso || iso.length < 10) return undefined;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return undefined;
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? undefined : date;
}

/** A Date → `YYYY-MM-DD`, read in LOCAL time so the day never shifts. */
function toIso(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

/** The calendar's own skin. Every value is a §2–§4 token; nothing is invented.
 *  EXPORTED (2026-09-06, Delivery Monitor month-calendar correction): the rail's
 *  inline month calendar renders the SAME `react-day-picker` primitive and must
 *  wear the same skin — a second spelling of these classes is the §6.1 defect. */
export const CALENDAR_CLASSNAMES = {
  root: "text-body text-kit-slate-12",
  months: "flex flex-col gap-4",
  month: "flex flex-col gap-2",
  month_caption: "flex items-center justify-center",
  caption_label: "text-strong text-kit-slate-12",
  nav: "flex items-center justify-between",
  button_previous: "rounded-control p-1 text-kit-slate-11 hover:bg-kit-slate-3",
  button_next: "rounded-control p-1 text-kit-slate-11 hover:bg-kit-slate-3",
  chevron: "fill-current",
  month_grid: "w-full border-collapse",
  weekdays: "text-label text-kit-slate-11",
  weekday: "p-1 font-normal",
  week: "",
  day: "p-0 text-center",
  day_button:
    "h-8 w-8 rounded-control text-body text-kit-slate-12 hover:bg-kit-slate-3 " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9",
  today: "font-medium text-kit-blue-11",
  selected: "[&>button]:bg-kit-blue-9 [&>button]:text-white [&>button]:hover:brightness-95",
  outside: "text-kit-slate-9",
  disabled: "opacity-40",
  hidden: "invisible",
};

export default function DatePicker({
  id,
  label,
  hint,
  error,
  required = false,
  disabled = false,
  minDate,
  value,
  onChange,
  placeholder = "Pick a date",
}: {
  id: string;
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  minDate?: string;
  value: string | null;
  onChange: (iso: string | null) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = fromIso(value);
  const firstAllowedDate = fromIso(minDate);

  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} required={required}>
      <Popover
        label={label ?? placeholder}
        open={open}
        onOpenChange={setOpen}
        align="start"
        trigger={
          <button
            type="button"
            id={id}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={error || hint ? `${id}-msg` : undefined}
            data-kit="date-picker"
            className={`${controlClass(Boolean(error), "single")} inline-flex items-center justify-between gap-2 text-left`}
          >
            <span className={value ? "" : "text-kit-slate-9"}>
              {value ? fmtDate(value) : placeholder}
            </span>
            <span className="text-kit-slate-9">
              <Icon name="date" size={16} />
            </span>
          </button>
        }
      >
        <DayPicker
          mode="single"
          selected={selected}
          defaultMonth={selected}
          disabled={firstAllowedDate ? { before: firstAllowedDate } : undefined}
          onSelect={(day) => {
            onChange(day ? toIso(day) : null);
            setOpen(false);
          }}
          showOutsideDays
          weekStartsOn={1}
          classNames={CALENDAR_CLASSNAMES}
        />
      </Popover>
    </FieldFrame>
  );
}
