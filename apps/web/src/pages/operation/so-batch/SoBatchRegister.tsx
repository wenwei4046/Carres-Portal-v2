import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  PURCHASE_DEMAND_RAIL_WORDS,
  PURCHASE_DEMAND_STATE_WORDS,
  SO_BATCH_PURCHASE_WORDS as W,
  SO_BATCH_RAIL_GROUPS,
  defaultAllocations,
  filterPurchaseDemands,
  isSelectableForBuying,
  purchaseDemandStateCounts,
  setDestination,
  soBatchSelectionSummary,
  type DestinationAllocation,
  type PurchaseDemandRow,
  type PurchaseDemandState,
  type SoBatchPurchaseResponse,
  type SoBatchSelection,
} from "@carres/shared";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { fmtDate } from "@/lib/fmt-date";
import { RailGroup, RailItem } from "../components/workspace-rail";
import PurchasingTabs from "../PurchasingTabs";
import DestinationAllocationEditor from "./DestinationAllocationEditor";

/**
 * SO BATCH PURCHASE — THE REGISTER
 * (CARD-2026-08-22-purchasing-02 §3; `docs/purchasing/MASTER.md` §9.1).
 *
 * ONE question, answered without the operator knowing any history: **what must
 * Carres buy today, what is stopping the rest, and where do the goods go?**
 *
 * ── WHAT REPLACED WHAT ──────────────────────────────────────────────────────
 *
 * The PO Schedule and its category walk are GONE. They asked the operator to
 * hold two things the system already knows — which calendar day a buy snaps to,
 * and which category they were part-way through — and neither of them says what
 * is WRONG with a row. `Supplier not assigned` says both what is wrong and who
 * fixes it, so the rail names facts and nothing else.
 *
 * ── EVERY NUMBER ON THIS PAGE IS THE SERVER'S ───────────────────────────────
 *
 * `Required`, `Stock`, `Open PO`, `Buy` and `Goods Must Arrive` are carried, not
 * computed. `Buy` in particular is PRINTED and has no input near it: it is the
 * remainder of an arithmetic this browser cannot see (`docs/purchasing/MASTER.md`
 * §5.1), and a typed remainder would be a second demand truth. The one thing
 * the operator arranges here is WHERE the goods go — and even that is checked
 * again by the server at issue.
 *
 * ── SELECTION IS AN OFFER THAT MUST BE ABLE TO SUCCEED ──────────────────────
 *
 * A tick-box appears only where `isSelectableForBuying` says a purchase order
 * could actually be made: ready state, positive remainder, resolved supplier,
 * live engine reference. Offering the tick anywhere else offers an act that
 * fails, which is worse than not offering it.
 */

const STORAGE_KEY = "carres.soBatchPurchase.register.v1";

/** Governed absence — a muted sentence, never a bare dash. */
function Absent({ children }: { children: string }) {
  return <span className="text-kit-slate-11">{children}</span>;
}

/** A number the server could not count says so, and never prints a `0`. */
function Count({ n }: { n: number | null }) {
  return n == null ? <Absent>Not counted yet</Absent> : <span className="tabular-nums">{n}</span>;
}

/** Initials for the owner avatar. The NAME never enters the sentence. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export interface SoBatchRegisterProps {
  data: SoBatchPurchaseResponse;
  isLoading: boolean;
  /** Hands the arrangement to the issue journey. This page creates nothing. */
  onIssue: (selections: SoBatchSelection[]) => void;
}

