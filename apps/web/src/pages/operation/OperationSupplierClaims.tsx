// design-standard: not-a-list-page — Claims sits UNDER the Purchasing module
// tab bar, and UI-KIT §8.3's Module-tab law says a module-tabbed page must NOT
// render ListPageShell's breadcrumb + big title: they duplicate the active tab
// and burn ~80px Jess does not have. Same shape as its sibling To Order.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  supplierClaimTypeLabel,
  supplierClaimStatusLabel,
  supplierClaimRequestLabel,
  supplierClaimResponseLabel,
  claimMoveOwnerLabel,
  purchasingActionEmpty,
  purchasingActionQueue,
  SUPPLIER_CLAIM_LATE,
} from "@carres/shared";
import {
  useOperationSupplierClaims,
  useOperationSuppliers,
  type SupplierClaimListRow,
} from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";
import ListPageShell, { type ActiveChip } from "@/components/ListPageShell";
import DataTable, {
  type Column,
  type TableSort,
} from "@/components/kit/DataTable";
import { SectionCard, SectionBand } from "@/components/SectionPanel";
// R8 — UI-KIT §6.1: P2's Receiving half already extracted this row, and this
// page shipped a third hand-written copy of it one import away from the
// component. Second occurrence is a full stop; this is the third.
import FacetRow from "@/components/FacetRow";
import PurchasingTabs from "./PurchasingTabs";
import SupplierClaimPanel from "./components/SupplierClaimPanel";

