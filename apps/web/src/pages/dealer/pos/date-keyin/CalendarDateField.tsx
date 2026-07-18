import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import {
  DOW_SHORT,
  MONTHS,
  daysInMonth,
  dowOf,
  fmtTriggerDate,
  isoFromParts,
  partsFromIso,
} from "./date-keyin";
import "./date-keyin.css";

/**
 * CalendarDateField — POS-skinned calendar popover (Loo 2026-07-14,
 * replaces the native `<input type="date">` popup; the quick-date chips
 * from the first cut were dropped the same day — Loo: pick on the
 * calendar only).
 *
 * Days outside [minIso, maxIso] are greyed and unclickable, so the
 * lead-time floor is visible instead of silently enforced by a `min`
 * attribute. Picking a day commits immediately and closes — calendars
 * don't need a Save step.
 */
interface Props {
  value: string; // ISO yyyy-mm-dd or ""
  onChange: (iso: string) => void;
  minIso: string;
  maxIso?: string;
  todayIso: string;
  placeholder?: string;
  disabled?: boolean;
  footNote?: React.ReactNode;
  ariaLabel: string;
  testId?: string;
}

export default function CalendarDateField({
  value,
  onChange,
  minIso,
  maxIso,
  todayIso,
  placeholder = "dd/mm/yyyy",
  disabled,
  footNote,
  ariaLabel,
  testId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<{ y: number; m: number }>({ y: 0, m: 0 });
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  function openCal() {
    const base = partsFromIso(value) ?? partsFromIso(minIso) ?? partsFromIso(todayIso);
    if (!base) return;
    setView({ y: base.y, m: base.m });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(iso: string) {
    onChange(iso);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function shiftMonth(delta: number) {
    setView((v) => {
      const total = v.y * 12 + v.m + delta;
      return { y: Math.floor(total / 12), m: ((total % 12) + 12) % 12 };
    });
  }

  const inRange = (iso: string) => iso >= minIso && (!maxIso || iso <= maxIso);
  // Month nav is capped where no selectable day can exist beyond it.
  const prevOk =
    open && isoFromParts({ y: view.m === 0 ? view.y - 1 : view.y, m: (view.m + 11) % 12, d: daysInMonth(view.m === 0 ? view.y - 1 : view.y, (view.m + 11) % 12) }) >= minIso;
  const nextOk =
    open && (!maxIso || isoFromParts({ y: view.m === 11 ? view.y + 1 : view.y, m: (view.m + 1) % 12, d: 1 }) <= maxIso);

  const days = open ? daysInMonth(view.y, view.m) : 0;
  const firstDow = open ? dowOf({ y: view.y, m: view.m, d: 1 }) : 0;

  return (
    <div className="dki-anchor" ref={anchorRef}>
      <button
        ref={triggerRef}
        type="button"
        className="dki-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        data-testid={testId}
        onClick={() => (open ? setOpen(false) : openCal())}
      >
        <span className={`dki-trigger__val${value ? "" : " is-empty"}`}>
          {value ? fmtTriggerDate(value) : placeholder}
        </span>
        <CalendarDays size={16} className="dki-trigger__icon" aria-hidden="true" />
      </button>

      {open && (
        <div className="dki-pop" role="dialog" aria-label={ariaLabel}>
          <div className="dki-cal__nav">
            <span className="dki-cal__month">
              {MONTHS[view.m]} {view.y}
            </span>
            <span className="dki-cal__arrows">
              <button
                type="button"
                className="dki-cal__arrow"
                aria-label="Previous month"
                disabled={!prevOk}
                onClick={() => shiftMonth(-1)}
              >
                ‹
              </button>
              <button
                type="button"
                className="dki-cal__arrow"
                aria-label="Next month"
                disabled={!nextOk}
                onClick={() => shiftMonth(1)}
              >
                ›
              </button>
            </span>
          </div>
          <div className="dki-cal__grid">
            {DOW_SHORT.map((d, i) => (
              <span key={i} className="dki-cal__dow">
                {d[0]}
              </span>
            ))}
            {Array.from({ length: firstDow }, (_, i) => (
              <span key={`b${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const iso = isoFromParts({ y: view.y, m: view.m, d: i + 1 });
              const cls = [
                "dki-cal__day",
                iso === todayIso ? "is-today" : "",
                iso === value ? "is-sel" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <button
                  key={iso}
                  type="button"
                  className={cls}
                  disabled={!inRange(iso)}
                  onClick={() => pick(iso)}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          {footNote && <div className="dki-cal__foot">{footNote}</div>}
        </div>
      )}
    </div>
  );
}
