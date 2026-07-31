/**
 * Purchasing → **To Order** — rebuilt from the Golden Template, 2026-07-31.
 *
 * Design System: `docs/03-page-patterns.md` → Review → Carres Examples owns the
 * region order; `docs/02-components.md` owns every box on this page. This file
 * is ASSEMBLY: it decides no business question and draws no component of its
 * own — the projection is `packages/shared/src/to-order.ts`, the arrangement
 * state machine is `./to-order-preview.ts`, and every visible string is
 * `TO_ORDER_WORDS` or composed from it.
 *
 * Shape (Queue pattern wrapping the Review workspace):
 *
 *     queue rail 320px       the Fiori-worklist rail as a THREE-LEVEL tree
 *                            (Loo, 2026-07-31): `Ready to issue` + total, then
 *                            category (icon) → supplier → small `PO n` rows.
 *                            Each level opens the next; the COUNT is the big
 *                            fact on every row; a lower level never repeats
 *                            what the level above already said. The rail is
 *                            scanned for numbers; a PO row is only the door to
 *                            the workspace. Zero actions here.
 *     workspace              ONE purchase order fills the pane
 *       PO bar               include · PO 1 of N · customer · SO
 *       Header line          ONE row of facts: supplier · category ····
 *                            Order by · production days · Destination
 *       Items                the review itself — the largest region
 *     not on any PO          only when applicable — belongs to the arrangement
 *     Issue                  count · the one blue-9 button · refusal reasons
 *
 * What is deliberately NOT here, each a ruling and not a gap:
 *
 *  · **No Supplier Communication region and no Notes region.** Both are blocked
 *    (`po_sends` does not exist; Notes has no ruled word). An unbuilt region is
 *    not rendered as an empty placeholder — a chevron that opens nothing is a
 *    dead control (Loo, 2026-07-31). The frozen region ORDER in
 *    `03-page-patterns.md` still holds; the regions join it when their data
 *    exists.
 *  · **No search box and no filter.** The old page's search was decoration —
 *    zero `<input>` in the entire file. The words stay in `TO_ORDER_WORDS` for
 *    the day the queue is long enough to need the real thing.
 *  · **Destination has ONE home: the Header line** (Loo's frozen draft,
 *    2026-07-31 — the header is the facts row, and Destination is a fact the
 *    operator may change). The Issue region states only the count, the button
 *    and why it refuses.
 *  · **The Header line is permanent, not collapsible.** Everything a header
 *    body would hold — the supplier's address, telephone, Attn, terms — has no
 *    column in `suppliers`, so there is nothing to open. It becomes collapsible
 *    the day those columns exist.
 *  · **Selection is `blue-3`, hover a faint blue tint** — `01-design-tokens.md`
 *    §2.3, "Never grey". The strong `blue-9` fill still appears exactly once,
 *    on `Issue Purchase Order`.
 *
 * The queue rail is page-local markup, tokens only: no kit component renders a
 * two-line picking list yet, and the kit's own law is that a component is
 * extracted on its second occurrence, not invented for its first.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  TO_ORDER_WORDS as W,
  categoryLabel,
  countOrders,
  issuedHeadline,
  itemsCount,
  moveToTarget,
  poIndexLabel,
  productionDaysLabel,
  purchaseOrderCount,
  unitLabel,
  unresolvedHeadline,
  type ToOrderBuildRef,
  type ToOrderProposal,
} from "@carres/shared";
import Button from "@/components/kit/Button";
import Card from "@/components/kit/Card";
import Checkbox from "@/components/kit/Checkbox";
import DataTable, { type Column } from "@/components/kit/DataTable";
import DropdownMenu, { type MenuItem } from "@/components/kit/DropdownMenu";
import EmptyState from "@/components/kit/EmptyState";
import Icon, { type IconName } from "@/components/kit/Icon";
import Loading from "@/components/kit/Loading";
import Panel from "@/components/kit/Panel";
import SectionHeader from "@/components/kit/SectionHeader";
import Select from "@/components/kit/Select";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { qk } from "@/lib/queries";
import PurchasingTabs from "./PurchasingTabs";
import {
  canRearrange,
  check as checkPlan,
  describe as describeDocs,
  initialState,
  moveBuild,
  removeBuild,
  removedBuilds,
  restoreBuild,
  splitOut,
  toggleInclude,
  type PreviewDoc,
  type PreviewState,
} from "./to-order-preview";

// ── Wire types ──────────────────────────────────────────────────────────────

interface Destination {
  id: string;
  name: string;
  isDefault: boolean;
}

interface Unresolved {
  sku: string;
  orderId: string;
  so: number | null;
}

interface ToOrderResponse {
  today: string;
  proposals: ToOrderProposal[];
  destinations: Destination[];
  /** Demand the catalog could not answer for. Empty is the only healthy value. */
  unresolved?: Unresolved[];
}

interface IssueResponse {
  supplier: string;
  destination: string;
  pos: { id: string; customer: string }[];
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function OperationToOrder() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const q = useQuery<ToOrderResponse>({
    queryKey: qk.operation.toOrder(),
    queryFn: () => apiFetch<ToOrderResponse>("/api/operation/purchase/to-order"),
    refetchOnWindowFocus: true,
  });

