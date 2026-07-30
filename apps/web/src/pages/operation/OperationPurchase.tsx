import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Filter, Search } from "lucide-react";
import {
  TO_ORDER_WORDS as W,
  issuedHeadline,
  purchaseOrderCount,
  sortToOrderRows,
  type ToOrderProposal,
  type ToOrderRow,
  type ToOrderSortKey,
} from "@carres/shared";
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

interface ToOrderResponse {
  today: string;
  proposals: ToOrderProposal[];
  destinations: Destination[];
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

  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const [destId, setDestId] = useState<string | null>(null);
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});
  // Sort resets on every open: the day's order is Stock ready, and a sort
  // somebody left behind yesterday is not today's priority.
  const [sortKey, setSortKey] = useState<ToOrderSortKey>("stockReady");
  const [asc, setAsc] = useState(true);
  const [issued, setIssued] = useState<IssueResponse | null>(null);

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

  const rows = useMemo(
    () => (current ? sortToOrderRows(current.rows, sortKey, asc) : []),
    [current, sortKey, asc],
  );

  const issue = useMutation<IssueResponse, Error, void>({
    mutationFn: () => {
      if (!current || !destId) throw new Error("nothing to issue");
      return apiFetch<IssueResponse>("/api/operation/purchase/to-order/issue", {
        method: "POST",
        body: JSON.stringify({
          supplierId: current.supplierId,
          category: current.category,
          destinationId: destId,
        }),
      });
    },
    onSuccess: (res) => {
      setIssued(res);
      setPickedKey(null);
      setOpenRows({});
      void qc.invalidateQueries({ queryKey: ["operation"] });
    },
  });

  function toggleSort(k: ToOrderSortKey) {
    if (k === sortKey) setAsc((v) => !v);
    else {
      setSortKey(k);
      setAsc(true);
    }
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-base-100">
      <PurchasingTabs />

      <div className="flex-1 min-h-0 flex gap-4 px-6 py-4 overflow-hidden">
        <Sidebar
          proposals={proposals}
          currentKey={current?.key ?? null}
          onPick={(k) => {
            setPickedKey(k);
            setOpenRows({});
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
          ) : !current ? (
            <EmptyPanel loading={q.isLoading} error={q.error as Error | null} />
          ) : (
            <>
              <Grid
                proposal={current}
                rows={rows}
                sortKey={sortKey}
                asc={asc}
                onSort={toggleSort}
                openRows={openRows}
                onToggleRow={(id) => setOpenRows((m) => ({ ...m, [id]: !m[id] }))}
              />
              <StickyAction
                proposal={current}
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

function Sidebar({
  proposals,
  currentKey,
  onPick,
  loading,
}: {
  proposals: ToOrderProposal[];
  currentKey: string | null;
  onPick: (key: string) => void;
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
              <button
                key={p.key}
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
            );
          })
        )}
      </div>
    </aside>
  );
}

// ── Grid ────────────────────────────────────────────────────────────────────

const COLS: { key: ToOrderSortKey; label: string; numeric?: boolean; title?: string }[] = [
  { key: "cust", label: W.colCustomer },
  { key: "so", label: W.colSo },
  { key: "qty", label: W.colQty, numeric: true },
  { key: "summary", label: W.colSummary },
  { key: "stockReady", label: W.colStockReady, numeric: true, title: W.stockReadyHelp },
];

