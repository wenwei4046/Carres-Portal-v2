import { useState } from "react";
import { useDecideOrderChangeRequest, useOrderChangeRequests } from "@/lib/queries";

/**
 * ChangeRequestsPanel — Add-product P3 (0233, design 2026-07-18 §4). The
 * operator's approval card for a dealer-submitted product change on a
 * proceed-lane order. APPROVE runs the full engine pipeline server-side
 * (fresh prices / mutex / gifts / delivery) and appends the lines atomically;
 * REJECT stamps the request with the note (surfaced to the dealer's POS).
 * Auto-hides when the order has no pending request.
 */
export default function ChangeRequestsPanel({ orderId }: { orderId: string }) {
  const reqQ = useOrderChangeRequests(orderId);
  const decideMut = useDecideOrderChangeRequest(orderId);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const pending = (reqQ.data?.requests ?? []).find((r) => r.status === "pending") ?? null;
  if (!pending) return null;

  const lines = (pending.payload.lines ?? []) as Array<{
    sku?: string;
    qty?: number;
    unitPrice?: number;
    label?: string;
  }>;

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
        Product change · awaiting approval
      </p>
      {lines.map((l, i) => (
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
      ))}
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
          {decideMut.isPending ? "Working…" : "Approve & add"}
        </button>
      </div>
    </div>
  );
}