  const proposals = useMemo(() => q.data?.proposals ?? [], [q.data]);
  const destinations = useMemo(() => q.data?.destinations ?? [], [q.data]);
  const unresolved = useMemo(() => q.data?.unresolved ?? [], [q.data]);

  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const [destId, setDestId] = useState<string | null>(null);
  /**
   * Which purchase order fills the workspace — as a PAIR, so a pick can never
   * outlive its proposal: a doc key from another supplier simply does not
   * apply, and the pane falls back to the first document. Null = the first.
   */
  const [pickedDoc, setPickedDoc] = useState<{ proposal: string; doc: string } | null>(
    null,
  );
  const [issued, setIssued] = useState<IssueResponse | null>(null);
  /**
   * The arrangement. It lives here and nowhere else — a refresh drops it and
   * the server's own suggestion comes back, which is what keeps a Proposal a
   * computed view rather than a stored draft.
   */
  const [plan, setPlan] = useState<PreviewState | null>(null);

  const today = q.data?.today ?? null;

  // The default pick is the TOP of the rail — first bucket, then the walking
  // order (mattress → bedframe → sofa): the operator starts at the top and
  // clears down.
  const firstInSequence = useMemo(() => {
    const bucketRank = (p: ToOrderProposal) =>
      today ? BUCKET_ORDER.indexOf(bucketOf(p.orderBy, today)) : 0;
    return (
      [...proposals].sort(
        (a, b) =>
          bucketRank(a) - bucketRank(b) ||
          categoryRank(a.category) - categoryRank(b.category),
      )[0] ?? null
    );
  }, [proposals, today]);
  const current = proposals.find((p) => p.key === pickedKey) ?? firstInSequence;

  /**
   * Which categories are open. Category is the rail's ONLY fold (Loo,
   * 2026-07-31): inside it the purchase orders are CARDS, all visible — the
   * queue's job is to be cleared, and a card hidden behind a second fold is a
   * purchase order nobody issues. The most urgent category opens itself.
   */
  const [expandedCats, setExpandedCats] = useState<ReadonlySet<string>>(new Set());
  /** A ☑ pressed on a foreign card — applied once that proposal's plan loads. */
  const [pendingInclude, setPendingInclude] = useState<{
    proposal: string;
    doc: string;
  } | null>(null);

  // Follow the list when it changes under us — a proposal leaves once issued.
  useEffect(() => {
    if (pickedKey && !proposals.some((p) => p.key === pickedKey)) setPickedKey(null);
  }, [proposals, pickedKey]);

  useEffect(() => {
    if (destId) return;
    const def = destinations.find((d) => d.isDefault) ?? destinations[0];
    if (def) setDestId(def.id);
  }, [destinations, destId]);

  // Rebuild the arrangement whenever the proposal underneath it changes. The
  // picked document is NOT reset here — it is a pair, so a pick from another
  // proposal simply stops applying (proven by the cross-supplier pick test:
  // a reset here lands the pane on PO 1 instead of the row that was clicked).
  const currentKey = current?.key ?? null;
  useEffect(() => {
    setPlan(current ? initialState(current) : null);
  }, [currentKey, current]);

  // The current document's category always shows its cards.
  useEffect(() => {
    if (!currentKey) return;
    const cat = proposals.find((p) => p.key === currentKey)?.category;
    if (cat) setExpandedCats((s) => (s.has(cat) ? s : new Set(s).add(cat)));
  }, [currentKey, proposals]);

  // A ☑ pressed on a foreign card lands after its proposal's plan is rebuilt.
  useEffect(() => {
    if (!pendingInclude || pendingInclude.proposal !== currentKey || !plan) return;
    const doc = pendingInclude.doc;
    setPendingInclude(null);
    setPlan((st) => (st ? toggleInclude(st, doc) : st));
  }, [pendingInclude, currentKey, plan]);

  /**
   * The queue's structure, exactly as the frozen blueprint reads it: time
   * bucket → category (Loo's FIXED walking order: mattress → bedframe → sofa,
   * accessories reserved) → supplier. Empty buckets never render; suppliers
   * inside a category keep the proposals' own urgency order.
   */
  const buckets = useMemo(() => {
    const byBucket = new Map<BucketKey, ToOrderProposal[]>();
    for (const p of proposals) {
      const k = today ? bucketOf(p.orderBy, today) : "today";
      const arr = byBucket.get(k);
      if (arr) arr.push(p);
      else byBucket.set(k, [p]);
    }
    const groupByCategory = (ps: ToOrderProposal[]) => {
      const byCat = new Map<string, ToOrderProposal[]>();
      for (const p of ps) {
        const arr = byCat.get(p.category);
        if (arr) arr.push(p);
        else byCat.set(p.category, [p]);
      }
      return [...byCat.entries()]
        .map(([category, list]) => ({ category, proposals: list }))
        .sort((a, b) => categoryRank(a.category) - categoryRank(b.category));
    };
    return BUCKET_ORDER.filter((k) => byBucket.has(k)).map((k) => {
      const ps = byBucket.get(k)!;
      return {
        key: k,
        poCount: ps.reduce((n, p) => n + p.poCount, 0),
        groups: groupByCategory(ps),
      };
    });
  }, [proposals, today]);

