import type { ReactNode } from "react";
import { PURCHASE_REQUEST_REASONS, type PurchaseRequestContext } from "@carres/shared";
import Block from "@/components/kit/Block";
import Input from "@/components/kit/Input";
import Select from "@/components/kit/Select";
import Textarea from "@/components/kit/Textarea";
import DatePicker from "@/components/kit/DatePicker";
import PurchaseRequestRecipients from "./PurchaseRequestRecipients";
import PurchaseRequestAllocations from "./PurchaseRequestAllocations";
import { changeRequestPurpose, removeRequestRecipient } from "./purchase-request-draft";

/** Field sections for the EXISTING CreateRequestWorkspace. No submit button, item
 * picker, alternate form or transport. Keep unmounted until the owning writer and
 * read-back support the complete context; the legacy submit must not discard it. */
export default function PurchaseRequestContextFields({ value, onChange, serviceCases, destinations, pickupLocations, stockByLine, earliestRecipientDate, earliestSupplierDateBySku, disabled = false, section = "all", automaticFacts, additionalFields, purposeLocked = false }: {
  section?: "all" | "details" | "recipients" | "allocations";
  automaticFacts?: ReactNode;
  additionalFields?: ReactNode;
  purposeLocked?: boolean;
  value: PurchaseRequestContext;
  onChange: (context: PurchaseRequestContext) => void;
  serviceCases: ReadonlyArray<{ id: string; label: string }>;
  destinations: ReadonlyArray<{ id: string; name: string }>;
  pickupLocations: ReadonlyArray<{ id: string; name: string }>;
  /** Exact SKU/configuration stock read, keyed by stable request line, never SKU alone. */
  stockByLine: ReadonlyMap<string, ReadonlyArray<{ locationId: string; destinationId: string; name: string; available: number }>>;
  earliestRecipientDate: string | null;
  earliestSupplierDateBySku: ReadonlyMap<string, string | null>;
  disabled?: boolean;
}) {
  const rs = value.purpose === "ready_stock";
  const patch = (change: Partial<PurchaseRequestContext>) => onChange({ ...value, ...change });
  return <>
    {(section === "all" || section === "details") && <Block title="Request Details">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {automaticFacts}
        <DatePicker id="purchase-request-proceed" label="Proceed Date" required disabled={disabled} value={value.proceedDate || null} onChange={(date) => patch({ proceedDate: date ?? "" })} />
        {rs && <DatePicker id="purchase-request-stock-date" label="Delivery Date" required disabled={disabled || earliestRecipientDate == null} minDate={earliestRecipientDate ?? undefined} error={earliestRecipientDate && value.stockDeliveryDate && value.stockDeliveryDate < earliestRecipientDate ? `Choose ${earliestRecipientDate} or later` : undefined} value={value.stockDeliveryDate} onChange={(stockDeliveryDate) => patch({ stockDeliveryDate })} />}
        <Select id="purchase-request-purpose" label="Purpose" required disabled={disabled || rs || purposeLocked} value={value.purpose} options={rs ? [{ value: "ready_stock", label: "Ready Stock" }] : [{ value: "service_case", label: "Service Case" }, { value: "general_purchase", label: "General Purchase" }]} onValueChange={(purpose) => onChange(changeRequestPurpose(value, purpose as PurchaseRequestContext["purpose"]))} />
        {value.purpose === "service_case" && <Select id="purchase-request-case" label="Service Case" required disabled={disabled} value={value.serviceCaseId ?? undefined} options={serviceCases.map((item) => ({ value: item.id, label: item.label }))} onValueChange={(serviceCaseId) => patch({ serviceCaseId })} />}
        {value.purpose === "general_purchase" && <>
          <Select id="purchase-request-reason" label="Reason for purchase" required disabled={disabled} value={value.reason ?? undefined} options={PURCHASE_REQUEST_REASONS} onValueChange={(reason) => patch({ reason: reason as PurchaseRequestContext["reason"], companyPersonName: "", projectReference: "", explanation: "" })} />
          {value.reason === "purchase_for_others" && <>
            <Input id="purchase-request-company-person" label="Company / Person name" required disabled={disabled} value={value.companyPersonName} onChange={(event) => patch({ companyPersonName: event.target.value })} />
            <Input id="purchase-request-project" label="Project name / reference" disabled={disabled} value={value.projectReference} onChange={(event) => patch({ projectReference: event.target.value })} />
          </>}
          {value.reason === "other" && <Textarea id="purchase-request-explanation" label="Explanation" required disabled={disabled} value={value.explanation} onChange={(event) => patch({ explanation: event.target.value })} />}
        </>}
        {additionalFields}
        {value.origin === "forecast_suggestion" && <Textarea id="purchase-request-forecast-change" label="Reason for change" disabled={disabled} value={value.forecastChangeReason} onChange={(event) => patch({ forecastChangeReason: event.target.value })} />}
      </div>
    </Block>}
    {(section === "all" || section === "recipients") && !rs && <PurchaseRequestRecipients value={value.recipients} disabled={disabled} pickupLocations={pickupLocations} earliestDate={earliestRecipientDate} onChange={(recipients) => {
      const kept = new Set(recipients.map((recipient) => recipient.id));
      const next = value.recipients.filter((recipient) => !kept.has(recipient.id)).reduce((context, recipient) => removeRequestRecipient(context, recipient.id), value);
      onChange({ ...next, recipients });
    }} />}
    {(section === "all" || section === "allocations") && value.lines.map((line) => <PurchaseRequestAllocations key={line.id} line={line} recipients={value.recipients} destinations={destinations} stockOffers={stockByLine.get(line.id) ?? []} stockRequest={rs} earliestSupplierDate={earliestSupplierDateBySku.get(line.sku) ?? null} disabled={disabled} onChange={(next) => patch({ lines: value.lines.map((item) => item.id === next.id ? next : item) })} />)}
  </>;
}
