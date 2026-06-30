import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { qk } from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";
import type { OpsStockItem, OpsStockListResponse } from "@carres/shared";
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
    mutationFn: (args: { sku: string; ref: string }) =>
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
    mutationFn: (itemId: string) =>
      apiFetch(`/api/ops/stock/takeout`, {
        method: "POST",
        body: JSON.stringify({ itemId }),
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

  return (
    <div className={props.embedded ? "" : "p-8 max-w-7xl mx-auto"}>
      {!props.embedded && (
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wider text-base-500 mb-1">
            {props.kicker}
          </p>
          <h1 className="t-h1 text-base-900">{props.title}</h1>
          <p className="text-sm text-base-600 mt-2">{props.blurb}</p>
        </div>
      )}

      {props.actions.includes("add") ? (
        <section className="rounded border border-base-200 bg-white p-4 mb-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-base-900">
              Add stock (receive new units)
            </h2>
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => setShowAdd((s) => !s)}
            >
              {showAdd ? "Cancel" : "+ Add stock"}
            </button>
          </div>
          {showAdd ? (
            <div className="mt-3 flex flex-wrap gap-2 items-end">
              <label className="text-xs">
                <span className="block text-base-500 mb-1">SKU (Item Code)</span>
                <input
                  className="rounded border border-base-300 px-2 py-1.5 text-sm w-56"
                  value={add.sku}
                  onChange={(e) => setAdd((a) => ({ ...a, sku: e.target.value }))}
                  placeholder="1007-K BEDFRAME"
                  autoFocus
                />
              </label>
              <label className="text-xs">
                <span className="block text-base-500 mb-1">Condition</span>
                <select
                  className="rounded border border-base-300 px-2 py-1.5 text-sm"
                  value={add.condition}
                  onChange={(e) => setAdd((a) => ({ ...a, condition: e.target.value }))}
                >
                  {Object.entries(CONDITION_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                <span className="block text-base-500 mb-1">Status</span>
                <select
                  className="rounded border border-base-300 px-2 py-1.5 text-sm"
                  value={add.status}
                  onChange={(e) => setAdd((a) => ({ ...a, status: e.target.value }))}
                >
                  <option value="free">Free</option>
                  <option value="reserved">Reserved</option>
                </select>
              </label>
              {add.status === "reserved" ? (
                <label className="text-xs">
                  <span className="block text-base-500 mb-1">Reserved ref</span>
                  <input
                    className="rounded border border-base-300 px-2 py-1.5 text-sm w-32"
                    value={add.reservedRef}
                    onChange={(e) => setAdd((a) => ({ ...a, reservedRef: e.target.value }))}
                    placeholder="SO-1001"
                  />
                </label>
              ) : null}
              <label className="text-xs">
                <span className="block text-base-500 mb-1">Supplier</span>
                <input
                  className="rounded border border-base-300 px-2 py-1.5 text-sm w-28"
                  value={add.supplier}
                  onChange={(e) => setAdd((a) => ({ ...a, supplier: e.target.value }))}
                  placeholder="NF"
                />
              </label>
              <label className="text-xs">
                <span className="block text-base-500 mb-1">PO No.</span>
                <input
                  className="rounded border border-base-300 px-2 py-1.5 text-sm w-32"
                  value={add.poNo}
                  onChange={(e) => setAdd((a) => ({ ...a, poNo: e.target.value }))}
                  placeholder="PO/2604-042"
                />
              </label>
              <label className="text-xs">
                <span className="block text-base-500 mb-1">Source ref</span>
                <input
                  className="rounded border border-base-300 px-2 py-1.5 text-sm w-28"
                  value={add.sourceRef}
                  onChange={(e) => setAdd((a) => ({ ...a, sourceRef: e.target.value }))}
                  placeholder="CR0973"
                />
              </label>
              <label className="text-xs">
                <span className="block text-base-500 mb-1">Qty</span>
                <input
                  type="number"
                  min={1}
                  className="rounded border border-base-300 px-2 py-1.5 text-sm w-16"
                  value={add.qty}
                  onChange={(e) => setAdd((a) => ({ ...a, qty: e.target.value }))}
                />
              </label>
              <button
                type="button"
                className="rounded bg-base-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-base-800 disabled:opacity-50"
                disabled={!add.sku.trim() || createMut.isPending}
                onClick={submitAdd}
              >
                {createMut.isPending ? "Adding…" : "Add"}
              </button>
            </div>
          ) : null}
          {createMut.isError ? (
            <p className="mt-2 text-xs text-error-700">
              {(createMut.error as { message?: string })?.message ?? "add failed"}
            </p>
          ) : null}
        </section>
      ) : null}

      {props.actions.includes("reserve") ? (
        <section className="rounded border border-base-200 bg-white p-4 mb-4">
          <h2 className="text-sm font-semibold text-base-900 mb-2">
            Reserve oldest free unit
          </h2>
          <div className="flex flex-wrap gap-2 items-end">
            <label className="text-xs">
              <span className="block text-base-500 mb-1">SKU (Item Code)</span>
              <input
                className="rounded border border-base-300 px-2 py-1.5 text-sm w-56"
                value={reserveSku}
                onChange={(e) => setReserveSku(e.target.value)}
                placeholder="MS01-B1201F-K"
              />
            </label>
            <label className="text-xs">
              <span className="block text-base-500 mb-1">Customer Ref</span>
              <input
                className="rounded border border-base-300 px-2 py-1.5 text-sm w-40"
                value={reserveRef}
                onChange={(e) => setReserveRef(e.target.value)}
                placeholder="SO-1001"
              />
            </label>
            <button
              type="button"
              className="rounded bg-base-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-base-800 disabled:opacity-50"
              disabled={
                !reserveSku.trim() ||
                !reserveRef.trim() ||
                reserveMut.isPending
              }
              onClick={() =>
                reserveMut.mutate(
                  { sku: reserveSku.trim(), ref: reserveRef.trim() },
                  {
                    onSuccess: () => {
                      setReserveSku("");
                      setReserveRef("");
                    },
                  },
                )
              }
            >
              {reserveMut.isPending ? "Reserving…" : "Reserve"}
            </button>
          </div>
          {reserveMut.isError ? (
            <p className="mt-2 text-xs text-error-700">
              {(reserveMut.error as { message?: string })?.message ??
                "reserve failed"}
            </p>
          ) : null}
        </section>
      ) : null}

      {loading ? (
        <p className="text-sm text-base-500">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded border border-base-200 bg-white p-12 text-center">
          <p className="text-base-700 font-medium">Nothing here.</p>
        </div>
      ) : (
        <div className="rounded border border-base-200 bg-white overflow-x-auto">
          <table className="w-full text-sm [&_tbody_tr:nth-child(even)]:bg-base-50/60">
            <thead className="bg-base-700 text-[11px] uppercase tracking-[0.02em] text-white">
              <tr>
                <th className="text-left px-3 py-2 font-bold">Unit ID</th>
                <th className="text-left px-3 py-2 font-bold">SKU</th>
                <th className="text-left px-3 py-2 font-bold">Condition</th>
                <th className="text-left px-3 py-2 font-bold">Status</th>
                <th className="text-left px-3 py-2 font-bold">Reserved for</th>
                <th className="text-left px-3 py-2 font-bold">History</th>
                <th className="text-left px-3 py-2 font-bold">PO No.</th>
                <th className="text-left px-3 py-2 font-bold">Source Ref</th>
                <th className="text-left px-3 py-2 font-bold">Date in</th>
                <th className="text-right px-3 py-2 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <RowItem
                  key={r.id}
                  row={r}
                  actions={props.actions}
                  onConditionChange={(condition) =>
                    conditionMut.mutate({ itemId: r.id, condition })
                  }
                  onRelease={() => releaseMut.mutate(r.id)}
                  onReassign={(newRef) =>
                    reassignMut.mutate({ itemId: r.id, newRef })
                  }
                  onTakeout={() => {
                    if (
                      window.confirm(
                        `Take out unit ${r.sku}? This marks it sold + writes a stock movement.`,
                      )
                    ) {
                      takeoutMut.mutate(r.id);
                    }
                  }}
                  onFlagRepair={(flag) =>
                    flagRepairMut.mutate({ itemId: r.id, flag })
                  }
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
                    conditionMut.isPending ||
                    deleteMut.isPending
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const CONDITION_LABEL: Record<string, string> = {
  new: "New",
  exhibition: "Exhibition",
  old: "Old",
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
  onRemove,
  busy,
}: {
  row: OpsStockItem;
  actions: Action[];
  onConditionChange: (c: string) => void;
  onRelease: () => void;
  onReassign: (newRef: string) => void;
  onTakeout: () => void;
  onFlagRepair: (flag: boolean) => void;
  onRemove: () => void;
  busy: boolean;
}) {
  const [showReassign, setShowReassign] = useState(false);
  const [newRef, setNewRef] = useState("");
  return (
    <tr className="border-t border-base-200 hover:bg-base-50">
      {/* Unit ID = the minted per-unit serial (id-abc123456). Falls back to "—"
          for legacy/seed rows that never got a unit_code. Previously this cell
          showed row.sku, which (a) was wrong and (b) left the header row one
          column wider than the body — fixed by adding the dedicated SKU cell
          that follows. */}
      <td className="px-3 py-2 font-mono text-[11px] text-base-900 whitespace-nowrap">
        {row.unitCode ?? <span className="text-base-400">—</span>}
      </td>
      <td className="px-3 py-2 font-mono text-base-700">{row.sku}</td>
      <td className="px-3 py-2">
        <select
          value={row.condition}
          onChange={(e) => onConditionChange(e.target.value)}
          disabled={busy}
          className="rounded border border-base-200 bg-white px-1.5 py-0.5 text-xs text-base-700 focus:border-primary focus:outline-none disabled:opacity-50"
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
        <span
          className={`pill capitalize ${
            row.status === "free"
              ? "pill-confirmed"
              : row.status === "reserved"
                ? "pill-collected"
                : "pill-neutral"
          }`}
        >
          {row.status}
        </span>
      </td>
      <td className="px-3 py-2 text-base-700">{row.reservedRef ?? "—"}</td>
      <td className="px-3 py-2 text-xs text-base-500">
        {row.refHistory.length > 0 ? row.refHistory.join(", ") : "—"}
      </td>
      <td className="px-3 py-2 text-xs text-base-600 font-mono">{row.poNo ?? "—"}</td>
      <td className="px-3 py-2 text-xs text-base-500 font-mono">{row.sourceRef ?? "—"}</td>
      <td className="px-3 py-2 text-xs text-base-500">{fmtDate(row.dateIn)}</td>
      <td className="px-3 py-2 text-right">
        <div className="flex flex-wrap gap-1 justify-end items-center">
          {actions.includes("release") && row.status === "reserved" ? (
            <ActionBtn label="Release" onClick={onRelease} disabled={busy} />
          ) : null}
          {actions.includes("reassign") && row.status === "reserved" ? (
            showReassign ? (
              <>
                <input
                  className="rounded border border-base-300 px-2 py-1 text-xs w-28"
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
          {actions.includes("takeout") &&
          (row.status === "free" || row.status === "reserved") ? (
            <ActionBtn label="Takeout" onClick={onTakeout} disabled={busy} />
          ) : null}
          {actions.includes("flag-repair") ? (
            <ActionBtn
              label={row.needsRepair ? "Unflag" : "Repair"}
              onClick={() => onFlagRepair(!row.needsRepair)}
              disabled={busy}
            />
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
      className="rounded border border-base-300 bg-white px-2 py-1 text-xs text-base-700 hover:bg-base-100 disabled:opacity-40 disabled:cursor-not-allowed"
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  );
}
