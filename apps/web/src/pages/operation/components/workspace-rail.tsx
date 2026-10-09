/**
 * The Purchasing Workspace's 200px navigation rail — extracted 2026-08-03.
 *
 * UI-KIT §6.1: the second occurrence is a full stop. `OperationPurchaseOrders`
 * drew this rail first; `OperationReceiving` copied it when Receiving moved
 * onto the same Workspace template, and the copies had already begun to
 * differ — one grew a danger tone and a tooltip the other never got.
 *
 * A page-level recipe, not a kit component: the kit has no rail, and a
 * navigation rail is a WORKSPACE shape rather than a general one. When the kit
 * grows one, this file is what it replaces.
 *
 * ── THE LOOK — v4 UI kit (owner 9 Oct 2026, `01-design-tokens.md` §§1–4) ──
 * The rail is ONE white card (1px card border, radius 8, no shadow), 240px
 * open, sitting on the theme ground. Inside: 6px padding so a row's 10px
 * padding puts every word 16px from the card edge (the card padding); a 10/600
 * .12em uppercase muted label names a static group; rows are 13px body, hover
 * the grey hover, the chosen row 600 in the theme select colours, radius 8;
 * counts 12px muted; groups part on the thin section line. No box inside the
 * box, no coloured edge marker. Icons are Material Symbols through `MIcon`.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import Icon, { type IconName } from "@/components/kit/Icon";
import MIcon from "@/components/carres/MIcon";

/* The v4 recipe, typed once so no row in this file drifts from another. */
const GROUP_LABEL =
  "text-[10px] font-semibold uppercase leading-[13px] tracking-[0.12em] text-c-muted";
/** A rail row: 7px × 10px, 13/18, radius 8 (the side menu's item grammar). */
const ROW =
  "relative flex min-h-8 w-full gap-2 rounded-lg px-2.5 py-[7px] text-left text-[13px] leading-[18px] max-[767px]:min-h-10";
const ROW_ON = "bg-c-select-bg font-semibold text-c-select-fg";
const ROW_REST = "text-c-body hover:bg-c-hover";
const COUNT = "shrink-0 tabular-nums text-[12px] leading-[18px] font-normal text-c-muted";

export function RailGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="py-1">
      <div className="flex items-center px-2.5 pb-1 pt-1.5">
        <span className={GROUP_LABEL}>{title}</span>
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

export function RailItem({
  label,
  count,
  active,
  onClick,
  title,
  danger,
  testId,
}: {
  label: string;
  /** Omitted renders no number at all — an absent count and a zero are
   *  different facts, and a queue that has not been read yet must not print a
   *  reassuring `0`. */
  count?: number;
  active: boolean;
  onClick: () => void;
  title?: string;
  /** §8.4 — danger reads first inside a group, and only while unselected: a
   *  picked row is already carrying the selection's own colour. */
  danger?: boolean;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      data-testid={testId}
      className={[
        // Hover is GREY; the theme select colours mark the chosen row only.
        `${ROW} items-center`,
        active ? ROW_ON : ROW_REST,
      ].join(" ")}
    >
      <span
        className={`flex-1 truncate ${danger && !active ? "text-c-err-fg" : ""}`}
      >
        {label}
      </span>
      {count != null && <span className={COUNT}>{count}</span>}
    </button>
  );
}

/**
 * ── THE READABLE FILTER RAIL — style C, the Portal default ──────────────────
 * (`docs/ui/MASTER.md` §6.7 Portal-wide listing readability, Jess 2026-09-17;
 * geometry from Card 02-C, owner ruling 2026-08-27).
 *
 * 240px wide · one white card · the thin section line between groups · 32px
 * minimum row (40px on a phone) — and a governed label is NEVER truncated: it
 * wraps onto a second line in the same body font at its natural height, count
 * still visible and right-aligned. The rail is navigation, not batch
 * selection — no row here ever grows a checkbox, and each group stays
 * single-choice.
 *
 * Every group heading is a button: kit icon + 13px/600 ink normal-case title,
 * the group's chosen value in the theme select colour at the right ONLY while
 * that group is filtered (empty otherwise), and a chevron. Collapsing hides the group's
 * controls but keeps them mounted, so a collapsed group never loses or clears
 * its filter. The open/closed state is remembered per browser, per rail, per
 * group.
 */
