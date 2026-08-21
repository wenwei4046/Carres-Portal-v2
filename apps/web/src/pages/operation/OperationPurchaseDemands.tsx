import { useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  categoryLabel,
  filterPurchaseDemands,
  groupPurchaseDemands,
  purchaseDemandCoverageLine,
  purchaseDemandFooter,
  purchaseDemandHelpLine,
  purchaseDemandStateCounts,
  PURCHASE_DEMAND_RAIL_WORDS,
  PURCHASE_DEMAND_STATES,
  PURCHASE_DEMAND_STATE_WORDS,
  PURCHASE_DEMAND_WORDS as W,
  isPurchaseDemandState,
  type PurchaseDemandItemGroup,
  type PurchaseDemandRow,
  type PurchaseDemandState,
  type PurchaseDemandsResponse,
} from "@carres/shared";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import PurchasingTabs from "./PurchasingTabs";
/* The Purchasing Workspace's OWN 200px rail recipe, extracted 2026-08-03 and
   already worn by Purchase Orders and Goods Receipts. A third rail would be a
   third thing to keep in step — UI-KIT §6.1: the second occurrence is a full
   stop (`docs/ui/MASTER.md` — LOCAL RAIL ACTIVE ROW). */
import { RailGroup, RailItem } from "./components/workspace-rail";

/**
 * PURCHASE DEMANDS — the customer-demand Register
 * (CARD-2026-08-20-purchase-demands; `docs/purchasing/MASTER.md` §3.1).
 *
 * ONE question: *what customer goods need buying, what already covers them, and
 * what must be fixed before they can be bought?*
 *
 * ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────────
 *
 * No `Issue PO`. No draft purchase order. No price, no FOC, no approval. No
 * `Deliver To` editor — pre-Issue arrangement belongs to SO Batch Purchase and
 * final truth to the PO. No Unit ID column — Stock has not created or allocated
 * a Unit merely because a customer asked for something. No selection that could
 * commit money. The page's ONE door out is a navigation door: `Open SO Batch
 * Purchase`, which opens the existing workspace and issues nothing.
 *
 * ── THE 200px RAIL IS PAGE-OWNED FILTERING, NOT NAVIGATION ─────────────────
 *
 * It uses the governed `NavRow` treatment (`docs/ui/MASTER.md` — LOCAL RAIL
 * ACTIVE ROW) and it names CONCRETE FACTS. It may never say `Today`,
 * `Tomorrow`, `Needs attention`, `Follow up`, `Pending` or `Waiting`: those are
 * words that tell an operator a row is important without telling them what is
 * wrong with it. `Supplier not assigned` tells them both.
 *
 * Rail choices ride the URL (`?state=`), so a refresh, a share and the back
 * button all land on the same listing.
 *
 * ── THE TREE ────────────────────────────────────────────────────────────────
 *
 *   item/model  →  variant  →  one customer's demand
 *
 * A single-variant item collapses straight to the customer leaves — a level
 * that holds one child is a level that costs a click and says nothing. A sofa's
 * modules are ONE leaf (the engine's build), so a customer's matched set stays
 * together.
 *
 * Every word on screen is `@carres/shared`'s `PURCHASE_DEMAND_*`, and every
 * number is the server's. Nothing is derived here.
 */

const STORAGE_KEY = "carres.purchaseDemands.register.v1";

/** Governed absence — a muted sentence, never a bare dash. */
function Absent({ children }: { children: string }) {
  return <span className="text-kit-slate-11">{children}</span>;
}

/** A number the server could not count says so, and never prints a `0`. */
function Count({ n }: { n: number | null }) {
  return n == null ? <Absent>—</Absent> : <span className="tabular-nums">{n}</span>;
}

function useDemands() {
  return useQuery<PurchaseDemandsResponse>({
    queryKey: ["purchase-demands"],
    queryFn: () => apiFetch<PurchaseDemandsResponse>("/api/operation/purchase/demands"),
  });
}

