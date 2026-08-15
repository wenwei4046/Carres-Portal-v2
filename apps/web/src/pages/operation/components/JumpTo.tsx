/**
 * `Jump to…` — the ONE global navigate-only command surface across the ERP
 * (`docs/ui/MASTER.md` · `REGISTER PAGE HEADER` and `JUMP TO… INTERACTION`,
 * both APPROVED / LOCKED, Loo 2026-08-11).
 *
 * The locked contract, implemented here and nowhere else — modules must not
 * grow their own competing jump search:
 *
 *   · the Page Header trigger shows its keyboard hint and opens on click or ⌘K
 *   · desktop = one centred overlay; small screens = the same surface, full-screen
 *   · empty query = at most FIVE permitted RECENT destinations, then permitted
 *     destinations
 *   · typing searches ONLY (1) governed module/destination names and (2) exact
 *     or partial governed document numbers — SO · PO · GRN · INV
 *   · a document result shows its number, its type and the smallest useful
 *     identifying party
 *   · results are permission-filtered BEFORE display
 *   · ↑ / ↓ move · Enter navigates · Esc closes
 *   · no match renders the plain empty state `No results`, and never offers create
 *   · selecting a result only OPENS its owning destination/document
 *
 * ⛔ THERE IS NO WRITE HERE, AND THERE IS NO PLACE TO PUT ONE. Every row is an
 * `href` handed to `navigate()`. Nothing on this surface approves, receives,
 * pays, edits, creates or performs any other workflow — which is why a `No
 * results` state offers nothing rather than offering to make one.
 *
 * **Permission filtering has two halves, and neither trusts the other.**
 *   DESTINATIONS are composed from `portal-nav`'s `visibleGroups` /
 *   `visibleItems` — the exact functions the sidebar renders from, so a
 *   destination this surface offers is one the operator can already reach and
 *   nothing here can invent a door.
 *   DOCUMENTS never touch this file's logic: `/api/operation/jump` reads them
 *   under the caller's own token, so RLS decides what exists.
 *
 * The overlay itself is the kit's `Modal` (focus trap · Esc · scroll lock ·
 * backdrop · returned focus), never a hand-rolled one — the kit exists because
 * 63 files once rolled their own. `max-w-modal` with `w-full` is what makes the
 * small-screen case full-width, and `max-h-dialog` (85vh) full-height.
 *
 * Register Search stays page-owned. This surface does not search table cells,
 * customer phone numbers or product text, and a module may not widen it
 * locally.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { JUMP_DOC_LABEL, type JumpDocumentResult } from "@carres/shared";
import Modal from "@/components/kit/Modal";
import SearchInput from "@/components/kit/SearchInput";
import EmptyState from "@/components/kit/EmptyState";
import { useAuth } from "@/lib/auth";
import { useJumpSearch } from "@/lib/queries";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import {
  navItemHref,
  visibleGroups,
  visibleItems,
  type PortalNavGroup,
  type PortalNavItem,
} from "@/pages/portal/portal-nav";

/** At most five, and the MASTER says five. */
const RECENT_LIMIT = 5;
const RECENT_KEY = "carres-jump-recent";

/** One permitted destination, flattened out of the portal nav. */
export interface JumpDestination {
  /** Stable identity across sessions — `<area>:<item key>`. */
  id: string;
  label: string;
  /** The area word, so `Sales Orders` and Admin's `Sales Orders` stay apart. */
  area: string;
  href: string;
}

/**
 * Every destination the live role may open, in sidebar order.
 *
 * Read from `portal-nav` rather than a list of its own: a second list is a
 * second permission model, and the one that drifts is always the copy.
 */
export function permittedDestinations(
  role: Parameters<typeof visibleGroups>[0],
): JumpDestination[] {
  const out: JumpDestination[] = [];
  for (const group of visibleGroups(role)) {
    for (const item of visibleItems(group, role)) {
      out.push({
        id: `${group.area}:${item.key}`,
        label: item.label,
        area: group.label,
        href: navItemHref(group as PortalNavGroup, item as PortalNavItem),
      });
    }
  }
  return out;
}

/** Destination-NAME matching, and only the name. */
export function matchDestinations(
  destinations: JumpDestination[],
  query: string,
): JumpDestination[] {
  const q = query.trim().toLowerCase();
  if (q === "") return destinations;
  const starts: JumpDestination[] = [];
  const contains: JumpDestination[] = [];
  for (const d of destinations) {
    const label = d.label.toLowerCase();
    if (label.startsWith(q)) starts.push(d);
    else if (label.includes(q)) contains.push(d);
  }
  return [...starts, ...contains];
}

function readRecentIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/**
 * The recents, re-resolved through the PERMITTED list every time.
 *
 * Stored ids are resolved, never rendered from storage: a role change, a
 * renamed door or a retired item must drop out of this list rather than offer a
 * stale destination — and localStorage is not a permission record.
 */
export function resolveRecents(
  ids: string[],
  destinations: JumpDestination[],
): JumpDestination[] {
  const byId = new Map(destinations.map((d) => [d.id, d]));
  const out: JumpDestination[] = [];
  for (const id of ids) {
    const d = byId.get(id);
    if (d) out.push(d);
    if (out.length >= RECENT_LIMIT) break;
  }
  return out;
}

/** The hint the trigger prints, in the modifier this keyboard actually has. */
function keyboardHint(): string {
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
  return mac ? "⌘K" : "Ctrl K";
}

type Row =
  | { kind: "destination"; destination: JumpDestination }
  | { kind: "document"; document: JumpDocumentResult };

export default function JumpTo() {
  const navigate = useNavigate();
  const role = useAuth((s) => s.role);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  const destinations = useMemo(() => permittedDestinations(role), [role]);
  /* Destinations filter locally on every keystroke; only the DOCUMENT lookup
   * crosses the network, so only it is debounced. Typing `SO-1307` is one
   * request, not seven. */
  const debouncedQuery = useDebouncedValue(query, 150);
  const documentsQ = useJumpSearch(debouncedQuery);
  const documents = documentsQ.data?.documents ?? [];

  /* Recents are read when the surface OPENS, not on every render: the list must
   * not reshuffle under the operator's cursor while they are looking at it. */
  useEffect(() => {
    if (open) setRecentIds(readRecentIds());
  }, [open]);

  /* ⌘K / Ctrl+K from anywhere. `preventDefault` because the browser's own
   * Ctrl+K focuses the address bar, and the operator asked for this box. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key ?? "").toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const typed = query.trim() !== "";
  const recents = useMemo(
    () => (typed ? [] : resolveRecents(recentIds, destinations)),
    [typed, recentIds, destinations],
  );
  const matchedDestinations = useMemo(
    () => matchDestinations(destinations, query),
    [destinations, query],
  );

  /* ONE flat row list — the arrow keys move through what is on screen, so the
   * order the operator sees and the order Enter follows are the same object. */
  const rows: Row[] = useMemo(() => {
    const r: Row[] = [];
    for (const d of recents) r.push({ kind: "destination", destination: d });
    for (const d of matchedDestinations) {
      if (recents.some((x) => x.id === d.id)) continue;
      r.push({ kind: "destination", destination: d });
    }
    for (const doc of documents) r.push({ kind: "document", document: doc });
    return r;
  }, [recents, matchedDestinations, documents]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active, open, rows.length]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
  }, []);

  /**
   * The only thing selecting a result does.
   *
   * A DESTINATION is remembered; a DOCUMENT is not — the MASTER's empty state
   * is "recent destinations", and a list of documents someone opened once is a
   * different feature with a different privacy question.
   */
  const go = useCallback(
    (row: Row) => {
      if (row.kind === "destination") {
        const id = row.destination.id;
        const next = [id, ...readRecentIds().filter((x) => x !== id)].slice(0, RECENT_LIMIT);
        try {
          localStorage.setItem(RECENT_KEY, JSON.stringify(next));
        } catch {
          /* A browser refusing storage costs the recents list, never the jump. */
        }
        close();
        navigate(row.destination.href);
        return;
      }
      close();
      navigate(row.document.href);
    },
    [close, navigate],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (rows.length === 0 ? 0 : (i + 1) % rows.length));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (rows.length === 0 ? 0 : (i - 1 + rows.length) % rows.length));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[active];
      if (row) go(row);
      return;
    }
    if (e.key === "Escape") {
      /* `type="search"` clears itself on Escape in some browsers, which would
       * eat the close. Closing here makes the locked behaviour deterministic. */
      e.preventDefault();
      close();
    }
  };

  const hint = keyboardHint();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Jump to"
        /* The word and the hint collapse under `sm` — a 44px header cannot
         * carry four labelled utilities on a phone, and a keyboard hint is a
         * lie on a device with no keyboard. `title` keeps the glyph named,
         * which is exactly how Bell / Help / Settings beside it already read. */
        title={`Jump to… (${hint})`}
        aria-keyshortcuts="Meta+K Control+K"
        data-testid="jump-to-trigger"
        className="flex items-center gap-1.5 h-7 pl-2 pr-1.5 rounded-md text-base-500 hover:text-base-900 hover:bg-hovertint transition-colors"
      >
        <Search size={16} />
        <span className="hidden sm:inline text-meta">Jump to…</span>
        <span className="hidden sm:inline text-label text-base-400 border border-base-200 rounded px-1 py-0.5 tabular-nums">
          {hint}
        </span>
      </button>

      <Modal open={open} onOpenChange={(o) => (o ? setOpen(true) : close())} title="Jump to…">
        <div onKeyDown={onKeyDown} data-testid="jump-to-surface">
          {/* The active row is painted AND announced: without
              `aria-activedescendant` the arrow keys move a highlight a screen
              reader never hears, which is a keyboard surface that only works
              with eyes. */}
          <SearchInput
            id="jump-to-query"
            placeholder="Destination or document number"
            aria-label="Jump to"
            role="combobox"
            aria-expanded
            aria-controls="jump-to-results"
            aria-activedescendant={rows[active] ? rowDomId(rows[active]) : undefined}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
          />

          <div
            ref={listRef}
            id="jump-to-results"
            role="listbox"
            aria-label="Jump to results"
            className="mt-3 max-h-80 overflow-y-auto"
          >
            {rows.length === 0 ? (
              /* The plain empty state the MASTER names, and nothing else: a
               * search that found nothing has nothing to teach, and this
               * surface has no create action to offer. */
              <EmptyState title="No results" />
            ) : (
              <>
                {recents.length > 0 && <GroupLabel>Recent</GroupLabel>}
                {rows.map((row, i) => {
                  const isFirstDoc =
                    row.kind === "document" && rows.findIndex((r) => r.kind === "document") === i;
                  const isFirstOtherDest =
                    row.kind === "destination" &&
                    recents.length > 0 &&
                    i === recents.length;
                  return (
                    <div key={rowKey(row)}>
                      {isFirstOtherDest && <GroupLabel>Destinations</GroupLabel>}
                      {isFirstDoc && <GroupLabel>Documents</GroupLabel>}
                      <RowButton
                        row={row}
                        activeRow={i === active}
                        onHover={() => setActive(i)}
                        onSelect={() => go(row)}
                      />
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}

function rowKey(row: Row): string {
  return row.kind === "destination"
    ? `d:${row.destination.id}`
    : `k:${row.document.type}:${row.document.number}`;
}

/** The option's DOM id — what `aria-activedescendant` points at. */
function rowDomId(row: Row): string {
  return `jump-to-row-${rowKey(row).replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

function GroupLabel({ children }: { children: string }) {
  return (
    <div className="px-2 pt-2 pb-1 text-label uppercase tracking-[0.05em] text-kit-slate-11">
      {children}
    </div>
  );
}

function RowButton({
  row,
  activeRow,
  onHover,
  onSelect,
}: {
  row: Row;
  activeRow: boolean;
  onHover: () => void;
  onSelect: () => void;
}) {
  const isDoc = row.kind === "document";
  return (
    <button
      type="button"
      role="option"
      id={rowDomId(row)}
      aria-selected={activeRow}
      data-active={activeRow}
      data-testid={isDoc ? "jump-to-document" : "jump-to-destination"}
      onMouseMove={onHover}
      onClick={onSelect}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-control text-left ${
        activeRow ? "bg-kit-blue-3" : "hover:bg-kit-slate-3"
      }`}
    >
      {isDoc ? (
        <>
          <span className="shrink-0 font-mono tabular-nums text-body text-kit-slate-12">
            {row.document.number}
          </span>
          <span className="shrink-0 text-meta text-kit-slate-11">
            {JUMP_DOC_LABEL[row.document.type]}
          </span>
          {row.document.party && (
            <span className="min-w-0 truncate text-meta text-kit-slate-11">
              · {row.document.party}
            </span>
          )}
        </>
      ) : (
        <>
          <span className="min-w-0 truncate text-body text-kit-slate-12">
            {row.destination.label}
          </span>
          <span className="shrink-0 text-meta text-kit-slate-11">{row.destination.area}</span>
        </>
      )}
    </button>
  );
}
