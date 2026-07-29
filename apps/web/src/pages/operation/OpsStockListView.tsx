import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { qk } from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";
import {
  POOL_USE_REASONS,
  POOL_USE_REASON_LABEL,
  isHeldStockStatus,
  isSellableStockStatus,
  opsStockStatusLabel,
  poolDrawProblem,
  type OpsStockItem,
  type OpsStockListResponse,
  type PoolUseReason,
} from "@carres/shared";
import { AlertTriangle } from "lucide-react";

/**
 * Shared list view for the 4 ops-stock pages (Ready / Reserved / Repair /
 * Inventory). Each page passes its endpoint + which per-row actions to
 * enable. Keeps duplication low while letting each page own its sidebar
 * entry + mental mode.
 */

type Action =
  | "reserve"
  | "release"
  | "reassign"
  | "takeout"
  | "flag-repair"
  | "refurbish"
  | "add"
  | "remove";

interface Props {
  /** "/ready" | "/reserved" | "/repair" | "/inventory" */
  endpoint: string;
  /** The view label shown in the page header. */
  title: string;
  /** Kicker text above the title. */
  kicker: string;
  /** One-line subtitle under the title. */
  blurb: string;
  /** Per-row actions to enable. */
  actions: Action[];
  /** queryKey scope under qk.operation (e.g. 'opsStockReady'). Needed so
   *  each tab's cache is distinct + mutations can invalidate sibling tabs. */
  cacheKey: string;
  /** Jess redesign step 3 — embedded inside the unified Stock On Hand shell.
   *  Suppresses this component's own page header + outer page padding so the
   *  parent owns the chrome (title + filter chips). Defaults to standalone. */
  embedded?: boolean;
  /** When provided, render THESE rows instead of fetching. Lets the On Hand
   *  shell fetch the master /inventory grid ONCE, then client-side filter per
   *  chip — instant switching + chip counts off a single round-trip. Mutations
   *  still invalidate the ops-stock cache, which the parent's query listens to,
   *  so the injected rows refresh after any action. */
  rows?: OpsStockItem[];
  /** On Hand C+ P2 — roll units up by SKU/model into collapsible groups so a
   *  1000+ unit pool renders as ~150 header rows, not 1000 <select> rows.
   *  Groups start collapsed; expand on demand. */
  grouped?: boolean;
  /** Client-side page size. Paginates GROUPS when grouped, else rows. */
  pageSize?: number;
}

