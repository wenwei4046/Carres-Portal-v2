import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Filter, Search } from "lucide-react";
import {
  TO_ORDER_WORDS as W,
  issuedHeadline,
  itemsCount,
  purchaseOrderCount,
  unresolvedHeadline,
  type ToOrderProposal,
} from "@carres/shared";
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
import PurchaseOrderWorkspace from "./purchase-order/PurchaseOrderWorkspace";
import PurchasingTabs from "./PurchasingTabs";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { qk } from "@/lib/queries";

/**
 * Purchasing → **To Order** — the Planning Workspace.
 *
 * One question: *goods we do not have yet — how far along is each one?* The
 * page is a REVIEW surface, so it is a dense sortable grid rather than a wall
 * of cards: an operator scans, compares, spots the outlier and commits. A card
 * can only be read; a grid can be worked.
 *
 * Shape, frozen with Loo 2026-07-30:
 *
 *   sidebar 300px          which slice of purchasing, and when its PO is due out
 *   review grid            one row = one customer order = one future PO
 *   sticky action          destination · how many POs · the one blue button
 *
 * The rules that are not visual, and where they live:
 *
 *  · **Nothing is stored.** Proposals are recomputed on every read, so this
 *    page has no status, no hold, no audit and no lifecycle of its own.
 *  · **Qty counts sofas, not module lines** — `buildToOrder` in
 *    `packages/shared/src/to-order.ts` owns that, and every other business rule
 *    on this page with it. This file decides no business question.
 *  · **An exception replaces the value in its OWN cell.** There is no status
 *    column and no warning icon: nobody should read a ⚠ and then hunt for
 *    which column caused it.
 *  · **Blue appears once**, on `Issue Purchase Order`. Current row, hover and
 *    the expanded row are all grey — an accent that marks four things marks
 *    nothing.
 *
 * This replaces the 2026-07-22 three-stage cockpit whole. That page put Send /
 * Chase / Receive on one screen; `Check in` has since moved to Receiving on the
 * deadline-anchor boundary, and what is left is one job — review demand and
 * issue the documents.
 */

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

