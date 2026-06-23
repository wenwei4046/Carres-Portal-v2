import type { CatalogResponse, OutletDto, SalespersonDto } from "@carres/shared";
import type { WizardDraft } from "../new-order/draft";
import Step1Customer from "../new-order/Step1Customer";
import Step3Delivery from "../new-order/Step3Delivery";
import StairCarryFields from "./StairCarryFields";

/**
 * Step 02 — CUSTOMER. Merges the legacy Step1 (outlet/salesperson + customer +
 * address + emergency + billing) and Step3 (delivery + proceed date) forms,
 * plus the relocated stair-carry fields, into one centred full-screen column.
 * 2990s re-skin: the customer column sits on a .pos-card white surface; field
 * grid is 2-col where space allows. Validation/logic entirely unchanged.
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
    <div className="mx-auto w-full max-w-3xl px-6 py-8 flex flex-col gap-6 animate-page-enter">
      {/* Customer + address card */}
      <div className="pos-card p-6 flex flex-col gap-7">
        <Step1Customer
          draft={draft}
          onChange={onChange}
          outlets={outlets}
          salespersons={salespersons}
        />
      </div>

      {/* Delivery dates card */}
      <div className="pos-card p-6">
        <Step3Delivery
          draft={draft}
          onChange={onChange}
          catalog={catalog}
          minLeadDays={minLeadDays}
        />
      </div>

      {/* Delivery access card */}
      <div className="pos-card p-6">
        <StairCarryFields draft={draft} onChange={onChange} cfg={catalog.floorConfig} />
      </div>
    </div>
  );
}