type RailContextValue = { railKey: string | null };
const RailContext = createContext<RailContextValue>({ railKey: null });

type GroupContextValue = { report: (id: string, label: string | null) => void };
const GroupContext = createContext<GroupContextValue | null>(null);

function railStorageKey(railKey: string | null, groupKey: string): string | null {
  return railKey ? `carres.filterRail.${railKey}.${groupKey}` : null;
}

/** Reports a control's chosen label to its group heading while it is chosen. */
function useReportChosen(label: string | null) {
  const group = useContext(GroupContext);
  const id = useId();
  useEffect(() => {
    if (!group) return;
    group.report(id, label);
    return () => group.report(id, null);
  }, [group, id, label]);
}

/**
 * ⭐ THE RESTORE CONTROL — the rail's own button, extracted 2026-09-18.
 *
 * `FilterRail` draws its `Hide filters` control; the button that brings the
 * rail BACK lives in the register's toolbar, so four pages had each drawn it
 * inline with the same 145-character class string (UI-KIT §6.6, and §6.1's
 * "the second occurrence is a full stop" — Purchase Returns would have been
 * the sixth copy). Hide and restore are two halves of one interaction and now
 * live in one file, so neither half can drift alone.
 *
 * Each page keeps its OWN `testId`: the tests that assert this control are
 * page tests, and renaming their hooks would be a behaviour change dressed as
 * a refactor.
 */
export function ShowFiltersButton({
  onShow,
  testId,
}: {
  onShow: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      aria-label="Show filters"
      title="Show filters"
      data-testid={testId}
      onClick={onShow}
      /* The v4 toolbar icon button: 36 round, no border, body ink, grey hover. */
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-c-body hover:bg-c-hover"
    >
      <MIcon name="left_panel_open" size={20} />
    </button>
  );
}

export function FilterRail({
  children,
  testId,
  onHide,
  header,
  className,
  ariaLabel,
}: {
  children: ReactNode;
  /** Also names the rail for remembered group open/closed state. */
  testId?: string;
  className?: string;
  ariaLabel?: string;
  onHide?: () => void;
  /**
   * Owner correction 2026-09-06 (Delivery Monitor): a FIXED region above the
   * scrolling filter groups — Delivery's month calendars live here. It never
   * scrolls away; the groups below scroll independently. The two regions
   * carry `{testId}-fixed` / `{testId}-scroll` so a page can assert the
   * independence.
   *
   * RECEIVING NO LONGER USES IT (owner ruling 2026-09-17): its month calendar
   * is retired and the expected-arrival view lives in Warehouse Arrival
   * Schedule, so that rail is one scrolling column of groups. Omitted = that
   * shape, which is the Portal default.
   */
  header?: ReactNode;
}) {
  const ctx = useMemo(() => ({ railKey: testId ?? null }), [testId]);
  const hide = onHide && (
    <button
      type="button"
      onClick={onHide}
      aria-label="Hide filters"
      title="Hide filters"
      className="absolute right-1.5 top-1.5 z-10 grid h-8 w-8 place-items-center rounded-lg text-c-muted hover:bg-c-hover hover:text-c-body"
    >
      <MIcon name="left_panel_close" size={20} />
    </button>
  );
  /* ONE white card on the ground: 1px card border, radius 8, no shadow. */
  const card = "relative flex w-[240px] min-h-0 shrink-0 flex-col rounded-lg border border-c-card-border bg-c-card";
  if (header) {
    return (
      <RailContext.Provider value={ctx}>
        <aside
          data-testid={testId}
          aria-label={ariaLabel}
          className={`${card} overflow-hidden ${className ?? ""}`}
        >
          {hide}
          <div
            className="shrink-0 border-b border-c-section-line px-2.5 py-2"
            data-testid={testId ? `${testId}-fixed` : undefined}
          >
            {header}
          </div>
          <div
            className="flex min-h-0 flex-1 flex-col overflow-y-auto p-1.5 [scrollbar-width:thin]"
            data-testid={testId ? `${testId}-scroll` : undefined}
          >
            {children}
          </div>
        </aside>
      </RailContext.Provider>
    );
  }
  return (
    <RailContext.Provider value={ctx}>
      <aside
        data-testid={testId}
        aria-label={ariaLabel}
        /* The collapse toggle sits `top-1.5`, absolutely positioned beside the
           first heading; the first heading leaves it room on the right. */
        className={`${card} overflow-y-auto p-1.5 [scrollbar-width:thin] ${onHide ? "[&>div:first-of-type>button]:pr-9" : ""} ${className ?? ""}`}
      >
        {hide}
        {children}
      </aside>
    </RailContext.Provider>
  );
}

