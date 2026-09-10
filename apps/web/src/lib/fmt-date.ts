const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const APP_TIME_ZONE = "Asia/Kuala_Lumpur";

function appDateParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    dow: value("weekday"),
    day: value("day"),
    mon: value("month"),
    yr: value("year"),
    hh: value("hour"),
    mm: value("minute"),
  };
}

/**
 * ⭐ THE YEAR RULE — owner ruling 2026-08-15 (Chai), portal-wide.
 *
 * **The year appears only when it is not the current year.** `Wed, 12 Aug` for
 * a date in the year the operator is living in; `Fri, 15 Jan 27` for one that
 * is not. Nine dates in ten on an operational screen are this year, and a
 * repeated `26` down a column is ink that answers nothing — the moment it
 * changes is the moment it carries the whole meaning.
 *
 * **It is ONE predicate, used by every spelling in this file.** That is what
 * stops the rule fragmenting: `fmtDate` and `fmtDateShort` differ in whether
 * they carry the weekday and in nothing else, so two surfaces can never print
 * two different opinions about the same day.
 *
 * The comparison runs in Carres' business timezone, never the browser's — a
 * Malaysian operator at 00:30 on 1 January and a UTC CI runner must agree on
 * which year is current.
 */
export function appYearNow(): number {
  const now = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
  }).format(new Date());
  return Number(now);
}

/** The parsed parts of an ISO string, plus its full year, or `null` if unusable. */
function parts(iso: string | null | undefined) {
  if (!iso) return null;
  // Bare business dates have no timezone and must keep their written day.
  // Timestamps are always displayed in Carres' MYT business timezone, never
  // the browser/runner timezone (GitHub CI is UTC; operators are in Malaysia).
  const bare = iso.length === 10;
  const d = new Date(bare ? `${iso}T00:00:00Z` : iso);
  if (isNaN(d.getTime())) return null;
  if (bare) {
    return {
      dow: DAYS[d.getUTCDay()],
      day: String(d.getUTCDate()),
      mon: MONTHS[d.getUTCMonth()],
      yr: String(d.getUTCFullYear()).slice(2),
      full: d.getUTCFullYear(),
      hh: "00",
      mm: "00",
    };
  }
  const p = appDateParts(d);
  return { ...p, full: Number(`20${p.yr}`) };
}

/** `always` is for a PRINTED DOCUMENT — see `fmtDate`'s note. */
type YearMode = "auto" | "always";

/** The one place the year rule is decided. */
function carriesYear(fullYear: number, mode: YearMode | undefined): boolean {
  return mode === "always" || fullYear !== appYearNow();
}

/**
 * Format an ISO date string as **"Tue, 20 May"** — weekday FIRST
 * (Loo, 2026-07-30; supersedes the date-first spelling of 2026-06-12), and the
 * year only when it is not the current one (owner ruling 2026-08-15 — see
 * THE YEAR RULE above): **"Fri, 15 Jan 27"**.
 *
 * The weekday moved to the front because it makes a date COLUMN line up: the
 * prefix is always three characters, where a leading day number is one or two
 * and pushes the weekday around. **The weekday is never dropped** — the
 * no-relative-date-words ruling means an operator reads the day off the date
 * itself, so the date must say which day it is.
 *
 * Every date in the portal comes from here, so this is the only place the
 * spelling exists.
 *
 * Returns "—" for null/undefined/invalid input.
 *
 * `time: true` includes HH:MM → "Tue, 20 May 14:30".
 *
 * **`year: "always"` is for a PRINTED DOCUMENT and nothing else.** A screen is
 * read today, so "this year" is context the reader already has. A service note
 * or a receipt is printed, filed and re-read in a later year by someone who has
 * no such context, and a document that says `Request Date: Wed, 12 Aug` has
 * lost a fact it is the document's job to carry. It is an option ON the one
 * formatter, never a second formatter.
 */
export function fmtDate(
  iso: string | null | undefined,
  opts?: { time?: boolean; year?: YearMode; timeOnly?: boolean },
): string {
  const p = parts(iso);
  if (!p) return "—";
  /* ⭐ THE CLOCK ALONE (2026-08-25) — for a list already grouped under a date
     heading, where repeating the day on every row makes the reader re-parse the
     same string to find the one boundary that matters. It is an OPTION on the
     one date function rather than a second helper: COPY-STANDARD is explicit
     that a second date spelling is a defect, and a private `hh:mm` beside a
     caller is exactly that. Absent, every existing caller is byte-identical. */
  if (opts?.timeOnly) return `${p.hh}:${p.mm}`;
  const head = carriesYear(p.full, opts?.year)
    ? `${p.dow}, ${p.day} ${p.mon} ${p.yr}`
    : `${p.dow}, ${p.day} ${p.mon}`;
  return opts?.time ? `${head} ${p.hh}:${p.mm}` : head;
}

/**
 * Format a `YYYY-MM` period as "Jul 2026". For month switchers and any screen
 * that names a month rather than a day.
 *
 * Lives here rather than beside each caller so the portal has ONE month
 * spelling, and reads the parts directly instead of going through
 * `toLocaleDateString` (COPY-STANDARD: never hand a date to the locale).
 */
export function fmtMonth(period: string | null | undefined): string {
  if (!period) return "—";
  const [y, m] = period.slice(0, 7).split("-").map(Number);
  const mon = MONTHS[(m ?? 0) - 1];
  if (!mon || !Number.isFinite(y)) return "—";
  return `${mon} ${y}`;
}

/*
 * `fmtDayChip` is DELETED (owner ruling 2026-08-15). It existed for ONE
 * reason — a ~100px day chip could not afford the year — and THE YEAR RULE
 * now drops the year from every current-year date, so the chip's spelling and
 * the portal's spelling became the same string. What remained was a second
 * function that would have disagreed with `fmtDate` on exactly one input: a
 * date in another year, where the chip would have hidden the fact that makes
 * it matter. Chips call `fmtDate`.
 *
 * The same ruling deleted three page-local no-year formatters built by string
 * surgery on these two — `railDayLabel` (To Order · Purchase Orders) and
 * `dayMon` (Order Detail drawer). They were compensating for a year the
 * formatter should never have printed; the compensation is now the rule.
 */

/**
 * Format an ISO date as **"12 Jun"** — day + month, no weekday, and the year
 * only when it is not the current one ("15 Jan 27"), through the SAME
 * predicate `fmtDate` uses.
 *
 * This is not a second date rule; it is the ruled date **less its weekday**,
 * for the compact spots that read as a sentence rather than as a column —
 * `received 12 Jun`, `due 12 Jun`, the Calendar panel's selected-day header.
 * A date COLUMN carries the weekday, because that is what an operator sorts
 * and plans on; a mid-sentence date does not, because the sentence already
 * says what the day is for.
 */
export function fmtDateShort(iso: string | null | undefined): string {
  const p = parts(iso);
  if (!p) return "—";
  return carriesYear(p.full, undefined)
    ? `${p.day} ${p.mon} ${p.yr}`
    : `${p.day} ${p.mon}`;
}

/**
 * Today's date as `YYYY-MM-DD` in Carres' business timezone — for a date input
 * that should start on "today".
 *
 * `new Date().toISOString().slice(0, 10)` is the wrong spelling: it is UTC, so
 * between midnight and 08:00 in Malaysia it names yesterday. Same timezone as
 * every other date in this file, so a form and the screen that lists it agree.
 */
export function appTodayIso(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}
