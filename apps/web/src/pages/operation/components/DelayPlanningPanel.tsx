import { useState } from "react";

import type { DelayDecision } from "@carres/shared";

import { orderActionButton } from "@carres/shared";

import { fmtDate } from "@/lib/fmt-date";
import { useRecordDelayDecision } from "@/lib/queries";

/**
 * C8 · Delay planning — the DECISION, and the gate before the customer
 * (Jess 2026-07-27; the specification is `docs/ORDERS-WORKING-FLOW.md` §3).
 *
 * **Why this is a panel and not a row in the checklist.** C2's action list has
 * no controls by law, and C6's steps have none either: an action leaves when
 * the SYSTEM measures its completion. `Delay planning` completes on a stored
 * decision, so something has to collect it — and COPY-STANDARD's own rule says
 * *where a FORM already collects the inputs, that form IS the checklist*. This
 * is that form. It appears only while the action is open and disappears the
 * moment the decision lands, because the ladder stops raising the action.
 *
 * **THE GATE IS THE POINT.** A supplier naming a later date is not yet a delay:
 * we may have the item in ready stock, or another supplier may cover it. Only
 * `We cannot make the promised date` opens
 * `Call {logistics} — arrange new delivery date`. **The customer is the last to
 * know, and only when we have tried and failed** — which is why there is no
 * button anywhere on this panel that opens a call to a customer.
 *
 * **The promised date is not editable here, and it is not editable anywhere in
 * this flow.** `orders.delivery_date` stays at what was sold (§3 stage 3), so
 * every late / on-time figure keeps measuring against it. The panel PRINTS the
 * promised date as a fact and offers no control that could change it.
 *
 * Every word on screen is COPY-STANDARD's: `Delay planning` (its vocabulary
 * table), `Record the delay decision` (the dictionary's BUTTON string, read
 * from the shared mirror — this file spells no verb), the two answers as Jess
 * ruled them 2026-07-28, and `Note (optional)`, which is the label this drawer
 * already uses for a free-text note (rule 8: same word app-wide).
 */
export interface DelayPlanningPanelProps {
  orderId: string;
  /** The factory date that overshot the promise — what the decision is ABOUT.
   *  Sent back with the answer so the record names its own subject, and so a
   *  later slip is a new delay rather than one this answer silences. */
  supplierEtaIso: string;
  /** What was SOLD. Printed as a fact; never editable from here. */
  promisedDateIso: string | null;
}

export default function DelayPlanningPanel({
  orderId,
  supplierEtaIso,
  promisedDateIso,
}: DelayPlanningPanelProps) {
  const [decision, setDecision] = useState<DelayDecision | null>(null);
  const [note, setNote] = useState("");
  const record = useRecordDelayDecision(orderId);
  const buttonWord = orderActionButton("delay_planning") ?? "";

  return (
    <section
      data-testid="delay-planning-panel"
      className="shrink-0 rounded-lg border border-danger/40 bg-white px-3 py-2 flex flex-col gap-2"
    >
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="t4-label shrink-0">Delay planning</span>
        <span className="t4-secondary truncate">
          Stock arrives after the promised date
        </span>
      </div>
      <div className="t4-secondary tabular-nums">
        {promisedDateIso ? `Promised ${fmtDate(promisedDateIso)} · ` : ""}
        {`supplier ready ${fmtDate(supplierEtaIso)}`}
      </div>
      <div className="flex flex-col gap-1">
        {(
          [
            ["keep", "We can still make the promised date"],
            ["new_date", "We cannot make the promised date"],
          ] as const
        ).map(([value, label]) => (
          <label
            key={value}
            data-testid="delay-decision-choice"
            data-decision={value}
            className="flex items-center gap-2 text-body text-base-900 cursor-pointer"
          >
            <input
              type="radio"
              name={`delay-decision-${orderId}`}
              value={value}
              checked={decision === value}
              onChange={() => setDecision(value)}
            />
            <span className="truncate min-w-0">{label}</span>
          </label>
        ))}
      </div>
      <label className="block">
        <span className="text-meta text-base-500">Note (optional)</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-[4px] border border-base-200 px-2 py-1 text-body"
        />
      </label>
      {record.isError && (
        <div data-testid="delay-decision-error" className="t4-secondary text-danger">
          {record.error?.message ?? "Could not record the decision."}
        </div>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          data-testid="delay-decision-submit"
          className="btn-primary py-1.5 text-body disabled:opacity-40"
          disabled={decision === null || record.isPending}
          onClick={() =>
            decision &&
            record.mutate({
              decision,
              supplierEta: supplierEtaIso,
              ...(note.trim() ? { note: note.trim() } : {}),
            })
          }
        >
          {buttonWord}
        </button>
      </div>
    </section>
  );
}