/**
 * OperationSupplierClaims — R2 of the receiving & claim queue
 * (docs/receiving-claim-execution-queue.md, Jess 2026-07-27), given the portal's
 * ONE list behaviour by card **P2** (docs/purchasing-execution-queue.md).
 *
 * The card's test is "a receiving problem cannot exist without a case row
 * chasing it". Migration 0288 makes the case unavoidable; THIS page is where
 * the case is visible — one row per problem, with the supplier who owes us, the
 * PO it came off, how many units, and the photo that proves it.
 *
 * Sidebar home: none. Claims is a fourth tab under the existing Purchasing
 * module (the queue doc's rule: "no new menu item"), sitting beside Receiving
 * because a claim is what a receiving produces.
 *
 * R3 gives the row its LIFE. Every open claim ends in the one thing the card
 * asks for — **who owes the next move** — computed by `claimNextMove` in the
 * shared module, so the sentence in the column and the buttons in the panel can
 * never describe different steps.
 *
 * ── P2 · what this page owes UI-KIT §8.2 ────────────────────────────────────
 *
 * It had NO facet rail and NO filter state at all, so none of the interaction
 * law could be true here. It now runs the same rail the Orders list runs —
 * `ListPageShell` + `SectionCard`/`SectionBand` + a row per facet value:
 *
 *   click a queue tile   → the table filters · click it again / ✕ → it clears
 *   two picks            → two ✕-able chips, each clearing just its own
 *   click a ROW          → the claim opens (it opens from the top; there are no
 *                          tabs on this surface to land deep in)
 *   close it             → the filters AND the scroll position come back
 *
 * **Two shapes, and the difference is the empty state** (UI-KIT §8.2, the rule
 * P2 added on 2026-07-28). `Open / Closed / All` is a STAGE picker — one is
 * always on, there is no "none selected" view to clear into — so re-clicking the
 * active one does nothing. The facet rows below are QUEUE TILES and every one of
 * them toggles.
 *
 * **No word on this page is new.** The one queue tile is
 * `Confirm what happens next` — COPY-STANDARD's dictionary row for this action,
 * taken verbatim, together with its locked empty state. `Confirm what happens
 * next` is the ACTION; `Claims` is the TAB, and a place and an action may not
 * share one word. The two group titles are the words this table's own columns
 * already carry (`Supplier` · `Problem`), and `Queues` is the Orders rail's.
 *
 * ── R8 · the sweep P2 handed over (2026-07-28) ──────────────────────────────
 *
 *  - The tile and the row spelt ONE action two ways on this very screen: the
 *    tile printed the dictionary's `Confirm what happens next` while the Next
 *    move column printed R3's `Call {supplier} — confirm what they will do`.
 *    `claimNextMove` now reads the mirror, so the two cannot part again.
 *  - The two tile strings stop being hand-copied constants and come from
 *    `order-action-words.ts` — the same module the To Order tab reads.
 *  - The explanatory paragraph above the list is DELETED (Loo, 2026-07-28). It
 *    spent a permanent horizontal band on a page whose fixed-chrome budget is
 *    200px (UI-KIT §1.3) and it EXPLAINED rather than worked: §1.1's third
 *    question — "if it were removed, could today's work still be finished?" —
 *    answers YES, so the gate does not admit it. One band back is roughly one
 *    more visible row, every day.
 *  - The local `FacetRow` copy is gone; the page imports the shared component.
 *
 * Measured while doing it: the word `Contact` appears in ZERO visible strings on
 * this screen. R3 already shipped `Call`; what was left was the two spellings
 * above, which is what Loo's ruling was really about.
 *
 * ── D7-Claims · the last hand-rolled `<table>` in Purchasing joins the kit ───
 *
 * Measured 2026-08-05 before a line was written: To Order 13 kit imports, 0
 * hand-rolled tables · Purchase Orders 4 · Receiving 4 · **Claims 0 kit
 * imports, 1 hand-rolled `<table>`, no header sort.** It renders through
 * `DataTable` now. **No word changed (R8 ruled them), no filter behaviour
 * changed (P2 ruled it), no column added and none removed** — the same eight,
 * in the same order, and the header words are the column defs' because that is
 * the one place `DataTable` lets them be typed.
 *
 * **THE ROW WAS TWO LINES TALL AND THE KIT'S ROW IS 40px, WHICH IS THE WHOLE
 * MIGRATION.** Six cells stacked a second line under the first (the status
 * pill, `{n} units`, the note, `DO {n}`, who reported it, the photo count).
 * `DataTable` is `[&_td]:h-10` + `whitespace-nowrap`, so every fact moved onto
 * ONE line, side by side. Nothing was dropped and no word was re-spelt — each
 * one is still its own element, which is also what keeps the existing tests
 * passing untouched.
 *
 * **Loo's rule ① applied, with the numbers** (P16, 2026-08-04: *"A table's
 * WIDTH does not decide a COLUMN's width. Content does."*). Every width below
 * is `ceil(measured) + 16 padding + 4`, measured in a REAL browser against
 * this app's own stylesheet at 13px Inter — never estimated, and never off the
 * rows that happen to be on screen (there are none: production holds **0
 * claims**, so the worst string of each column came from the SOURCE it draws
 * on — `suppliers.name`, `purchase_order_lines.sku`, the bounded label sets in
 * `supplier-claim.ts`, and the ONE sentence the late sweep writes).
 *
 *     Claim    150   SC-99999 62.4 + Closed pill 60.8      1.16×
 *     Supplier 111   Carres Internal 90.8                  1.22×
 *     Item     181   LYYAR-1A(LHF) 95.3 + 999 units 59.4   1.13×
 *     Problem  154   Wrong specification pill 133.9        1.15×
 *     PO       147   PO-2050 54.6 + DO DO-5231 66          1.16×
 *     Reported 194   Mon, 27 Jul 26 91.5 + reporter 76.2   1.12×
 *     Next move 368  owner pill 104.4 + label 235.2        1.06×
 *     (actions) 134  Open 54.3 + 99 photos 53.1            1.18×
 *
 * **`sizing="content"`, so no column absorbs the slack** — the trailing filler
 * does, and on a wide monitor the whitespace on the right is the point.
 *
 * **THE ONE MEASURED COST, REPORTED RATHER THAN SOFTENED.** The columns total
 * 1439 + the kit's 42px expand control = **1481**, and at 1440×900 this page's
 * container is **1022**. So the grid scrolls sideways. It ALREADY DID — the
 * hand-rolled table carried `minWidth: 1120` in the same 1022 — but the
 * threshold moves 1120 → 1481, because putting a two-line cell on one line
 * costs horizontal width. That is the price of the 40px law and it is the
 * honest half of this card.
 *
 * **WHY THE NOTE IS NOT PAID FOR IN WIDTH, and the finding underneath it.**
 * Sized to hold its note in full, `Problem` would be 350px rather than 154 —
 * 200px of permanent width for a fact only a `late_delivery` claim carries.
 * That is exactly what Loo REFUSED on the sibling page (*"both are empty on
 * roughly 90% of rows, and a permanent column for a 10% fact is a permanently
 * empty column"*), and his answer there was rule ③: *an inline second line,
 * under the row, only when it has content.* **`DataTable` has no such prop** —
 * `expansion` is the only thing under a row and rule ② reserves it for the
 * record's own detail, which here is the claim panel. So the note rides
 * `Problem` inline and truncates, with its full text on `title`. Nothing is
 * unreachable; nothing invented. **The kit gap is the report, and D6 meets it
 * on a much larger page.**
 */