  const docs = useMemo(
    () => (current && plan ? describeDocs(current, plan) : []),
    [current, plan],
  );
  const removed = useMemo(
    () => (current && plan ? removedBuilds(current, plan) : []),
    [current, plan],
  );
  const currentDoc =
    (pickedDoc && pickedDoc.proposal === currentKey
      ? docs.find((d) => d.key === pickedDoc.doc)
      : undefined) ??
    docs[0] ??
    null;

  /**
   * The rail's rows per proposal: the CURRENT one shows the live arrangement
   * (a split adds a row the moment it happens); every other expanded group
   * shows the server's own suggestion, which is exactly what picking it loads.
   */
  const railDocs = useMemo(() => {
    const m = new Map<string, PreviewDoc[]>();
    for (const p of proposals) {
      m.set(p.key, p.key === currentKey ? docs : describeDocs(p, initialState(p)));
    }
    return m;
  }, [proposals, currentKey, docs]);

  const verdict = useMemo(
    () => (current && plan ? checkPlan(current, plan) : null),
    [current, plan],
  );

  const issue = useMutation<IssueResponse, Error, void>({
    mutationFn: () => {
      if (!current || !destId || !plan) throw new Error("nothing to issue");
      return apiFetch<IssueResponse>("/api/operation/purchase/to-order/issue", {
        method: "POST",
        body: JSON.stringify({
          supplierId: current.supplierId,
          category: current.category,
          destinationId: destId,
          // The ARRANGEMENT only. No SKU, no quantity, no price — the server
          // reads those from its own recomputation.
          purchaseOrders: plan.docs.map((d) => ({
            key: d.key,
            include: d.include,
            buildKeys: d.buildKeys,
          })),
        }),
      });
    },
    onSuccess: (res) => {
      setIssued(res);
      setPickedKey(null);
      setPickedDoc(null);
      void qc.invalidateQueries({ queryKey: ["operation"] });
    },
  });

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-kit-slate-3">
      <PurchasingTabs />

      <div className="flex-1 min-h-0 flex gap-4 px-6 py-4 overflow-hidden">
        <QueueRail
          buckets={buckets}
          totalPos={proposals.reduce((n, p) => n + p.poCount, 0)}
          currentKey={current?.key ?? null}
          railDocs={railDocs}
          currentDocKey={currentDoc?.key ?? null}
          expandedCats={expandedCats}
          onToggleCat={(c) =>
            setExpandedCats((s) => {
              const n = new Set(s);
              if (n.has(c)) n.delete(c);
              else n.add(c);
              return n;
            })
          }
          onPickDoc={(proposalKey, docKey) => {
            if (proposalKey !== currentKey) setPickedKey(proposalKey);
            setPickedDoc({ proposal: proposalKey, doc: docKey });
            setIssued(null);
          }}
          onToggleInclude={(proposalKey, docKey) => {
            if (proposalKey === currentKey) {
              setPlan((st) => (st ? toggleInclude(st, docKey) : st));
            } else {
              // The ☑ on a foreign card first loads that proposal, then the
              // pending effect below applies the toggle to the fresh plan.
              setPickedKey(proposalKey);
              setPickedDoc({ proposal: proposalKey, doc: docKey });
              setPendingInclude({ proposal: proposalKey, doc: docKey });
              setIssued(null);
            }
          }}
          loading={q.isLoading}
        />

        <div className="flex-1 min-w-0 flex flex-col min-h-0 gap-3">
          {/* ── COMMANDS — the layer above the regions (Golden Template).
               `Create Proposal` is in the architecture, disabled until its
               card builds the manual entrance (Loo's Office rule: keep the
               slot visible, switch it on later). ── */}
          <div className="shrink-0 flex items-center gap-4" data-testid="to-order-commands">
            <span className="text-meta text-kit-slate-11 whitespace-nowrap">
              {W.planFor}{" "}
              <span className="text-kit-slate-12 tabular-nums">
                {today ? fmtDate(today) : "—"}
              </span>
            </span>
            <span className="ml-auto flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void q.refetch()}
                data-testid="to-order-recompute"
              >
                {W.workOutPlanAgain}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled
                data-testid="to-order-create-proposal"
              >
                {W.createProposal}
              </Button>
            </span>
          </div>

