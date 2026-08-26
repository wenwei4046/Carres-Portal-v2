import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  SO_BATCH_PURCHASE_WORDS as W,
  SO_BATCH_RAIL,
  defaultAllocations,
  purchaseDemandRailWords,
  purchaseDemandStateWords,
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
import GoodsMiniTable, {
  categoryWord,
  type GoodsMiniLine,
} from "../components/GoodsMiniTable";

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
  /* THE WORDS FOLLOW THE GOVERNED SETTING. The safety-band labels carry the
     number (`14 safety days left`), so they are composed from the server's own
     `safetyDays` — never a hard-coded 14 (Card 02-A §4). */
  const stateWords = useMemo(() => purchaseDemandStateWords(data.safetyDays), [data.safetyDays]);
  const railWords = useMemo(() => purchaseDemandRailWords(data.safetyDays), [data.safetyDays]);
  /* `SETUP TO FIX` renders only while its count is above zero. When the last
     such line is fixed, its filter must not survive as an invisible narrowing
     the operator can no longer see or clear. */
  const setupCount = counts.no_production_days;
  useEffect(() => {
    if (setupCount > 0) return;
    setStates((prev) => {
      if (!prev.has("no_production_days")) return prev;
      const next = new Set(prev);
      next.delete("no_production_days");
      return next;
    });
  }, [setupCount]);

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
        /* ⭐ THE LINK LIVES ON THE COLUMN, where the Card put it (§3.2 —
           "Link to Sales Order; customer is the quiet second line").
           It used to live only inside the expand, so reaching the order the
           demand came from meant opening a box first — and the column that was
           supposed to carry it was plain text. Moving it here is what let the
           expand stop repeating the row (owner correction 2026-08-24). */
        accessor: (r) => (
          <span className="flex flex-col leading-tight" data-testid={`so-batch-source-${r.id}`}>
            {r.so == null ? (
              <span className="font-mono font-medium" />
            ) : (
              <button
                type="button"
                className="self-start font-mono font-medium text-kit-blue-11 underline-offset-2 hover:underline"
                data-testid={`so-batch-source-link-${r.id}`}
                onClick={(e) => {
                  /* The row's own click opens the expand; this one leaves the
                     page, so it must not do both. */
                  e.stopPropagation();
                  navigate(`/operation/orders/so/${r.orderId}`);
                }}
              >
                {`SO-${r.so}`}
              </button>
            )}
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
              <span className="truncate">{stateWords[r.state]}</span>
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
        filterValue: (r) => stateWords[r.state],
        exportValue: (r) => r.action?.action ?? "",
      },
    ],
    [data.destinations, data.defaultDestinationId, live, changeWholeRow, setRowAllocations, destinationName, stateWords],
  );

  /* ── The inspector ────────────────────────────────────────────────────── */
  /**
   * ⭐ THE SAME CHILD TABLE SALES ORDERS AND DELIVERY DRAW
   * (owner correction 2026-08-24; `GoodsMiniTable`'s own ruling, Chai
   * 2026-08-15 — "written ONCE so that two pages cannot drift into two
   * mini-tables that almost agree").
   *
   * ── WHAT THIS REPLACES, AND WHY IT READ AS CONFUSION ────────────────────
   *
   * A hand-drawn `grid-cols-2` label/value list — the second mini-table that
   * ruling exists to forbid — and it failed twice over:
   *
   *   · IT WAS AS WIDE AS THE TABLE. `justify-between` across a half of a
   *     1600px row put `REQUIRED` at the left edge and its `1` some 780px
   *     away, with nothing in between. The parent is a table with aligned
   *     columns; the child was a form floating in white space.
   *   · IT RE-PRINTED THE ROW. Seven of its eight facts — Required, From
   *     Stock, On Open PO, Buy, Source, Required for, Goods must arrive,
   *     Deliver to — are ALREADY columns on the row above it. `Expand has
   *     exactly one job` (CLAUDE.md §2), and its job was not to say
   *     everything again.
   *
   * ── WHAT THE ROW GENUINELY CANNOT SAY ───────────────────────────────────
   *
   * The row is one line per BUILD. A matched set is one row and several module
   * codes, so the PARTS are the child's job — and beside them, the two facts
   * the row only summarises: WHICH purchase order already covers this
   * (`Open PO` prints a number, never its document), and where a SPLIT
   * arrangement actually sends each unit.
   */
  const renderExpansion = (r: PurchaseDemandRow) => {
    const arranged = live.get(r.id) ?? [];
    /* A SPLIT earns its quantity; one destination prints its name alone — the
       sibling register's own rule, so the two boxes read the same way. */
    const deliverTo =
      arranged.length > 0
        ? arranged.map((a) =>
            arranged.length > 1
              ? `${destinationName(a.destinationId)} ×${a.qty}`
              : destinationName(a.destinationId),
          )
        : data.defaultDestinationId
          ? [destinationName(data.defaultDestinationId)]
          : [];

    /* A row always has at least one part. The fallback names the row itself
       rather than printing an empty box for a demand the projection has not
       broken down. */
    const parts =
      r.parts.length > 0
        ? r.parts
        : [{ sku: r.skus[0] ?? r.item, qty: r.qtyNeeded, unitCost: null }];

    const lines: GoodsMiniLine[] = parts.map((part) => ({
      key: `${r.id}::${part.sku}`,
      testId: `so-batch-part-${part.sku}`,
      category: r.category ? categoryWord(r.category) : "Other goods",
      /* NOTHING IS MINTED BEFORE ISSUE. The Unit IDs are allocated when the
         purchase order is created, so the honest answer here is the governed
         absence — not a blank, and never an invented code. */
      unitIds: [],
      unitAbsence: "Not allocated",
      coveredBy: r.poNumbers,
      coveredByAbsence: "Not ordered yet",
      deliverTo,
      deliverToAbsence: "Not chosen",
      sku: part.sku,
      qty: part.qty,
      item: r.item,
      /* ⭐ NO SECOND LINE FOR A FACT THAT IS ALREADY BESIDE IT.
       *
       * MEASURED on production 2026-08-26: passing `r.variant` here ("King")
       * made the `Item` cell two lines, which took the child row from 26.5px to
       * 54.5px — and with `align-top` every other cell then sat above ~28px of
       * white. One line of goods cost 108px of expansion against a 38px parent
       * row.
       *
       * And it bought nothing. The size is ALREADY printed twice within a
       * centimetre of it: the `SKU` column in this same box reads `L1201S-K`,
       * and the parent row's `SKU / configuration` column reads
       * `L1201S · King · L1201S-K`. A third printing is what doubled the row.
       *
       * The sibling register DOES pass `itemDetail`, and must keep it: there it
       * carries fabric, firmness and seat height — configuration that appears
       * nowhere else on the row. The line is earned there and not here.
       *
       * (`docs/ui/MASTER.md` REGISTER TABLE DENSITY LAW — expanded content takes
       * its NATURAL child-row height. Natural is what the content needs, not
       * what a repeated fact inflates it to.) */
      /* Buying is ticked on the PARENT row — one whole-line switch, not two. */
      selectable: false,
    }));

    return (
      <div data-testid={`so-batch-inspector-${r.id}`}>
        <GoodsMiniTable
          label={r.so == null ? `Goods on ${r.item}` : `Goods on SO-${r.so}`}
          lines={lines}
          showCoveredBy
        />
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
          <RailGroup title={SO_BATCH_RAIL.toOrder.heading}>
            {/* The whole unissued listing — selecting it CLEARS every facet,
                which is the shared local-rail law's `All` behaviour. */}
            <RailItem
              active={states.size === 0}
              onClick={() => setStates(new Set())}
              testId="so-batch-all-not-ordered"
              label={SO_BATCH_RAIL.toOrder.all}
              count={rows.length > 0 ? rows.length : undefined}
              title={`${rows.length} ${W.footerUnit}`}
            />
          </RailGroup>
          <RailGroup title={SO_BATCH_RAIL.timing.heading}>
            {SO_BATCH_RAIL.timing.states.map((s) => (
              <RailItem
                key={s}
                active={states.has(s)}
                onClick={() => toggleState(s)}
                testId={`so-batch-state-${s}`}
                label={railWords[s] ?? ""}
                /* A zero prints nothing: an absent queue and an empty one
                   read the same to an operator, and only one is news. */
                count={counts[s] > 0 ? counts[s] : undefined}
                title={`${counts[s]} ${W.footerUnit} · ${stateWords[s]}`}
              />
            ))}
          </RailGroup>
          {/* The one Purchasing-owned setup exception, and only while it
              exists — an empty exception section is noise wearing a heading. */}
          {setupCount > 0 && (
            <RailGroup title={SO_BATCH_RAIL.setup.heading}>
              {SO_BATCH_RAIL.setup.states.map((s) => (
                <RailItem
                  key={s}
                  active={states.has(s)}
                  onClick={() => toggleState(s)}
                  testId={`so-batch-state-${s}`}
                  label={railWords[s] ?? ""}
                  count={counts[s] > 0 ? counts[s] : undefined}
                  title={`${counts[s]} ${W.footerUnit} · ${stateWords[s]}`}
                />
              ))}
            </RailGroup>
          )}
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
                /* ⭐ AND IT NAMES WHOEVER MAY ACT TODAY (0379; closure §1).
                   A dated buddy cover is the person to ask, not the holder they
                   are covering — a chip that named the absent holder sent the
                   operator to somebody who is on leave. */
                <span
                  className="shrink-0 truncate text-meta text-kit-slate-11"
                  data-testid="so-batch-duty-chip"
                >
                  {data.actingPoDuty
                    ? `${data.actingPoDuty.name} is covering PO duty`
                    : data.currentPoDuty
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
