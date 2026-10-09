// design-standard: not-a-list-page — this is a central Settings editor, not a Register.
/**
 * Settings → Company (Carres Settings List COM-01 · COM-02, owner confirmed
 * 9 Oct 2026; storage 0669). The one company identity every printed document
 * carries, and the one customer support contact.
 *
 * Jess, or a person she names for Company, edits. Edit → Review changes →
 * Save changes; a reason is optional (a compulsory reason is not confirmed).
 * Values not verified stay `Not set` — never guessed. Bank accounts live in
 * Payments, hours in Office, warehouse details in Warehouse.
 */
import { useState } from "react";
import { toast } from "sonner";
import {
  COMPANY_PROFILE_FIELDS,
  companyAddressLines,
  type CompanyProfileField,
  type CompanyProfileValues,
} from "@carres/shared";
import Button from "@/components/kit/Button";
import Input from "@/components/kit/Input";
import PageShell from "@/components/kit/PageShell";
import Loading from "@/components/kit/Loading";
import { useCompanySettings, useSaveCompanySettings } from "@/lib/settings-queries";
import { ChangeList, Notice, Row, Section, Value, W, refusalOf } from "./parts";

export const COMPANY_FIELD_LABEL: Record<CompanyProfileField, string> = {
  legal_name: "Legal company name",
  former_name: "Former company name",
  registration_no: "SSM registration number",
  address_line1: "Registered address line 1",
  address_line2: "Registered address line 2",
  address_line3: "Registered address line 3",
  postcode: "Postcode",
  city: "City",
  country: "Country",
  company_phone: "Company telephone",
  company_email: "Company email",
  support_name: "Customer support name",
  support_phone: "Customer support telephone",
  support_whatsapp: "Customer support WhatsApp",
  support_email: "Customer support email",
};

const LEGAL: CompanyProfileField[] = [
  "legal_name", "former_name", "registration_no",
  "address_line1", "address_line2", "address_line3", "postcode", "city", "country",
  "company_phone", "company_email",
];
const SUPPORT: CompanyProfileField[] = ["support_name", "support_phone", "support_whatsapp", "support_email"];
const REQUIRED: CompanyProfileField[] = ["legal_name", "registration_no"];

function trimmed(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

export default function CompanySettings() {
  const query = useCompanySettings();
  const save = useSaveCompanySettings();
  const [step, setStep] = useState<"view" | "edit" | "review">("view");
  const [draft, setDraft] = useState<CompanyProfileValues | null>(null);
  const [reason, setReason] = useState("");

  if (query.isError) {
    return (
      <PageShell variant="settings" title="Company">
        <div role="alert" className="p-6 text-body">
          <p>{W.loadFailed}</p>
          <Button variant="neutral" onClick={() => void query.refetch()}>{W.tryAgain}</Button>
        </div>
      </PageShell>
    );
  }
  if (!query.data) {
    return <PageShell variant="settings" title="Company"><Loading label={W.loading} /></PageShell>;
  }
  const data = query.data;
  const current = data.values;
  const editable = data.stored && data.canEdit;

  const changed = draft
    ? COMPANY_PROFILE_FIELDS.filter((f) => trimmed(draft[f]) !== trimmed(current[f]))
    : [];
  const missing = draft ? REQUIRED.filter((f) => trimmed(draft[f]) == null) : [];
  const gap = missing.length > 0
    ? `${COMPANY_FIELD_LABEL[missing[0]!]} is required`
    : changed.length === 0 ? "nothing changed" : null;

  const begin = () => { setDraft({ ...current }); setReason(""); setStep("edit"); };
  const stop = () => { setDraft(null); setReason(""); setStep("view"); };
  const commit = () => {
    if (!draft || data.revision == null) return;
    const values = Object.fromEntries(COMPANY_PROFILE_FIELDS.map((f) => [f, trimmed(draft[f])])) as CompanyProfileValues;
    save.mutate(
      { values: { ...values, legal_name: values.legal_name ?? "", registration_no: values.registration_no ?? "" }, revision: data.revision, reason: reason.trim() || undefined },
      {
        onSuccess: () => { toast.success("Company settings saved"); stop(); },
        onError: (e) => toast.error(refusalOf(e)),
      },
    );
  };

  const field = (f: CompanyProfileField) => step === "view" || !draft ? (
    <Row key={f} label={COMPANY_FIELD_LABEL[f]}><Value value={current[f]} /></Row>
  ) : (
    <Row key={f} label={COMPANY_FIELD_LABEL[f]} htmlFor={`company-${f}`}>
      <Input
        id={`company-${f}`}
        value={draft[f] ?? ""}
        maxLength={200}
        required={REQUIRED.includes(f)}
        disabled={step === "review"}
        error={step === "edit" && REQUIRED.includes(f) && trimmed(draft[f]) == null ? `${COMPANY_FIELD_LABEL[f]} is required` : undefined}
        onChange={(e) => setDraft({ ...draft, [f]: e.target.value })}
      />
    </Row>
  );

  const editAction = step === "view" && editable
    ? <Button variant="neutral" onClick={begin} data-testid="company-edit">{W.edit}</Button>
    : null;

  return (
    <PageShell variant="settings" title="Company">
      <div className="mx-auto grid w-full max-w-4xl gap-5 overflow-auto p-5" data-testid="company-settings">
        {!data.stored && <Notice testId="company-not-installed">{W.notInstalled}</Notice>}
        {data.stored && !data.canEdit && <Notice testId="company-read-only">{W.readOnly}</Notice>}

        <Section
          title="Legal company"
          lead="Every printed document reads these details."
          action={editAction}
          testId="company-legal"
        >
          {LEGAL.map(field)}
          {step === "view" && (
            <Row label="Printed address">
              <Value value={companyAddressLines(current).join("\n")} />
            </Row>
          )}
        </Section>

        <Section
          title="Customer support"
          lead="The one contact customers see. Staff who act are still recorded by name."
          testId="company-support"
        >
          {SUPPORT.map(field)}
        </Section>

        {step !== "view" && draft && (
          <Section title={W.reviewChanges} testId="company-review">
            {step === "review" ? (
              <ul className="grid gap-0.5">
                {changed.map((f) => (
                  <li key={f} className="text-body">
                    {COMPANY_FIELD_LABEL[f]}: {current[f] ?? W.notSet} → {trimmed(draft[f]) ?? W.notSet}
                  </li>
                ))}
              </ul>
            ) : null}
            <Row label={W.reason} htmlFor="company-reason">
              <Input id="company-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
            </Row>
            <div className="flex flex-wrap gap-2 pt-2">
              {step === "edit" ? (
                <Button variant="primary" disabled={gap !== null} onClick={() => setStep("review")} data-testid="company-review-button">
                  {gap ? `${W.reviewChanges}: ${gap}` : W.reviewChanges}
                </Button>
              ) : (
                <Button variant="primary" loading={save.isPending} onClick={commit} data-testid="company-save">
                  {W.saveChanges}
                </Button>
              )}
              <Button variant="neutral" onClick={() => (step === "review" ? setStep("edit") : stop())}>
                {step === "review" ? W.back : W.cancel}
              </Button>
            </div>
          </Section>
        )}

        <ChangeList
          changes={data.changes}
          testId="company-changes"
          labelOf={() => "Company details"}
          fieldLabel={(f) => COMPANY_FIELD_LABEL[f as CompanyProfileField] ?? f}
          valueOf={(_f, v) => (v == null || v === "" ? W.notSet : String(v))}
        />
      </div>
    </PageShell>
  );
}
