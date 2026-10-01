/**
 * The two panels of the whole-page Sales Order edit (0562; orders/MASTER
 * § VIEW FIRST, EDIT ON PURPOSE · § ADD / CANCEL AN ITEM · § Customer
 * agreement evidence):
 *
 *   DraftReview      while editing — Before/After, what it starts elsewhere
 *                    (`Before the change`), `Reason for change`, the customer's
 *                    request date and, for a commercial change, the customer
 *                    agreement evidence. The SERVER still decides Save vs
 *                    Submit on commit.
 *   WaitingRequest   a live request — `Amendment request` or
 *                    `Out of date — propose again`; its evidence; the
 *                    principal's `Approve and apply` / `Reject`. Nothing here
 *                    changes the effective order or its document until the
 *                    database applies the complete version.
 */
// design-standard: not-a-list-page — these are two panels INSIDE the Sales Order
// object page. The tables are a Before/After comparison of one order's own change,
// never a register of records: no rows to filter, sort, page or open.
import { useState } from "react";
import Button from "@/components/kit/Button";
import DatePicker from "@/components/kit/DatePicker";
import Input from "@/components/kit/Input";
import Select from "@/components/kit/Select";
import { useAuth } from "@/lib/auth";
import { useRecordAmendmentSupplier } from "@/lib/queries";
import { toast } from "sonner";
import Textarea from "@/components/kit/Textarea";
import { fmtDate } from "@/lib/fmt-date";
import type { AmendmentGates, SalesOrderAmendment } from "@/lib/queries";
import type { DiffRow } from "./sales-order-change";
import { AgreementForm, AgreementOnRecord, type RecordedAgreement } from "./customer-agreement";

