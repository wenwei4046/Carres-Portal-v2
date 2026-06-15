import type { CatalogResponse, OutletDto, SalespersonDto } from "@carres/shared";
import type { WizardDraft } from "../new-order/draft";
import Step1Customer from "../new-order/Step1Customer";
import Step3Delivery from "../new-order/Step3Delivery";
import StairCarryFields from "./StairCarryFields";

/**
 * Step 02 — CUSTOMER. Merges the legacy Step1 (outlet/salesperson + customer +
 * address + emergency + billing) and Step3 (delivery + proceed date) forms,
 * plus the relocated stair-carry fields, into one centred full-screen column.
 * The form components are reused unchanged; only the wrapper is new.
 */
export default function CustomerStep({
  draft,
  onChange,
  outlets,
  salespersons,
  catalog,
  minLeadDays,
}: {
  draft: WizardDraft;
  onChange: (next: WizardDraft) => void;
  outlets: OutletDto[];
  salespersons: SalespersonDto[];
  catalog: CatalogResponse;
  minLeadDays: number;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8 flex flex-col gap-9">
      <Step1Customer
        draft={draft}
        onChange={onChange}
        outlets={outlets}
        salespersons={salespersons}
      />
      <div className="border-t border-base-200" />
      <Step3Delivery
        draft={draft}
        onChange={onChange}
        catalog={catalog}
        minLeadDays={minLeadDays}
      />
      <div className="border-t border-base-200" />
      <StairCarryFields draft={draft} onChange={onChange} cfg={catalog.floorConfig} />
    </div>
  );
}
