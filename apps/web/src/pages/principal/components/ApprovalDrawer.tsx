import { useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useDecideApproval, useTopupApprove } from "@/lib/queries";
import { TOAST } from "@/lib/toast-copy";
import ApprovalKindBadge from "./ApprovalKindBadge";
import ApprovalStatusPill from "./ApprovalStatusPill";

// Payment methods offered for top_up approval. `dealer_deposit` is excluded
// because topping up the deposit balance with the deposit balance is circular;
// `credit_card`/`debit_card` are excluded because Carres has no card terminal
// for B2B top-ups (per Loo). Finance picks one of these four when approving.
const TOPUP_METHODS = ["bank_transfer", "cash", "cheque", "duitnow_qr"] as const;
type TopupMethod = (typeof TOPUP_METHODS)[number];

/**
 * Right slide-in drawer for a single approval. Mirrors
 * `reference/proto/principal-approvals.jsx` lines 132-188.
 *
 * Layout (top → bottom):
 *   1. Header — id kicker (first 8 chars) + title + close X
 *   2. Field grid — Type / Status / By / When / Ref / Amount / Reason
 *   3. Decision block — only when status != pending
 *   4. Spacer (flex-1) — pushes the action footer to the bottom
 *   5. Action footer — Note textarea + Reject / Approve buttons (pending only)
 *
 * Decide flow uses `useDecideApproval(id)` from queries.ts; the page caller
 * doesn't pass any `onSuccess` opts because the cache invalidation is already
 * built into the hook (approvals list + dashboard + dealers all bust on
 * success). Toasts fire here so the drawer can close + tell the user in the
 * same beat without round-tripping the message back through the page.
 *
 * Error path follows Phase 2C convention (TopUpDepositModal:71-85): if the
 * thrown value is an `ApiError`, surface its `message` (or a body `code` when
 * available); fall back to the generic Error message otherwise.
 */
interface Approval {
  id: string;
  kind: string;
  title: string;
  actor: string | null;
  refers_to: string | null;
  amount: number | string | null;
  created_at: string;
  status: string;
  decided_at?: string | null;
  decided_by?: string | null;
  decision_note?: string | null;
  reason?: string | null;
}

interface Props {
  approval: Approval;
  onClose: () => void;
}