/**
 * One collapsible rail group. `icon` is required: the icon supplements the
 * title, it never replaces it. `chosen` is normally derived from the
 * group's own rows/select; pass it only for a page-local control that is not
 * a `FilterRailRow`/`FilterRailSelect` (`null` = not filtered).
 */
export function FilterRailGroup({
  title,
  icon,
  children,
  chosen,
  groupKey,
  defaultOpen = false,
}: {
  title: string;
  icon: IconName;
  children: ReactNode;
  chosen?: string | null;
  /** Stable storage name when the title is not (defaults to the title). */
  groupKey?: string;
  defaultOpen?: boolean;
}) {
  const { railKey } = useContext(RailContext);
  const storageKey = railStorageKey(railKey, groupKey ?? title);
  const [open, setOpenState] = useState(() => { try { const saved = storageKey ? localStorage.getItem(storageKey) : null; return saved == null ? defaultOpen : saved === "1"; } catch { return defaultOpen; } });
  const [reported, setReported] = useState<ReadonlyArray<readonly [string, string]>>([]);
  const report = useCallback((id: string, label: string | null) => {
    setReported((prev) => {
      const rest = prev.filter(([k]) => k !== id);
      if (label == null) return rest.length === prev.length ? prev : rest;
      const same = prev.find(([k, v]) => k === id && v === label);
      return same ? prev : [...rest, [id, label] as const];
    });
  }, []);
  const groupCtx = useMemo(() => ({ report }), [report]);
  const shown = chosen !== undefined ? chosen : (reported[0]?.[1] ?? null);
  const bodyId = useId();
  const toggle = () => {
    const next = !open;
    setOpenState(next);
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, next ? "1" : "0");
    } catch {
      // Storage may be unavailable in a locked-down browser.
    }
  };
  return (
    <div
      className="border-t border-c-section-line py-1 first-of-type:border-t-0"
      data-rail-group={groupKey ?? title}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={bodyId}
        /* Keyboard focus is the shell's one outline (`--c-focus`, offset −2). */
        className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-c-hover max-[767px]:min-h-10"
      >
        <span className="flex shrink-0 text-c-secondary">
          <Icon name={icon} />
        </span>
        {/* A title never breaks inside a word (it may still wrap at a space); the
            chosen value beside it gives way and truncates instead. */}
        <span className="min-w-min flex-1 break-normal text-[13px] font-semibold leading-[18px] text-c-ink">
          {title}
        </span>
        {!open && shown != null && (
          <span
            className="min-w-0 max-w-[45%] truncate text-[13px] font-semibold leading-[18px] text-c-select-fg"
            title={shown}
            data-testid="rail-group-chosen"
          >
            {shown}
          </span>
        )}
        <MIcon name={open ? "expand_more" : "chevron_right"} size={18} className="text-c-muted" />
      </button>
      <GroupContext.Provider value={groupCtx}>
        {/* `hidden` alone lost to `flex` (a class beats the attribute), so a
            closed group still drew its rows: the display follows `open`. */}
        <div id={bodyId} hidden={!open} className={`mt-0.5 flex-col gap-0.5 pb-1 ${open ? "flex" : "hidden"}`}>
          {children}
        </div>
      </GroupContext.Provider>
    </div>
  );
}

