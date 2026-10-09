/**
 * The amendment panels of the Sales Order detail, drawn the handoff's way
 * (owner-confirmed 2026-10-08) over the SAME 0562 business flow:
 *
 *   ChangeReview      the confirmation before the commit — Before / After,
 *                     what it starts elsewhere, and the one sentence that says
 *                     whether it saves or goes for approval. The SERVER still
 *                     chooses Save vs Submit.
 *   WaitingAmendment  a live request — waiting / out of date; its evidence;
 *                     the principal's `Approve and apply` / `Reject`, gated on
 *                     recorded customer agreement that covers THESE terms;
 *                     `Withdraw`. Nothing here changes the order until the
 *                     database applies the complete version.
 *
 * The gates are the ones `SalesOrderChangePanels` carries, unchanged: approve
 * is refused without a recorded agreement that covers the proposal, and both
 * decisions need a written reason.
 */
import { useState } from "react";
import { fmtDate } from "@/lib/fmt-date";
import type { SalesOrderAmendment } from "@/lib/queries";
import type { DiffRow } from "../sales-order-change";
import { AgreementForm, AgreementOnRecord, type RecordedAgreement } from "../customer-agreement";
import { CBtn } from "./ui";

export function DiffList({ rows, label }: { rows: DiffRow[]; label: string }) {
  return (
    <div role="table" aria-label={label} className="text-[13px]">
      {rows.map((r, i) => (
        <div
          key={`${r.what}-${i}`}
          role="row"
          className="grid grid-cols-[minmax(0,.6fr)_minmax(0,1fr)_16px_minmax(0,1fr)] items-baseline gap-2 border-t border-c-section-line py-1.5"
        >
          <span role="cell" className="text-c-secondary">{r.what}</span>
          <span role="cell" className="break-words text-c-muted line-through">{r.before || "Not recorded"}</span>
          <span aria-hidden="true" className="text-c-muted">→</span>
          <span role="cell" className="break-words font-semibold text-c-ink">{r.after || "Not recorded"}</span>
        </div>
      ))}
    </div>
  );
}

