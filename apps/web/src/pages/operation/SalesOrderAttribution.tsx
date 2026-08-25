/**
 * SalesOrderAttribution — STAGE 3 · card 3.3: CLASS B + TEST 3.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THREE VERBS, THREE BUTTONS, AND THEY NEVER MERGE
 *
 * ```
 * SUBMIT   Send for approval   → writes a REQUEST. The order does not move.
 * APPROVE  Approve the change  → writes that request's status. Nothing else.
 * APPLY    Apply the change    → the ONLY verb that moves the order, and it
 *                                re-runs every floor first, so it can still
 *                                refuse after an approval.
 * ```
 *
 * Why a request lane at all, when Stage 2's Save writes any other field
 * directly: salesperson · showroom · dealer decide who gets PAID. The customer's
 * agreement is unchanged (so this is Class B — no customer acceptance, ever),
 * but money moves between parties, which is GATES.md Test 3. `LOCK THE
 * CONSEQUENCE, NOT THE WHOLE DOCUMENT`: the phone number beside it stays
 * directly editable while a change here waits.
 *
 * EVERY GATE IS SERVER-SIDE. This file draws buttons; `sales_order_*_attribution`
 * (0329) decides. GATES.md GATE 3 is explicit about why — internal roles have no
 * dealer write floor in RLS, so a UI-only approval is not a control for the exact
 * roles that could bypass it. A hidden button here is courtesy, never security.
 *
 * WORDS: the naming law is verb + clear object, no shorthand a new hire must
 * google (COPY-STANDARD §"Action naming law"). "Attribution" is that shorthand,
 * so it appears in this file's CODE and never on its SCREEN — the operator reads
 * "who this order belongs to".
 */
import { useState } from "react";
import { toast } from "sonner";
import Button from "@/components/kit/Button";
import Modal from "@/components/kit/Modal";
import Select from "@/components/kit/Select";
import Textarea from "@/components/kit/Textarea";
import { useAuth } from "@/lib/auth";
import { fmtDate } from "@/lib/fmt-date";
import {
  useApplyAttributionChange,
  useDecideAttributionChange,
  useWithdrawAttributionChange,
  useSalesOrderAttribution,
  useSubmitAttributionChange,
  type AttributionChanges,
  type AttributionRequest,
} from "@/lib/queries";

type Option = { value: string; label: string };

/** The order's parties as the workspace already knows them. */
export interface AttributionCurrent {
  salesperson_id: string | null;
  outlet_id: string | null;
  dealer_id: string | null;
}

/** The one sentence naming who GATE 3 lets decide this exact request. */
function approverWord(approver: AttributionRequest["approver"]): string {
  return approver === "principal" ? "The principal approves this" : "HR or the principal approves this";
}

/** from → to, in names, one line per field that moves. */
function MoveLine({ label, move }: { label: string; move: { from: string | null; to: string | null } }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 text-body">
      <span className="text-label text-base-500">{label}</span>
      <span className="text-base-700 line-through">{move.from ?? "Not recorded"}</span>
      <span className="text-base-500">→</span>
      <span className="font-semibold text-base-900">{move.to ?? "Not recorded"}</span>
    </div>
  );
}