export function FilterRailRow({
  label,
  supportingText,
  count,
  active,
  onClick,
  title,
  testId,
  resets = false,
  tone = "default",
  indent = false,
}: {
  label: string;
  /** `workspace` — the Work rail (Workspace MASTER §5.10 BUILD SHEET): full
   *  width rows with the count on the right; the chosen order row wears the
   *  theme select colours. */
  tone?: "default" | "workspace";
  /** A record row under its module row (the Work order list). */
  indent?: boolean;
  supportingText?: string;
  /** Omitted renders no number. A live count is passed as-is — the fixed rows
   *  print zero rather than hiding it. */
  count?: number;
  active: boolean;
  onClick: () => void;
  title?: string;
  testId: string;
  /** The group's `All …` row: choosing it means the group is NOT filtered, so
   *  the heading shows no chosen value. */
  resets?: boolean;
}) {
  useReportChosen(active && !resets ? label : null);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      data-testid={testId}
      className={tone === "workspace" ? [
        "relative flex min-h-9 w-full items-center gap-2 py-2 pr-4 text-left text-[13px] leading-[18px] text-c-body max-[767px]:min-h-10",
        indent ? "pl-6" : "pl-4",
        /* ONE SELECTION COLOUR IN THE RAIL (Jess, 2026-09-28: "why force to
           select all module with blue? confusing like select 2"): only the
           chosen order row wears the theme select colours. A chosen filter
           (Attention, Module) is the grey chip with bold text, the same as the
           My Task / Team Work switch. */
        active ? (indent ? ROW_ON : "bg-c-hover font-semibold text-c-ink") : "hover:bg-c-hover",
      ].join(" ") : [
        /* 32px minimum: the 18px line + 7px above and below. A wrapped label
           simply adds its second 18px line — natural height, same font, never
           a tooltip. `items-start` keeps the count on the first line. */
        `${ROW} items-start`,
        /* A rail choice is 600 in the theme select colours (v4). The group's
           `All …` row is the unfiltered state — bold ink, never the select
           wash, so an unfiltered group never reads as a second choice. */
        active ? (resets ? "font-semibold text-c-ink hover:bg-c-hover" : ROW_ON) : ROW_REST,
      ].join(" ")}
    >
      <span className="min-w-0 flex-1 break-words">
        {label}
        {supportingText && (
          <span className="block text-[12px] leading-4 font-normal text-c-secondary">{supportingText}</span>
        )}
      </span>
      {count != null && <span className={COUNT}>{count}</span>}
    </button>
  );
}

/**
 * ── A RAIL ROW THAT CAN OPEN, WITHOUT FILTERING — owner ruling 2026-09-17 ───
 * (Receiving's `GRN date` group, Purchasing MASTER §9.4.)
 *
 * ```
 *   ▸  14 – 20 Sep                                                        7
 *      └ pressing the LABEL filters the register by that week
 *        pressing the ARROW only shows its days — it filters NOTHING
 * ```
 *
 * The two jobs are two controls, because one control doing both is how a
 * person loses a filter they meant to keep: an operator opening a week to see
 * which day carried the GRNs would otherwise silently narrow the whole
 * register to that week. Both are real buttons, both reachable by keyboard,
 * and the arrow states what it is doing through `aria-expanded`.
 *
 * It is the `FilterRailRow` geometry unchanged — 32px minimum, wrapping label,
 * right-aligned count, the same selected treatment — with the disclosure in
 * front of it. A group that has nothing to open passes no `children` and gets
 * an ordinary row.
 */
