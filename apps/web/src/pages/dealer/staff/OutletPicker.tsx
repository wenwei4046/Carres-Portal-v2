import { ChevronRight } from "lucide-react";
import type { OutletDto } from "@carres/shared";

/**
 * OutletPicker (0232) — shown only when an activated store has MORE THAN ONE
 * outlet; a single-outlet store auto-selects and never sees this. The chosen
 * outlet scopes the PIN screen's staff tiles and prefills the CUSTOMER step's
 * outlet field for the session.
 */
export default function OutletPicker({
  outlets,
  onPick,
}: {
  outlets: OutletDto[];
  onPick: (outletId: string) => void;
}) {
  return (
    <div className="staff-gate" data-testid="staff-outlet-picker">
      <div className="staff-gate__card staff-gate__card--narrow">
        <div className="staff-gate__eyebrow">Which outlet</div>
        <h2 className="staff-gate__title">Pick your outlet</h2>
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
