import { ChevronRight } from "lucide-react";
import { branchNoun, type OutletDto, type StoreChannel } from "@carres/shared";
import CarresLockup from "@/components/CarresLockup";

/**
 * OutletPicker (0233) — shown only when an activated store has MORE THAN ONE
 * outlet; a single-outlet store auto-selects and never sees this. The chosen
 * outlet scopes the PIN screen's staff tiles and prefills the CUSTOMER step's
 * outlet field for the session.
 */
export default function OutletPicker({
  outlets,
  storeChannel = "dealer",
  onPick,
}: {
  outlets: OutletDto[];
  /** Names the branch — a dealer's is an "outlet", ours is a "showroom". */
  storeChannel?: StoreChannel;
  onPick: (outletId: string) => void;
}) {
  const branch = branchNoun(storeChannel).toLowerCase();
  return (
    <div className="pos-proto staff-gate" data-testid="staff-outlet-picker">
      <div className="staff-gate__card staff-gate__card--narrow">
        <div className="staff-gate__lockup">
          <CarresLockup size={24} />
        </div>
        <div className="staff-gate__eyebrow">Which {branch}</div>
        <h2 className="staff-gate__title">Pick your {branch}</h2>
        <p className="staff-gate__sub">Choose where you're working today. You can switch later.</p>
        <div className="staff-outlets">
          {outlets.map((o) => (
            <button
              key={o.id}
              type="button"
              className="staff-outlet"
              onClick={() => onPick(o.id)}
              data-testid={`staff-outlet-${o.id}`}
            >
              <span>
                <span className="staff-outlet__name">{o.name}</span>
                <span className="staff-outlet__addr">{o.address}</span>
              </span>
              <ChevronRight size={18} strokeWidth={1.75} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