export function FilterRailExpandableRow({
  label,
  count,
  active,
  onClick,
  testId,
  expandLabel,
  children,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  testId: string;
  /** The arrow's accessible name — `Show the days in 14 – 20 Sep`. */
  expandLabel: string;
  /** The rows revealed beneath. Absent = no arrow is drawn. */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  useReportChosen(active ? label : null);
  return (
    <div>
      <div className="relative flex items-start">
        {children ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            aria-label={expandLabel}
            title={expandLabel}
            data-testid={`${testId}-expand`}
            onClick={() => setOpen((v) => !v)}
            className="mt-[7px] grid h-[18px] w-4 shrink-0 place-items-center rounded-lg text-c-muted hover:bg-c-hover hover:text-c-body"
          >
            <MIcon name={open ? "expand_more" : "chevron_right"} size={16} />
          </button>
        ) : (
          <span className="w-4 shrink-0" aria-hidden />
        )}
        <button
          type="button"
          onClick={onClick}
          aria-pressed={active}
          data-testid={testId}
          className={[`${ROW} items-start`, active ? ROW_ON : ROW_REST].join(" ")}
        >
          <span className="min-w-0 flex-1 break-words">{label}</span>
          {count != null && <span className={COUNT}>{count}</span>}
        </button>
      </div>
      {children && (
        <div id={bodyId} hidden={!open} className={`ml-4 flex-col gap-0.5 ${open ? "flex" : "hidden"}`}>
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * ── THE COMPACT FACT DROPDOWN — owner ruling 2026-09-11 ─────────────────────
 *
 * A rail SECTION whose facts are a long, open-ended list collapses into one
 * control instead of printing every value as a row.
 *
 * ⭐ WHY ONLY SOME SECTIONS. `WORK TO DO` and `ORDER TIMING` are the same
 * five and three rows every day, they are what an operator scans first thing
 * in the morning, and their counts are the point — those stay visible rows.
 * `PRODUCT`, `SUPPLIER` and Manual Purchase's `PURCHASE PURPOSE` are FACT
 * lists: the supplier list grows with the business, and on a rail 240px wide
 * a dozen supplier names push the timing rows — the ones that say what to do
 * today — below the fold. A fact list answers *narrow to this one*, which a
 * select answers in one control and one line.
 *
 * ⛔ WHAT IT IS NOT. It is not a second filter model: it writes the same
 * single-slot section value the rows wrote, so sections still combine with
 * AND and the `All …` option still clears only its own section. It is not a
 * multi-select, and it never grows a checkbox — the rail is navigation, not
 * batch selection.
 *
 * The ACTIVE treatment is the rail's own: a chosen value wears the theme
 * select colours at 600, so a narrowed section is as visible as a selected
 * row. A count rides in the option text (`Ohana · 4`),
 * because the reason the counts existed — knowing a name is worth clicking
 * before you click it — does not go away just because the rows became
 * options.
 */
export function FilterRailSelect({
  label,
  value,
  options,
  onChange,
  testId,
  allLabel,
}: {
  /** The accessible name — the section heading is visual, not programmatic. */
  label: string;
  /** `null` = the section is not narrowed (the `All …` option). */
  value: string | null;
  options: ReadonlyArray<{ value: string; label: string; count?: number }>;
  onChange: (next: string | null) => void;
  testId: string;
  /** `All suppliers` — the section's own clearing word, never invented here. */
  allLabel: string;
}) {
  const active = value != null;
  useReportChosen(active ? (options.find((o) => o.value === value)?.label ?? null) : null);
  return (
    <div className="relative">
      <select
        aria-label={label}
        data-testid={testId}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        className={[
          /* The v4 field: 32px, 1px input border, radius 8, 10px sides, 13px
             — so a section that collapsed does not change the rail's rhythm. */
          "h-8 w-full rounded-lg border px-2.5 text-[13px] leading-[18px] max-[767px]:h-10",
          active
            ? "border-c-select-bg bg-c-select-bg font-semibold text-c-select-fg"
            : "border-c-input-border bg-c-card text-c-body hover:bg-c-hover",
        ].join(" ")}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.count == null ? o.label : `${o.label} · ${o.count}`}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Below this canvas width the 240px rail floats over the Register (the
 *  shared purchasing responsive pattern) — and, since S3, starts hidden. */
export const FILTER_RAIL_FLOAT_BELOW_PX = 896;

/**
 * ⭐ S3 · THE RAIL'S OPEN STATE, REMEMBERED PER BROWSER (owner follow-up
 * 2026-09-16, SO Batch Purchase + Manual Purchase).
 *
 * On a canvas narrower than 896px the rail floats OVER the list, so opening
 * it by default covered the very rows the operator came to read (measured at
 * 390px: ~38px of list left). It therefore starts hidden there — unless this
 * browser opened it before, which is a choice the page keeps.
 *
 *   stored "1"  the operator opened it       → open at any width
 *   stored "0"  the operator hid it          → hidden at any width
 *   nothing     never chosen                 → open on a wide canvas,
 *                                              hidden below 896px
 *
 * Storage failures never break the page: the live state still works for the
 * visit, and a blocked read counts as "never chosen".
 */
export function useFilterRailOpen(
  storageKey: string,
  canvasRef: RefObject<HTMLElement | null>,
): [boolean, (open: boolean) => void] {
  const [stored] = useState<string | null>(() => {
    try {
      return localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  });
  const [open, setOpen] = useState(stored !== "0");
  /* The canvas BECAME narrow after load (the right-hand Tasks area opened, the
     window shrank): the rail would float over the very rows the operator is
     reading, so it steps aside for this visit. Nothing is written to storage —
     the operator's choice comes back as soon as the canvas is wide again, and
     opening it while narrow is honoured (production acceptance 2026-10-06). */
  const [narrowHidden, setNarrowHidden] = useState(false);
  useLayoutEffect(() => {
    if (stored != null) return;
    const width = canvasRef.current?.clientWidth ?? 0;
    if (width > 0 && width < FILTER_RAIL_FLOAT_BELOW_PX) setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let wasNarrow = el.clientWidth > 0 && el.clientWidth < FILTER_RAIL_FLOAT_BELOW_PX;
    const observer = new ResizeObserver(() => {
      const width = el.clientWidth;
      if (width <= 0) return;
      const narrow = width < FILTER_RAIL_FLOAT_BELOW_PX;
      if (narrow && !wasNarrow) setNarrowHidden(true);
      if (!narrow && wasNarrow) setNarrowHidden(false);
      wasNarrow = narrow;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [canvasRef]);
  const setVisible = useCallback(
    (next: boolean) => {
      setNarrowHidden(false);
      setOpen(next);
      try {
        localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        // Storage may be unavailable in a locked-down browser.
      }
    },
    [storageKey],
  );
  return [open && !narrowHidden, setVisible];
}

/**
 * ── THE MONTH GRID — the rail's calendar, Monday to Saturday ──────────────
 * (Jess, 2026-09-26: "full 1 month, need to see Sat work — office doesn't
 * work Saturday, but the Workspace needs to see it". Sunday is never drawn.)
 *
 * ```
 *    MON TUE WED THU FRI SAT
 *          1   2   3   4   5
 *      7   8   9  10  11  12
 *     14  15  16  17  18  19      ← a tile: the day number over its count
 *              2   3   2   1
 * ```
 *
 * Nothing is written in words — the count line is EMPTY when nothing is due,
 * a closed day (public holiday) is grey text with its name only in the
 * accessible name and tooltip. Today is the number in a RING; the week that
 * holds today is the tinted row (Jess, 2026-09-26: "circle the day you are
 * today, not write today; the week should have colour"). The full grid's
 * chosen tile wears the theme select colours. The compact Work grid has NO
 * select colour (Jess, 2026-09-28: one selection colour in the Work rail = the
 * chosen order row): its chosen day is the darker grey chip, today a dark
 * ring. Six columns share the 216px row.
 */
export interface RailWeekDay {
  iso: string;
  /** `Mon, 28 Sep` — the accessible name's first part. */
  label: string;
  /** `MON` · `28`, both cut from that one spelling. */
  weekday: string;
  dayNumber: string;
  /** The holiday's name when the day is closed, else null. */
  closed: string | null;
  count: number;
  today: boolean;
}

const MONTH_GRID_COLUMNS = ["MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

export function FilterRailMonthGrid({
  weeks,
  chosenIso,
  onPick,
  testId,
  compact = false,
}: {
  /** The Work inbox's month: 36px rows, the count under the number, a day
   *  with work dark and a day without it grey (Jess, 2026-09-27). */
  compact?: boolean;
  weeks: readonly (readonly (RailWeekDay | null)[])[];
  chosenIso: string | null;
  onPick: (iso: string) => void;
  testId: string;
}) {
  return (
    <div className={compact ? "py-1" : "py-2"} data-testid={testId}>
      <div className="grid grid-cols-6 gap-x-1" aria-hidden="true">
        {MONTH_GRID_COLUMNS.map((c) => (
          <span key={c} className="text-center text-[10px] font-semibold leading-4 text-c-muted">{c}</span>
        ))}
      </div>
      {weeks.map((week, row) => {
        const thisWeek = week.some((d) => d?.today);
        return (
        <div key={row} className={`grid grid-cols-6 gap-x-1 gap-y-1 rounded-lg ${thisWeek ? "bg-c-ground" : ""}`} data-testid={`${testId}-week-${row}`} data-this-week={thisWeek ? "yes" : undefined}>
          {week.map((d, col) => {
            if (!d) return <span key={col} aria-hidden="true" />;
            const chosen = chosenIso === d.iso;
            const closed = d.closed !== null;
            const name = `${d.label}${d.today ? " · Today" : ""}${d.closed ? ` · ${d.closed}` : ""} · ${d.count} ${d.count === 1 ? "action" : "actions"}`;
            return (
              <button
                key={d.iso}
                type="button"
                onClick={() => onPick(d.iso)}
                aria-pressed={chosen}
                aria-label={name}
                title={d.closed ?? undefined}
                data-testid={`${testId.replace(/s$/, "")}-${d.iso}`}
                data-today={d.today ? "yes" : undefined}
                data-closed={closed ? "yes" : undefined}
                className={[
                  /* The count sits UNDER the day number in both grids (Workspace
                     §5.10 8b; Jess 2026-09-28 on the compact grid's count beside
                     the number: "failed ui. how to make it easy read"). */
                  "flex h-9 min-w-0 flex-col items-center justify-start rounded-lg pt-0.5 tabular-nums",
                  chosen ? (compact ? "bg-c-btn-border text-c-ink" : "bg-c-select-bg text-c-select-fg") : closed || (compact && d.count === 0) ? "text-c-muted hover:bg-c-hover" : "text-c-ink hover:bg-c-hover",
                ].join(" ")}
              >
                <span className={`grid h-5 w-5 place-items-center rounded-full leading-4 ${compact ? `text-[13px] ${(d.count > 0 && !closed) || chosen ? "font-semibold" : "font-normal"}` : "text-[13px] font-semibold"} ${d.today ? (!compact && chosen ? "ring-1 ring-c-select-fg" : "ring-1 ring-c-ink") : ""}`}>{d.dayNumber}</span>
                <span className={compact ? `h-3.5 text-[11px] leading-[14px] ${chosen ? "text-c-ink" : "text-c-secondary"}` : `h-3.5 text-[10px] leading-[14px] ${chosen ? "text-c-select-fg" : "text-c-secondary"}`}>
                  {!closed && d.count > 0 ? d.count : ""}
                </span>
              </button>
            );
          })}
        </div>
        );
      })}
    </div>
  );
}

/** Shared value-list filter: OR within a group; owner-approved SO pilot. */
export function FilterRailMultiSelect({label, values, options, onChange, allLabel, testId, compact = false}: {
 label: string; values: readonly string[]; options: readonly {value:string; label:string}[];
 onChange:(values:string[])=>void; allLabel:string; testId:string; compact?:boolean;
}) {
 const [query,setQuery]=useState("");
 const [expanded,setExpanded]=useState(false);
 const listId=useId();
 useReportChosen(values.length ? (values.length===1 ? values[0] : `${values.length} selected`) : null);
 const content = <div data-testid={testId} className="flex min-w-0 flex-col gap-1">
  <input aria-label={`Search ${label}`} placeholder="Search…" value={query} onChange={e=>setQuery(e.target.value)} className="h-8 min-w-0 rounded-lg border border-c-input-border bg-c-card px-2.5 text-[13px] text-c-ink placeholder:text-c-muted" />
  <button type="button" aria-pressed={!values.length} onClick={()=>onChange([])} className={`${ROW} items-center font-medium ${ROW_REST}`}>{allLabel}</button>
  <div className={compact ? "max-h-36 overflow-y-auto" : "max-h-48 overflow-y-auto"}>
   {options.filter(o=>o.label.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(o=><button
    key={o.value} type="button" aria-pressed={values.includes(o.value)}
    onClick={()=>onChange(values.includes(o.value)?values.filter(v=>v!==o.value):[...values,o.value])}
    className={`${ROW} items-center ${values.includes(o.value)?ROW_ON:ROW_REST}`}>
    <span className="min-w-0 break-words">{o.label}</span>
   </button>)}
  </div>
 </div>;
 if (!compact) return content;
 return <div className="flex min-w-0 flex-col gap-1">
  <button type="button" className="flex h-8 w-full items-center justify-between gap-1 rounded-lg border border-c-input-border bg-c-card px-2.5 text-left text-[13px] text-c-body hover:bg-c-hover" aria-label={`Select ${label}`} aria-expanded={expanded} aria-controls={listId} onClick={()=>setExpanded(value=>!value)}>
   <span className="truncate">{values.length === 0 ? allLabel : values.length === 1 ? values[0] : `${values.length} selected`}</span><MIcon name={expanded ? "expand_less" : "expand_more"} size={18} className="text-c-muted" />
  </button>
  {expanded && <div id={listId} className="rounded-lg border border-c-btn-border bg-c-card p-1.5">{content}</div>}
 </div>;
}
