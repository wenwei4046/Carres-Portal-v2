/**
 * DatePicker — UI-KIT §6 Box Dictionary, card D0.5b.
 *
 * **Radix has no calendar primitive**, which §11 already records, so this one
 * is `react-day-picker` inside the kit's own `Popover`. Its stylesheet is NOT
 * imported: appearance is Carres's (§11 — "Radix = behaviour, Carres =
 * appearance"), so every part is dressed through the library's `classNames`
 * map with kit tokens. Importing their CSS would import a look we would then
 * have to unwind.
 *
 * **The trigger prints `fmtDate()` and nothing else.** §2.4 makes
 * `19 Jul 26, Sun` the one human date, from one helper — a picker that showed
 * `2026-07-19` would be the 21st spelling of a date in this codebase.
 *
 * **The value is an ISO `YYYY-MM-DD` string, not a `Date`.** Every date the
 * portal stores is that string; handing a component a `Date` means a timezone
 * conversion at both ends, and `fmtDate` already carries the scar of that bug
 * (a bare date read in UTC-minus shifts to the day before).
 */
import { useState } from "react";
import { DayPicker } from "react-day-picker";
import { fmtDate } from "@/lib/fmt-date";
import FieldFrame from "./FieldFrame";
import Icon from "./Icon";
import { controlClass } from "./field-recipe";
import { POPOVER_SURFACE } from "./overlay-recipe";
import * as RadixPopover from "@radix-ui/react-popover";

/** Local-time ISO day — never `toISOString()`, which shifts across midnight. */
function toIsoDay(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

const CLASS_NAMES = {
  root: "text-body text-kit-slate-12",
  months: "flex flex-col gap-2",
  month: "flex flex-col gap-2",
  month_caption: "flex items-center justify-center py-1",
  caption_label: "text-strong text-kit-slate-12",
  nav: "flex items-center justify-between",
  button_previous:
    "grid h-6 w-6 place-items-center rounded-control text-kit-slate-11 hover:bg-kit-blue-3 disabled:opacity-40",
  button_next:
    "grid h-6 w-6 place-items-center rounded-control text-kit-slate-11 hover:bg-kit-blue-3 disabled:opacity-40",
  chevron: "h-4 w-4 fill-current",
  month_grid: "w-full border-collapse",
  weekdays: "flex",
  weekday: "w-8 text-label text-kit-slate-11",
  week: "flex w-full",
  day: "p-0",
  day_button:
    "grid h-8 w-8 place-items-center rounded-control text-body hover:bg-kit-blue-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9",
  selected: "[&_button]:bg-kit-blue-9 [&_button]:text-white",
  today: "[&_button]:text-kit-blue-11 [&_button]:font-medium",
  outside: "[&_button]:text-kit-slate-9",
  disabled: "[&_button]:opacity-40 [&_button]:cursor-not-allowed [&_button]:hover:bg-transparent",
} as const;

export default function DatePicker({
  id,
  label,
  hint,
  error,
  required = false,
  value,
  onChange,
  placeholder = "Pick a date",
  disabled = false,
}: {
  id: string;
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** ISO `YYYY-MM-DD`, or null when no date has been picked. */
  value: string | null;
  onChange: (iso: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(`${value}T00:00:00`) : undefined;

  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} required={required}>
      <RadixPopover.Root open={open} onOpenChange={setOpen}>
        <RadixPopover.Trigger
          id={id}
          disabled={disabled}
          data-kit="date-picker"
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${id}-msg` : undefined}
          className={`${controlClass(Boolean(error), "single")} flex items-center justify-between gap-2 text-left`}
        >
          <span className={value ? "" : "text-kit-slate-9"}>{value ? fmtDate(value) : placeholder}</span>
          <span className="text-kit-slate-9">
            <Icon name="date" size={14} />
          </span>
        </RadixPopover.Trigger>
        <RadixPopover.Portal>
          <RadixPopover.Content align="start" sideOffset={4} aria-label={label ?? "Pick a date"} className={POPOVER_SURFACE}>
            <DayPicker
              mode="single"
              selected={selected}
              defaultMonth={selected}
              onSelect={(d) => {
                onChange(d ? toIsoDay(d) : null);
                setOpen(false);
              }}
              showOutsideDays
              weekStartsOn={1}
              classNames={CLASS_NAMES}
            />
          </RadixPopover.Content>
        </RadixPopover.Portal>
      </RadixPopover.Root>
    </FieldFrame>
  );
}