export default function OperationPurchase() {
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
  /** Which purchase order fills the workspace. Null = the first one. */
  const [pickedDoc, setPickedDoc] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssueResponse | null>(null);
  /**
   * The arrangement. It lives here and nowhere else — a refresh drops it and
   * the server's own suggestion comes back, which is what keeps a Proposal a
   * computed view rather than a stored draft.
   */
  const [plan, setPlan] = useState<PreviewState | null>(null);

  const current = proposals.find((p) => p.key === pickedKey) ?? proposals[0] ?? null;

  // Follow the list when it changes under us — a proposal leaves once issued.
  useEffect(() => {
    if (pickedKey && !proposals.some((p) => p.key === pickedKey)) setPickedKey(null);
  }, [proposals, pickedKey]);

  useEffect(() => {
    if (destId) return;
    const def = destinations.find((d) => d.isDefault) ?? destinations[0];
    if (def) setDestId(def.id);
  }, [destinations, destId]);

  // Rebuild the arrangement whenever the proposal underneath it changes.
  const currentKey = current?.key ?? null;
  useEffect(() => {
    setPlan(current ? initialState(current) : null);
    setPickedDoc(null);
  }, [currentKey, current]);

  const docs = useMemo(
    () => (current && plan ? describeDocs(current, plan) : []),
    [current, plan],
  );
  const removed = useMemo(
    () => (current && plan ? removedBuilds(current, plan) : []),
    [current, plan],
  );
  const currentDoc = docs.find((d) => d.key === pickedDoc) ?? docs[0] ?? null;

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
    <div className="flex-1 min-h-0 flex flex-col bg-base-100">
      <PurchasingTabs />

      <div className="flex-1 min-h-0 flex gap-4 px-6 py-4 overflow-hidden">
        <Sidebar
          proposals={proposals}
          currentKey={current?.key ?? null}
          docs={docs}
          currentDocKey={currentDoc?.key ?? null}
          onPickDoc={setPickedDoc}
          onPick={(k) => {
            setPickedKey(k);
            setPickedDoc(null);
            setIssued(null);
          }}
          loading={q.isLoading}
        />

        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          {issued ? (
            <IssuedPanel
              result={issued}
              onOpenPurchaseOrders={() => navigate("/operation/procurement")}
            />
          ) : !current || !currentDoc ? (
            <EmptyPanel loading={q.isLoading} error={q.error as Error | null} />
          ) : (
            <>
              <PurchaseOrderWorkspace
                doc={currentDoc}
                index={docs.findIndex((d) => d.key === currentDoc.key) + 1}
                total={docs.length}
                supplierLabel={current.label}
                destinationName={destinations.find((d) => d.id === destId)?.name ?? null}
                orderByLabel={current.orderBy ? `Order by ${fmtDate(current.orderBy)}` : null}
                category={current.category}
                canRearrange={canRearrange(current)}
                moveTargets={docs
                  .filter((d) => d.key !== currentDoc.key)
                  .map((d, i) => ({ key: d.key, label: `Purchase Order ${i + 1}` }))}
                onInclude={() =>
                  setPlan((st) => (st ? toggleInclude(st, currentDoc.key) : st))
                }
                onRemove={(k) => setPlan((st) => (st ? removeBuild(st, k) : st))}
                onSplit={(k) => setPlan((st) => (st ? splitOut(st, [k]) : st))}
                onMove={(k, to) => setPlan((st) => (st ? moveBuild(st, k, to) : st))}
                onOpenOrder={(orderId) => navigate(`/operation/orders?order=${orderId}`)}
              />

              {/* Existing behaviour, deliberately preserved through the
                  rebuild: an item taken off a document stays visible and can
                  be put back. It is not one of the five regions — it belongs
                  to the whole arrangement, not to one purchase order. */}
              {removed.length > 0 ? (
                <div
                  className="shrink-0 mt-3 bg-white border border-base-200 rounded-[8px] px-4 py-3"
                  data-testid="to-order-removed"
                >
                  <div className="text-meta font-semibold text-base-900">{W.removedHeading}</div>
                  <div className="text-meta text-base-600 mb-1.5">{W.removedHelp}</div>
                  {removed.map((b) => (
                    <div key={b.buildKey} className="flex items-baseline gap-3 py-1">
                      <span className="text-meta text-base-900">
                        {b.so != null ? `SO-${b.so}` : "—"} · {b.customer}
                      </span>
                      <span className="text-meta text-base-600 truncate">{b.title}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setPlan((st) => (st && current ? restoreBuild(st, current, b.buildKey) : st))
                        }
                        data-testid={`to-order-putback-${b.buildKey}`}
                        className="ml-auto text-meta text-base-900 underline underline-offset-2"
                      >
                        {W.putBack}
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <StickyAction
                proposal={current}
                unresolved={unresolved}
                count={verdict?.count ?? 0}
                blockedReason={verdict && !verdict.ok ? (verdict.message ?? null) : null}
                destinations={destinations}
                destId={destId}
                onDest={setDestId}
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

// ── Sidebar ─────────────────────────────────────────────────────────────────

/**
 * The queue — which slice of purchasing, and which document inside it.
 *
 * The purchase orders of the SELECTED supplier nest under it, because the
 * workspace shows one document at a time and this is where an operator picks
 * which. Splitting an item adds a row here the moment it happens.
 */
function Sidebar({
  proposals,
  currentKey,
  docs,
  currentDocKey,
  onPick,
  onPickDoc,
  loading,
}: {
  proposals: ToOrderProposal[];
  currentKey: string | null;
  /** Documents of the CURRENT proposal only. */
  docs: PreviewDoc[];
  currentDocKey: string | null;
  onPick: (key: string) => void;
  onPickDoc: (key: string) => void;
  loading: boolean;
}) {
  return (
    <aside className="w-[300px] shrink-0 flex flex-col min-h-0" data-testid="to-order-sidebar">
      <div className="flex items-center gap-2 px-1 pb-2.5">
        <span className="flex-1 min-w-0 flex items-center gap-1.5 text-base-500 text-body">
          <Search size={15} strokeWidth={2} aria-hidden />
          <span title={W.searchLabel} aria-label={W.searchLabel}>
            {W.searchPlaceholder}
          </span>
        </span>
        <span className="text-base-500" title={W.filterLabel} aria-label={W.filterLabel}>
          <Filter size={15} strokeWidth={2} aria-hidden />
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading && proposals.length === 0 ? (
          <div className="px-3 py-2 text-meta text-base-500">…</div>
        ) : (
          proposals.map((p) => {
            const on = p.key === currentKey;
            return (
              <div key={p.key}>
                <button
                type="button"
                onClick={() => onPick(p.key)}
                data-testid={`to-order-proposal-${p.key}`}
                aria-current={on ? "true" : undefined}
                className={[
                  "block w-full text-left rounded-[6px] pl-3.5 pr-2.5 pt-2 pb-2.5 mb-px",
                  // Grey, never blue. The only blue on this page is the button.
                  on ? "bg-base-200" : "hover:bg-base-100",
                ].join(" ")}
              >
                <div className="text-body font-semibold text-base-900 truncate">{p.label}</div>
                <div className="text-meta text-base-600 truncate">
                  {purchaseOrderCount(p.poCount)} ·{" "}
                  {p.orderBy ? (
                    <>
                      Order by{" "}
                      <span className="text-base-900 tabular-nums">{fmtDate(p.orderBy)}</span>
                    </>
                  ) : (
                    W.noDeliveryDate
                  )}
                </div>
                </button>
                {on
                  ? docs.map((d, i) => (
                      <DocRow
                        key={d.key}
                        doc={d}
                        index={i + 1}
                        total={docs.length}
                        on={d.key === currentDocKey}
                        onPick={() => onPickDoc(d.key)}
                      />
                    ))
                  : null}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

/** One purchase order in the queue, under its supplier. */
function DocRow({
  doc,
  index,
  total,
  on,
  onPick,
}: {
  doc: PreviewDoc;
  index: number;
  total: number;
  on: boolean;
  onPick: () => void;
}) {
  const units = doc.builds.reduce((n, b) => n + b.qty, 0);
  return (
    <button
      type="button"
      onClick={onPick}
      data-testid={`to-order-doc-${doc.key}`}
      aria-current={on ? "true" : undefined}
      className={[
        "block w-full text-left rounded-[6px] pl-6 pr-2.5 py-1.5 mb-px",
        on ? "bg-base-200" : "hover:bg-base-100",
        doc.include ? "" : "opacity-50",
      ].join(" ")}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-meta font-semibold text-base-900 whitespace-nowrap">
          PO {index} of {total}
        </span>
        {doc.customer != null ? (
          <span className="text-meta text-base-600 truncate">{doc.customer}</span>
        ) : null}
        <span className="ml-auto text-meta text-base-600 whitespace-nowrap tabular-nums">
          {itemsCount(doc.builds.length, units)}
        </span>
      </div>
    </button>
  );
}

// ── Purchase Order Preview ──────────────────────────────────────────────────

/**
 * What pressing Issue would create — before it exists.
 *
 * One block per future purchase order. Nothing here is a status: `Include in
 * this issue` decides whether a document goes out THIS time and nothing else,
 * and `Remove from this Purchase Order` takes an item off a document without
 * touching the customer's order. Every one of these lives in this tab until the
 * page is refreshed.
 */
// ── Sticky action ───────────────────────────────────────────────────────────

function StickyAction({
  proposal,
  unresolved,
  count,
  blockedReason,
  destinations,
  destId,
  onDest,
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
  destinations: Destination[];
  destId: string | null;
  onDest: (id: string) => void;
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
    <div
      className="shrink-0 mt-2.5 bg-white border border-base-200 rounded-[8px] px-3.5 py-2"
      data-testid="to-order-action"
    >
      {unread ? (
        <div className="mb-1.5" data-testid="to-order-unresolved">
          <div className="text-body font-semibold text-base-900">
            {unresolvedHeadline(unresolved.length)}
          </div>
          <div className="text-meta text-base-600">{W.unresolvedHelp}</div>
          <div className="text-meta text-base-600">
            {unresolved
              .slice(0, 6)
              .map((u) => `${u.so != null ? `SO-${u.so}` : "—"} · ${u.sku}`)
              .join("  ·  ")}
          </div>
        </div>
      ) : blocked ? (
        <div className="mb-1.5">
          <div className="text-body font-semibold text-base-900">{W.productionDaysRequired}</div>
          <div className="text-meta text-base-600">{W.productionDaysHelp}</div>
        </div>
      ) : badPlan ? (
        <div className="mb-1.5 text-meta text-base-900" data-testid="to-order-plan-blocked">
          {blockedReason}
        </div>
      ) : null}

      {error ? (
        <div className="mb-1.5 text-meta text-danger" role="alert">
          {error.message}
        </div>
      ) : null}

      <div className="flex items-center gap-4 flex-wrap">
        <label className="flex items-center gap-1.5 text-body">
          <span className="text-meta text-base-500">{W.destination}</span>
          <select
            value={destId ?? ""}
            onChange={(e) => onDest(e.target.value)}
            aria-label={W.destination}
            data-testid="to-order-destination"
            className="text-body font-semibold text-base-900 bg-transparent border-0 focus:outline-none cursor-pointer"
          >
            {destinations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>

        {/* The count follows the arrangement, not the system's first guess. */}
        <span
          className="ml-auto text-body font-semibold tabular-nums whitespace-nowrap"
          data-testid="to-order-count"
        >
          {purchaseOrderCount(count)}
        </span>

        <button
          type="button"
          onClick={onIssue}
          disabled={blocked || unread || badPlan || pending || !destId}
          data-testid="to-order-issue"
          className="h-8 px-3.5 rounded-[6px] bg-kit-blue-9 text-white text-body font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {W.issue}
        </button>
      </div>
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
    <div
      className="bg-white border border-base-200 rounded-[8px] px-3.5 py-3"
      data-testid="to-order-issued"
    >
      <div className="text-strong text-base-900">
        {issuedHeadline(result.pos.length, result.supplier)}
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-x-6 gap-y-1">
        {result.pos.map((p) => (
          <div key={p.id} className="flex items-baseline gap-2 text-body">
            <span className="font-mono text-meta text-base-900">{p.id}</span>
            <span className="text-base-600 truncate">{p.customer}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-4 flex-wrap">
        <span className="text-meta text-base-600">{W.nextStep}</span>
        <button
          type="button"
          onClick={onOpenPurchaseOrders}
          data-testid="to-order-open-pos"
          className="ml-auto h-8 px-3.5 rounded-[6px] bg-kit-blue-9 text-white text-body font-medium"
        >
          {W.openPurchaseOrders}
        </button>
      </div>
    </div>
  );
}

function EmptyPanel({ loading, error }: { loading: boolean; error: Error | null }) {
  return (
    <div
      className="flex-1 min-h-0 bg-white border border-base-200 rounded-[8px] grid place-items-center"
      data-testid="to-order-empty"
    >
      <div className="text-body text-base-600">
        {error ? error.message : loading ? "…" : W.empty}
      </div>
    </div>
  );
}
