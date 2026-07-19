import { useState } from "react";
import { KeyRound, RefreshCw } from "lucide-react";
import { useStaffSession } from "@/lib/staff";
import { ChangeMyPinModal, staffColorHex, staffInitials, TIER_LABEL } from "./staff-ui";

/**
 * Current-staff chip (0233) shown in the POS top bar. Renders the signed-in
 * staff member (colour avatar + name + tier) as a "换人 / switch" button:
 * clicking clears the staff token — keeping the working outlet — which drops
 * StaffGate back to the PIN screen. A sibling "改 PIN" button (Loo 2026-07-18)
 * lets EVERY tier rotate its own PIN (hidden in owner-mode, whose sid is null —
 * no personal PIN to rotate). Returns null when there's no staff session
 * (principal on-behalf / unlinked salesperson) so the host can fall back to
 * its default chip. (The back-office "kit" variant died with the back-office,
 * 2026-07-19.)
 */
export default function StaffSwitchChip() {
  const staff = useStaffSession((s) => s.staff);
  const clearToken = useStaffSession((s) => s.clearToken);
  const [pinOpen, setPinOpen] = useState(false);
  if (!staff) return null;

  const tier = TIER_LABEL[staff.tier];
  const pinModal =
    pinOpen && staff.sid ? (
      <ChangeMyPinModal sid={staff.sid} name={staff.name} onClose={() => setPinOpen(false)} />
    ) : null;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <button
        type="button"
        className="pos-staff-chip pos-staff-chip--btn"
        onClick={clearToken}
        title="换人 · Switch staff"
        data-testid="staff-switch-chip"
      >
        <span className="pos-staff-chip__avatar" style={{ background: staffColorHex(staff.color) }}>
          {staffInitials(staff.name)}
        </span>
        <span style={{ textAlign: "left" }}>
          {staff.name}
          <span className="pos-staff-chip__role" style={{ display: "block" }}>
            {tier.zh} · {tier.en}
          </span>
        </span>
        <span className="pos-staff-chip__switch">
          <RefreshCw size={12} strokeWidth={2} />
          换人
        </span>
      </button>
      {staff.sid && (
        <button
          type="button"
          className="pos-staff-chip pos-staff-chip--btn"
          onClick={() => setPinOpen(true)}
          title="改 PIN · Change my PIN"
          data-testid="staff-changepin-chip"
        >
          <span className="pos-staff-chip__switch">
            <KeyRound size={12} strokeWidth={2} />
            改 PIN
          </span>
        </button>
      )}
      {pinModal}
    </span>
  );
}
