import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import {
  usePaymentBackdateRequests,
  useDecidePaymentBackdate,
  useWorkspaceDuties,
  type PaymentBackdateRequest,
} from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import { Facts } from "./PaymentCollectionWorkspace";

const inputCls = "mt-0.5 w-full rounded-md border border-base-200 px-2 py-1.5 text-body";

/** 0707 — a payment whose paid date is more than 14 days ago waits here for
 *  the Payment Approver (Houzs port, row 11; awaits Jess's review). Nothing in
 *  it counts until it is approved. The SERVER decides who may decide; this
 *  only keeps the doors out of sight of someone who cannot use them. */
export default function InvoiceBackdateRequests({ orderId }: { orderId: string }) {
  const q = usePaymentBackdateRequests(orderId);
  const me = useAuth((s) => s.user?.id ?? null);
  const role = useAuth((s) => s.role);
  const duties = useWorkspaceDuties();
  const isApprover = role === "principal" || (me != null && (duties.data?.duties ?? [])
    .some((d) => d.key === "payment_approver" && d.resolution?.actor_user_id === me));
  const waiting = (q.data?.requests ?? []).filter((r) => r.status === "waiting");
  if (waiting.length === 0) return null;
  return <Facts title="Waiting for the Payment Approver">
    {waiting.map((r) => <Request key={r.id} orderId={orderId} request={r}
      mayDecide={isApprover && r.requested_by !== me} />)}
  </Facts>;
}

function Request({ orderId, request: r, mayDecide }: {
  orderId: string; request: PaymentBackdateRequest; mayDecide: boolean;
}) {
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState("");
  const [duplicate, setDuplicate] = useState(false);
  const [checked, setChecked] = useState(false);
  const decide = useDecidePaymentBackdate(orderId, {
    onSuccess: (_d, v) => toast.success(v.approve ? "Approved" : "Refused"),
    onError: (e) => {
      if (/already recorded/i.test(e.message)) setDuplicate(true);
      toast.error(e.message);
    },
  });
  return <div className="mb-2" data-testid="backdate-request">
    <p>{rm(Number(r.amount))} · Paid date: {fmtDate(r.paid_on)}</p>
    <p className="text-meta">Paid date is more than 14 days ago.</p>
    {mayDecide && (refusing
      ? <div className="mt-1 space-y-1">
          <label className="block">
            <span className="text-meta text-kit-slate-11">Decision reason</span>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
              aria-label="Decision reason" className={inputCls} />
          </label>
          <span className="flex gap-2">
            <button className="btn-primary" disabled={!reason.trim() || decide.isPending}
              onClick={() => decide.mutate({ requestId: r.id, approve: false, reason: reason.trim() })}>Refuse</button>
            <button className="btn-secondary" onClick={() => setRefusing(false)}>Back</button>
          </span>
        </div>
      : <div className="mt-1 space-y-1">
          {duplicate && <label className="flex items-start gap-2 text-meta">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)}
              aria-label="I checked the earlier payment" />
            <span>I opened the earlier payment and this is a different one.</span>
          </label>}
          <span className="flex gap-2">
            <button className="btn-primary" disabled={decide.isPending || (duplicate && !checked)}
              onClick={() => decide.mutate({ requestId: r.id, approve: true, duplicateAck: checked || undefined })}>Approve</button>
            <button className="btn-secondary" disabled={decide.isPending}
              onClick={() => setRefusing(true)}>Refuse</button>
          </span>
        </div>)}
  </div>;
}
