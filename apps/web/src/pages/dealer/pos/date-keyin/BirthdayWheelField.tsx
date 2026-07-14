import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import {
  MONTHS,
  ageOn,
  daysInMonth,
  fmtBirthday,
  isoFromParts,
  partsFromIso,
  type DateParts,
} from "./date-keyin";
import "./date-keyin.css";

/**
 * BirthdayWheelField — desktop take on the iOS drum picker (Loo 2026-07-14).
 *
 * Replaces the native `<input type="date">` whose calendar popup made staff
 * page back 30-60 years month by month. Three scroll-snap columns
 * (Day | Month | Year): mouse wheel / trackpad scrolls, clicking a row
 * selects it, arrow keys nudge. Only Save commits (Esc / outside-click
 * cancels), mirroring the mobile drum's 保存 behaviour. Value contract stays
 * ISO `yyyy-mm-dd` in the draft.
 */
interface Props {
  value: string; // ISO yyyy-mm-dd or ""
  onChange: (iso: string) => void;
  todayIso: string;
  testId?: string;
}

type ColKind = "d" | "m" | "y";

const ROW = 36; // px — must match .dki-wheel__item height
const YEAR_MIN = 1930;
/** Empty-value landing spot: scrolling from 1990 beats scrolling from today. */
const DEFAULT_SEED: DateParts = { y: 1990, m: 5, d: 15 };

function scrollColTo(el: HTMLElement | null, idx: number, smooth: boolean) {
  if (!el) return;
  const top = idx * ROW;
  const reduce =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  try {
    el.scrollTo({ top, behavior: smooth && !reduce ? "smooth" : "auto" });
  } catch {
    el.scrollTop = top; // jsdom has no Element.scrollTo
  }
}