export default function OpsStockListView(props: Props) {
  const qc = useQueryClient();
  const listKey = ["operation", "ops-stock", props.cacheKey] as const;

  const listQ = useQuery<OpsStockListResponse>({
    queryKey: listKey,
    queryFn: () => apiFetch(`/api/ops/stock${props.endpoint}`),
    refetchInterval: 20_000,
    // Parent-injected rows bypass the fetch entirely.
    enabled: props.rows === undefined,
  });

  function invalidateAll() {
    // All 4 ops-stock list caches need a refresh after any action because
    // an item can hop between tabs (reserve takes from Ready → Reserved).
    qc.invalidateQueries({ queryKey: ["operation", "ops-stock"] });
    // stock_balances aggregate may have changed → operation dashboard /
    // warehouse view.
    qc.invalidateQueries({ queryKey: qk.operation.dashboard() });
  }

  const reserveMut = useMutation({
    mutationFn: (args: {
      sku: string;
      ref: string;
      reason: PoolUseReason;
      note: string | null;
    }) =>
      apiFetch<{ itemId: string }>(`/api/ops/stock/reserve`, {
        method: "POST",
        body: JSON.stringify(args),
      }),
    onSuccess: invalidateAll,
  });
  const conditionMut = useMutation({
    mutationFn: (args: { itemId: string; condition: string }) =>
      apiFetch(`/api/ops/stock/${args.itemId}/condition`, {
        method: "PATCH",
        body: JSON.stringify({ condition: args.condition }),
      }),
    onSuccess: invalidateAll,
  });

  const releaseMut = useMutation({
    mutationFn: (itemId: string) =>
      apiFetch(`/api/ops/stock/release`, {
        method: "POST",
        body: JSON.stringify({ itemId }),
      }),
    onSuccess: invalidateAll,
  });
  const reassignMut = useMutation({
    mutationFn: (args: { itemId: string; newRef: string }) =>
      apiFetch(`/api/ops/stock/reassign`, {
        method: "POST",
        body: JSON.stringify(args),
      }),
    onSuccess: invalidateAll,
  });
  const takeoutMut = useMutation({
    mutationFn: (args: {
      itemId: string;
      reason: PoolUseReason | null;
      note: string | null;
    }) =>
      apiFetch(`/api/ops/stock/takeout`, {
        method: "POST",
        body: JSON.stringify(args),
      }),
    onSuccess: invalidateAll,
  });
  const flagRepairMut = useMutation({
    mutationFn: (args: { itemId: string; flag: boolean }) =>
      apiFetch(`/api/ops/stock/flag-repair`, {
        method: "POST",
        body: JSON.stringify(args),
      }),
    onSuccess: invalidateAll,
  });
  // Refurbish lifecycle: a Free Display unit → In repair (out of ready-stock),
  // then completion grades it up to 'refurbished' (sellable as new) + Free.
  const refurbishMut = useMutation({
    mutationFn: (itemId: string) =>
      apiFetch(`/api/ops/stock/refurbish`, {
        method: "POST",
        body: JSON.stringify({ itemId }),
      }),
    onSuccess: invalidateAll,
  });
  const refurbishCompleteMut = useMutation({
    mutationFn: (itemId: string) =>
      apiFetch(`/api/ops/stock/refurbish-complete`, {
        method: "POST",
        body: JSON.stringify({ itemId }),
      }),
    onSuccess: invalidateAll,
  });
  // "+ Add stock" (GRN-in) + per-row Remove (Jess 2026-06-29).
  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch(`/api/ops/stock`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: invalidateAll,
  });
  const deleteMut = useMutation({
    mutationFn: (itemId: string) =>
      apiFetch(`/api/ops/stock/${itemId}`, { method: "DELETE" }),
    onSuccess: invalidateAll,
  });

  const rows: OpsStockItem[] = props.rows ?? listQ.data?.items ?? [];
  const loading = props.rows === undefined && listQ.isLoading;

  // Reserve action needs a SKU + a customer ref. We surface a tiny form
  // above the table (rather than per-row) since reserve picks oldest free
  // matching SKU automatically.
  const [reserveSku, setReserveSku] = useState("");
  const [reserveRef, setReserveRef] = useState("");
  // K4 (0292) — why the ready-pool unit is being pulled. The card's locked five
  // replace 0213's two, and the SAME shared rule the server enforces decides
  // whether the button is live, so a dark button and a refusal always agree.
  const [reserveReason, setReserveReason] = useState<PoolUseReason | "">("");
  const [reserveNote, setReserveNote] = useState("");
  const reserveProblem = poolDrawProblem({
    reason: reserveReason,
    note: reserveNote,
  });

  // "+ Add stock" form state.
  const EMPTY_ADD = {
    sku: "",
    condition: "new",
    status: "free",
    reservedRef: "",
    supplier: "",
    poNo: "",
    sourceRef: "",
    qty: "1",
  };
  const [showAdd, setShowAdd] = useState(false);
  const [add, setAdd] = useState(EMPTY_ADD);
  function submitAdd() {
    const body: Record<string, unknown> = {
      sku: add.sku.trim(),
      condition: add.condition,
      status: add.status,
      qty: add.qty,
    };
    if (add.status === "reserved" && add.reservedRef.trim())
      body.reservedRef = add.reservedRef.trim();
    if (add.supplier.trim()) body.supplier = add.supplier.trim();
    if (add.poNo.trim()) body.poNo = add.poNo.trim();
    if (add.sourceRef.trim()) body.sourceRef = add.sourceRef.trim();
    createMut.mutate(body, {
      onSuccess: () => {
        setAdd(EMPTY_ADD);
        setShowAdd(false);
      },
    });
  }

  // On Hand C+ P2 — grouped-by-model rollup + client pagination. A 1000+ unit
  // pool renders as ~150 collapsed group rows (one per SKU/model), each
  // expandable to its units; pagination bounds each page to `PAGE` groups.
  const grouped = props.grouped ?? false;
  const PAGE = props.pageSize ?? (grouped ? 25 : 50);
  const [page, setPage] = useState(0);
  // Groups start collapsed (expanded = the set of open SKUs).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Filters change the injected rows → jump back to page 1.
  useEffect(() => {
    setPage(0);
  }, [props.rows]);

  const groups = useMemo(() => {
    if (!grouped) return null;
    const m = new Map<string, OpsStockItem[]>();
    for (const r of rows) {
      const g = m.get(r.sku);
      if (g) g.push(r);
      else m.set(r.sku, [r]);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows, grouped]);

  const pageCount = grouped ? (groups?.length ?? 0) : rows.length;
  const totalPages = Math.max(1, Math.ceil(pageCount / PAGE));
  const safePage = Math.min(page, totalPages - 1);
  const pageGroups = grouped
    ? (groups ?? []).slice(safePage * PAGE, safePage * PAGE + PAGE)
    : [];
  const pageRows = grouped
    ? []
    : rows.slice(safePage * PAGE, safePage * PAGE + PAGE);

  function toggleGroup(sku: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  }
  function renderUnit(r: OpsStockItem) {
    return (
      <RowItem
        key={r.id}
        row={r}
        actions={props.actions}
        onConditionChange={(condition) =>
          conditionMut.mutate({ itemId: r.id, condition })
        }
        onRelease={() => releaseMut.mutate(r.id)}
        onReassign={(newRef) => reassignMut.mutate({ itemId: r.id, newRef })}
        onTakeout={(reason, note) => {
          if (
            window.confirm(
              `Take out unit ${r.sku}? This marks it sold + writes a stock movement.`,
            )
          ) {
            takeoutMut.mutate({ itemId: r.id, reason, note });
          }
        }}
        onFlagRepair={(flag) => flagRepairMut.mutate({ itemId: r.id, flag })}
        onRefurbish={() => refurbishMut.mutate(r.id)}
        onRefurbishComplete={() => {
          if (
            window.confirm(
              `Mark refurbish of ${r.sku} complete? It returns to Free stock, graded as Refurbished (sellable as new).`,
            )
          ) {
            refurbishCompleteMut.mutate(r.id);
          }
        }}
        onRemove={() => {
          if (
            window.confirm(
              `Remove unit ${r.sku} from stock? This deletes a mis-keyed entry (use Takeout for a sale).`,
            )
          ) {
            deleteMut.mutate(r.id);
          }
        }}
        busy={
          releaseMut.isPending ||
          reassignMut.isPending ||
          takeoutMut.isPending ||
          flagRepairMut.isPending ||
          refurbishMut.isPending ||
          refurbishCompleteMut.isPending ||
          conditionMut.isPending ||
          deleteMut.isPending
        }
      />
    );
  }

  return (
    <div className={props.embedded ? "" : "p-8 max-w-7xl mx-auto"}>
      {!props.embedded && (
        <div className="mb-6">
          <p className="text-meta uppercase tracking-wider text-base-500 mb-1">
            {props.kicker}
          </p>
          <h1 className="text-page text-base-900">{props.title}</h1>
          <p className="text-body text-base-600 mt-2">{props.blurb}</p>
        </div>
      )}

      {props.actions.includes("add") ? (
        <section className="rounded border border-base-200 bg-white p-4 mb-4">
          <div className="flex items-center justify-between">
            <h2 className="text-body font-semibold text-base-900">
              Add stock (receive new units)
            </h2>
            <button
              type="button"
              className="text-meta font-medium text-primary hover:underline"
              onClick={() => setShowAdd((s) => !s)}
            >
              {showAdd ? "Cancel" : "+ Add stock"}
            </button>
          </div>
          {showAdd ? (
            <div className="mt-3 flex flex-wrap gap-2 items-end">
              <label className="text-meta">
                <span className="block text-base-500 mb-1">SKU (Item Code)</span>
                <input
                  className="rounded border border-base-300 px-2 py-1.5 text-body w-56"
                  value={add.sku}
                  onChange={(e) => setAdd((a) => ({ ...a, sku: e.target.value }))}
                  placeholder="1007-K BEDFRAME"
                  autoFocus
                />
              </label>
              <label className="text-meta">
                <span className="block text-base-500 mb-1">Condition</span>
                <select
                  className="rounded border border-base-300 px-2 py-1.5 text-body"
                  value={add.condition}
                  onChange={(e) => setAdd((a) => ({ ...a, condition: e.target.value }))}
                >
                  {Object.entries(CONDITION_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </label>
              <label className="text-meta">
                <span className="block text-base-500 mb-1">Status</span>
                <select
                  className="rounded border border-base-300 px-2 py-1.5 text-body"
                  value={add.status}
                  onChange={(e) => setAdd((a) => ({ ...a, status: e.target.value }))}
                >
                  <option value="free">Free</option>
                  <option value="reserved">Reserved</option>
                </select>
              </label>
              {add.status === "reserved" ? (
                <label className="text-meta">
                  <span className="block text-base-500 mb-1">Reserved ref</span>
                  <input
                    className="rounded border border-base-300 px-2 py-1.5 text-body w-32"
                    value={add.reservedRef}
                    onChange={(e) => setAdd((a) => ({ ...a, reservedRef: e.target.value }))}
                    placeholder="SO-1001"
                  />
                </label>
              ) : null}
              <label className="text-meta">
                <span className="block text-base-500 mb-1">Supplier</span>
                <input
                  className="rounded border border-base-300 px-2 py-1.5 text-body w-28"
                  value={add.supplier}
                  onChange={(e) => setAdd((a) => ({ ...a, supplier: e.target.value }))}
                  placeholder="NF"
                />
              </label>
              <label className="text-meta">
                <span className="block text-base-500 mb-1">PO No.</span>
                <input
                  className="rounded border border-base-300 px-2 py-1.5 text-body w-32"
                  value={add.poNo}
                  onChange={(e) => setAdd((a) => ({ ...a, poNo: e.target.value }))}
                  placeholder="PO/2604-042"
                />
              </label>
              <label className="text-meta">
                <span className="block text-base-500 mb-1">Source ref</span>
                <input
                  className="rounded border border-base-300 px-2 py-1.5 text-body w-28"
                  value={add.sourceRef}
                  onChange={(e) => setAdd((a) => ({ ...a, sourceRef: e.target.value }))}
                  placeholder="CR0973"
                />
              </label>
              <label className="text-meta">
                <span className="block text-base-500 mb-1">Qty</span>
                <input
                  type="number"
                  min={1}
                  className="rounded border border-base-300 px-2 py-1.5 text-body w-16"
                  value={add.qty}
                  onChange={(e) => setAdd((a) => ({ ...a, qty: e.target.value }))}
                />
              </label>
              <button
                type="button"
                className="rounded bg-base-900 px-3 py-1.5 text-body font-medium text-white hover:bg-base-800 disabled:opacity-50"
                disabled={!add.sku.trim() || createMut.isPending}
                onClick={submitAdd}
              >
                {createMut.isPending ? "Adding…" : "Add"}
              </button>
            </div>
          ) : null}
          {createMut.isError ? (
            <p className="mt-2 text-meta text-error-700">
              {(createMut.error as { message?: string })?.message ?? "add failed"}
            </p>
          ) : null}
        </section>
      ) : null}

      {props.actions.includes("reserve") ? (
        <section className="rounded border border-base-200 bg-white p-4 mb-4">
          <h2 className="text-body font-semibold text-base-900 mb-2">
            Reserve oldest free unit
          </h2>
          <div className="flex flex-wrap gap-2 items-end">
            <label className="text-meta">
              <span className="block text-base-500 mb-1">SKU (Item Code)</span>
              <input
                className="rounded border border-base-300 px-2 py-1.5 text-body w-56"
                value={reserveSku}
                onChange={(e) => setReserveSku(e.target.value)}
                placeholder="MS01-B1201F-K"
              />
            </label>
            <label className="text-meta">
              <span className="block text-base-500 mb-1">Customer Ref</span>
              <input
                className="rounded border border-base-300 px-2 py-1.5 text-body w-40"
                value={reserveRef}
                onChange={(e) => setReserveRef(e.target.value)}
                placeholder="SO-1001"
              />
            </label>
            <label className="text-meta">
              <span className="block text-base-500 mb-1">Reason</span>
              <select
                className="rounded border border-base-300 px-2 py-1.5 text-body w-44"
                value={reserveReason}
                onChange={(e) =>
                  setReserveReason(e.target.value as PoolUseReason | "")
                }
                data-testid="onhand-reserve-reason"
              >
                <option value="">Why taken?</option>
                {POOL_USE_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {POOL_USE_REASON_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-meta">
              <span className="block text-base-500 mb-1">Detail</span>
              <input
                className="rounded border border-base-300 px-2 py-1.5 text-body w-48"
                value={reserveNote}
                onChange={(e) => setReserveNote(e.target.value)}
                placeholder={
                  reserveReason === "other"
                    ? "Say what the reason is"
                    : "Optional"
                }
                data-testid="onhand-reserve-note"
              />
            </label>
            <button
              type="button"
              className="rounded bg-base-900 px-3 py-1.5 text-body font-medium text-white hover:bg-base-800 disabled:opacity-50"
              disabled={
                !reserveSku.trim() ||
                !reserveRef.trim() ||
                !!reserveProblem ||
                reserveMut.isPending
              }
              onClick={() =>
                reserveMut.mutate(
                  {
                    sku: reserveSku.trim(),
                    ref: reserveRef.trim(),
                    reason: reserveReason as PoolUseReason,
                    note: reserveNote.trim() || null,
                  },
                  {
                    onSuccess: () => {
                      setReserveSku("");
                      setReserveRef("");
                      setReserveReason("");
                      setReserveNote("");
                    },
                  },
                )
              }
            >
              {reserveMut.isPending ? "Reserving…" : "Reserve"}
            </button>
            {reserveProblem ? (
              <span
                className="text-meta text-base-500 self-center"
                data-testid="onhand-reserve-problem"
              >
                {reserveProblem}
              </span>
            ) : null}
          </div>
          {reserveMut.isError ? (
            <p className="mt-2 text-meta text-error-700">
              {(reserveMut.error as { message?: string })?.message ??
                "reserve failed"}
            </p>
          ) : null}
        </section>
      ) : null}

      {loading ? (
        <p className="text-body text-base-500">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded border border-base-200 bg-white p-12 text-center">
          <p className="text-base-700 font-medium">Nothing here.</p>
        </div>
      ) : (
        <>
          {grouped ? (
            <div className="flex items-center justify-between mb-2">
              <span className="text-label text-base-500">
                {groups?.length ?? 0} models · {rows.length} units
              </span>
              <div className="flex gap-3 text-label">
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() =>
                    setExpanded(new Set((groups ?? []).map(([s]) => s)))
                  }
                >
                  Expand all
                </button>
                <button
                  type="button"
                  className="text-base-500 hover:underline"
                  onClick={() => setExpanded(new Set())}
                >
                  Collapse all
                </button>
              </div>
            </div>
          ) : null}
          <div className="rounded border border-base-200 bg-white overflow-x-auto">
            <table className="w-full text-body">
              <thead className="bg-base-700 border-b-2 border-primary text-label uppercase tracking-[0.02em] text-white">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Unit ID</th>
                  <th className="text-left px-3 py-2 font-semibold">SKU</th>
                  <th className="text-left px-3 py-2 font-semibold">Condition</th>
                  <th className="text-left px-3 py-2 font-semibold">Status</th>
                  <th className="text-left px-3 py-2 font-semibold">Reserved for</th>
                  <th className="text-left px-3 py-2 font-semibold">History</th>
                  <th className="text-left px-3 py-2 font-semibold">PO No.</th>
                  <th className="text-left px-3 py-2 font-semibold">Source Ref</th>
                  <th className="text-left px-3 py-2 font-semibold">Date in</th>
                  <th className="text-right px-3 py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {grouped
                  ? pageGroups.map(([sku, rs]) => {
                      const isOpen = expanded.has(sku);
                      const reserved = rs.filter(
                        (x) => x.status === "reserved",
                      ).length;
                      const repair = rs.filter((x) => x.needsRepair).length;
                      // R4: counted, never subtracted. `rs.length - reserved -
                      // repair` called every other status ready, so a held unit
                      // would have been advertised as available in the one
                      // number a picker reads at a glance.
                      const ready = rs.filter(
                        (x) => isSellableStockStatus(x.status) && !x.needsRepair,
                      ).length;
                      const held = rs.filter((x) => isHeldStockStatus(x.status)).length;
                      return (
                        <Fragment key={"g-" + sku}>
                          <tr className="bg-base-100 border-t border-base-200">
                            <td colSpan={10} className="px-3 py-1.5">
                              <button
                                type="button"
                                onClick={() => toggleGroup(sku)}
                                className="inline-flex items-center gap-2 text-left"
                              >
                                <span className="text-base-400 w-3 inline-block">
                                  {isOpen ? "▾" : "▸"}
                                </span>
                                <span className="font-mono text-meta font-semibold text-base-900">
                                  {sku}
                                </span>
                                <span className="text-label text-base-500">
                                  {rs.length} units ·{" "}
                                  <span className="text-success-700">
                                    {ready} ready
                                  </span>
                                  {reserved ? ` · ${reserved} reserved` : ""}
                                  {held ? (
                                    <span className="text-warning-700">
                                      {" "}
                                      · {held} on hold
                                    </span>
                                  ) : null}
                                  {repair ? (
                                    <span className="text-warning-700">
                                      {" "}
                                      · {repair} repair
                                    </span>
                                  ) : null}
                                </span>
                              </button>
                            </td>
                          </tr>
                          {isOpen ? rs.map(renderUnit) : null}
                        </Fragment>
                      );
                    })
                  : pageRows.map(renderUnit)}
              </tbody>
            </table>
          </div>
          {totalPages > 1 ? (
            <div className="flex items-center justify-between mt-3 text-meta text-base-600">
              <span>
                Page {safePage + 1} of {totalPages}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={safePage <= 0}
                  onClick={() => setPage(safePage - 1)}
                  className="rounded border border-base-300 bg-white px-2.5 py-1 text-meta hover:bg-base-100 disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={safePage >= totalPages - 1}
                  onClick={() => setPage(safePage + 1)}
                  className="rounded border border-base-300 bg-white px-2.5 py-1 text-meta hover:bg-base-100 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

const CONDITION_LABEL: Record<string, string> = {
  new: "New",
  exhibition: "Display",
  old: "Fair (used)",
  refurbished: "Refurbished",
  damaged: "Damaged",
};

function RowItem({
  row,
  actions,
  onConditionChange,
  onRelease,
  onReassign,
  onTakeout,
  onFlagRepair,
  onRefurbish,
  onRefurbishComplete,
  onRemove,
  busy,
}: {
  row: OpsStockItem;
  actions: Action[];
  onConditionChange: (c: string) => void;
  onRelease: () => void;
  onReassign: (newRef: string) => void;
  onTakeout: (reason: PoolUseReason | null, note: string | null) => void;
  onFlagRepair: (flag: boolean) => void;
  onRefurbish: () => void;
  onRefurbishComplete: () => void;
  onRemove: () => void;
  busy: boolean;
}) {
  const [showReassign, setShowReassign] = useState(false);
  const [newRef, setNewRef] = useState("");
  // K4 — the reason a FREE unit is being taken, asked inline (the same shape
  // the Reassign box already uses) because a window.confirm cannot ask it.
  const [showTakeout, setShowTakeout] = useState(false);
  const [takeoutReason, setTakeoutReason] = useState<PoolUseReason | "">("");
  const [takeoutNote, setTakeoutNote] = useState("");
  return (
    <tr className="border-t border-base-200 hover:bg-base-50">
      {/* Unit ID = the minted per-unit serial (id-abc123456). Falls back to "—"
          for legacy/seed rows that never got a unit_code. Previously this cell
          showed row.sku, which (a) was wrong and (b) left the header row one
          column wider than the body — fixed by adding the dedicated SKU cell
          that follows. */}
      <td className="px-3 py-2 font-mono text-label text-base-900 whitespace-nowrap">
        {row.unitCode ?? <span className="text-base-400">—</span>}
      </td>
      <td className="px-3 py-2 font-mono text-base-700">
        {row.sku}
        {row.qty && row.qty > 1 ? (
          <span
            className="ml-1.5 rounded bg-base-100 px-1.5 py-0.5 text-label font-semibold text-base-600"
            title="Bulk line — this record represents this many units"
          >
            ×{row.qty}
          </span>
        ) : null}
      </td>
      <td className="px-3 py-2">
        <select
          value={row.condition}
          onChange={(e) => onConditionChange(e.target.value)}
          disabled={busy}
          className="rounded border border-base-200 bg-white px-1.5 py-0.5 text-meta text-base-700 focus:border-primary focus:outline-none disabled:opacity-50"
        >
          {Object.entries(CONDITION_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        {row.needsRepair ? (
          <AlertTriangle size={12} strokeWidth={2.5} className="ml-1 inline text-warning-700" />
        ) : null}
      </td>
      <td className="px-3 py-2">
        {/* R4 (0299): the words come from the shared label map, not from the
            raw column — a status added in SQL used to reach the screen as
            `written_off`. A held unit is amber, not red: nothing is broken
            about the system, the goods are simply not available. */}
        <span
          className={`pill ${
            row.status === "free"
              ? "pill-confirmed"
              : row.status === "reserved"
                ? "pill-collected"
                : row.status === "on_hold"
                  ? "pill-warning"
                  : "pill-neutral"
          }`}
        >
          {opsStockStatusLabel(row.status)}
        </span>
      </td>
      <td className="px-3 py-2 text-base-700">{row.reservedRef ?? "—"}</td>
      <td className="px-3 py-2 text-meta text-base-500">
        {row.refHistory.length > 0 ? row.refHistory.join(", ") : "—"}
      </td>
      <td className="px-3 py-2 text-meta text-base-600 font-mono">{row.poNo ?? "—"}</td>
      <td className="px-3 py-2 text-meta text-base-500 font-mono">{row.sourceRef ?? "—"}</td>
      <td className="px-3 py-2 text-meta text-base-500">{fmtDate(row.dateIn)}</td>
      <td className="px-3 py-2 text-right">
        <div className="flex flex-wrap gap-1 justify-end items-center">
          {actions.includes("release") && row.status === "reserved" ? (
            <ActionBtn label="Release" onClick={onRelease} disabled={busy} />
          ) : null}
          {actions.includes("reassign") && row.status === "reserved" ? (
            showReassign ? (
              <>
                <input
                  className="rounded border border-base-300 px-2 py-1 text-meta w-28"
                  value={newRef}
                  onChange={(e) => setNewRef(e.target.value)}
                  placeholder="new ref"
                  autoFocus
                />
                <ActionBtn
                  label="✓"
                  onClick={() => {
                    if (newRef.trim()) {
                      onReassign(newRef.trim());
                      setShowReassign(false);
                      setNewRef("");
                    }
                  }}
                  disabled={busy || !newRef.trim()}
                />
                <ActionBtn
                  label="×"
                  onClick={() => {
                    setShowReassign(false);
                    setNewRef("");
                  }}
                  disabled={busy}
                />
              </>
            ) : (
              <ActionBtn label="Reassign" onClick={() => setShowReassign(true)} disabled={busy} />
            )
          ) : null}
          {/* K4 — taking a unit straight off the FREE shelf draws on ready
              stock, so it answers the same question the reserve doors ask.
              A RESERVED unit does not: that draw was recorded when it was
              reserved, and asking twice would double-count the month. */}
          {actions.includes("takeout") && row.status === "free" ? (
            showTakeout ? (
              <>
                <select
                  value={takeoutReason}
                  onChange={(e) =>
                    setTakeoutReason(e.target.value as PoolUseReason | "")
                  }
                  className="rounded border border-base-300 px-1.5 py-1 text-meta"
                  aria-label={`Why ${row.sku} is being taken`}
                  data-testid={`takeout-reason-${row.id}`}
                >
                  <option value="">Why taken?</option>
                  {POOL_USE_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {POOL_USE_REASON_LABEL[r]}
                    </option>
                  ))}
                </select>
                <input
                  className="rounded border border-base-300 px-2 py-1 text-meta w-28"
                  value={takeoutNote}
                  onChange={(e) => setTakeoutNote(e.target.value)}
                  placeholder={takeoutReason === "other" ? "say what" : "detail"}
                  aria-label="More detail"
                />
                <ActionBtn
                  label="✓"
                  onClick={() => {
                    onTakeout(takeoutReason as PoolUseReason, takeoutNote.trim() || null);
                    setShowTakeout(false);
                    setTakeoutReason("");
                    setTakeoutNote("");
                  }}
                  disabled={
                    busy ||
                    !!poolDrawProblem({ reason: takeoutReason, note: takeoutNote })
                  }
                />
                <ActionBtn
                  label="×"
                  onClick={() => {
                    setShowTakeout(false);
                    setTakeoutReason("");
                    setTakeoutNote("");
                  }}
                  disabled={busy}
                />
              </>
            ) : (
              <ActionBtn
                label="Takeout"
                onClick={() => setShowTakeout(true)}
                disabled={busy}
              />
            )
          ) : actions.includes("takeout") && row.status === "reserved" ? (
            <ActionBtn label="Takeout" onClick={() => onTakeout(null, null)} disabled={busy} />
          ) : null}
          {actions.includes("flag-repair") ? (
            <ActionBtn
              label={row.needsRepair ? "Unflag" : "Repair"}
              onClick={() => onFlagRepair(!row.needsRepair)}
              disabled={busy}
            />
          ) : null}
          {actions.includes("refurbish") &&
          row.needsRepair ? (
            <ActionBtn label="Refurbish done" onClick={onRefurbishComplete} disabled={busy} />
          ) : actions.includes("refurbish") &&
            row.status === "free" &&
            row.condition === "exhibition" ? (
            <ActionBtn label="Refurbish" onClick={onRefurbish} disabled={busy} />
          ) : null}
          {actions.includes("remove") ? (
            <ActionBtn label="Remove" onClick={onRemove} disabled={busy} />
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function ActionBtn({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      className="rounded border border-base-300 bg-white px-2 py-1 text-meta text-base-700 hover:bg-base-100 disabled:opacity-40 disabled:cursor-not-allowed"
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  );
}