type Tab = "open" | "closed" | "all";

const TABS: { key: Tab; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

/** COPY-STANDARD, PURCHASING dictionary — the two of this action's five strings
 *  a list page shows. R8 stopped hand-copying them: a queue tile's name IS its
 *  action, and `claimNextMove` now builds the row line from the same mirror, so
 *  the tile and the row structurally cannot spell one action two ways. */
const QUEUE_TILE = purchasingActionQueue("confirm_what_happens_next");
const QUEUE_EMPTY =
  purchasingActionEmpty("confirm_what_happens_next") ?? "";

/** Claim type → v17 pill. A late delivery is amber (waiting on somebody), an
 *  arrived-but-wrong unit is red (something is already broken). Colour lives
 *  here; the words live in the shared module. */
function claimPill(type: string): string {
  return type === SUPPLIER_CLAIM_LATE ? "pill-warning" : "pill-overdue";
}

/** Multi-select facet toggle. Local, like the identical helpers on Orders and
 *  Payments — extracting it is `DataTable`'s job (⑧ D0.5c), not P2's. */
function toggleInSet<T>(prev: Set<T>, v: T): Set<T> {
  const next = new Set(prev);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
}

/** Is the supplier the one who still owes an answer on this claim?
 *  `claimNextMove` is the single authority — this page never re-derives the
 *  lifecycle, it only asks which step is open. */
function waitingSupplierAnswer(c: SupplierClaimListRow): boolean {
  return c.next_move.key === "answer";
}

/** The party word for a facet row. COPY-STANDARD: name the party when the
 *  system knows it, the role word when it does not — never a blank. */
function supplierLabel(c: SupplierClaimListRow): string {
  const n = c.supplier_name?.trim();
  return n ? n : "supplier";
}

/**
 * D7-Claims — what each column is SORTED BY.
 *
 * `DataTable` shows the arrow; the PAGE orders the rows, which is the kit's
 * own contract. A column appears here only if it has a NATURAL order, so the
 * button column has none and is not sortable — a header that sorts by nothing
 * is a control that lies.
 *
 * The claim number and the PO number are compared NUMERICALLY (`SC-1001` vs
 * `SC-999`): they are sequences wearing a prefix, and a plain string compare
 * would file 1000 before 999 the day the sequence reaches four digits.
 *
 * `Next move` sorts by WHO OWES IT first — that is the question the column
 * exists to answer, and it groups the operator's own work together — then by
 * the sentence, so the order is total and two rows can never swap between
 * renders.
 */
const COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function sortValue(c: SupplierClaimListRow, key: string): string {
  switch (key) {
    case "claim":
      return c.claim_no;
    case "supplier":
      return c.supplier_name ?? "";
    case "item":
      return c.sku;
    case "problem":
      return supplierClaimTypeLabel(c.claim_type);
    case "po":
      return c.po_id;
    case "reported":
      return c.reported_at;
    case "next_move":
      return `${c.next_move.owner} ${c.next_move.label}`;
    default:
      return "";
  }
}

function sortClaims(
  rows: readonly SupplierClaimListRow[],
  sort: TableSort | null,
): SupplierClaimListRow[] {
  // No sort = the order the API sent, untouched. A third header click clears
  // back to exactly this (`DataTable` reports `null`).
  if (!sort) return [...rows];
  const dir = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort(
    (a, b) =>
      dir * COLLATOR.compare(sortValue(a, sort.key), sortValue(b, sort.key)) ||
      // A stable tie-break so equal values never swap between renders.
      COLLATOR.compare(a.claim_no, b.claim_no),
  );
}

export default function OperationSupplierClaims() {
  const [tab, setTab] = useState<Tab>("open");
  const [openClaimId, setOpenClaimId] = useState<string | null>(null);

  // ── §8.2 filter state — the three things this rail can pick ────────────────
  const [queueOnly, setQueueOnly] = useState(false);
  const [supplierFilter, setSupplierFilter] = useState<Set<string>>(new Set());
  const [problemFilter, setProblemFilter] = useState<Set<string>>(new Set());
  const [facetOpen, setFacetOpen] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  // D7-Claims — the page owns the order; the kit only draws the arrow.
  const [sort, setSort] = useState<TableSort | null>(null);

  const { data, isLoading, isError, error, refetch } =
    useOperationSupplierClaims(tab);
  // The WhatsApp GROUP link per supplier (0239) — the follow-up door the card
  // names. Cached 5 minutes and shared with the rest of the operation portal.
  const suppliersQ = useOperationSuppliers();
  const groupUrlBySupplier = useMemo(
    () =>
      new Map(
        (suppliersQ.data?.suppliers ?? []).map((s) => [
          s.id,
          s.whatsapp_group_url ?? null,
        ]),
      ),
    [suppliersQ.data],
  );

  const claims = useMemo(() => data?.claims ?? [], [data]);
  const counts = data?.counts ?? { open: 0, closed: 0, all: 0 };

  const anyFilter =
    queueOnly || supplierFilter.size > 0 || problemFilter.size > 0;

  function resetFilters() {
    setQueueOnly(false);
    setSupplierFilter(new Set());
    setProblemFilter(new Set());
  }

  /** The stage picker. Re-clicking the stage you are already on is a NO-OP —
   *  there are three, one is always on, and there is nothing to clear into
   *  (UI-KIT §8.2's no-empty-state shape). A DIFFERENT stage clears the facet
   *  picks, exactly as To Order does: a filter that survives into a stage where
   *  its value holds nothing leaves the operator staring at a blank table with
   *  no clue which of the two emptied it. */
  function goTab(next: Tab) {
    if (next === tab) return;
    setTab(next);
    setOpenClaimId(null);
    resetFilters();
  }

  // ── Facet counts ───────────────────────────────────────────────────────────
  //
  // Each group is counted with every filter EXCEPT ITS OWN applied. That is
  // what makes the rail honest: a visible row with a count above zero always
  // returns at least that many rows when it is clicked, so no combination of
  // clicks can produce a blank table nobody asked for. Zero rows are hidden for
  // the same reason.
  const passesSupplier = (c: SupplierClaimListRow) =>
    supplierFilter.size === 0 || supplierFilter.has(c.supplier_id);
  const passesProblem = (c: SupplierClaimListRow) =>
    problemFilter.size === 0 || problemFilter.has(c.claim_type);
  const passesQueue = (c: SupplierClaimListRow) =>
    !queueOnly || waitingSupplierAnswer(c);

  const queueCount = useMemo(
    () =>
      claims.filter((c) => passesSupplier(c) && passesProblem(c) && waitingSupplierAnswer(c))
        .length,
    [claims, supplierFilter, problemFilter],
  );

  const supplierFacets = useMemo(() => {
    const by = new Map<string, { id: string; label: string; n: number }>();
    for (const c of claims) {
      if (!passesQueue(c) || !passesProblem(c)) continue;
      const cur = by.get(c.supplier_id);
      if (cur) cur.n += 1;
      else by.set(c.supplier_id, { id: c.supplier_id, label: supplierLabel(c), n: 1 });
    }
    return [...by.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  }, [claims, queueOnly, problemFilter]);

  const problemFacets = useMemo(() => {
    const by = new Map<string, { key: string; label: string; n: number }>();
    for (const c of claims) {
      if (!passesQueue(c) || !passesSupplier(c)) continue;
      const cur = by.get(c.claim_type);
      if (cur) cur.n += 1;
      else
        by.set(c.claim_type, {
          key: c.claim_type,
          label: supplierClaimTypeLabel(c.claim_type),
          n: 1,
        });
    }
    return [...by.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  }, [claims, queueOnly, supplierFilter]);

  const rows = useMemo(
    () =>
      sortClaims(
        claims.filter((c) => passesQueue(c) && passesSupplier(c) && passesProblem(c)),
        sort,
      ),
    [claims, queueOnly, supplierFilter, problemFilter, sort],
  );

  // ── §8.2 · one ✕-able chip per pick ────────────────────────────────────────
  const activeChips: ActiveChip[] = [];
  if (queueOnly)
    activeChips.push({ label: QUEUE_TILE, onClear: () => setQueueOnly(false) });
  for (const id of supplierFilter)
    activeChips.push({
      label: `Supplier: ${supplierFacets.find((f) => f.id === id)?.label ?? claims.find((c) => c.supplier_id === id)?.supplier_name ?? id}`,
      onClear: () => setSupplierFilter((p) => toggleInSet(p, id)),
    });
  for (const key of problemFilter)
    activeChips.push({
      label: `Problem: ${supplierClaimTypeLabel(key)}`,
      onClear: () => setProblemFilter((p) => toggleInSet(p, key)),
    });

  // ── §8.2 · closing the claim gives the list back ───────────────────────────
  //
  // Opening a claim inserts a tall panel row and closing it takes that height
  // away again, so the browser clamps the table's scrollTop underneath the
  // operator. The position is snapshotted on open and put back on close, and it
  // is re-applied after each render until it sticks, because a mutation inside
  // the panel refetches and re-lays the table out a frame or two later.
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollBeforeOpen = useRef<number | null>(null);
  const pendingScroll = useRef<number | null>(null);

  useLayoutEffect(() => {
    const want = pendingScroll.current;
    if (want == null) return;
    const el = tableScrollRef.current;
    if (!el) return;
    el.scrollTop = want;
    if (el.scrollTop === want || el.scrollHeight - el.clientHeight <= want) {
      pendingScroll.current = null;
    }
  });

  function closeClaim() {
    setOpenClaimId(null);
    pendingScroll.current = scrollBeforeOpen.current;
    scrollBeforeOpen.current = null;
  }

  function toggleClaim(id: string) {
    if (openClaimId === id) {
      closeClaim();
      return;
    }
    scrollBeforeOpen.current = tableScrollRef.current?.scrollTop ?? 0;
    setOpenClaimId(id);
  }

  // A close or a filter can take the open claim off the list. Give the scroll
  // back then too — otherwise the one case where the panel disappears WITHOUT
  // the operator clicking anything is the one case that jumps.
  useEffect(() => {
    if (!openClaimId) return;
    if (rows.some((c) => c.id === openClaimId)) return;
    closeClaim();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, openClaimId]);

  function toggleGroup(key: string) {
    setCollapsedGroups((p) => toggleInSet(p, key));
  }

  const emptyLine = queueOnly
    ? QUEUE_EMPTY
    : tab === "open"
      ? "No open claims — every delivery so far arrived complete and on time."
      : "Nothing in this tab.";

  /**
   * The eight columns — the SAME eight, in the same order, with the same
   * words. Every width is measured (see this file's header); every secondary
   * fact that used to sit on a second line now sits inline, in its own
   * element, so a cell reads left-to-right in one 40px row.
   */
  const columns: readonly Column<SupplierClaimListRow>[] = [
    {
      key: "claim",
      label: "Claim",
      width: "150px",
      sortable: true,
      cell: (c) => (
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="font-mono font-semibold truncate">{c.claim_no}</span>
          {c.status !== "open" && (
            <span className="pill pill-neutral shrink-0">
              {supplierClaimStatusLabel(c.status)}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "supplier",
      label: "Supplier",
      width: "111px",
      sortable: true,
      cell: (c) => c.supplier_name ?? "—",
    },
    {
      key: "item",
      label: "Item",
      width: "181px",
      sortable: true,
      cell: (c) => (
        <span className="flex items-baseline gap-2 min-w-0">
          <span className="truncate" title={c.sku}>
            {c.sku}
          </span>
          <span className="shrink-0 font-mono text-label text-kit-slate-11">
            {c.qty} unit{c.qty === 1 ? "" : "s"}
          </span>
        </span>
      ),
    },
    {
      key: "problem",
      label: "Problem",
      width: "154px",
      sortable: true,
      cell: (c) => (
        <span className="flex items-center gap-2 min-w-0">
          <span
            className={`pill ${claimPill(c.claim_type)} shrink-0`}
            data-testid={`claim-type-${c.claim_no}`}
          >
            {supplierClaimTypeLabel(c.claim_type)}
          </span>
          {/* The note truncates rather than buying 200px of permanent width
              for a fact only a late claim carries — its full text is on the
              tooltip, so nothing becomes unreachable. */}
          {c.note && (
            <span className="truncate text-label text-kit-slate-11" title={c.note}>
              {c.note}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "po",
      label: "PO",
      width: "147px",
      sortable: true,
      cell: (c) => (
        <span className="flex items-baseline gap-2 min-w-0">
          <span className="font-mono truncate">{c.po_id}</span>
          {c.do_number && (
            <span className="shrink-0 font-mono text-label text-kit-slate-11">
              DO {c.do_number}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "reported",
      label: "Reported",
      width: "194px",
      sortable: true,
      cell: (c) => (
        <span className="flex items-baseline gap-2 min-w-0">
          <span className="shrink-0">{fmtDate(c.reported_at)}</span>
          {/* A late-delivery claim is raised by the nightly sweep, so there is
              no human to name. Say so rather than printing a blank. */}
          <span className="truncate text-label text-kit-slate-11">
            {c.reported_by_name ?? "System"}
          </span>
        </span>
      ),
    },
    {
      key: "next_move",
      label: "Next move",
      width: "368px",
      sortable: true,
      cell: (c) =>
        c.status === "closed" ? (
          // A closed claim keeps BOTH sides on the row — the card's done-when,
          // readable without opening it.
          <span className="block truncate text-meta text-kit-slate-11">
            Asked {supplierClaimRequestLabel(c.requested_action)} → got{" "}
            {supplierClaimResponseLabel(c.supplier_response)}
          </span>
        ) : (
          <span className="flex items-center gap-2 min-w-0">
            <span
              className={`pill ${c.next_move.owner === "carres" ? "pill-overdue" : "pill-warning"} shrink-0`}
              data-testid={`claim-owner-${c.claim_no}`}
            >
              {claimMoveOwnerLabel(c.next_move.owner, c.supplier_name)}
            </span>
            <span
              className="truncate text-meta"
              title={c.next_move.label}
              data-testid={`claim-next-move-${c.claim_no}`}
            >
              {c.next_move.label}
            </span>
          </span>
        ),
    },
    {
      // The Open button — no header word; it is not a fact, and it has no
      // natural order, so it does not sort either.
      key: "open",
      label: " ",
      width: "134px",
      align: "right",
      cell: (c) => {
        const expanded = openClaimId === c.id;
        return (
          // Button FIRST, count second — the reading order the stacked cell
          // had. Keeping it makes the before/after word dump byte-identical,
          // which is the card's own done-when proved rather than argued.
          <span className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={(e) => {
                // The whole row is the click target (§8.2); the button stays
                // for the people who reach for it, and must not toggle twice.
                e.stopPropagation();
                toggleClaim(c.id);
              }}
              className="btn-secondary text-label py-1.5 px-3 shrink-0"
              data-testid={`claim-open-${c.claim_no}`}
            >
              {expanded ? "Hide" : "Open"}
            </button>
            {c.photo_count > 0 && !expanded && (
              <span className="shrink-0 text-label text-kit-slate-11">
                {c.photo_count} photo{c.photo_count === 1 ? "" : "s"}
              </span>
            )}
          </span>
        );
      },
    },
  ];

  return (
    <div className="h-full flex flex-col">
      <PurchasingTabs />
      {/* R8 — the explainer that used to sit here is DELETED (Loo, 2026-07-28).
          Straight from the tab bar into the work: the tab already says "Claims"
          (§8.3), and a paragraph describing the page is not the page. */}

      <div className="flex-1 min-h-0">
        <ListPageShell
          testId="operation-supplier-claims"
          facetOpen={facetOpen}
          onFacetToggle={() => setFacetOpen((v) => !v)}
          facetToggleTitle="Show filters"
          activeChips={activeChips}
          facet={
            <SectionCard>
              {/* QUEUES — the module's own queue names, danger group first
                  (UI-KIT §8.4). Purchasing has six queues and exactly one of
                  them lives on this tab: the claim waiting for the supplier to
                  say what they will do. It renders even at zero, because a
                  quiet screen must mean watched and fine, never nobody looked
                  (COPY-STANDARD). */}
              <SectionBand
                title="Queues"
                danger
                strong
                collapsed={collapsedGroups.has("queues")}
                onToggle={() => toggleGroup("queues")}
              />
              {!collapsedGroups.has("queues") && (
                <div>
                  <FacetRow
                    testId="facet-queue-answer"
                    label={QUEUE_TILE}
                    count={queueCount}
                    tone={queueCount > 0 ? "danger" : "muted"}
                    active={queueOnly}
                    title="We asked and the supplier has not come back yet — ring them and record what they say."
                    onClick={() => setQueueOnly((v) => !v)}
                  />
                </div>
              )}

              {/* SUPPLIER — a fact, so it is a filter (COPY-STANDARD's UI type
                  dictionary). The word is this table's own column header, and
                  the sibling To Order tab's band title. */}
              {supplierFacets.length > 0 && (
                <>
                  <SectionBand
                    title="Supplier"
                    strong
                    collapsed={collapsedGroups.has("supplier")}
                    onToggle={() => toggleGroup("supplier")}
                  />
                  {!collapsedGroups.has("supplier") && (
                    <div>
                      {supplierFacets.map((f) => (
                        <FacetRow
                          key={f.id}
                          testId={`facet-supplier-${f.id}`}
                          label={f.label}
                          count={f.n}
                          active={supplierFilter.has(f.id)}
                          onClick={() =>
                            setSupplierFilter((p) => toggleInSet(p, f.id))
                          }
                        />
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* PROBLEM — the same words the Problem column prints, from the
                  one shared module. */}
              {problemFacets.length > 0 && (
                <>
                  <SectionBand
                    title="Problem"
                    strong
                    collapsed={collapsedGroups.has("problem")}
                    onToggle={() => toggleGroup("problem")}
                  />
                  {!collapsedGroups.has("problem") && (
                    <div>
                      {problemFacets.map((f) => (
                        <FacetRow
                          key={f.key}
                          testId={`facet-problem-${f.key}`}
                          label={f.label}
                          count={f.n}
                          active={problemFilter.has(f.key)}
                          onClick={() =>
                            setProblemFilter((p) => toggleInSet(p, f.key))
                          }
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </SectionCard>
          }
          toolbar={
            <div
              className="flex gap-1 p-1 bg-base-100 rounded w-fit max-w-full overflow-auto"
              role="tablist"
              aria-label="Claim status"
            >
              {TABS.map((t) => {
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    role="tab"
                    aria-selected={active}
                    onClick={() => goTab(t.key)}
                    className={`px-3 py-1.5 text-meta rounded cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                      active
                        ? "bg-white text-base-900 font-semibold shadow-sm"
                        : "text-base-600 font-medium hover:text-base-900"
                    }`}
                  >
                    <span>{t.label}</span>
                    <span
                      className={`text-label font-mono px-1.5 py-px rounded-full ${
                        active
                          ? "bg-base-100 text-base-700"
                          : "bg-base-200 text-base-500"
                      }`}
                    >
                      {counts[t.key]}
                    </span>
                  </button>
                );
              })}
            </div>
          }
          footer={
            <>
              <span className="tabular-nums">
                {rows.length} {rows.length === 1 ? "claim" : "claims"}
              </span>
              {anyFilter && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="hover:text-base-900 transition-colors"
                >
                  Reset filters
                </button>
              )}
            </>
          }
        >
          {isLoading && (
            <div
              className="flex-1 min-h-0 bg-white border border-base-200 rounded-t-[12px]"
              data-testid="supplier-claims-skeleton"
            >
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-14 border-b border-base-100 animate-pulse bg-base-50/40"
                />
              ))}
            </div>
          )}

          {isError && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-body">
              <div className="text-destructive font-semibold mb-2">
                Couldn&rsquo;t load claims
              </div>
              <div className="text-meta text-base-700 mb-3">
                {(error as Error | undefined)?.message ?? "Unknown error"}
              </div>
              <button
                type="button"
                onClick={() => void refetch()}
                className="btn-secondary text-label py-1.5 px-3"
              >
                Retry
              </button>
            </div>
          )}

          {!isLoading && !isError && (
            <DataTable
              rows={rows}
              columns={columns}
              rowId={(c) => c.id}
              /* The scroller is the KIT's div now, so the page's scroll
                 restore has to be able to find it. */
              testId="claims-table-scroll"
              rootRef={tableScrollRef}
              rowTestId="supplier-claim-row"
              /* Loo's rule ①: the columns take exactly what their content
                 measured and the leftover goes to a filler holding nothing. */
              sizing="content"
              label="Claims"
              empty={emptyLine}
              sort={sort}
              onSortChange={setSort}
              /* §8.2 — the whole row opens the claim. */
              onRowOpen={(c) => toggleClaim(c.id)}
              /* Rule ②: Expand has exactly ONE job — the line details of this
                 record. That is the claim panel, and nothing else may move in
                 here. ONE claim is open at a time by construction: the state
                 is a single id, so two open rows cannot be represented. */
              expansion={{
                expanded: openClaimId ? new Set([openClaimId]) : new Set<string>(),
                onToggle: (id) => toggleClaim(id),
                // The page's OWN existing words — no new string invented for
                // the control's accessible name.
                label: (c) => (openClaimId === c.id ? "Hide" : "Open"),
                render: (c) => (
                  <SupplierClaimPanel
                    claim={c}
                    supplierGroupUrl={groupUrlBySupplier.get(c.supplier_id) ?? null}
                  />
                ),
              }}
            />
          )}

        </ListPageShell>
      </div>
    </div>
  );
}

// R8 — the local `FacetRow` copy that used to sit here is DELETED. It was a
// third hand-written copy of a component that already exists at
// `@/components/FacetRow` (extracted by P2's Receiving half under UI-KIT §6.1),
// one import away, with an identical API and an identical rendered button.
// Deleting it is not the D0.5c extraction P2 reserves: that one is
// `PageShell`/`DataTable` and owns the BEHAVIOUR — the filtering, the clearing,
// the scroll restore, all of which stay in this file.