function Consequences({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-[12px] text-c-secondary">Before approval</p>
      <ul className="mt-1 flex flex-col gap-1 text-[13px] text-c-ink" data-testid="change-consequences">
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

export function ChangeReview(props: {
  rows: DiffRow[];
  consequences: string[];
  commercial: boolean;
  blocked: string | null;
  reason: string;
  askedOn: string | null;
  agreement: RecordedAgreement | null;
}) {
  return (
    <section data-testid="draft-review" aria-label="Your changes" className="flex flex-col gap-2">
      <p className={`rounded-lg px-3 py-2 text-[13px] font-medium ${props.blocked ? "bg-c-warn-bg text-c-warn-fg" : "bg-c-info-bg text-c-info-fg"}`}>
        {props.blocked
          ? props.blocked
          : props.commercial
            ? "These changes go for approval. The order stays as it is until approved."
            : "This correction saves as a new revision."}
      </p>
      <DiffList rows={props.rows} label="Before and after" />
      {props.commercial && <Consequences items={props.consequences} />}
      <div className="mt-2 flex flex-col">
        <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-4 border-t border-c-section-line py-[7px] text-[13px]">
          <span className="text-c-secondary">Reason for change</span>
          <span className="break-words font-medium text-c-ink">{props.reason || "Not recorded"}</span>
        </div>
        <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-4 border-t border-c-section-line py-[7px] text-[13px]">
          <span className="text-c-secondary">Requested date (from customer)</span>
          <span className={`font-medium ${props.askedOn ? "text-c-ink" : "text-c-muted"}`}>{props.askedOn ? fmtDate(props.askedOn) : "Not recorded"}</span>
        </div>
        {props.commercial && (
          <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-4 border-t border-c-section-line py-[7px] text-[13px]">
            <span className="text-c-secondary">Customer agreement</span>
            <span className={`break-words font-medium ${props.agreement ? "text-c-ink" : "text-c-muted"}`}>
              {props.agreement
                ? props.agreement.reference
                : "Not recorded. You can send the request without it, but management cannot approve until it is recorded."}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

export function WaitingAmendment(props: {
  amendment: SalesOrderAmendment;
  rows: DiffRow[];
  consequences: string[];
  canDecide: boolean;
  busy: boolean;
  onRecordAgreement: (a: RecordedAgreement) => void;
  onDecide: (decision: "approve" | "reject", note: string) => void;
  onProposeAgain: () => void;
  onWithdraw: () => void;
}) {
  const a = props.amendment;
  const [decision, setDecision] = useState("");
  const [open, setOpen] = useState(false);
  /* Both facts come from the SERVER on every read. The screen never decides
     for itself that a change is agreed, and the database refuses regardless. */
  const recorded = Boolean(a.customer_agreement_kind);
  const covered = a.customer_agreement_covers_proposal === true;
  const who = a.submitted_by_name?.trim() || "Staff identity not recorded";
  return (
    <section
      className="flex flex-col gap-2 rounded-lg bg-c-warn-bg px-4 py-3.5"
      data-testid="waiting-request"
      aria-label="Amendment request"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex min-w-[220px] flex-1 flex-col leading-[1.35]">
          <span className="text-[12px] font-semibold text-c-warn-fg">
            {a.stale ? "Amendment out of date. Propose again" : "Amendment · waiting for approval"}
          </span>
          {props.rows[0] && (
            <span className="text-[13px] text-c-body">
              {props.rows[0].what}: {props.rows[0].before || "Not recorded"} → <b className="font-semibold">{props.rows[0].after || "Not recorded"}</b>
              {props.rows.length > 1 ? ` and ${props.rows.length - 1} more` : ""}
            </span>
          )}
          <span className="text-[12px] text-c-secondary">
            {[a.reason, who, `Submitted ${fmtDate(a.submitted_at)}`, `on Rev ${a.base_revision}`].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="flex flex-wrap gap-1.5">
          <CBtn kind="normal" className="!h-[30px] !text-[12px] !font-semibold" onClick={() => setOpen((v) => !v)} aria-expanded={open} data-testid="amendment-details">
            {open ? "Hide details" : "Details"}
          </CBtn>
          {!a.stale && (
            <CBtn kind="normal" className="!h-[30px] !text-[12px] !font-semibold" onClick={props.onWithdraw} data-testid="amendment-withdraw">
              Withdraw
            </CBtn>
          )}
          {a.stale && (
            <CBtn kind="main" className="!h-[30px] !text-[12px]" onClick={props.onProposeAgain} data-testid="propose-again">
              Propose this version again
            </CBtn>
          )}
        </span>
      </div>
      {a.stale && (
        <p className="text-[13px] text-c-body">
          The order changed after this request was sent. Nothing was applied. Compare and propose again.
        </p>
      )}
      {(open || props.canDecide) && (
        <div className="flex flex-col gap-2 rounded-lg bg-c-card px-3 py-2.5">
          <DiffList rows={props.rows} label={a.stale ? "Sent on and proposed" : "Before and after"} />
          {!a.stale && <Consequences items={props.consequences} />}
          {!a.stale && (
            <div className="border-t border-c-section-line pt-2" data-testid="amendment-agreement">
              <p className="text-[12px] text-c-secondary">Customer agreement</p>
              <AgreementOnRecord
                kind={a.customer_agreement_kind}
                reference={a.customer_agreement_reference}
                detail={a.customer_agreement_detail}
                coversProposal={recorded ? covered : undefined}
              />
              {(!recorded || !covered) && (
                <AgreementForm idPrefix="so-request-agreement" busy={props.busy} onRecord={props.onRecordAgreement} />
              )}
            </div>
          )}
          {!a.stale && props.canDecide && (
            <div className="flex flex-col gap-2 border-t border-c-section-line pt-2">
              <label className="flex flex-col gap-1 text-[12px] text-c-secondary" htmlFor="so-decision">
                Management decision reason
                <textarea
                  id="so-decision"
                  rows={2}
                  value={decision}
                  onChange={(e) => setDecision(e.target.value)}
                  className="rounded-lg border border-c-input-border bg-c-card px-2.5 py-1.5 text-[13px] text-c-ink outline-none focus:[outline:var(--c-focus)] focus:[outline-offset:-2px]"
                />
              </label>
              <div className="flex flex-wrap justify-end gap-2">
                <CBtn kind="normal" disabled={!decision.trim() || props.busy} onClick={() => props.onDecide("reject", decision.trim())} data-testid="decide-reject">
                  Reject
                </CBtn>
                <CBtn kind="main" className="!h-8" disabled={!decision.trim() || !recorded || !covered || props.busy}
                  onClick={() => props.onDecide("approve", decision.trim())} data-testid="decide-approve">
                  Approve and apply
                </CBtn>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Withdraw needs a reason (the server refuses an empty one). */
export function WithdrawForm({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-[12px] text-c-secondary" htmlFor="so-withdraw-reason">
      Why are you withdrawing it?
      <textarea
        id="so-withdraw-reason"
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-c-input-border bg-c-card px-2.5 py-1.5 text-[13px] text-c-ink outline-none focus:[outline:var(--c-focus)] focus:[outline-offset:-2px]"
      />
    </label>
  );
}