export default function BirthdayWheelField({ value, onChange, todayIso, testId }: Props) {
  const [open, setOpen] = useState(false);
  const [pend, setPend] = useState<DateParts>(DEFAULT_SEED);

  const anchorRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const colDRef = useRef<HTMLDivElement | null>(null);
  const colMRef = useRef<HTMLDivElement | null>(null);
  const colYRef = useRef<HTMLDivElement | null>(null);
  const timersRef = useRef<Partial<Record<ColKind, ReturnType<typeof setTimeout>>>>({});

  const yearMax = partsFromIso(todayIso)?.y ?? new Date().getFullYear();
  const yearCount = yearMax - YEAR_MIN + 1;

  const colRef = (kind: ColKind) => (kind === "d" ? colDRef : kind === "m" ? colMRef : colYRef);
  const colCount = (kind: ColKind) =>
    kind === "d" ? daysInMonth(pend.y, pend.m) : kind === "m" ? 12 : yearCount;
  const selIdx = (kind: ColKind) =>
    kind === "d" ? pend.d - 1 : kind === "m" ? pend.m : pend.y - YEAR_MIN;

  const dayLabels = useMemo(() => {
    const n = daysInMonth(pend.y, pend.m);
    return Array.from({ length: n }, (_, i) => String(i + 1));
  }, [pend.y, pend.m]);
  const yearLabels = useMemo(
    () => Array.from({ length: yearCount }, (_, i) => String(YEAR_MIN + i)),
    [yearCount],
  );

  function openPicker() {
    setPend(partsFromIso(value) ?? DEFAULT_SEED);
    setOpen(true);
  }
  function close() {
    for (const t of Object.values(timersRef.current)) clearTimeout(t);
    timersRef.current = {};
    setOpen(false);
  }

  // Position all three drums on the pending value the moment the popover mounts.
  useLayoutEffect(() => {
    if (!open) return;
    scrollColTo(colDRef.current, pend.d - 1, false);
    scrollColTo(colMRef.current, pend.m, false);
    scrollColTo(colYRef.current, pend.y - YEAR_MIN, false);
    colYRef.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Month/year changes can shrink the day list (Feb) — keep the (clamped)
  // day row centered after the list re-renders.
  useEffect(() => {
    if (!open) return;
    scrollColTo(colDRef.current, pend.d - 1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pend.y, pend.m]);

  // Esc cancels, outside pointerdown cancels — neither commits.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(
    () => () => {
      for (const t of Object.values(timersRef.current)) clearTimeout(t);
    },
    [],
  );

  function applyIdx(prev: DateParts, kind: ColKind, idx: number): DateParts {
    if (kind === "d") {
      const n = daysInMonth(prev.y, prev.m);
      return { ...prev, d: Math.max(1, Math.min(n, idx + 1)) };
    }
    if (kind === "m") {
      const m = Math.max(0, Math.min(11, idx));
      return { ...prev, m, d: Math.min(prev.d, daysInMonth(prev.y, m)) };
    }
    const y = Math.max(YEAR_MIN, Math.min(yearMax, YEAR_MIN + idx));
    return { ...prev, y, d: Math.min(prev.d, daysInMonth(y, prev.m)) };
  }

  /** Wheel/trackpad path — commit whichever row settled on the center line. */
  function handleScroll(kind: ColKind) {
    const t = timersRef.current;
    if (t[kind]) clearTimeout(t[kind]);
    t[kind] = setTimeout(() => {
      const el = colRef(kind).current;
      if (!el) return;
      setPend((prev) => applyIdx(prev, kind, Math.round(el.scrollTop / ROW)));
    }, 140);
  }

  /** Click / keyboard path — set the value directly, then glide the drum. */
  function pick(kind: ColKind, idx: number) {
    setPend((prev) => applyIdx(prev, kind, idx));
    scrollColTo(colRef(kind).current, idx, true);
  }

  function handleKey(kind: ColKind, e: React.KeyboardEvent) {
    let next: number | null = null;
    const cur = selIdx(kind);
    const max = colCount(kind) - 1;
    if (e.key === "ArrowUp") next = cur - 1;
    else if (e.key === "ArrowDown") next = cur + 1;
    else if (e.key === "PageUp") next = cur - 5;
    else if (e.key === "PageDown") next = cur + 5;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = max;
    else if (e.key === "Enter") {
      e.preventDefault();
      save();
      return;
    } else return;
    e.preventDefault();
    pick(kind, Math.max(0, Math.min(max, next)));
  }

  function save() {
    onChange(isoFromParts(pend));
    close();
    triggerRef.current?.focus();
  }
  function clear() {
    onChange("");
    close();
    triggerRef.current?.focus();
  }

  const committed = partsFromIso(value);
  const committedAge = committed ? ageOn(todayIso, committed) : null;
  const pendAge = ageOn(todayIso, pend);

  function renderCol(kind: ColKind, labels: readonly string[]) {
    const sel = selIdx(kind);
    return (
      <div
        ref={colRef(kind)}
        className="dki-wheel__col"
        tabIndex={0}
        role="listbox"
        aria-label={kind === "d" ? "Day" : kind === "m" ? "Month" : "Year"}
        data-testid={`dki-wheel-${kind}`}
        onScroll={() => handleScroll(kind)}
        onKeyDown={(e) => handleKey(kind, e)}
      >
        <div className="dki-wheel__spacer" />
        {labels.map((label, i) => (
          <div
            key={label}
            role="option"
            aria-selected={i === sel}
            className={`dki-wheel__item${i === sel ? " is-center" : ""}`}
            onClick={() => pick(kind, i)}
          >
            {label}
          </div>
        ))}
        <div className="dki-wheel__spacer" />
      </div>
    );
  }

  return (
    <div className="dki-anchor" ref={anchorRef}>
      <button
        ref={triggerRef}
        type="button"
        className="dki-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid={testId}
        onClick={() => (open ? close() : openPicker())}
      >
        <span className={`dki-trigger__val${committed ? "" : " is-empty"}`}>
          {committed ? fmtBirthday(value) : "Select birthday"}
        </span>
        {committed && committedAge != null && committedAge >= 0 && (
          <span className="dki-trigger__meta">{committedAge} y/o</span>
        )}
        <CalendarDays size={16} className="dki-trigger__icon" aria-hidden="true" />
      </button>

      {open && (
        <div className="dki-pop" role="dialog" aria-label="Pick birthday">
          <div className="dki-pop__head">
            <span className="dki-pop__read">
              {pend.d} {MONTHS[pend.m]} {pend.y}
            </span>
            {pendAge >= 0 && <span className="dki-pop__age">{pendAge} y/o</span>}
          </div>
          <div className="dki-wheel__labels" aria-hidden="true">
            <span>Day</span>
            <span>Month</span>
            <span>Year</span>
          </div>
          <div className="dki-wheel">
            <div className="dki-wheel__band" />
            {renderCol("d", dayLabels)}
            {renderCol("m", MONTHS)}
            {renderCol("y", yearLabels)}
          </div>
          <div className="dki-pop__foot">
            <button type="button" className="dki-btn-ghost" onClick={clear}>
              Clear
            </button>
            <button type="button" className="dki-btn-save" onClick={save}>
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