export default function SalesOrderAttribution({
  orderId,
  current,
  salespersonOptions,
  outletOptions,
  dealerOptions,
  onApplied,
}: {
  orderId: string;
  current: AttributionCurrent;
  /** Excludes the "Not recorded" placeholder — this form picks a real party. */
  salespersonOptions: Option[];
  outletOptions: Option[];
  dealerOptions: Option[];
  /** The order moved — the workspace refetches its revisions and its PDF. */
  onApplied: () => void;
}) {
  const liveQ = useSalesOrderAttribution(orderId);
  const request = liveQ.data?.request ?? null;
  /* GATE 3 names HR and the principal as the deciders; the owner ruling of
     2026-08-15 makes them the only ones who may OPEN the change too. A hidden
     button is courtesy — `sales_order_*_attribution` is still the control. */
  const role = useAuth((s) => s.role);
  const canRequest = role === "principal" || role === "hr";

  const [formOpen, setFormOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState("");
  const [salesperson, setSalesperson] = useState<string>("keep");
  const [outlet, setOutlet] = useState<string>("keep");
  const [dealer, setDealer] = useState<string>("keep");
  const [reason, setReason] = useState("");

  const resetForm = () => {
    setSalesperson("keep");
    setOutlet("keep");
    setDealer("keep");
    setReason("");
  };

  const submitMut = useSubmitAttributionChange(orderId, {
    onSuccess: () => {
      toast.success("Sent for approval");
      resetForm();
      setFormOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const decideMut = useDecideAttributionChange(orderId, {
    onSuccess: (r) => toast.success(r.status === "approved" ? "Approved" : "Rejected"),
    onError: (e) => toast.error(e.message),
  });
  const withdrawMut = useWithdrawAttributionChange(orderId, {
    onSuccess: () => {
      toast.success("Approval taken back");
      setWithdrawing(false);
      setWithdrawReason("");
    },
    /* A GATE 3 refusal arrives naming the approver lane, not as a login
     * problem — the same sentence the approval itself would have shown. */
    onError: (e) => toast.error(e.message),
  });
  const applyMut = useApplyAttributionChange(orderId, {
    onSuccess: (r) => {
      /* A second Apply is a no-op and says so — it never claims a new revision. */
      toast.success(r.already_applied ? "Already applied — nothing changed" : `Applied · Rev ${r.revision}`);
      void liveQ.refetch();
      onApplied();
    },
    /* A floor crossed since the approval refuses HERE, with the floor's own
     * sentence (0272's "reopen the run before changing who gets credit for it"
     * arrives verbatim — never flattened into "something went wrong"). */
    onError: (e) => toast.error(e.message),
  });

  /** Only the fields the operator actually moved reach the request. */
  const buildChanges = (): AttributionChanges => {
    const changes: AttributionChanges = {};
    if (salesperson !== "keep") changes.salesperson_id = salesperson === "none" ? null : salesperson;
    if (outlet !== "keep") changes.outlet_id = outlet === "none" ? null : outlet;
    if (dealer !== "keep") changes.dealer_id = dealer;
    return changes;
  };
  const changeCount = Object.keys(buildChanges()).length;

  const keep = (label: string): Option[] => [{ value: "keep", label: `Keep ${label}` }];

  return (
    <div className="mt-3 border-t border-kit-slate-5 pt-3" data-testid="attribution-lane">
      {request ? (
        <div
          className="rounded-card border border-kit-slate-5 bg-kit-slate-3 px-3 py-2.5"
          data-testid="attribution-request"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-label font-semibold tracking-wide text-base-700 uppercase">
              {request.status === "pending" ? "Waiting for approval" : "Approved — not applied yet"}
            </span>
            <span className="text-meta text-base-500">
              Asked {fmtDate(request.created_at, { time: true })}
            </span>
          </div>

          <div className="mt-2 flex flex-col gap-1">
            {request.salesperson && <MoveLine label="Salesperson" move={request.salesperson} />}
            {request.outlet && <MoveLine label="Showroom" move={request.outlet} />}
            {request.dealer && <MoveLine label="Dealer" move={request.dealer} />}
            {request.channel && <MoveLine label="Sold through" move={request.channel} />}
          </div>

          {request.reason && (
            <p className="text-meta text-base-700 mt-2 break-words">Reason — {request.reason}</p>
          )}
          <p className="text-meta text-base-500 mt-1">{approverWord(request.approver)}</p>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {request.status === "pending" ? (
              <>
                <Button
                  size="sm"
                  variant="primary"
                  loading={decideMut.isPending}
                  onClick={() => decideMut.mutate({ requestId: request.id, decision: "approved" })}
                  data-testid="attribution-approve"
                >
                  Approve the change
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={decideMut.isPending}
                  onClick={() => decideMut.mutate({ requestId: request.id, decision: "rejected" })}
                  data-testid="attribution-reject"
                >
                  Reject the change
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="primary"
                  loading={applyMut.isPending}
                  onClick={() => applyMut.mutate({ requestId: request.id })}
                  data-testid="attribution-apply"
                >
                  Apply the change
                </Button>
                {/* The way back out. Before 0336 an approval could only be
                    cleared by carrying it out — the one thing GATE 4 says an
                    approval is not. */}
                {withdrawing ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <input
                      aria-label="Why is it being taken back?"
                      placeholder="Why is it being taken back?"
                      value={withdrawReason}
                      onChange={(e) => setWithdrawReason(e.target.value)}
                      className="h-8 min-w-[18rem] rounded-control border border-base-200 px-2 text-body"
                      data-testid="attribution-withdraw-reason"
                    />
                    <Button
                      size="sm"
                      variant="neutral"
                      disabled={withdrawReason.trim().length === 0}
                      loading={withdrawMut.isPending}
                      onClick={() =>
                        withdrawMut.mutate({
                          requestId: request.id,
                          reason: withdrawReason.trim(),
                        })
                      }
                      data-testid="attribution-withdraw-confirm"
                    >
                      Take the approval back
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setWithdrawing(false)}>
                      Cancel
                    </Button>
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setWithdrawing(true)}
                    data-testid="attribution-withdraw"
                  >
                    Take the approval back
                  </Button>
                )}
              </>
            )}
          </div>

          {/* APPROVE writes the request and NOTHING else — the order is
              unchanged until Apply, and the screen says so rather than
              letting the operator assume the approval was the act. */}
          <p className="text-meta text-base-500 mt-2">
            {request.status === "pending"
              ? "Approving records the decision only — the sales order does not change until it is applied."
              : "The sales order has not changed yet. Applying writes it and mints a revision."}
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-meta text-base-500">
            Sales ownership changes only after approval.
          </p>
          {/* ⭐ READ-ONLY FOR OPERATION — owner ruling 2026-08-15. Who gets paid
              is not an Operation correction, and a button that always refuses
              teaches the operator to ignore refusals. The door appears for the
              roles GATE 3 lets decide it; the REQUEST panel above stays visible
              to everyone, because a pending change is truth, not an action. */}
          {/* ⭐ THE LABEL IS LOCKED, SO THE EXPLANATION SITS BESIDE IT
              (2026-08-24). `COPY-STANDARD.md:1427` is a `Use exactly` row, and
              its `Do NOT use` column already rejects `Request ownership change`,
              `Reassign` and `Change owner` — the three renames anyone reaching
              for a clearer word lands on. What was missing is not a better noun
              but the sentence saying what pressing it does, and that sentence
              already exists as APPROVED copy on the modal this button opens. It
              is repeated here rather than reworded, so no new string is minted
              and the two surfaces cannot drift apart. */}
          {canRequest && (
            <div className="flex flex-col items-start gap-1">
              <Button
                size="sm"
                variant="neutral"
                onClick={() => setFormOpen(true)}
                data-testid="attribution-open"
              >
                Change salesperson — needs approval
              </Button>
              <p className="text-meta text-base-500" data-testid="attribution-open-note">
                This is sent for approval. The sales order does not change until it is applied.
              </p>
            </div>
          )}
        </div>
      )}

      <Modal
        open={formOpen}
        onOpenChange={(o) => {
          if (!o) resetForm();
          setFormOpen(o);
        }}
        title="Request ownership change"
        description="This is sent for approval. The sales order does not change until it is applied."
        footer={
          <span className="flex items-center gap-3 pt-1">
            <Button variant="ghost" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={changeCount === 0 || reason.trim().length === 0}
              loading={submitMut.isPending}
              onClick={() => submitMut.mutate({ changes: buildChanges(), reason: reason.trim() })}
              data-testid="attribution-submit"
            >
              Send for approval
            </Button>
          </span>
        }
      >
        <div className="flex flex-col gap-3">
          <Select
            id="attr-salesperson"
            label="Salesperson"
            value={salesperson}
            onValueChange={setSalesperson}
            options={[
              ...keep(salespersonOptions.find((o) => o.value === current.salesperson_id)?.label ?? "as it is"),
              { value: "none", label: "Not recorded" },
              ...salespersonOptions,
            ]}
          />
          <Select
            id="attr-outlet"
            label="Showroom"
            value={outlet}
            onValueChange={setOutlet}
            options={[
              ...keep(outletOptions.find((o) => o.value === current.outlet_id)?.label ?? "as it is"),
              { value: "none", label: "Not recorded" },
              ...outletOptions,
            ]}
          />
          <Select
            id="attr-dealer"
            label="Dealer"
            value={dealer}
            onValueChange={setDealer}
            options={[
              ...keep(dealerOptions.find((o) => o.value === current.dealer_id)?.label ?? "as it is"),
              ...dealerOptions,
            ]}
          />
          <Textarea
            id="attr-reason"
            label="Why is this changing?"
            required
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {/* Named before the operator picks, not after they are refused. */}
          <p className="text-meta text-base-500">
            {dealer !== "keep"
              ? "A dealer change is approved by the principal."
              : "A salesperson or showroom change is approved by HR or the principal."}
          </p>
        </div>
      </Modal>
    </div>
  );
}