export default function ApprovalDrawer({ approval, onClose }: Props) {
  const [note, setNote] = useState("");
  const [method, setMethod] = useState<TopupMethod>("bank_transfer");
  const [reference, setReference] = useState("");
  const decide = useDecideApproval(approval.id);
  const topup = useTopupApprove();
  const isPending = approval.status === "pending";
  const isTopup = approval.kind === "top_up";
  const busy = decide.isPending || topup.isPending;

  async function submit(status: "approved" | "rejected") {
    try {
      // top_up approve uses the wrap RPC (finance_topup_approve) which
      // atomically decides the approval, inserts payments, and bumps
      // dealers.deposit_balance. The generic approval_decide RPC doesn't
      // handle kind='top_up' (refund/new_dealer/price_change only) — using
      // it here would leave deposit_balance untouched.
      if (isTopup && status === "approved") {
        await topup.mutateAsync({
          approvalId: approval.id,
          method,
          reference: reference.trim() || null,
        });
      } else {
        await decide.mutateAsync({ status, note: note.trim() || undefined });
      }
      const successMsg =
        status === "approved"
          ? approval.kind === "refund"
            ? TOAST.approveRefund(approval.title)
            : `Approved ${approval.kind} · ${approval.title.split(" · ")[0]}`
          : TOAST.rejectApproval(approval.kind, approval.title);
      toast.success(successMsg);
      onClose();
    } catch (e: unknown) {
      // Phase 2C error pattern (see TopUpDepositModal:71-85). ApiError's
      // `message` is already pulled from the body's `message` field by
      // apiFetch, so we can usually surface it directly.
      if (e instanceof ApiError) {
        toast.error(e.message || "Could not submit decision");
      } else {
        toast.error(e instanceof Error ? e.message : "Could not submit decision");
      }
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex justify-end">
      <button
        type="button"
        aria-label="Close drawer"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 cursor-pointer border-0 p-0"
      />
      <div
        className="relative bg-white h-screen overflow-auto p-7 flex flex-col"
        style={{ width: 520 }}
      >
        <div className="flex justify-between items-start mb-[18px]">
          <div>
            <div className="kicker">{approval.id.slice(0, 8)}</div>
            <h2 className="font-display text-[22px] leading-tight mt-1 tracking-tight font-semibold">
              {approval.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-base-500 text-lg bg-transparent border-0 cursor-pointer leading-none px-1"
          >
            ×
          </button>
        </div>

        <div
          className="grid gap-x-4 gap-y-2.5 text-[13px] py-4 border-y border-base-100 mb-[18px]"
          style={{ gridTemplateColumns: "auto 1fr" }}
        >
          <div className="text-base-500 text-[11.5px]">Type</div>
          <div>
            <ApprovalKindBadge kind={approval.kind} />
          </div>
          <div className="text-base-500 text-[11.5px]">Status</div>
          <div>
            <ApprovalStatusPill status={approval.status} />
          </div>
          <div className="text-base-500 text-[11.5px]">By</div>
          <div>{approval.actor ?? "—"}</div>
          <div className="text-base-500 text-[11.5px]">When</div>
          <div>{new Date(approval.created_at).toLocaleString()}</div>
          {approval.refers_to && (
            <>
              <div className="text-base-500 text-[11.5px]">Ref</div>
              <div className="font-mono text-[12px]">{approval.refers_to}</div>
            </>
          )}
          {approval.amount != null && (
            <>
              <div className="text-base-500 text-[11.5px]">Amount</div>
              <div className="font-mono font-bold">
                RM {Number(approval.amount).toLocaleString()}
              </div>
            </>
          )}
          {approval.reason && (
            <>
              <div className="text-base-500 text-[11.5px]">Reason</div>
              <div>{approval.reason}</div>
            </>
          )}
        </div>

        {!isPending && approval.decided_at && (
          <div className="mb-[18px] p-3.5 bg-base-50 rounded-md">
            <div className="text-[10px] uppercase tracking-wider text-base-500 font-semibold mb-1.5">
              Decision
            </div>
            <div className="text-[13px]">
              <strong>{approval.decided_by ?? "—"}</strong> ·{" "}
              {new Date(approval.decided_at).toLocaleString()}
            </div>
            {approval.decision_note && (
              <div className="text-[12px] text-base-600 mt-1">{approval.decision_note}</div>
            )}
          </div>
        )}

        <div className="flex-1" />

        {isPending && (
          <div className="pt-[18px] border-t border-base-100">
            {isTopup && (
              <>
                <div className="text-[10px] uppercase tracking-wider text-base-500 font-semibold mb-1.5">
                  Method (required to approve)
                </div>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as TopupMethod)}
                  data-testid="topup-method"
                  className="w-full px-2.5 py-2 border border-base-200 rounded text-[12px] outline-none mb-3 font-sans bg-white"
                >
                  {TOPUP_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
                <div className="text-[10px] uppercase tracking-wider text-base-500 font-semibold mb-1.5">
                  Reference (optional)
                </div>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Bank slip / cheque no / txn ID…"
                  data-testid="topup-reference"
                  className="w-full px-2.5 py-2 border border-base-200 rounded text-[12px] outline-none mb-3 font-sans"
                />
              </>
            )}
            <div className="text-[10px] uppercase tracking-wider text-base-500 font-semibold mb-1.5">
              {isTopup ? "Reject reason (optional)" : "Note (optional)"}
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={isTopup ? "Why rejecting?" : "Reason or condition…"}
              className="w-full px-2.5 py-2 border border-base-200 rounded text-[12px] resize-y outline-none mb-3 font-sans"
              style={{ minHeight: 60 }}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => submit("rejected")}
                disabled={busy}
                className="btn-secondary flex-1"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => submit("approved")}
                disabled={busy}
                className="btn-primary flex-1"
                data-testid="approval-approve"
              >
                Approve
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
