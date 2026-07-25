import { useState } from "react";
import { useDecideOrderChangeRequest, useOrderChangeRequests } from "@/lib/queries";

/**
 * ChangeRequestsPanel — Add-product P3 (0233, design 2026-07-18 §4). The
 * operator's approval card for a dealer-submitted product change on a
 * proceed-lane order. APPROVE runs the full engine pipeline server-side
 * (fresh prices / mutex / gifts / delivery) and applies atomically;
 * REJECT stamps the request with the note (surfaced to the dealer's POS).
 * Auto-hides when the order has no pending request.
 *
 * 0257 — kind-aware: 'add_lines' (product lines + service add-ons) renders
 * the append list; 'replace_lines' renders the old→new swap (applied through
 * replace_order_lines — up-sell only, blocked once the line has a live
 * procurement thread: `line_in_production`).
 */
export default function ChangeRequestsPanel({ orderId }: { orderId: string }) {
  const reqQ = useOrderChangeRequests(orderId);
  const decideMut = useDecideOrderChangeRequest(orderId);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const pending = (reqQ.data?.requests ?? []).find((r) => r.status === "pending") ?? null;
  if (!pending) return null;

  const isReplace = pending.kind === "replace_lines";
  // 0258 — service add-on qty/size edit.
  const isAddonEdit = pending.kind === "edit_addon";
  const lines = [
    ...((pending.payload.lines ?? []) as Array<{
      sku?: string;
      qty?: number;
      unitPrice?: number;
      label?: string;
    }>),
    ...((pending.payload.addons ?? []) as Array<{
      addonKey?: string;
      qty?: number;
      unitPrice?: number;
      label?: string;
    }>).map((a) => ({ sku: a.addonKey, qty: a.qty, unitPrice: a.unitPrice, label: a.label })),
  ];
  const targetLines = (pending.payload.targetLines ?? []) as Array<{
    sku?: string;
    qty?: number;
    unitPrice?: number;
    label?: string;
  }>;
  const newLine = (pending.payload.line ?? {}) as {
    sku?: string;
    qty?: number;
    unitPrice?: number;
    label?: string;
  };

  async function decide(approve: boolean) {
    if (!pending) return;
    setErr(null);
    try {
      await decideMut.mutateAsync({
        requestId: pending.id,
        approve,
        note: note.trim() || null,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Decision failed");
    }
  }

  return (
    <div
      className="rounded border border-warning bg-warning-soft/40 p-3 my-3"
      data-testid="ops-change-requests"
    >
      <p className="t-micro text-base-600 mb-1.5">
        {isReplace
          ? "Item change · awaiting approval"
          : isAddonEdit
            ? "Add-on change · awaiting approval"
            : "Product change · awaiting approval"}
      </p>
      {isAddonEdit ? (
        <div data-testid="ops-cr-editaddon">
          <div className="flex items-center justify-between t-small text-base-500 line-through">
            <span>
              {(pending.payload.label as string | undefined) ?? "Add-on"} ×
              {pending.payload.oldQty ?? "?"}
              {pending.payload.oldSize ? ` · ${pending.payload.oldSize}` : ""}
            </span>
          </div>
          <div className="flex items-center justify-between t-small text-base-800">
            <span>
              → ×{pending.payload.qty ?? "?"}
              {typeof (pending.payload.attrs as { size?: unknown } | null | undefined)?.size ===
              "string"
                ? ` · ${(pending.payload.attrs as { size: string }).size}`
                : ""}
            </span>
          </div>
        </div>
      ) : isReplace ? (
        <div data-testid="ops-cr-replace">
          {targetLines.map((l, i) => (
            <div
              key={i}
              className="flex items-center justify-between t-small text-base-500 line-through"
            >
              <span>
                {l.label ?? l.sku} ×{l.qty ?? 1}
              </span>
              {typeof l.unitPrice === "number" && (
                <span className="font-mono">RM {l.unitPrice.toLocaleString()}</span>
              )}
            </div>
          ))}
          <div className="flex items-center justify-between t-small text-base-800">
            <span>
              → {newLine.label ?? newLine.sku} ×{newLine.qty ?? 1}
            </span>
            {typeof newLine.unitPrice === "number" && (
              <span className="font-mono text-base-600">
                ≈ RM {newLine.unitPrice.toLocaleString()}
              </span>
            )}
          </div>
        </div>
      ) : (
        lines.map((l, i) => (
          <div key={i} className="flex items-center justify-between t-small text-base-800">
            <span>
              {l.label ?? l.sku} ×{l.qty ?? 1}
            </span>
            {typeof l.unitPrice === "number" && (
              <span className="font-mono text-base-600">
                ≈ RM {l.unitPrice.toLocaleString()}
              </span>
            )}
          </div>
        ))
      )}
      <p className="t-tiny text-base-500 mt-1">
        Prices re-derive from the live catalog at approval.
      </p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Decision note (sent to the dealer on reject)"
        rows={2}
        className="w-full mt-2 px-2 py-1.5 border border-base-300 rounded text-sm bg-white outline-none focus:border-primary"
        data-testid="ops-cr-note"
      />
      {err && (
        <p className="t-tiny text-danger mt-1" data-testid="ops-cr-error">
          {err}
        </p>
      )}
      <div className="flex gap-2 justify-end mt-2">
        <button
          type="button"
          className="btn-danger text-[12px]"
          disabled={decideMut.isPending}
          onClick={() => decide(false)}
          data-testid="ops-cr-reject"
        >
          Reject
        </button>
        <button
          type="button"
          className="btn-primary text-[12px]"
          disabled={decideMut.isPending}
          onClick={() => decide(true)}
          data-testid="ops-cr-approve"
        >
          {decideMut.isPending
            ? "Working…"
            : isReplace || isAddonEdit
              ? "Approve & apply"
              : "Approve & add"}
        </button>
      </div>
    </div>
  );
}
