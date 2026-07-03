import type { CatalogResponse, OutletDto, SalespersonDto } from "@carres/shared";
import type { WizardDraft } from "../new-order/draft";
import Step1Customer from "../new-order/Step1Customer";
import Step3Delivery from "../new-order/Step3Delivery";
import StairCarryFields from "./StairCarryFields";

/** In-flow dealer pick (internal operator placing on behalf of a dealer).
 *  Absent for dealer-side logins — their JWT dealer is the order's dealer. */
export interface DealerPick {
  dealers: Array<{ id: string; name: string }>;
  loading: boolean;
  value: string | null;
  onPick: (id: string, name: string) => void;
}

/**
 * Step 02 — CUSTOMER. Merges the legacy Step1 (outlet/salesperson + customer +
 * address + emergency + billing) and Step3 (delivery + proceed date) forms,
 * plus the relocated stair-carry fields, into one centred full-screen column.
 * 2990s re-skin: the customer column sits on a .pos-card white surface; field
 * grid is 2-col where space allows. Validation/logic entirely unchanged.
 *
 * POS-parity — when `dealerPick` is provided (internal operator), a Dealer card
 * leads the column; the rest of the form appears only after a dealer is chosen
 * (outlets + salespersons belong to that dealer).
 */
export default function CustomerStep({
  draft,
  onChange,
  outlets,
  salespersons,
  catalog,
  minLeadDays,
  dealerPick,
}: {
  draft: WizardDraft;
  onChange: (next: WizardDraft) => void;
  outlets: OutletDto[];
  salespersons: SalespersonDto[];
  catalog: CatalogResponse;
  minLeadDays: number;
  dealerPick?: DealerPick;
}) {
  const dealerPending = !!dealerPick && !dealerPick.value;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8 flex flex-col gap-6 animate-page-enter">
      {/* Dealer card — internal operator picks who this sale belongs to. */}
      {dealerPick && (
        <div className="pos-card p-6">
          <p className="t-micro text-base-400">Sale info</p>
          <h3 className="t-h4 mt-0.5">Dealer</h3>
          <p className="t-small text-base-500 mt-1">
            Pick the dealer this sale belongs to. The order, outlet and salesperson are recorded
            under that dealer; the activity log keeps your name as who placed it.
          </p>
          <select
            value={dealerPick.value ?? ""}
            onChange={(e) => {
              const d = dealerPick.dealers.find((x) => x.id === e.target.value);
              if (d) dealerPick.onPick(d.id, d.name);
            }}
            disabled={dealerPick.loading || dealerPick.dealers.length === 0}
            data-testid="pos-dealer-pick"
            className="mt-3 w-full max-w-sm rounded-md border border-base-300 bg-white px-3 py-2 t-body disabled:opacity-50"
          >
            <option value="">
              {dealerPick.loading
                ? "Loading dealers…"
                : dealerPick.dealers.length === 0
                  ? "No active dealers"
                  : "Select a dealer…"}
            </option>
            {dealerPick.dealers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {dealerPending ? (
        <p className="t-small text-base-500 text-center py-4">
          Pick a dealer to continue — the outlet and salesperson lists follow the dealer.
        </p>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