export default function OperationPurchaseDemands() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = useDemands();

  const allRows = useMemo<PurchaseDemandRow[]>(() => q.data?.rows ?? [], [q.data]);

  /* ── The rail, on the URL ─────────────────────────────────────────────── */
  const stateSet = useMemo<Set<PurchaseDemandState>>(() => {
    const raw = searchParams.get("state") ?? "";
    return new Set(raw.split(",").map((s) => s.trim()).filter(isPurchaseDemandState));
  }, [searchParams]);

  const toggleState = useCallback(
    (s: PurchaseDemandState) => {
      const next = new Set(stateSet);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      const params = new URLSearchParams(searchParams);
      if (next.size === 0) params.delete("state");
      else params.set("state", [...next].join(","));
      setSearchParams(params, { replace: false });
    },
    [stateSet, searchParams, setSearchParams],
  );

  const clearStates = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    params.delete("state");
    setSearchParams(params, { replace: false });
  }, [searchParams, setSearchParams]);

  const counts = useMemo(() => purchaseDemandStateCounts(allRows), [allRows]);
  const railRows = useMemo(
    () => filterPurchaseDemands(allRows, stateSet),
    [allRows, stateSet],
  );
  const groups = useMemo(() => groupPurchaseDemands(railRows), [railRows]);

  const openSalesOrder = useCallback(
    (orderId: string) => navigate(`/operation/orders/so/${orderId}`),
    [navigate],
  );
  const openPurchaseOrder = useCallback(
    (poId: string) => navigate(`/operation/procurement?po=${encodeURIComponent(poId)}`),
    [navigate],
  );
  const openBatch = useCallback(
    (so?: number | null) =>
      navigate(so == null ? "/operation?tab=purchase" : `/operation?tab=purchase&so=${so}`),
    [navigate],
  );

  /* ── The parent columns ───────────────────────────────────────────────── */
  const columns = useMemo<DataGridColumn<PurchaseDemandItemGroup>[]>(
    () => [
      {
        key: "item",
        label: W.colItem,
        width: 300,
        minWidth: 200,
        sortable: true,
        chooserGroup: "Item",
        accessor: (g) => {
          // The governed two-line treatment, applied at the parent ONLY when
          // every leaf shares one blocker — an item whose rows disagree would
          // otherwise print a fix that is true of some of them.
          const states = new Set(g.rows.map((r) => r.state));
          const only = states.size === 1 ? [...states][0]! : null;
          const help =
            only && only !== "ready_to_buy" && only !== "covered"
              ? purchaseDemandHelpLine(g.rows[0]!)
              : null;
          return (
            <span className="flex flex-col leading-tight">
              <span className="truncate font-medium">{g.item}</span>
              {only && help ? (
                <>
                  <span className="truncate text-meta text-kit-slate-11">
                    {PURCHASE_DEMAND_STATE_WORDS[only]}
                  </span>
                  <span className="truncate text-meta text-kit-slate-11">{help}</span>
                </>
              ) : null}
            </span>
          );
        },
        searchValue: (g) =>
          [
            g.item,
            ...g.rows.flatMap((r) => [
              r.variant ?? "",
              r.customer ?? "",
              r.so == null ? "" : `SO-${r.so} ${r.so}`,
              r.supplier ?? "",
              ...r.skus,
              ...r.poNumbers,
            ]),
          ].join(" "),
        filterValue: (g) => g.item,
        exportValue: (g) => g.item,
      },
      {
        key: "category",
        label: W.colCategory,
        width: 110,
        sortable: true,
        chooserGroup: "Item",
        accessor: (g) =>
          g.category ? categoryLabel(g.category) : <Absent>{W.colSku}</Absent>,
        filterValue: (g) => (g.category ? categoryLabel(g.category) : W.colSku),
        searchValue: (g) => (g.category ? categoryLabel(g.category) : ""),
      },
      {
        key: "work",
        label: W.railHeading,
        width: 190,
        defaultHidden: true,
        chooserGroup: "Work to do",
        accessor: (g) => {
          const states = [...new Set(g.rows.map((r) => r.state))];
          return states.map((s) => PURCHASE_DEMAND_STATE_WORDS[s]).join(" · ");
        },
        filterValue: (g) =>
          [...new Set(g.rows.map((r) => PURCHASE_DEMAND_STATE_WORDS[r.state]))].join(" · "),
      },
      {
        key: "supplier",
        label: W.colSupplier,
        width: 150,
        defaultHidden: true,
        chooserGroup: "Item",
        accessor: (g) => {
          const names = [...new Set(g.rows.map((r) => r.supplier).filter(Boolean))];
          return names.length > 0 ? names.join(" · ") : <Absent>{W.noSupplier}</Absent>;
        },
        filterValue: (g) =>
          [...new Set(g.rows.map((r) => r.supplier ?? W.noSupplier))].join(" · "),
      },
      {
        key: "qtyNeeded",
        label: W.colQtyNeeded,
        width: 104,
        align: "right",
        sortable: true,
        chooserGroup: "Quantity",
        filterType: "number",
        numberValue: (g) => g.qtyNeeded,
        accessor: (g) => <span className="tabular-nums">{g.qtyNeeded}</span>,
        exportValue: (g) => g.qtyNeeded,
        sortFn: (a, b) => a.qtyNeeded - b.qtyNeeded,
        footerTotal: (rows) => (
          <span className="tabular-nums">{rows.reduce((s, g) => s + g.qtyNeeded, 0)}</span>
        ),
      },
      {
        key: "readyStock",
        label: W.colReadyStock,
        width: 108,
        align: "right",
        sortable: true,
        chooserGroup: "Quantity",
        accessor: (g) => <span className="tabular-nums">{g.readyStock}</span>,
        exportValue: (g) => g.readyStock,
        sortFn: (a, b) => a.readyStock - b.readyStock,
        footerTotal: (rows) => (
          <span className="tabular-nums">{rows.reduce((s, g) => s + g.readyStock, 0)}</span>
        ),
      },
      {
        key: "onPo",
        label: W.colOnPo,
        width: 84,
        align: "right",
        sortable: true,
        chooserGroup: "Quantity",
        accessor: (g) => <span className="tabular-nums">{g.onPo}</span>,
        exportValue: (g) => g.onPo,
        searchValue: (g) => g.rows.flatMap((r) => r.poNumbers).join(" "),
        sortFn: (a, b) => a.onPo - b.onPo,
        footerTotal: (rows) => (
          <span className="tabular-nums">{rows.reduce((s, g) => s + g.onPo, 0)}</span>
        ),
      },
      {
        /* PRINTED, never editable: this Register states what a purchase would
           have to cover. Changing it is the PO's act, behind its own door. */
        key: "toBuy",
        label: W.colToBuy,
        width: 84,
        align: "right",
        sortable: true,
        chooserGroup: "Quantity",
        accessor: (g) => <span className="tabular-nums font-medium">{g.toBuy}</span>,
        exportValue: (g) => g.toBuy,
        sortFn: (a, b) => a.toBuy - b.toBuy,
        footerTotal: (rows) => (
          <span className="tabular-nums">{rows.reduce((s, g) => s + g.toBuy, 0)}</span>
        ),
      },
    ],
    [],
  );

  /* ── The leaf ─────────────────────────────────────────────────────────── */
  const Leaf = ({ r }: { r: PurchaseDemandRow }) => {
    const help = purchaseDemandHelpLine(r);
    const owner = r.ownerName ?? r.ownerDuty;
    return (
      <li className="flex flex-col gap-0.5 border-t border-kit-slate-4 px-3 py-1.5 first:border-t-0">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-body">
          {r.so != null ? (
            <button
              type="button"
              className="font-mono font-medium text-kit-blue-11 underline-offset-2 hover:underline"
              onClick={() => openSalesOrder(r.orderId)}
              data-testid={`demand-so-${r.id}`}
            >
              SO-{r.so}
            </button>
          ) : null}
          <span className="truncate">{r.customer ?? ""}</span>
          <span className="text-kit-slate-11">
            {r.customerDelivery ? fmtDate(r.customerDelivery) : W.noCustomerDate}
          </span>
          <span className="tabular-nums">
            {W.colQtyNeeded} <Count n={r.qtyNeeded} />
          </span>
          <span className="tabular-nums">
            {W.colToBuy} <Count n={r.toBuy} />
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-meta text-kit-slate-11">
          <span>{purchaseDemandCoverageLine(r)}</span>
          {r.poNumbers.map((po) => (
            <button
              key={po}
              type="button"
              className="font-mono text-kit-blue-11 underline-offset-2 hover:underline"
              onClick={() => openPurchaseOrder(po)}
              data-testid={`demand-po-${r.id}-${po}`}
            >
              {po}
            </button>
          ))}
          <span>{r.supplier ?? W.noSupplier}</span>
        </span>
        {help ? (
          <span
            className="flex flex-wrap items-center gap-x-2 text-meta"
            data-testid={`demand-blocker-${r.id}`}
          >
            <span className="text-kit-slate-12">{PURCHASE_DEMAND_STATE_WORDS[r.state]}</span>
            {owner ? (
              <span
                className="rounded-control bg-kit-slate-3 px-1.5 text-kit-slate-11"
                data-testid={`demand-owner-${r.id}`}
              >
                {owner}
              </span>
            ) : null}
            <span className="text-kit-slate-11">{help}</span>
          </span>
        ) : null}
        {r.state === "ready_to_buy" && r.so != null ? (
          <span className="text-meta">
            <button
              type="button"
              className="text-kit-blue-11 underline-offset-2 hover:underline"
              onClick={() => openBatch(r.so)}
              data-testid={`demand-open-batch-${r.id}`}
            >
              {W.openBatch}
            </button>
          </span>
        ) : null}
      </li>
    );
  };

  const renderExpansion = (g: PurchaseDemandItemGroup) => (
    <div className="bg-white" data-testid={`demand-expansion-${g.key}`}>
      {g.singleVariant ? (
        // One variant is not a level — it costs a click and says nothing.
        <ul className="flex flex-col">
          {g.variants[0]!.rows.map((r) => (
            <Leaf key={r.id} r={r} />
          ))}
        </ul>
      ) : (
        g.variants.map((v) => (
          <div key={v.key}>
            {/* `kit-slate-3` — the lightest step the config PUBLISHES. A
                `slate-2` band renders nothing at all and the level would be
                invisible (the 2026-08-06 To Order defect; `kit-palette.test`
                is the guard that catches it). */}
            <div className="flex items-center justify-between border-t border-kit-slate-5 bg-kit-slate-3 px-3 py-1 text-label font-medium uppercase text-kit-slate-11">
              <span>{v.variant ?? g.item}</span>
              <span className="tabular-nums normal-case">
                {W.colToBuy} {v.toBuy}
              </span>
            </div>
            <ul className="flex flex-col">
              {v.rows.map((r) => (
                <Leaf key={r.id} r={r} />
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-kit-canvas">
      <PurchasingTabs />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside
          className="flex w-[200px] min-h-0 shrink-0 flex-col overflow-y-auto border-r border-kit-slate-5 bg-white px-3 py-3"
          data-testid="purchase-demands-rail"
        >
          {/* The rows are independent TOGGLES, so `RailItem` announces them as
              pressed — which is what it already does. The bare number is demand
              LINES; the word that says so lives in the title, exactly as the
              other Purchasing rails handle their own units. */}
          <RailGroup title={W.railHeading}>
            <RailItem
              active={stateSet.size === 0}
              onClick={clearStates}
              testId="purchase-demands-state-all"
              label={W.railAll}
              count={allRows.length}
              title={`${allRows.length} ${W.footerUnit}`}
            />
            {PURCHASE_DEMAND_STATES.map((s) => (
              <RailItem
                key={s}
                active={stateSet.has(s)}
                onClick={() => toggleState(s)}
                testId={`purchase-demands-state-${s}`}
                label={PURCHASE_DEMAND_RAIL_WORDS[s]}
                count={counts[s]}
                title={`${counts[s]} ${W.footerUnit} · ${PURCHASE_DEMAND_STATE_WORDS[s]}`}
              />
            ))}
          </RailGroup>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col p-2" data-testid="register-column">
          {q.isError ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-white">
              <p className="text-body text-kit-slate-12">
                The purchase demands could not be loaded
              </p>
              {(q.error as Error | undefined)?.message ? (
                <p className="text-meta text-kit-slate-11">{(q.error as Error).message}</p>
              ) : null}
              <button
                type="button"
                className="rounded-control border border-kit-slate-6 bg-white px-3 py-1.5 text-meta font-medium text-kit-slate-12 hover:bg-kit-slate-3"
                onClick={() => void q.refetch()}
              >
                Try again
              </button>
            </div>
          ) : (
            <DataGrid<PurchaseDemandItemGroup>
              appearance="reference"
              rows={groups}
              columns={columns}
              storageKey={STORAGE_KEY}
              rowKey={(g) => g.key}
              exportName={W.page}
              searchPlaceholder={W.search}
              isLoading={q.isLoading}
              emptyMessage={W.empty}
              groupBanner={false}
              stickyIdentity
              chooserGroupOrder={["Item", "Quantity", "Work to do"]}
              expandable={{ renderExpansion }}
              toolbarEnd={
                <button
                  type="button"
                  data-testid="open-so-batch-purchase"
                  onClick={() => openBatch(null)}
                  className="inline-flex h-7 shrink-0 items-center rounded-control border border-kit-slate-6 bg-white px-3 text-meta font-medium text-kit-slate-12 hover:bg-kit-slate-3"
                >
                  {W.openBatch}
                </button>
              }
              statusSummary={(filtered) => {
                const shown = filtered.flatMap((g) => g.rows);
                const line = purchaseDemandFooter(shown, allRows);
                return (
                  <span className="block truncate" title={line}>
                    {line}
                  </span>
                );
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
