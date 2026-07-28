// design-standard: not-a-list-page — Claims sits UNDER the Purchasing module
// tab bar, and UI-KIT §8.3's Module-tab law says a module-tabbed page must NOT
// render ListPageShell's breadcrumb + big title: they duplicate the active tab
// and burn ~80px Jess does not have. Same shape as its sibling To Order.
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  supplierClaimTypeLabel,
  supplierClaimStatusLabel,
  supplierClaimRequestLabel,
  supplierClaimResponseLabel,
  claimMoveOwnerLabel,
  SUPPLIER_CLAIM_LATE,
} from "@carres/shared";
import {
  useOperationSupplierClaims,
  useOperationSuppliers,
  type SupplierClaimListRow,
} from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";
import ListPageShell, { type ActiveChip } from "@/components/ListPageShell";
import { SectionCard, SectionBand } from "@/components/SectionPanel";
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
 * NOT touched, on purpose: the `Contact` wording and R3's own next-move
 * sentences. Those are ④ R8's rename sweep, and a rename is not a click
 * behaviour.
 */

type Tab = "open" | "closed" | "all";

const TABS: { key: Tab; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

/** COPY-STANDARD, PURCHASING dictionary — the five strings of this action, and
 *  the two of them a list page shows. Copied nowhere else; a queue tile's name
 *  IS its action, so it must read the same word the row line will read once R8
 *  lands the `Contact` → `Call` sweep on the R2/R3 screens. */
const QUEUE_TILE = "Confirm what happens next";
const QUEUE_EMPTY = "No claim is waiting for a supplier answer.";

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

export default function OperationSupplierClaims() {
  const [tab, setTab] = useState<Tab>("open");
  const [openClaimId, setOpenClaimId] = useState<string | null>(null);

  // ── §8.2 filter state — the three things this rail can pick ────────────────
  const [queueOnly, setQueueOnly] = useState(false);
  const [supplierFilter, setSupplierFilter] = useState<Set<string>>(new Set());
  const [problemFilter, setProblemFilter] = useState<Set<string>>(new Set());
  const [facetOpen, setFacetOpen] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

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
    () => claims.filter((c) => passesQueue(c) && passesSupplier(c) && passesProblem(c)),
    [claims, queueOnly, supplierFilter, problemFilter],
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

  return (
    <div className="h-full flex flex-col">
      <PurchasingTabs />
      {/* One line of what the page is for, then straight into the work. No big
          title: the active Purchasing tab already says "Claims" (§8.3). */}
      <div className="shrink-0 px-6 pt-3 text-[13px] text-base-600">
        What the supplier still owes us. Opened by receiving — damaged or wrong
        items — and by an ETA that passed with goods still pending delivery.
      </div>

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
                    className={`px-3 py-1.5 text-[12px] rounded cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                      active
                        ? "bg-white text-base-900 font-semibold shadow-sm"
                        : "text-base-600 font-medium hover:text-base-900"
                    }`}
                  >
                    <span>{t.label}</span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-px rounded-full ${
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
            <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm">
              <div className="text-destructive font-semibold mb-2">
                Couldn&rsquo;t load claims
              </div>
              <div className="text-[12px] text-base-700 mb-3">
                {(error as Error | undefined)?.message ?? "Unknown error"}
              </div>
              <button
                type="button"
                onClick={() => void refetch()}
                className="btn-secondary text-[11px] py-1.5 px-3"
              >
                Retry
              </button>
            </div>
          )}

          {!isLoading && !isError && (
            <div
              ref={tableScrollRef}
              data-testid="claims-table-scroll"
              className="flex-1 min-h-0 bg-white border border-base-200 rounded-t-[12px] overflow-auto"
            >
              <table
                className="w-full border-collapse text-[13px] [&_tbody_tr:nth-child(even)]:bg-base-100/70"
                style={{ minWidth: 1120 }}
              >
                <thead className="bg-base-700 border-b-2 border-primary text-white">
                  <tr>
                    <Th>Claim</Th>
                    <Th>Supplier</Th>
                    <Th>Item</Th>
                    <Th>Problem</Th>
                    <Th>PO</Th>
                    <Th>Reported</Th>
                    {/* The card's done-when, as a column. */}
                    <Th>Next move</Th>
                    {/* The Open button — no header word; it is not a fact. */}
                    <Th> </Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
                        className="p-12 text-center text-[12px] text-base-500"
                      >
                        {/* An empty state that is a real answer, not a shrug —
                            and when the queue is the thing that emptied it, the
                            answer is the dictionary's own. */}
                        {emptyLine}
                      </td>
                    </tr>
                  )}
                  {rows.map((c) => {
                    const expanded = openClaimId === c.id;
                    return (
                      <Fragment key={c.id}>
                        <tr
                          className="border-t border-base-100 align-top hover:bg-primary/5 cursor-pointer"
                          data-testid="supplier-claim-row"
                          aria-expanded={expanded}
                          onClick={() => toggleClaim(c.id)}
                        >
                          <td className="px-4 py-3 whitespace-nowrap font-mono font-semibold text-base-900">
                            {c.claim_no}
                            {c.status !== "open" && (
                              <div className="mt-1">
                                <span className="pill pill-neutral">
                                  {supplierClaimStatusLabel(c.status)}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-base-800">
                            {c.supplier_name ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-base-800">
                            <div>{c.sku}</div>
                            <div className="font-mono text-[10.5px] text-base-500 mt-0.5">
                              {c.qty} unit{c.qty === 1 ? "" : "s"}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={`pill ${claimPill(c.claim_type)}`}
                              data-testid={`claim-type-${c.claim_no}`}
                            >
                              {supplierClaimTypeLabel(c.claim_type)}
                            </span>
                            {c.note && (
                              <div className="text-[11px] text-base-600 mt-1">
                                {c.note}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap font-mono text-base-700">
                            {c.po_id}
                            {c.do_number && (
                              <div className="text-[10.5px] text-base-500 mt-0.5">
                                DO {c.do_number}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-base-700">
                            {fmtDate(c.reported_at)}
                            <div className="text-[10.5px] text-base-500 mt-0.5">
                              {/* A late-delivery claim is raised by the nightly
                                  sweep, so there is no human to name. Say so
                                  rather than printing a blank. */}
                              {c.reported_by_name ?? "System"}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {c.status === "closed" ? (
                              // A closed claim keeps BOTH sides on the row — the
                              // card's done-when, readable without opening it.
                              <div className="text-[12px] text-base-600">
                                Asked {supplierClaimRequestLabel(c.requested_action)}{" "}
                                → got {supplierClaimResponseLabel(c.supplier_response)}
                              </div>
                            ) : (
                              <div className="flex items-start gap-2">
                                <span
                                  className={`pill ${c.next_move.owner === "carres" ? "pill-overdue" : "pill-warning"} shrink-0`}
                                  data-testid={`claim-owner-${c.claim_no}`}
                                >
                                  {claimMoveOwnerLabel(
                                    c.next_move.owner,
                                    c.supplier_name,
                                  )}
                                </span>
                                <span
                                  className="text-[12px] text-base-800"
                                  data-testid={`claim-next-move-${c.claim_no}`}
                                >
                                  {c.next_move.label}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                // The whole row is the click target now (§8.2);
                                // the button stays for the people who reach for
                                // it, and must not toggle twice.
                                e.stopPropagation();
                                toggleClaim(c.id);
                              }}
                              className="btn-secondary text-[11px] py-1.5 px-3"
                              data-testid={`claim-open-${c.claim_no}`}
                            >
                              {expanded ? "Hide" : "Open"}
                            </button>
                            {c.photo_count > 0 && !expanded && (
                              <div className="text-[10.5px] text-base-500 mt-1">
                                {c.photo_count} photo{c.photo_count === 1 ? "" : "s"}
                              </div>
                            )}
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="bg-base-50">
                            <td colSpan={8} className="px-4 py-4">
                              <SupplierClaimPanel
                                claim={c}
                                supplierGroupUrl={
                                  groupUrlBySupplier.get(c.supplier_id) ?? null
                                }
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </ListPageShell>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.02em] text-white text-left">
      {children}
    </th>
  );
}

/** One facet cell — copied from the sibling To Order tab so the two halves of
 *  Purchasing read identically. The shared component is ⑧ D0.5c's job. */
function FacetRow({
  label,
  count,
  tone = "default",
  active,
  onClick,
  title,
  testId,
}: {
  label: string;
  count: number;
  tone?: "default" | "danger" | "muted";
  active?: boolean;
  onClick?: () => void;
  title?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      data-testid={testId}
      className={`w-full flex items-center gap-2 rounded-full text-left px-2.5 py-1.5 transition-colors ${
        active ? "bg-hovertint" : "hover:bg-hovertint"
      }`}
    >
      <span
        className={`min-w-0 truncate text-[13px] ${
          active ? "text-base-900 font-semibold" : "text-base-700"
        }`}
      >
        {label}
      </span>
      <span
        className={`ml-auto text-[12px] tabular-nums shrink-0 ${
          tone === "danger"
            ? "text-danger font-bold"
            : tone === "muted"
              ? "text-base-400"
              : "text-base-500 font-semibold"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
