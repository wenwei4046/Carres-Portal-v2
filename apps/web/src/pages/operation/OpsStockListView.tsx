import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { qk } from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";
import type { OpsStockItem, OpsStockListResponse } from "@carres/shared";

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
  | "flag-repair";

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
}

export default function OpsStockListView(props: Props) {
  const qc = useQueryClient();
  const listKey = ["operation", "ops-stock", props.cacheKey] as const;

  const listQ = useQuery<OpsStockListResponse>({
    queryKey: listKey,
    queryFn: () => apiFetch(`/api/ops/stock${props.endpoint}`),
    refetchInterval: 20_000,
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

  const rows: OpsStockItem[] = listQ.data?.items ?? [];

  // Reserve action needs a SKU + a customer ref. We surface a tiny form
  // above the table (rather than per-row) since reserve picks oldest free
  // matching SKU automatically.
  const [reserveSku, setReserveSku] = useState("");
  const [reserveRef, setReserveRef] = useState("");

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wider text-base-500 mb-1">
          {props.kicker}
        </p>
        <h1 className="text-3xl font-semibold text-base-900">{props.title}</h1>
        <p className="text-sm text-base-600 mt-2">{props.blurb}</p>
      </div>

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
              className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
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

      {listQ.isLoading ? (
        <p className="text-sm text-base-500">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded border border-base-200 bg-white p-12 text-center">
          <p className="text-base-700 font-medium">Nothing here.</p>
        </div>
      ) : (
        <div className="rounded border border-base-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-base-50 text-xs uppercase tracking-wider text-base-500">
              <tr>
                <th className="text-left px-3 py-2 font-medium">SKU</th>
                <th className="text-left px-3 py-2 font-medium">Condition</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-left px-3 py-2 font-medium">Reserved for</th>
                <th className="text-left px-3 py-2 font-medium">History</th>
                <th className="text-left px-3 py-2 font-medium">PO No.</th>
                <th className="text-left px-3 py-2 font-medium">Source Ref</th>
                <th className="text-left px-3 py-2 font-medium">Date in</th>
                <th className="text-right px-3 py-2 font-medium">Actions</th>
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
                  busy={
                    releaseMut.isPending ||
                    reassignMut.isPending ||
                    takeoutMut.isPending ||
                    flagRepairMut.isPending ||
                    conditionMut.isPending
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
  busy,
}: {
  row: OpsStockItem;
  actions: Action[];
  onConditionChange: (c: string) => void;
  onRelease: () => void;
  onReassign: (newRef: string) => void;
  onTakeout: () => void;
  onFlagRepair: (flag: boolean) => void;
  busy: boolean;
}) {
  const [showReassign, setShowReassign] = useState(false);
  const [newRef, setNewRef] = useState("");
  return (
    <tr className="border-t border-base-200 hover:bg-base-50">
      <td className="px-3 py-2 font-mono text-base-900">{row.sku}</td>
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
          <span className="ml-1 text-warning-700 text-xs">⚠</span>
        ) : null}
      </td>
      <td className="px-3 py-2">
        <span
          className={
            row.status === "free"
              ? "text-success-700 text-xs font-medium"
              : row.status === "reserved"
                ? "text-base-700 text-xs font-medium"
                : "text-base-400 text-xs"
          }
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