          {issued ? (
            <IssuedPanel
              result={issued}
              onOpenPurchaseOrders={() => navigate("/operation/procurement")}
            />
          ) : !current || !currentDoc ? (
            <EmptyPane loading={q.isLoading} error={q.error as Error | null} />
          ) : (
            <>
              <Workspace
                proposal={current}
                doc={currentDoc}
                index={docs.findIndex((d) => d.key === currentDoc.key) + 1}
                total={docs.length}
                destinations={destinations}
                destId={destId}
                onDest={setDestId}
                onRemove={(k) => setPlan((st) => (st ? removeBuild(st, k) : st))}
                onSplit={(k) => setPlan((st) => (st ? splitOut(st, [k]) : st))}
                onMove={(k, to) => setPlan((st) => (st ? moveBuild(st, k, to) : st))}
                onOpenOrder={(orderId) => navigate(`/operation/orders?order=${orderId}`)}
                // Numbered by QUEUE position, so the Move menu and the queue
                // call one document by one number. (The old page numbered the
                // filtered list, so `PO 2 of 2` read `Purchase Order 1` in
                // its own Move menu.)
                moveTargets={docs
                  .map((d, i) => ({ key: d.key, label: `Purchase Order ${i + 1}` }))
                  .filter((d) => d.key !== currentDoc.key)}
              />

              {/* An item taken off a document stays visible and can be put
                  back. It belongs to the whole arrangement, not to one
                  purchase order, which is why it sits outside the workspace. */}
              {removed.length > 0 ? (
                <div className="shrink-0" data-testid="to-order-removed">
                  <Panel title={W.removedHeading} padding="none">
                    <div className="px-4 py-2">
                      <div className="text-meta text-kit-slate-11">{W.removedHelp}</div>
                      {removed.map((b) => (
                        <div key={b.buildKey} className="flex items-center gap-3 py-1">
                          <span className="text-meta text-kit-slate-12 whitespace-nowrap">
                            {b.so != null ? `SO-${b.so}` : "—"} · {b.customer}
                          </span>
                          <span className="text-meta text-kit-slate-11 truncate">{b.title}</span>
                          <span className="ml-auto">
                            <Button
                              variant="ghost"
                              size="sm"
                              data-testid={`to-order-putback-${b.buildKey}`}
                              onClick={() =>
                                setPlan((st) =>
                                  st && current ? restoreBuild(st, current, b.buildKey) : st,
                                )
                              }
                            >
                              {W.putBack}
                            </Button>
                          </span>
                        </div>
                      ))}
                    </div>
                  </Panel>
                </div>
              ) : null}

              <IssueRegion
                proposal={current}
                unresolved={unresolved}
                count={verdict?.count ?? 0}
                blockedReason={verdict && !verdict.ok ? (verdict.message ?? null) : null}
                hasDestination={destId !== null}
                pending={issue.isPending}
                error={issue.error}
                onIssue={() => issue.mutate()}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Queue rail ──────────────────────────────────────────────────────────────

/** What the goods ARE → the glyph that says it. Only the three to-order categories. */
const CATEGORY_ICON: Record<string, IconName> = {
  mattress: "mattress",
  bedframe: "bedframe",
  sofa: "sofa",
};

/**
 * Loo's fixed walking order (2026-07-31). Accessories (pillow · mattress
 * protector) take the fourth slot when the reorder track joins To Order — an
 * unknown category lands after the sequence rather than crashing the sort.
 */
const CATEGORY_SEQUENCE = ["mattress", "bedframe", "sofa", "accessory"];

function categoryRank(c: string): number {
  const i = CATEGORY_SEQUENCE.indexOf(c);
  return i === -1 ? CATEGORY_SEQUENCE.length : i;
}

/**
 * The queue's OUTERMOST split — Loo's time buckets (2026-07-31): the bucket
 * name carries WHEN, so no row below it ever carries a date. Overdue is first
 * and red; an empty bucket is never rendered; no order-by date sinks to Later.
 */
type BucketKey = "overdue" | "today" | "tomorrow" | "thisWeek" | "nextWeek" | "later";

const BUCKET_ORDER: readonly BucketKey[] = [
  "overdue",
  "today",
  "tomorrow",
  "thisWeek",
  "nextWeek",
  "later",
];

function bucketOf(orderBy: string | null, today: string): BucketKey {
  if (!orderBy) return "later";
  if (orderBy < today) return "overdue";
  if (orderBy === today) return "today";
  const t = new Date(`${today}T00:00:00Z`).getTime();
  const d = new Date(`${orderBy}T00:00:00Z`).getTime();
  const diff = Math.round((d - t) / 86400000);
  if (diff === 1) return "tomorrow";
  // The week runs Monday–Sunday, same as the office calendar reads it.
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // Mon = 0
  const daysToNextMonday = 7 - dow;
  if (diff < daysToNextMonday) return "thisWeek";
  if (diff < daysToNextMonday + 7) return "nextWeek";
  return "later";
}

/**
 * The Fiori-worklist rail as a THREE-LEVEL tree (Loo, 2026-07-31):
 * category (icon) → supplier → purchase orders. Listing by listing — each
 * level opens the next, and only the deepest row selects. Three type sizes
 * only: the COUNT is the big fact — the rail answers "how many purchase
 * orders do I owe" at a glance — and a PO row is small because it is only the
 * door to the workspace. The rail carries ZERO actions: expanding changes
 * nothing, and only picking a PO row changes the pane.
 *
 * Page-local markup, tokens only — no kit component renders a picking list
 * yet. It is extracted into the kit on its second occurrence, per the kit's
 * own law, not invented for its first.
 */
const BUCKET_LABEL: Record<BucketKey, string> = {
  overdue: W.bucketOverdue,
  today: W.bucketToday,
  tomorrow: W.bucketTomorrow,
  thisWeek: W.bucketThisWeek,
  nextWeek: W.bucketNextWeek,
  later: W.bucketLater,
};

function QueueRail({
  buckets,
  totalPos,
  currentKey,
  railDocs,
  currentDocKey,
  expandedCats,
  onToggleCat,
  onPickDoc,
  onToggleInclude,
  loading,
}: {
  buckets: readonly {
    key: BucketKey;
    poCount: number;
    groups: readonly { category: string; proposals: ToOrderProposal[] }[];
  }[];
  totalPos: number;
  currentKey: string | null;
  /** Rows per proposal — live for the current one, the default for the rest. */
  railDocs: ReadonlyMap<string, PreviewDoc[]>;
  currentDocKey: string | null;
  expandedCats: ReadonlySet<string>;
  onToggleCat: (category: string) => void;
  onPickDoc: (proposalKey: string, docKey: string) => void;
  onToggleInclude: (proposalKey: string, docKey: string) => void;
  loading: boolean;
}) {
  return (
    <aside
      className="w-[320px] shrink-0 flex flex-col min-h-0 overflow-y-auto"
      data-testid="to-order-queue"
    >
      <div className="flex items-baseline gap-2 px-2 pb-2 mb-1 border-b border-kit-slate-6">
        <span className="text-label text-kit-slate-11">{W.readyToIssue}</span>
        <span
          className="ml-auto text-body font-semibold text-kit-slate-12 tabular-nums"
          data-testid="to-order-queue-total"
        >
          {totalPos}
        </span>
      </div>

      {loading && buckets.length === 0 ? (
        <div className="px-3 py-2">
          <Loading variant="skeleton" lines={3} label="Loading purchase orders" />
        </div>
      ) : (
        buckets.map((b) => (
          <div key={b.key} className="pt-3 first:pt-0">
            {/* ── The time bucket — the queue's outermost split. Its NAME
                 carries when, so no row below carries a date; Overdue is red
                 and always first; an empty bucket was never rendered. ── */}
            <div
              className="flex items-baseline gap-2 px-2 pb-1"
              data-testid={`to-order-bucket-${b.key}`}
            >
              <span
                className={
                  b.key === "overdue"
                    ? "text-label text-kit-red-11"
                    : "text-label text-kit-slate-11"
                }
              >
                {BUCKET_LABEL[b.key]}
              </span>
              <span
                className={[
                  "ml-auto text-meta font-medium tabular-nums",
                  b.key === "overdue" ? "text-kit-red-11" : "text-kit-slate-11",
                ].join(" ")}
              >
                {b.poCount}
              </span>
            </div>

            {b.groups.map((g) => {
              const catOpen = expandedCats.has(g.category);
              return (
                <div key={g.category}>
              {/* ── Level 1 · the category — GitHub's sidebar voice (Loo,
                   2026-07-31): every level reads the SAME dark size; the
                   hierarchy is carried by the icon, the indent and the guide
                   line, never by shrinking the word. ── */}
              <button
                type="button"
                onClick={() => onToggleCat(g.category)}
                data-testid={`to-order-category-${g.category}`}
                aria-expanded={catOpen}
                className="flex w-full items-center gap-2 text-left rounded-control px-2 py-1.5 mb-px hover:bg-kit-blue-3"
              >
                <span className="text-kit-slate-11">
                  <Icon name={catOpen ? "expand" : "forward"} size={16} />
                </span>
                <span className="text-kit-slate-11">
                  <Icon name={CATEGORY_ICON[g.category] ?? "goods"} size={16} />
                </span>
                {/* Icon + word and NOTHING else — no count, no date (Loo,
                    2026-07-31: a second number on the title is what made the
                    rail unreadable; urgency lives in the workspace header). */}
                <span className="text-body font-medium text-kit-slate-12 truncate">
                  {categoryLabel(g.category)}
                </span>
              </button>

              {/* ── Inside an open category: supplier section headers + one
                   CARD per purchase order, ALL visible (Loo, 2026-07-31: the
                   queue is cleared card by card — no second fold). ──────── */}
              {catOpen
                ? g.proposals.map((p) => {
                    const docs = railDocs.get(p.key) ?? [];
                    return (
                      <div key={p.key}>
                        <div
                          data-testid={`to-order-proposal-${p.key}`}
                          className="flex items-center gap-2 px-2 pt-2 pb-1"
                        >
                          <span className="text-kit-slate-11">
                            <Icon name="supplier" size={14} />
                          </span>
                          {/* The category said what the goods are — the
                              section says WHO makes them and WHY we buy
                              (the Source; only Customer Order exists until
                              Create Proposal builds the manual entrance). */}
                          <span className="text-meta font-medium text-kit-slate-11 truncate">
                            {p.supplierName} · {W.sourceCustomerOrder}
                          </span>
                        </div>

                        <div className="flex flex-col gap-2 px-2 pb-1">
                          {docs.map((d) => (
                            <PoCard
                              key={d.key}
                              doc={d}
                              on={p.key === currentKey && d.key === currentDocKey}
                              dimmed={p.key === currentKey && !d.include}
                              onPick={() => onPickDoc(p.key, d.key)}
                              onToggleInclude={() => onToggleInclude(p.key, d.key)}
                              testId={`to-order-doc-${p.key}-${d.key}`}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })
                : null}
                </div>
              );
            })}
          </div>
        ))
      )}
    </aside>
  );
}

/**
 * One purchase order = one CARD (Loo, 2026-07-31 — the queue is a card list
 * cleared card by card). This page controls ORDERS, not customers, so the
 * title is the SO number; a consolidated document spans many orders and has
 * no number yet (nothing exists before Issue, by the 2026-07-30 ruling), so
 * it is titled by its count — `12 orders` — and its second line READS the
 * orders out: `SO-1203 · SO-1212 · +10`. No customer name, no date, no items.
 * Where-you-are is GitHub's shape in the kit's colours: a STRAIGHT `blue-9`
 * bar on the card's left edge + `blue-3` fill; only the right corners round.
 */
function PoCard({
  doc,
  on,
  dimmed,
  onPick,
  onToggleInclude,
  testId,
}: {
  doc: PreviewDoc;
  on: boolean;
  dimmed: boolean;
  onPick: () => void;
  onToggleInclude: () => void;
  testId: string;
}) {
  // Counted by ORDER (an order can lack an SO number); the preview line reads
  // only the numbers that exist.
  const orders = new Set(doc.builds.map((b) => b.orderId)).size;
  const sos = [
    ...new Set(doc.builds.map((b) => b.so).filter((s): s is number => s != null)),
  ];
  return (
    <div
      data-testid={testId}
      aria-current={on ? "true" : undefined}
      className={[
        "relative rounded-card border border-kit-slate-5 px-3 py-2",
        on ? "bg-kit-blue-3" : "bg-white hover:bg-kit-blue-3",
        dimmed ? "opacity-40" : "",
      ].join(" ")}
    >
      {/* The where-you-are bar — a STRAIGHT 2px line (GitHub's own shape:
          inset from the corners, so the card's radius never curves it). */}
      {on ? (
        <span
          aria-hidden
          className="absolute left-0 top-1 bottom-1 w-0.5 bg-kit-blue-9"
        />
      ) : null}
      <div className="flex items-start gap-2">
        {/* PayEm's ☑, made ours: include in THIS issue. Unticking changes
            nothing about the customer's order; a refresh puts it back. */}
        <Checkbox
          id={`${testId}-include`}
          ariaLabel={W.include}
          checked={doc.include}
          onCheckedChange={onToggleInclude}
        />
        <button type="button" onClick={onPick} className="flex-1 min-w-0 text-left">
          <div className="text-body font-medium text-kit-slate-12 truncate tabular-nums">
            {doc.so != null ? `SO-${doc.so}` : countOrders(orders)}
          </div>
          {doc.so == null && sos.length > 0 ? (
            <div className="text-meta text-kit-slate-11 truncate tabular-nums">
              {sos
                .slice(0, 2)
                .map((s) => `SO-${s}`)
                .join(" · ")}
              {sos.length > 2 ? ` · +${sos.length - 2}` : ""}
            </div>
          ) : null}
        </button>
      </div>
    </div>
  );
}

// ── Workspace — one purchase order ──────────────────────────────────────────

interface MoveTarget {
  key: string;
  /** `Purchase Order 2` — what the operator sees, composed by the page. */
  label: string;
}

/**
 * ONE purchase order fills the pane. Region order is the frozen Carres Example;
 * the two blocked regions (Supplier Communication · Notes) are absent, not
 * empty — they join when their data exists.
 */
function Workspace({
  proposal,
  doc,
  index,
  total,
  destinations,
  destId,
  onDest,
  moveTargets,
  onRemove,
  onSplit,
  onMove,
  onOpenOrder,
}: {
  proposal: ToOrderProposal;
  doc: PreviewDoc;
  index: number;
  total: number;
  destinations: Destination[];
  destId: string | null;
  onDest: (id: string) => void;
  moveTargets: readonly MoveTarget[];
  onRemove: (buildKey: string) => void;
  onSplit: (buildKey: string) => void;
  onMove: (buildKey: string, toKey: string) => void;
  onOpenOrder: (orderId: string) => void;
}) {
  const rearrange = canRearrange(proposal);

  const columns: readonly Column<ToOrderBuildRef>[] = [
    {
      key: "ref",
      label: W.itemsColRef,
      width: 16,
      cell: (b) => (b.so != null ? `SO-${b.so}` : "—"),
    },
    {
      key: "item",
      label: W.itemsColItem,
      width: 44,
      // The ordinal only when a sibling would read identically — PETER's two
      // Booqits are different sofas and an operator removing one has to know
      // which. It is NOT `title`: that carries the size, and Size is a column.
      cell: (b) =>
        b.ordinal != null
          ? `${unitLabel(proposal.category, 1)} ${b.ordinal} — ${b.model}`
          : b.model,
    },
    {
      key: "size",
      // Null where the category HAS no size, which is a different fact from
      // nobody having typed one — every sofa reads the dash for the first
      // reason and no mattress can read it for the second.
      label: W.itemsColSize,
      width: 16,
      cell: (b) => b.size ?? "—",
    },
    {
      key: "qty",
      label: W.itemsColQty,
      width: 12,
      align: "right",
      numeric: true,
      cell: (b) => b.qty,
    },
    {
      key: "action",
      label: W.itemsColAction,
      width: 12,
      align: "right",
      cell: (b) => (
        <DropdownMenu
          label={W.itemsMenu}
          trigger={
            <Button
              variant="ghost"
              size="sm"
              aria-label={W.itemsMenu}
              data-testid={`items-menu-${b.buildKey}`}
            >
              <Icon name="overflow" size={16} />
            </Button>
          }
          items={menuFor(b)}
        />
      ),
    },
  ];

  function menuFor(b: ToOrderBuildRef): MenuItem[] {
    const items: MenuItem[] = [];
    // Move is the SECOND step, never the first: until a split has happened
    // there is nowhere to move to, and a menu item with no destination is a
    // dead end wearing a verb (Loo, 2026-07-31).
    if (rearrange) {
      for (const t of moveTargets) {
        items.push({
          key: `move-${t.key}`,
          label: moveToTarget(t.label),
          onSelect: () => onMove(b.buildKey, t.key),
        });
      }
      items.push({
        key: "split",
        label: W.itemsSplit,
        onSelect: () => onSplit(b.buildKey),
      });
    }
    items.push({
      key: "remove",
      label: W.itemsRemove,
      onSelect: () => onRemove(b.buildKey),
    });
    items.push({
      key: "open",
      label: W.itemsOpenOrder,
      separatorBefore: true,
      onSelect: () => onOpenOrder(b.orderId),
    });
    return items;
  }

  const units = doc.builds.reduce((n, b) => n + b.qty, 0);
  const auditSos = [
    ...new Set(doc.builds.map((b) => b.so).filter((s): s is number => s != null)),
  ];

  return (
    <div
      className="flex-1 min-h-0 flex flex-col bg-white border border-kit-slate-5 rounded-card overflow-hidden"
      data-testid="to-order-workspace"
    >
      {/* ── PO bar — which document. The ☑ lives on the queue card now
           (PayEm's shape, Loo 2026-07-31) — one home, not two. ──────────── */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-kit-slate-5">
        <span className="text-body font-medium text-kit-slate-12 whitespace-nowrap">
          {poIndexLabel(index, total)}
        </span>
        {doc.customer != null ? (
          <span className="text-body text-kit-slate-12 truncate">{doc.customer}</span>
        ) : null}
        {doc.so != null ? (
          <span className="text-meta text-kit-slate-11 whitespace-nowrap">SO-{doc.so}</span>
        ) : null}
      </div>

      {!doc.include ? (
        <div className="shrink-0 px-4 py-1.5 text-meta text-kit-slate-11">
          {W.includeOffHelp}
        </div>
      ) : null}

      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-kit-slate-6">
        {/* ── Header — ONE row of facts (Loo's frozen draft, 2026-07-31):
             supplier · category ···· Order by · production days · Destination.
             Destination lives HERE and nowhere else — it is a fact of the
             purchase order the operator may change, not part of the commit.
             Permanent line until `suppliers` has columns to open. ── */}
        <section data-testid="to-order-header">
          <SectionHeader
            title={proposal.label}
            testId="to-order-header-line"
            meta={
              <span className="flex items-baseline gap-3">
                {proposal.orderBy ? (
                  <span className="tabular-nums whitespace-nowrap">
                    Order by {fmtDate(proposal.orderBy)}
                  </span>
                ) : null}
                {proposal.productionDays != null ? (
                  <span
                    className="tabular-nums whitespace-nowrap"
                    data-testid="to-order-production-days"
                  >
                    {productionDaysLabel(proposal.productionDays)}
                  </span>
                ) : null}
              </span>
            }
            action={
              <span className="flex items-center gap-2" data-testid="to-order-destination">
                {/* htmlFor names the Radix trigger, so the compact control
                    keeps its accessible name without a label row above it. */}
                <label
                  htmlFor="to-order-destination-select"
                  className="text-meta text-kit-slate-11"
                >
                  {W.destination}
                </label>
                <span className="w-44">
                  <Select
                    id="to-order-destination-select"
                    value={destId ?? undefined}
                    onValueChange={onDest}
                    options={destinations.map((d) => ({ value: d.id, label: d.name }))}
                  />
                </span>
              </span>
            }
          />
        </section>

        {/* ── Planning & Audit — how this proposal came to be. NEVER
             communication: nothing exists to say to a supplier before Issue
             (Loo's ruling, 2026-07-31). v1 states the one stored fact that
             exists — which customer orders the system generated it from. ── */}
        {auditSos.length > 0 ? (
          <section data-testid="to-order-audit">
            <SectionHeader title={W.planningAudit} testId="to-order-audit-header" />
            <div className="px-4 py-2 text-meta text-kit-slate-11">
              <span className="font-medium text-kit-slate-12">
                {W.systemGeneratedFrom}
              </span>{" "}
              <span className="tabular-nums">
                {auditSos.map((s) => `SO-${s}`).join(" · ")}
              </span>
            </div>
          </section>
        ) : null}

        {/* ── Items — the region the review happens in ─────────────────── */}
        <section data-testid="to-order-items">
          <SectionHeader
            title={W.itemsHeading}
            testId="to-order-items-header"
            meta={
              <span className="tabular-nums" data-testid="to-order-items-count">
                {itemsCount(doc.builds.length, units)}
              </span>
            }
          />
          <DataTable
            rows={doc.builds}
            columns={columns}
            rowId={(b) => b.buildKey}
            empty={W.itemsEmpty}
            label={W.itemsTableLabel}
          />
        </section>
      </div>
    </div>
  );
}

// ── Issue — the one primary action ──────────────────────────────────────────

function IssueRegion({
  proposal,
  unresolved,
  count,
  blockedReason,
  hasDestination,
  pending,
  error,
  onIssue,
}: {
  proposal: ToOrderProposal;
  unresolved: Unresolved[];
  /** How many documents the arrangement would create, live. */
  count: number;
  /** Why the arrangement cannot be issued, in the operator's words. */
  blockedReason: string | null;
  /** Destination lives in the Header; this region only states its absence. */
  hasDestination: boolean;
  pending: boolean;
  error: Error | null;
  onIssue: () => void;
}) {
  const blocked = proposal.blocked === "production_days";
  // A requirement the catalog could not answer for belongs to nobody in
  // particular — so it stops EVERY issue, not just this supplier's. Refusing at
  // the button beats refusing after the click.
  const unread = unresolved.length > 0;
  const badPlan = blockedReason !== null;

  return (
    <div className="shrink-0" data-testid="to-order-action">
      <Card>
        {unread ? (
          <div className="mb-2" data-testid="to-order-unresolved">
            <div className="text-body font-medium text-kit-slate-12">
              {unresolvedHeadline(unresolved.length)}
            </div>
            <div className="text-meta text-kit-slate-11">{W.unresolvedHelp}</div>
            <div className="text-meta text-kit-slate-11">
              {unresolved
                .slice(0, 6)
                .map((u) => `${u.so != null ? `SO-${u.so}` : "—"} · ${u.sku}`)
                .join("  ·  ")}
            </div>
          </div>
        ) : blocked ? (
          <div className="mb-2">
            <div className="text-body font-medium text-kit-slate-12">
              {W.productionDaysRequired}
            </div>
            <div className="text-meta text-kit-slate-11">{W.productionDaysHelp}</div>
          </div>
        ) : badPlan ? (
          <div className="mb-2 text-meta text-kit-slate-12" data-testid="to-order-plan-blocked">
            {blockedReason}
          </div>
        ) : !hasDestination ? (
          // Only when no destination is configured at all — the header's
          // select defaults itself the moment one exists.
          <div className="mb-2 text-meta text-kit-slate-12" data-testid="to-order-no-destination">
            {W.destinationRequired}
          </div>
        ) : null}

        {error ? (
          <div className="mb-2 text-meta text-kit-red-11" role="alert">
            {error.message}
          </div>
        ) : null}

        <div className="flex items-center gap-4 flex-wrap">
          {/* The count follows the arrangement, not the system's first guess. */}
          <span
            className="ml-auto text-body font-medium text-kit-slate-12 tabular-nums whitespace-nowrap"
            data-testid="to-order-count"
          >
            {purchaseOrderCount(count)}
          </span>

          <Button
            variant="primary"
            onClick={onIssue}
            disabled={blocked || unread || badPlan || pending || !hasDestination}
            loading={pending}
            data-testid="to-order-issue"
          >
            {W.issue}
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ── Result and empty ────────────────────────────────────────────────────────

function IssuedPanel({
  result,
  onOpenPurchaseOrders,
}: {
  result: IssueResponse;
  onOpenPurchaseOrders: () => void;
}) {
  return (
    <div className="shrink-0" data-testid="to-order-issued">
      <Panel title={issuedHeadline(result.pos.length, result.supplier)}>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          {result.pos.map((p) => (
            <div key={p.id} className="flex items-baseline gap-2 text-body">
              <span className="text-meta text-kit-slate-12 tabular-nums">{p.id}</span>
              <span className="text-kit-slate-11 truncate">{p.customer}</span>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-4 flex-wrap">
          <span className="text-meta text-kit-slate-11">{W.nextStep}</span>
          <span className="ml-auto">
            <Button
              variant="primary"
              onClick={onOpenPurchaseOrders}
              data-testid="to-order-open-pos"
            >
              {W.openPurchaseOrders}
            </Button>
          </span>
        </div>
      </Panel>
    </div>
  );
}

function EmptyPane({ loading, error }: { loading: boolean; error: Error | null }) {
  return (
    <div className="flex-1 min-h-0" data-testid="to-order-empty">
      <Card padding={loading ? "normal" : "none"}>
        {loading ? (
          <Loading variant="skeleton" lines={4} label="Loading purchase orders" />
        ) : (
          <EmptyState title={error ? error.message : W.empty} />
        )}
      </Card>
    </div>
  );
}