export default function SoBatchRegister({ data, isLoading, onIssue }: SoBatchRegisterProps) {
  const navigate = useNavigate();
  const rows = data.rows;
  const rowsById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  /* ── The rail ─────────────────────────────────────────────────────────── */
  const [states, setStates] = useState<Set<PurchaseDemandState>>(new Set());
  const counts = useMemo(() => purchaseDemandStateCounts(rows), [rows]);
  const shown = useMemo(() => filterPurchaseDemands(rows, states), [rows, states]);
  const toggleState = useCallback((s: PurchaseDemandState) => {
    setStates((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }, []);

  /* ── The arrangement ──────────────────────────────────────────────────────
   *
   * Session state, deliberately. `Deliver To` becomes truth when a purchase
   * order carries it; storing it here would create a second demand field that
   * nothing recomputes (Card §4.1).
   *
   * A tick is dropped the moment its row stops being buyable — a refetch that
   * covers a line must not leave a stale tick able to order it. */
  const [selected, setSelected] = useState<Map<string, DestinationAllocation[]>>(new Map());
  const live = useMemo(() => {
    const out = new Map<string, DestinationAllocation[]>();
    for (const [id, allocations] of selected) {
      const row = rowsById.get(id);
      if (row && isSelectableForBuying(row)) out.set(id, allocations);
    }
    return out;
  }, [selected, rowsById]);

  const selections = useMemo<SoBatchSelection[]>(
    () => [...live].map(([demandId, allocations]) => ({ demandId, allocations })),
    [live],
  );
  const summary = useMemo(
    () => soBatchSelectionSummary(selections, rowsById),
    [selections, rowsById],
  );

  const toggleRow = useCallback(
    (id: string) => {
      const row = rowsById.get(id);
      if (!row || !isSelectableForBuying(row)) return;
      setSelected((prev) => {
        const next = new Map(prev);
        if (next.has(id)) next.delete(id);
        else if (data.defaultDestinationId) {
          next.set(id, defaultAllocations(row, data.defaultDestinationId));
        }
        return next;
      });
    },
    [rowsById, data.defaultDestinationId],
  );

  const setRowAllocations = useCallback(
    (id: string, allocations: DestinationAllocation[]) => {
      setSelected((prev) => new Map(prev).set(id, allocations));
    },
    [],
  );

  /**
   * Changing the destination on a row nobody ticked TICKS IT. The operator's
   * act said "this one goes to Sungai Buloh", and a destination on an unticked
   * row would be an arrangement for a buy that is not happening.
   */
  const changeWholeRow = useCallback(
    (row: PurchaseDemandRow, destinationId: string) => {
      const current = live.get(row.id);
      const next = setDestination(
        { demandId: row.id, allocations: current ?? [] },
        destinationId,
        row.toBuy ?? 0,
      );
      setRowAllocations(row.id, next.allocations);
    },
    [live, setRowAllocations],
  );

  const destinationName = useCallback(
    (id: string) => data.destinations.find((d) => d.id === id)?.name ?? "",
    [data.destinations],
  );

  /* ── The columns ──────────────────────────────────────────────────────── */
  const columns = useMemo<DataGridColumn<PurchaseDemandRow>[]>(
    () => [
      {
        key: "source",
        label: W.colSourceSo,
        width: 128,
        sortable: true,
        chooserGroup: "Source",
        accessor: (r) => (
          <span className="flex flex-col leading-tight" data-testid={`so-batch-source-${r.id}`}>
            <span className="font-mono font-medium">{r.so == null ? "" : `SO-${r.so}`}</span>
            <span className="truncate text-meta text-kit-slate-11">{r.customer ?? ""}</span>
          </span>
        ),
        searchValue: (r) =>
          [r.so == null ? "" : `SO-${r.so} ${r.so}`, r.customer ?? "", ...r.skus, r.supplier ?? ""]
            .join(" "),
        sortFn: (a, b) => (a.so ?? 0) - (b.so ?? 0),
        exportValue: (r) => (r.so == null ? "" : `SO-${r.so}`),
      },
      {
        key: "requiredFor",
        label: W.colRequiredFor,
        /* `No delivery date yet` is an owed sentence too — see `stock`. */
        width: 146,
        sortable: true,
        chooserGroup: "Dates",
        accessor: (r) => (
          <span data-testid={`so-batch-required-for-${r.id}`}>
            {r.customerDelivery ? (
              fmtDate(r.customerDelivery)
            ) : (
              <Absent>No delivery date yet</Absent>
            )}
          </span>
        ),
        sortFn: (a, b) => (a.customerDelivery ?? "").localeCompare(b.customerDelivery ?? ""),
        exportValue: (r) => r.customerDelivery ?? "",
      },
      {
        key: "sku",
        label: W.colSku,
        width: 210,
        sortable: true,
        chooserGroup: "Item",
        accessor: (r) => (
          <span className="flex flex-col leading-tight">
            <span className="truncate font-medium">{r.item}</span>
            <span className="truncate text-meta text-kit-slate-11">
              {[r.variant, r.skus.join(" · ")].filter(Boolean).join(" · ")}
            </span>
          </span>
        ),
        searchValue: (r) => [r.item, r.variant ?? "", ...r.skus].join(" "),
        exportValue: (r) => `${r.item} ${r.skus.join(" · ")}`.trim(),
      },
      {
        key: "required",
        label: W.colRequired,
        width: 84,
        align: "right",
        sortable: true,
        chooserGroup: "Quantity",
        accessor: (r) => <span className="tabular-nums">{r.qtyNeeded}</span>,
        sortFn: (a, b) => a.qtyNeeded - b.qtyNeeded,
        exportValue: (r) => r.qtyNeeded,
        footerTotal: (rs) => (
          <span className="tabular-nums">{rs.reduce((s, r) => s + r.qtyNeeded, 0)}</span>
        ),
      },
      {
        key: "stock",
        label: W.colStock,
        /* Wide enough for `Not counted yet` — the sentence COPY-STANDARD owes
           when the blocker also blocks the arithmetic. A column that truncates
           it to `Not cou…` prints neither a number nor an answer. */
        width: 118,
        align: "right",
        sortable: true,
        chooserGroup: "Quantity",
        accessor: (r) => <Count n={r.readyStock} />,
        sortFn: (a, b) => (a.readyStock ?? 0) - (b.readyStock ?? 0),
        exportValue: (r) => r.readyStock ?? "",
      },
      {
        key: "openPo",
        label: W.colOpenPo,
        width: 118,
        align: "right",
        sortable: true,
        chooserGroup: "Quantity",
        accessor: (r) => <Count n={r.onPo} />,
        searchValue: (r) => r.poNumbers.join(" "),
        sortFn: (a, b) => (a.onPo ?? 0) - (b.onPo ?? 0),
        exportValue: (r) => r.onPo ?? "",
      },
      {
        /* PRINTED. The remainder of the server's arithmetic, and the one
           number on this page nobody may type (MASTER §5.1). */
        key: "buy",
        label: W.buy,
        width: 72,
        align: "right",
        sortable: true,
        chooserGroup: "Quantity",
        accessor: (r) => (
          <span className="tabular-nums font-medium" data-testid={`so-batch-buy-${r.id}`}>
            {r.toBuy == null ? <Absent>—</Absent> : r.toBuy}
          </span>
        ),
        sortFn: (a, b) => (a.toBuy ?? 0) - (b.toBuy ?? 0),
        exportValue: (r) => r.toBuy ?? "",
        footerTotal: (rs) => (
          <span className="tabular-nums">{rs.reduce((s, r) => s + (r.toBuy ?? 0), 0)}</span>
        ),
      },
      {
        key: "supplier",
        label: W.colSupplier,
        width: 124,
        sortable: true,
        chooserGroup: "Source",
        accessor: (r) =>
          r.supplier ? <span className="truncate">{r.supplier}</span> : <Absent>No supplier yet</Absent>,
        filterValue: (r) => r.supplier ?? "No supplier yet",
        exportValue: (r) => r.supplier ?? "",
      },
      {
        /* The ONE thing this page arranges — and only on a line that could
           actually be bought. A blocked row gets no editor because it has no
           buy to send anywhere. */
        key: "deliverTo",
        label: W.deliverTo,
        width: 190,
        chooserGroup: "Buying",
        accessor: (r) => (
          <span data-testid={`so-batch-deliver-to-${r.id}`}>
            {isSelectableForBuying(r) ? (
              <DestinationAllocationEditor
                row={r}
                destinations={data.destinations}
                allocations={
                  live.get(r.id) ??
                  (data.defaultDestinationId
                    ? defaultAllocations(r, data.defaultDestinationId)
                    : [])
                }
                onWholeRow={(destinationId) => changeWholeRow(r, destinationId)}
                onSplit={(allocations) => setRowAllocations(r.id, allocations)}
              />
            ) : (
              <Absent>—</Absent>
            )}
          </span>
        ),
        exportValue: (r) =>
          (live.get(r.id) ?? [])
            .map((a) => `${destinationName(a.destinationId)} ${a.qty}`)
            .join(" · "),
      },
      {
        key: "goodsMustArrive",
        label: W.goodsMustArrive,
        width: 132,
        sortable: true,
        chooserGroup: "Dates",
        accessor: (r) => (
          <span data-testid={`so-batch-arrive-${r.id}`}>
            {r.goodsMustArrive ? fmtDate(r.goodsMustArrive) : <Absent>—</Absent>}
          </span>
        ),
        sortFn: (a, b) => (a.goodsMustArrive ?? "").localeCompare(b.goodsMustArrive ?? ""),
        exportValue: (r) => r.goodsMustArrive ?? "",
      },
      {
        /* THE TWO-LINE TREATMENT (`docs/purchasing/MASTER.md` §8.3). Line 1 is
           the authoritative fact; line 2 is the 11px act. The owner is an
           AVATAR beside them — never a word inside the sentence. */
        key: "work",
        label: W.colWork,
        width: 230,
        chooserGroup: "Work",
        accessor: (r) => {
          if (!r.action) return null;
          const owner = r.action.ownerName;
          return (
            <span className="flex flex-col leading-tight" data-testid={`so-batch-work-${r.id}`}>
              <span className="truncate">{PURCHASE_DEMAND_STATE_WORDS[r.state]}</span>
              <span className="flex items-center gap-1.5">
                {owner ? (
                  <span
                    className="shrink-0 rounded-control bg-kit-slate-3 px-1 text-meta text-kit-slate-11"
                    title={owner}
                    data-testid={`so-batch-owner-${r.id}`}
                  >
                    {initials(owner)}
                  </span>
                ) : r.action.ownerDuty ? (
                  <span
                    className="shrink-0 rounded-control bg-kit-slate-3 px-1 text-meta text-kit-slate-11"
                    data-testid={`so-batch-owner-${r.id}`}
                  >
                    {r.action.ownerDuty}
                  </span>
                ) : null}
                <span
                  className="truncate text-meta text-kit-slate-11"
                  data-testid={`so-batch-act-${r.id}`}
                >
                  {r.action.action}
                </span>
              </span>
            </span>
          );
        },
        filterValue: (r) => PURCHASE_DEMAND_STATE_WORDS[r.state],
        exportValue: (r) => r.action?.action ?? "",
      },
    ],
    [data.destinations, data.defaultDestinationId, live, changeWholeRow, setRowAllocations, destinationName],
  );

  /* ── The inspector ────────────────────────────────────────────────────── */
  const renderExpansion = (r: PurchaseDemandRow) => {
    const arranged = live.get(r.id) ?? [];
    const deliverTo =
      arranged.length > 0
        ? arranged.map((a) => `${destinationName(a.destinationId)} ${a.qty}`).join(" · ")
        : data.defaultDestinationId
          ? destinationName(data.defaultDestinationId)
          : "";
    const fact = (label: string, value: React.ReactNode) => (
      <div className="flex items-baseline justify-between gap-4 py-0.5">
        <span className="text-label uppercase tracking-wide text-kit-slate-11">{label}</span>
        <span className="tabular-nums">{value}</span>
      </div>
    );
    return (
      <div
        className="grid gap-x-10 gap-y-1 bg-white px-4 py-3 text-body sm:grid-cols-2"
        data-testid={`so-batch-inspector-${r.id}`}
      >
        {/* The four numbers, in the order the arithmetic runs. */}
        <div className="flex flex-col">
          {fact(W.inspectorRequired, r.qtyNeeded)}
          {fact(W.inspectorFromStock, <Count n={r.takenFromStock} />)}
          {fact(
            W.inspectorOnOpenPo,
            <span className="flex items-center gap-2">
              <Count n={r.onPo} />
              {r.poNumbers.length > 0 ? (
                <span className="font-mono text-meta text-kit-slate-11">
                  {r.poNumbers.join(" · ")}
                </span>
              ) : null}
            </span>,
          )}
          {fact(W.inspectorBuy, <Count n={r.toBuy} />)}
        </div>
        <div className="flex flex-col">
          <div className="flex items-baseline justify-between gap-4 py-0.5">
            <span className="text-label uppercase tracking-wide text-kit-slate-11">
              {W.inspectorSource}
            </span>
            <button
              type="button"
              className="font-mono text-kit-blue-11 underline-offset-2 hover:underline"
              data-testid={`so-batch-inspector-so-${r.id}`}
              onClick={() => navigate(`/operation/orders/so/${r.orderId}`)}
            >
              {r.so == null ? r.item : `SO-${r.so} · ${r.skus[0] ?? r.item}`}
            </button>
          </div>
          {fact(
            W.inspectorRequiredFor,
            r.customerDelivery ? fmtDate(r.customerDelivery) : <Absent>No delivery date yet</Absent>,
          )}
          {fact(
            W.inspectorGoodsMustArrive,
            r.goodsMustArrive ? fmtDate(r.goodsMustArrive) : <Absent>—</Absent>,
          )}
          {fact(W.inspectorDeliverTo, deliverTo)}
        </div>
      </div>
    );
  };

  /* ── The page ─────────────────────────────────────────────────────────── */
  const selectedKeys = useMemo(() => new Set(live.keys()), [live]);

  return (
    <div
      className="flex h-full min-h-0 w-full flex-1 flex-col bg-kit-canvas"
      data-testid="so-batch-page"
    >
      <PurchasingTabs />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside
          className="flex w-[200px] min-h-0 shrink-0 flex-col gap-4 overflow-y-auto border-r border-kit-slate-5 bg-white px-3 py-3"
          data-testid="so-batch-rail"
        >
          {SO_BATCH_RAIL_GROUPS.map((group) => (
            <RailGroup key={group.heading} title={group.heading}>
              {group.states.map((s) => (
                <RailItem
                  key={s}
                  active={states.has(s)}
                  onClick={() => toggleState(s)}
                  testId={`so-batch-state-${s}`}
                  label={PURCHASE_DEMAND_RAIL_WORDS[s]}
                  /* A zero prints nothing: an absent queue and an empty one
                     read the same to an operator, and only one is news. */
                  count={counts[s] > 0 ? counts[s] : undefined}
                  title={`${counts[s]} ${W.footerUnit} · ${PURCHASE_DEMAND_STATE_WORDS[s]}`}
                />
              ))}
            </RailGroup>
          ))}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col p-2">
          <div className="min-h-0 flex-1" data-testid="so-batch-grid">
            <DataGrid<PurchaseDemandRow>
              appearance="reference"
              rows={shown}
              columns={columns}
              storageKey={STORAGE_KEY}
              rowKey={(r) => r.id}
              rowTestId={(r) => `so-batch-row-${r.id}`}
              exportName={W.destination}
              searchPlaceholder={W.search}
              isLoading={isLoading}
              emptyMessage={W.empty}
              groupBanner={false}
              stickyIdentity
              chooserGroupOrder={["Source", "Item", "Quantity", "Buying", "Dates", "Work"]}
              expandable={{
                renderExpansion,
                testId: (r) => `so-batch-expand-${r.id}`,
              }}
              selectable={{
                selectedKeys,
                onToggle: toggleRow,
                onToggleAll: (keys, allSelected) => {
                  for (const k of keys) {
                    const isOn = selectedKeys.has(k);
                    if (allSelected ? isOn : !isOn) toggleRow(k);
                  }
                },
                isSelectable: (r: PurchaseDemandRow) => isSelectableForBuying(r),
                testId: (r: PurchaseDemandRow) => `so-batch-select-${r.id}`,
              }}
              statusSummary={(filtered) => {
                const needed = filtered.reduce((s, r) => s + r.qtyNeeded, 0);
                const buy = filtered.reduce((s, r) => s + (r.toBuy ?? 0), 0);
                const line = `${filtered.length} ${W.footerUnit} · ${needed} ${
                  needed === 1 ? "unit" : "units"
                } needed · ${buy} ${buy === 1 ? "unit" : "units"} to buy`;
                return (
                  <span className="block truncate" data-testid="so-batch-footer" title={line}>
                    {line}
                  </span>
                );
              }}
            />
          </div>

          {summary.lines > 0 ? (
            <div
              className="mt-2 flex shrink-0 items-center justify-between gap-3 rounded-control border border-kit-slate-6 bg-white px-3 py-2"
              data-testid="so-batch-selection-bar"
            >
              <span className="truncate text-body">{summary.text}</span>
              {data.mayIssue ? (
                <button
                  type="button"
                  data-testid="so-batch-issue"
                  className="inline-flex h-7 shrink-0 items-center rounded-control bg-kit-blue-9 px-3 text-meta font-medium text-white hover:opacity-90"
                  onClick={() => onIssue(selections)}
                >
                  {W.issuePo}
                </button>
              ) : (
                /* NOT a disabled button. A control the operator cannot use
                   should say WHO can, not grey itself out and stay silent. */
                <span className="shrink-0 truncate text-meta text-kit-slate-11">
                  {data.currentPoDuty
                    ? `${data.currentPoDuty.name} holds PO duty`
                    : "Nobody holds PO duty"}
                </span>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