function DiffTable({ rows, label }: { rows: DiffRow[]; label: string }) {
  return (
    <div className="overflow-x-auto">
      <table aria-label={label} className="w-full border-collapse text-body">
        <thead>
          <tr className="border-b border-kit-slate-5">
            <th className="px-2 py-1.5 text-left text-label font-medium text-kit-slate-11">Change</th>
            <th className="px-2 py-1.5 text-left text-label font-medium text-kit-slate-11">Before</th>
            <th className="px-2 py-1.5 text-left text-label font-medium text-kit-slate-11">After</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.what}-${i}`} className="border-b border-kit-slate-5 align-top">
              <td className="px-2 py-1.5 text-kit-slate-11">{r.what}</td>
              <td className="px-2 py-1.5 text-kit-slate-11">{r.before}</td>
              <td className="px-2 py-1.5 font-semibold text-kit-slate-12">{r.after}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Consequences({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-meta text-kit-slate-11">Before the change</p>
      <ul className="mt-1 space-y-1 text-body text-kit-slate-12" data-testid="change-consequences">
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

export function DraftReview(props: {
  routing?: AmendmentGates;
  rows: DiffRow[];
  consequences: string[];
  commercial: boolean;
  blocked: string | null;
  reason: string;
  onReason: (v: string) => void;
  askedOn: string | null;
  onAskedOn: (v: string | null) => void;
  /* 0564 · the governed agreement, carried to the server with the request. A
     free sentence is the manager's assertion the ruling refuses, so this is
     the SAME triple the standalone door takes. */
  agreement: RecordedAgreement | null;
  onAgreement: (a: RecordedAgreement | null) => void;
}) {
  return (
    <section
      className="rounded-card border border-kit-blue-6 bg-kit-blue-2 px-4 py-3"
      data-testid="draft-review"
      aria-label="Your changes"
    >
      <p className="mb-2 text-body font-semibold text-kit-slate-12">
        {props.blocked
          ? props.blocked
          : props.commercial
            ? "Your changes"
            : "This correction saves as a new revision."}
      </p>
      <DiffTable rows={props.rows} label="Before and after" />
      {props.routing && <div className="mt-3 text-body text-kit-slate-11">
        {props.routing.supplier_scope.length > 0 && <p>PO Duty · {props.routing.po_duty.acting_user_name ?? "Not assigned"} · Record supplier answer</p>}
        {props.routing.sales_approval_required && <p>Sales Approver · {props.routing.sales_approver.acting_user_name ?? "Not assigned"}</p>}
      </div>}
      {props.commercial && <Consequences items={props.consequences} />}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <DatePicker id="so-change-asked" label="Requested date (from customer)" value={props.askedOn} onChange={props.onAskedOn} />
        <div className="sm:col-span-2">
          <Textarea id="so-change-reason" label="Reason for change" required rows={2} value={props.reason}
            onChange={(e) => props.onReason(e.target.value)} />
        </div>
        {props.commercial && (
          <div className="sm:col-span-3 border-t border-kit-blue-6 pt-3">
            <p className="text-label text-kit-slate-11">Customer agreement</p>
            <p className="mt-1 text-meta text-kit-slate-11">
              Record how the customer agreed before this change takes effect.
            </p>
            <AgreementForm idPrefix="so-change-agreement" value={props.agreement} onChange={props.onAgreement} />
          </div>
        )}
      </div>
    </section>
  );
}

export function WaitingRequest(props: {
  orderId: string;
  amendment: SalesOrderAmendment;
  rows: DiffRow[];
  consequences: string[];
  canDecide: boolean;
  busy: boolean;
  onRecordAgreement: (a: RecordedAgreement) => void;
  onDecide: (decision: "approve" | "reject", note: string) => void;
  onProposeAgain: () => void;
  onApplied?: (revision: number) => void;
  lineLabel?: (id: string) => string;
}) {
  const a = props.amendment;
  const [decision, setDecision] = useState("");
  const userId = useAuth((state) => state.user?.id);
  const g = a.gates;
  const needsSalesReview = Boolean(g?.sales_approval_required && !g.sales_approval_recorded);
  const canDecide = g ? props.canDecide && (needsSalesReview
    ? g.sales_approver.actor_user_id === userId : g.legacy_review_required) : props.canDecide;
  /* Both facts come from the SERVER on every read. The screen never decides
     for itself that a change is agreed, and the database refuses regardless. */
  const recorded = Boolean(a.customer_agreement_kind);
  const covered = a.customer_agreement_covers_proposal === true;
  return (
    <section
      className="rounded-card border border-kit-amber-6 bg-kit-amber-3 px-4 py-3"
      data-testid="waiting-request"
      aria-label="Amendment request"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-strong text-kit-slate-12">
          {a.stale ? "Out of date. Propose again" : "Amendment request"}
        </h2>
        <span className="text-meta text-kit-slate-11">
          Submitted {fmtDate(a.submitted_at)} · {a.submitted_by_name ?? "Not recorded"} · on Rev {a.base_revision}
        </span>
      </div>
      {a.reason && <p className="mb-2 mt-1 text-body text-kit-slate-12">Reason for change: {a.reason}</p>}
      {a.stale ? (
        <>
          <p className="mb-2 text-body text-kit-slate-12">
            The order changed after this request was sent. Nothing was applied. Compare and propose again.
          </p>
          <DiffTable rows={props.rows} label="Sent on and proposed" />
          <div className="mt-3 flex justify-end">
            <Button variant="primary" onClick={props.onProposeAgain} data-testid="propose-again">
              Propose this version again
            </Button>
          </div>
        </>
      ) : (
        <>
          <DiffTable rows={props.rows} label="Before and after" />
          <Consequences items={props.consequences} />
          <div className="mt-3 border-t border-kit-amber-6 pt-3" data-testid="amendment-agreement">
            <p className="text-label text-kit-slate-11">Customer agreement</p>
            <AgreementOnRecord
              kind={a.customer_agreement_kind}
              reference={a.customer_agreement_reference}
              detail={a.customer_agreement_detail}
              coversProposal={recorded ? covered : undefined}
            />
            {(!recorded || !covered) && (
              <AgreementForm
                idPrefix="so-request-agreement"
                busy={props.busy}
                onRecord={props.onRecordAgreement}
              />
            )}
          </div>
          {g && g.supplier_scope.length > 0 && <div className="mt-3 border-t border-kit-slate-5 pt-3">
            <p className="text-label text-kit-slate-11">PO Duty · {g.po_duty.acting_user_name ?? "Not assigned"} · Record supplier answer</p>
            {g.supplier_scope.map((scope) => <SupplierConfirmation key={`${scope.po_line_id}:${scope.order_line_id}`}
              orderId={props.orderId} amendmentId={a.id} scope={scope} label={props.lineLabel?.(scope.order_line_id)}
              recorded={g.supplier_confirmations?.filter((r) => r.po_line_id === scope.po_line_id && r.order_line_id === scope.order_line_id).at(-1)}
              canRecord={g.po_duty.actor_user_id === userId} onApplied={props.onApplied} />)}
          </div>}
          {g?.sales_approval_required && <p className="mt-3 text-body">Sales Approver · {g.sales_approval_recorded ? (g.sales_approval?.name ?? "Not recorded") : (g.sales_approver.acting_user_name ?? "Not assigned")}{g.sales_approval_recorded ? ` · Approved · ${g.sales_approval?.at ? fmtDate(g.sales_approval.at) : "Not recorded"}` : ""}</p>}
          {canDecide && (
            <div className="mt-3 flex flex-col gap-3 border-t border-kit-amber-6 pt-3">
              <Textarea id="so-decision" label="Management decision reason" rows={2} value={decision}
                onChange={(e) => setDecision(e.target.value)} />
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="neutral" disabled={!decision.trim() || props.busy}
                  onClick={() => props.onDecide("reject", decision.trim())} data-testid="decide-reject">
                  Reject
                </Button>
                <Button variant="primary" disabled={!decision.trim() || props.busy || (!needsSalesReview && (!recorded || !covered || Boolean(g?.supplier_waiting.length)))}
                  onClick={() => props.onDecide("approve", decision.trim())} data-testid="decide-approve">
                  {needsSalesReview ? "Approve" : "Approve and apply"}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function SupplierConfirmation(props: {
  orderId: string; amendmentId: string;
  scope: { po_id: string; po_line_id: string; order_line_id: string };
  recorded?: NonNullable<AmendmentGates["supplier_confirmations"]>[number];
  label?: string; canRecord: boolean; onApplied?: (revision: number) => void;
}) {
  const [answer, setAnswer] = useState<"confirmed" | "waiting" | "refused" | undefined>();
  const [date, setDate] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const mutation = useRecordAmendmentSupplier(props.orderId, {
    onSuccess: (r) => { toast.success("Supplier answer recorded"); if(r.status === "applied" && r.revision) props.onApplied?.(r.revision); },
    onError: (e) => toast.error(e.message),
  });
  return <div className="mt-2 grid gap-3 sm:grid-cols-2">
    <p className="text-body sm:col-span-2">{props.scope.po_id} · {props.label}</p>
    {props.recorded && <p className="text-meta text-kit-slate-11 sm:col-span-2">
      {({ confirmed: "Confirmed", waiting: "Waiting", refused: "Refused" })[props.recorded.answer]} · {props.recorded.supplier_date ? fmtDate(props.recorded.supplier_date) : "Not recorded"} · {props.recorded.reference} · {props.recorded.by_name ?? "Not recorded"} · {fmtDate(props.recorded.at)}
    </p>}
    {props.canRecord && <>
      <Select id={`supplier-answer-${props.scope.po_line_id}-${props.scope.order_line_id}`} label="Supplier answer" value={answer} onValueChange={(value) => setAnswer(value as typeof answer)}
        options={[{ value: "confirmed", label: "Confirmed" }, { value: "waiting", label: "Waiting" }, { value: "refused", label: "Refused" }]} />
      <DatePicker id={`supplier-date-${props.scope.po_line_id}-${props.scope.order_line_id}`} label="Supplier Confirmed Delivery Date" value={date} onChange={setDate} />
      <Input id={`supplier-evidence-${props.scope.po_line_id}-${props.scope.order_line_id}`} label="Evidence" value={reference} onChange={(e) => setReference(e.target.value)} />
      <Button variant="neutral" disabled={!answer || !reference.trim() || mutation.isPending}
        onClick={() => mutation.mutate({ amendmentId:props.amendmentId,poId:props.scope.po_id,
          poLineId:props.scope.po_line_id,orderLineId:props.scope.order_line_id,answer:answer!,supplierDate:date,reference:reference.trim() })}>
        Record supplier answer
      </Button>
    </>}
  </div>;
}
