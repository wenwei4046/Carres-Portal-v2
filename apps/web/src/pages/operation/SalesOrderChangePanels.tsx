/**
 * The two panels of the whole-page Sales Order edit (0562; orders/MASTER
 * § VIEW FIRST, EDIT ON PURPOSE · § ADD / CANCEL AN ITEM · § Customer
 * agreement evidence):
 *
 *   DraftReview      while editing — Before/After, what it starts elsewhere
 *                    (`Before approval`), `Reason for change`, the customer's
 *                    request date and, for a commercial change, the customer
 *                    agreement evidence. The SERVER still decides Save vs
 *                    Submit on commit.
 *   WaitingRequest   a live request — `Waiting for management` or
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
import Textarea from "@/components/kit/Textarea";
import { fmtDate } from "@/lib/fmt-date";
import type { SalesOrderAmendment } from "@/lib/queries";
import type { DiffRow } from "./sales-order-change";

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
      <p className="text-meta text-kit-slate-11">Before approval</p>
      <ul className="mt-1 space-y-1 text-body text-kit-slate-12" data-testid="change-consequences">
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

export function DraftReview(props: {
  rows: DiffRow[];
  consequences: string[];
  commercial: boolean;
  blocked: string | null;
  reason: string;
  onReason: (v: string) => void;
  askedOn: string | null;
  onAskedOn: (v: string | null) => void;
  evidence: string;
  onEvidence: (v: string) => void;
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
            ? "These changes go for approval. The order stays as it is until approved."
            : "This correction saves as a new revision."}
      </p>
      <DiffTable rows={props.rows} label="Before and after" />
      {props.commercial && <Consequences items={props.consequences} />}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <DatePicker id="so-change-asked" label="Requested date (from customer)" value={props.askedOn} onChange={props.onAskedOn} />
        <div className="sm:col-span-2">
          <Textarea id="so-change-reason" label="Reason for change" required rows={2} value={props.reason}
            onChange={(e) => props.onReason(e.target.value)} />
        </div>
        {props.commercial && (
          <div className="sm:col-span-3">
            <Input
              id="so-change-evidence"
              label="Customer agreement evidence"
              hint="You can send the request without it, but management cannot approve until it is recorded."
              value={props.evidence}
              onChange={(e) => props.onEvidence(e.target.value)}
            />
          </div>
        )}
      </div>
    </section>
  );
}

export function WaitingRequest(props: {
  amendment: SalesOrderAmendment;
  rows: DiffRow[];
  consequences: string[];
  canDecide: boolean;
  busy: boolean;
  onRecordEvidence: (note: string) => void;
  onDecide: (decision: "approve" | "reject", note: string) => void;
  onProposeAgain: () => void;
}) {
  const a = props.amendment;
  const [evidence, setEvidence] = useState("");
  const [decision, setDecision] = useState("");
  const covered = Boolean(a.evidence_covers_proposal);
  return (
    <section
      className="rounded-card border border-kit-amber-7 bg-kit-amber-2 px-4 py-3"
      data-testid="waiting-request"
      aria-label="Amendment request"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-strong text-kit-slate-12">
          {a.stale ? "Out of date — propose again" : "Waiting for management"}
        </h2>
        <span className="text-meta text-kit-slate-11">
          Submitted {fmtDate(a.submitted_at)} · on Rev {a.base_revision}
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
          <div className="mt-3 border-t border-kit-amber-6 pt-3">
            {covered ? (
              <p className="text-body text-kit-slate-12" data-testid="evidence-recorded">
                Customer agreement evidence: {a.evidence_note}
              </p>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Input
                    id="so-request-evidence"
                    label="Customer agreement evidence"
                    hint={a.evidence_note ? "The recorded evidence was for an earlier version of this request." : "Not recorded yet — the change cannot take effect."}
                    value={evidence}
                    onChange={(e) => setEvidence(e.target.value)}
                  />
                </div>
                <Button variant="neutral" disabled={!evidence.trim() || props.busy}
                  onClick={() => props.onRecordEvidence(evidence.trim())} data-testid="record-evidence">
                  Save
                </Button>
              </div>
            )}
          </div>
          {props.canDecide && (
            <div className="mt-3 flex flex-col gap-3 border-t border-kit-amber-6 pt-3">
              <Textarea id="so-decision" label="Management decision reason" rows={2} value={decision}
                onChange={(e) => setDecision(e.target.value)} />
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="neutral" disabled={!decision.trim() || props.busy}
                  onClick={() => props.onDecide("reject", decision.trim())} data-testid="decide-reject">
                  Reject
                </Button>
                <Button variant="primary" disabled={!decision.trim() || !covered || props.busy}
                  onClick={() => props.onDecide("approve", decision.trim())} data-testid="decide-approve">
                  Approve and apply
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