function Grid({
  proposal,
  rows,
  sortKey,
  asc,
  onSort,
  openRows,
  onToggleRow,
}: {
  proposal: ToOrderProposal;
  rows: ToOrderRow[];
  sortKey: ToOrderSortKey;
  asc: boolean;
  onSort: (k: ToOrderSortKey) => void;
  openRows: Record<string, boolean>;
  onToggleRow: (id: string) => void;
}) {
  const scroll = useRef<HTMLDivElement>(null);

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-white border border-base-200 rounded-[8px] overflow-hidden">
      <div className="shrink-0 px-3.5 pt-2.5 pb-2.5 border-b border-base-200 text-strong text-base-900">
        {proposal.label}
      </div>

      <div ref={scroll} className="flex-1 min-h-0 overflow-y-auto" data-testid="to-order-grid">
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            <col className="w-[26px]" />
            <col className="w-[112px]" />
            <col className="w-[78px]" />
            <col className="w-[44px]" />
            <col />
            <col className="w-[126px]" />
          </colgroup>
          <thead className="sticky top-0 z-[1]">
            <tr>
              <th className="bg-base-50 border-b border-base-200 h-7" />
              {COLS.map((c) => (
                <th
                  key={c.key}
                  title={c.title}
                  onClick={() => onSort(c.key)}
                  className={[
                    "bg-base-50 border-b border-base-200 h-7 px-2 text-label font-normal",
                    "text-base-500 hover:text-base-900 cursor-pointer select-none whitespace-nowrap",
                    c.numeric ? "text-right" : "text-left",
                  ].join(" ")}
                  data-testid={`to-order-col-${c.key}`}
                >
                  {c.label}
                  {sortKey === c.key ? <span className="ml-1">{asc ? "▲" : "▼"}</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <RowPair
                key={r.orderId}
                row={r}
                open={Boolean(openRows[r.orderId])}
                onToggle={() => onToggleRow(r.orderId)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RowPair({
  row,
  open,
  onToggle,
}: {
  row: ToOrderRow;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        data-testid={`to-order-row-${row.so ?? row.orderId}`}
        className={[
          "h-9 border-b border-base-100 cursor-pointer",
          open ? "bg-base-100" : "hover:bg-base-50",
        ].join(" ")}
      >
        <td className="px-2 align-middle">
          <ChevronRight
            size={12}
            strokeWidth={2.2}
            aria-hidden
            className={[
              "transition-transform",
              open ? "rotate-90 text-base-500" : "text-base-300",
            ].join(" ")}
          />
        </td>
        <td className="px-2 text-body font-semibold text-base-900 truncate">{row.customer}</td>
        <td className="px-2 text-meta text-base-600 truncate">
          {row.so != null ? `SO-${row.so}` : "—"}
        </td>
        <td className="px-2 text-body font-semibold text-right tabular-nums">{row.qty}</td>
        <td className="px-2 text-meta text-base-600 truncate" title={row.summary}>
          {row.summary}
        </td>
        {/* An exception takes over its own cell rather than lighting a status column. */}
        <td
          className={[
            "px-2 text-right",
            row.stockReady ? "text-body tabular-nums" : "text-meta text-base-900",
          ].join(" ")}
        >
          {row.stockReady ? fmtDate(row.stockReady) : W.noDeliveryDate}
        </td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={6} className="border-b border-base-100 pl-[34px] pr-2 pb-2.5">
            {row.builds.map((b, i) => (
              <div
                key={b.key}
                className={i === 0 ? "pt-2" : "pt-2 mt-2 border-t border-base-100"}
              >
                <div className="text-meta font-semibold text-base-900">{b.title}</div>
                <div className="text-meta text-base-600">{b.spec}</div>
                <div className="font-mono text-label text-base-500">{b.codes}</div>
              </div>
            ))}
          </td>
        </tr>
      ) : null}
    </>
  );
}

// ── Sticky action ───────────────────────────────────────────────────────────

function StickyAction({
  proposal,
  destinations,
  destId,
  onDest,
  pending,
  error,
  onIssue,
}: {
  proposal: ToOrderProposal;
  destinations: Destination[];
  destId: string | null;
  onDest: (id: string) => void;
  pending: boolean;
  error: Error | null;
  onIssue: () => void;
}) {
  const blocked = proposal.blocked === "production_days";

  return (
    <div
      className="shrink-0 mt-2.5 bg-white border border-base-200 rounded-[8px] px-3.5 py-2"
      data-testid="to-order-action"
    >
      {blocked ? (
        <div className="mb-1.5">
          <div className="text-body font-semibold text-base-900">{W.productionDaysRequired}</div>
          <div className="text-meta text-base-600">{W.productionDaysHelp}</div>
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

        <span className="ml-auto text-body font-semibold tabular-nums whitespace-nowrap">
          {purchaseOrderCount(proposal.poCount)}
        </span>

        <button
          type="button"
          onClick={onIssue}
          disabled={blocked || pending || !destId}
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
