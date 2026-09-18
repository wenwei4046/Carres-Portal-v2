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

export function RailGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center px-1.5">
        <span className="text-label font-semibold uppercase tracking-wide text-kit-slate-11">
          {title}
        </span>
      </div>
      <div className="mt-1 flex flex-col gap-0.5">{children}</div>
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
        // Hover is GREY (01-design-tokens §2.3, ruled 2026-08-03). Blue is the
        // primary action and the SELECTED row only. Both inline copies of this
        // rail were written before that rule and still carry the blue tint;
        // extracting the recipe is what made the linter able to see it.
        "relative flex items-center gap-2 px-2 py-1.5 rounded-control text-left text-body w-full",
        active
          ? "bg-kit-blue-3 text-kit-slate-12 font-semibold"
          : "text-kit-slate-11 hover:bg-kit-slate-3",
      ].join(" ")}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1 bottom-1 w-0.5 bg-kit-blue-9"
        />
      )}
      <span
        className={`flex-1 truncate ${danger && !active ? "text-kit-red-11" : ""}`}
      >
        {label}
      </span>
      {count != null && (
        <span className="tabular-nums text-label text-kit-slate-11">{count}</span>
      )}
    </button>
  );
}

/**
 * ── THE READABLE FILTER RAIL — style C, the Portal default ──────────────────
 * (`docs/ui/MASTER.md` §6.7 Portal-wide listing readability, Jess 2026-09-17;
 * geometry from Card 02-C, owner ruling 2026-08-27).
 *
 * 240px wide · 12px outer padding · a 1px divider between groups · 36px
 * minimum row — and a governed label is NEVER truncated: it wraps onto a
 * second line in the same body font at its natural height, count still
 * visible and right-aligned. The rail is navigation, not batch selection — no
 * row here ever grows a checkbox, and each group stays single-choice.
 *
 * Every group heading is a button: kit icon + 13px/600 slate-12 normal-case
 * title, the group's chosen value in blue at the right ONLY while that group
 * is filtered (empty otherwise), and a chevron. Collapsing hides the group's
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

function readGroupOpen(key: string | null): boolean {
  if (!key) return true;
  try {
    return localStorage.getItem(key) !== "0";
  } catch {
    return true;
  }
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
      className="absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-control border border-kit-slate-6 bg-white text-kit-slate-11 hover:bg-kit-slate-3 hover:text-kit-slate-12"
    >
      <Icon name="panelToggle" panelOpen />
    </button>
  );
  if (header) {
    return (
      <RailContext.Provider value={ctx}>
        <aside
          data-testid={testId}
          aria-label={ariaLabel}
          className={`relative flex w-[240px] min-h-0 shrink-0 flex-col border-r border-kit-slate-5 bg-white ${className ?? ""}`}
        >
          {hide}
          <div
            className="shrink-0 border-b border-kit-slate-5 p-3"
            data-testid={testId ? `${testId}-fixed` : undefined}
          >
            {header}
          </div>
          <div
            className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-3"
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
        /* The collapse toggle sits `top-2`, absolutely positioned beside the
           first heading; the first heading leaves it room on the right. */
        className={`relative flex w-[240px] min-h-0 shrink-0 flex-col overflow-y-auto border-r border-kit-slate-5 bg-white px-3 pb-3 ${onHide ? "pt-1 [&>div:first-of-type>button]:pr-9" : ""} ${className ?? ""}`}
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
}: {
  title: string;
  icon: IconName;
  children: ReactNode;
  chosen?: string | null;
  /** Stable storage name when the title is not (defaults to the title). */
  groupKey?: string;
}) {
  const { railKey } = useContext(RailContext);
  const storageKey = railStorageKey(railKey, groupKey ?? title);
  const [open, setOpenState] = useState(() => readGroupOpen(storageKey));
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
      className="border-t border-kit-slate-5 py-2 first-of-type:border-t-0"
      data-rail-group={groupKey ?? title}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex min-h-[36px] w-full items-center gap-2 rounded-control px-1.5 text-left hover:bg-kit-slate-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-kit-blue-9"
      >
        <span className="shrink-0 text-kit-slate-11">
          <Icon name={icon} />
        </span>
        <span className="min-w-0 flex-1 break-words text-body font-semibold text-kit-slate-12">
          {title}
        </span>
        {shown != null && (
          <span
            className="min-w-0 max-w-[45%] truncate text-body font-semibold text-kit-blue-11"
            title={shown}
            data-testid="rail-group-chosen"
          >
            {shown}
          </span>
        )}
        <span className="shrink-0 text-kit-slate-11">
          <Icon name={open ? "collapse" : "expand"} />
        </span>
      </button>
      <GroupContext.Provider value={groupCtx}>
        <div id={bodyId} hidden={!open} className="mt-1 flex flex-col gap-0.5">
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
}: {
  label: string;
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
      className={[
        /* 36px minimum: 18px text-body line + 9px above and below. A wrapped
           label simply adds its second 18px line — natural height, same font,
           never a tooltip. `items-start` keeps the count on the first line. */
        "relative flex min-h-[36px] w-full items-start gap-2 rounded-control px-2 py-[9px] text-left text-body text-kit-slate-12",
        active ? "bg-kit-blue-3 font-semibold" : "hover:bg-kit-slate-3",
      ].join(" ")}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1 bottom-1 w-0.5 bg-kit-blue-9"
        />
      )}
      <span className="min-w-0 flex-1 break-words">
        {label}
        {supportingText && (
          <span className="block text-meta font-normal text-kit-slate-11">{supportingText}</span>
        )}
      </span>
      {count != null && (
        <span className="shrink-0 tabular-nums text-meta leading-[18px] font-normal text-kit-slate-11">
          {count}
        </span>
      )}
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
 * It is the `FilterRailRow` geometry unchanged — 36px minimum, wrapping label,
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
        {active && (
          <span
            aria-hidden
            className="absolute left-0 top-1 bottom-1 w-0.5 bg-kit-blue-9"
          />
        )}
        {children ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            aria-label={expandLabel}
            title={expandLabel}
            data-testid={`${testId}-expand`}
            onClick={() => setOpen((v) => !v)}
            className="mt-[9px] grid h-[18px] w-4 shrink-0 place-items-center rounded-control text-kit-slate-11 hover:bg-kit-slate-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-kit-blue-9"
          >
            <Icon name={open ? "expand" : "forward"} size={14} />
          </button>
        ) : (
          <span className="w-4 shrink-0" aria-hidden />
        )}
        <button
          type="button"
          onClick={onClick}
          aria-pressed={active}
          data-testid={testId}
          className={[
            "flex min-h-[36px] w-full items-start gap-2 rounded-control px-2 py-[9px] text-left text-body text-kit-slate-12",
            active ? "bg-kit-blue-3 font-semibold" : "hover:bg-kit-slate-3",
          ].join(" ")}
        >
          <span className="min-w-0 flex-1 break-words">{label}</span>
          {count != null && (
            <span className="shrink-0 tabular-nums text-meta leading-[18px] font-normal text-kit-slate-11">
              {count}
            </span>
          )}
        </button>
      </div>
      {children && (
        <div id={bodyId} hidden={!open} className="ml-4 flex flex-col gap-0.5">
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
 * The ACTIVE treatment is the rail's own: a chosen value keeps the blue
 * left-edge marker and the blue field, so a narrowed section is as visible
 * as a selected row was. A count rides in the option text (`Ohana · 4`),
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
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1 bottom-1 z-10 w-0.5 bg-kit-blue-9"
        />
      )}
      <select
        aria-label={label}
        data-testid={testId}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        className={[
          /* The rail row's own geometry: 36px minimum, the same rounded
             control, the same body type — so a section that collapsed does
             not change the rail's rhythm. */
          "min-h-[36px] w-full rounded-control border px-2 py-[9px] text-body",
          active
            ? "border-kit-blue-9 bg-kit-blue-3 font-semibold text-kit-slate-12"
            : "border-kit-slate-6 bg-white text-kit-slate-12 hover:bg-kit-slate-3",
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
  useLayoutEffect(() => {
    if (stored != null) return;
    const width = canvasRef.current?.clientWidth ?? 0;
    if (width > 0 && width < FILTER_RAIL_FLOAT_BELOW_PX) setOpen(false);
    // Measured once, at mount: a later resize never overrides what is on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setVisible = useCallback(
    (next: boolean) => {
      setOpen(next);
      try {
        localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        // Storage may be unavailable in a locked-down browser.
      }
    },
    [storageKey],
  );
  return [open, setVisible];
}
