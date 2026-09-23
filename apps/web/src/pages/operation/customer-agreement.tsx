/**
 * THE CUSTOMER'S RECORDED AGREEMENT — one block, used by every screen that
 * shows or records it (0564; `docs/orders/MASTER.md` § "Customer agreement
 * evidence", owner ruling 2026-09-22 APPROVED / LOCKED).
 *
 *   "A signed document or a reference to the relevant customer confirmation
 *    (for example, WhatsApp) is acceptable; a new handwritten signature is not
 *    required for every amendment. A manager's statement or checkbox saying
 *    the customer agreed is not sufficient by itself and cannot substitute for
 *    the evidence."
 *
 * ⭐ WHY IT IS A COMPONENT AND NOT TWO COPIES. Two screens ask this question —
 * the amendment panel and the whole-page edit's waiting request. Two copies
 * would be two vocabularies and, the first time a kind is added, one screen
 * that quietly kept the old three. The WORDS are proposed, not approved
 * (COPY-STANDARD § "Customer agreement evidence — screen wording"), so they
 * live in exactly one place until Jess rules on them.
 *
 * ⭐ THERE IS NO TICK BOX AND THERE NEVER MAY BE ONE. Every kind demands a
 * REFERENCE that points at something findable outside the record; the database
 * refuses a kind without one, and refuses the approval without both.
 */
import { useState } from "react";
import Button from "@/components/kit/Button";
import Input from "@/components/kit/Input";
import Select from "@/components/kit/Select";
import Textarea from "@/components/kit/Textarea";
import type { CustomerAgreementKind } from "@/lib/queries";

export const AGREEMENT_KINDS: ReadonlyArray<{ value: CustomerAgreementKind; label: string; hint: string }> = [
  {
    value: "signed_document",
    label: "Signed document",
    hint: "The file name of the document the customer signed",
  },
  {
    value: "customer_confirmation",
    label: "Customer confirmation",
    hint: "Where the customer's own message can be found — for example WhatsApp, the date and the number",
  },
  {
    value: "original_agreement",
    label: "Original agreement",
    hint: "The revision whose signed agreement already covers this — for example Rev 1",
  },
];

export const agreementKindLabel = (kind: string | null | undefined) =>
  AGREEMENT_KINDS.find((k) => k.value === kind)?.label ?? kind ?? "";

export interface RecordedAgreement {
  kind: CustomerAgreementKind;
  reference: string;
  detail?: string;
}

/** What is on record, and what is missing — the approver's own reading. */
export function AgreementOnRecord(props: {
  kind?: string | null;
  reference?: string | null;
  detail?: string | null;
  coversProposal?: boolean;
}) {
  if (!props.kind) {
    return (
      <p className="mt-1.5 text-body text-kit-slate-12" data-testid="amendment-agreement-missing">
        Nothing on record shows the customer agreed to this change, so it cannot take effect yet.
        The proposal is kept.
      </p>
    );
  }
  return (
    <>
      <p className="mt-1.5 break-words text-meta text-kit-slate-11">
        {agreementKindLabel(props.kind)} — {props.reference}
      </p>
      {props.detail && <p className="mt-1 break-words text-meta text-kit-slate-11">{props.detail}</p>}
      {props.coversProposal === false && (
        <p className="mt-1.5 text-body text-kit-red-11" data-testid="amendment-agreement-stale">
          The proposed change is no longer what the customer agreed to. Record the customer
          agreement again before this can be approved.
        </p>
      )}
    </>
  );
}

/**
 * The form Sales records it through — never the approver: "Sales records the
 * confirmation basis; the authorised approver checks that it covers the
 * proposed change."
 *
 * `onRecord` receives the governed triple. `commitWord` lets the whole-page
 * edit say the agreement rides along with the request it is sending, while the
 * amendment panel records it on its own.
 */
export function AgreementForm(props: {
  idPrefix: string;
  busy?: boolean;
  commitWord?: string;
  onRecord?: (a: RecordedAgreement) => void;
  /** Controlled use: the draft carries the agreement to the server with it. */
  value?: RecordedAgreement | null;
  onChange?: (a: RecordedAgreement | null) => void;
}) {
  const [kind, setKind] = useState<CustomerAgreementKind>(props.value?.kind ?? "customer_confirmation");
  const [reference, setReference] = useState(props.value?.reference ?? "");
  const [detail, setDetail] = useState(props.value?.detail ?? "");
  const publish = (next: Partial<RecordedAgreement>) => {
    const merged: RecordedAgreement = {
      kind: next.kind ?? kind,
      reference: next.reference ?? reference,
      detail: next.detail ?? detail,
    };
    props.onChange?.(merged.reference.trim() ? { ...merged, reference: merged.reference.trim() } : null);
  };
  return (
    <div className="mt-2 flex flex-col gap-2">
      <Select
        id={`${props.idPrefix}-kind`}
        label="How did the customer agree?"
        value={kind}
        onValueChange={(v) => {
          setKind(v as CustomerAgreementKind);
          publish({ kind: v as CustomerAgreementKind });
        }}
        options={AGREEMENT_KINDS.map((k) => ({ value: k.value, label: k.label }))}
      />
      <Input
        id={`${props.idPrefix}-reference`}
        label={AGREEMENT_KINDS.find((k) => k.value === kind)?.hint ?? "Reference"}
        value={reference}
        onChange={(e) => {
          setReference(e.target.value);
          publish({ reference: e.target.value });
        }}
      />
      <Textarea
        id={`${props.idPrefix}-detail`}
        label="What did the customer agree to? (optional)"
        rows={2}
        value={detail}
        onChange={(e) => {
          setDetail(e.target.value);
          publish({ detail: e.target.value });
        }}
      />
      {props.onRecord && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="neutral"
            disabled={!reference.trim() || props.busy}
            data-testid={`${props.idPrefix}-save`}
            onClick={() =>
              props.onRecord?.({ kind, reference: reference.trim(), detail: detail.trim() || undefined })
            }
          >
            {props.commitWord ?? "Record customer agreement"}
          </Button>
        </div>
      )}
    </div>
  );
}
