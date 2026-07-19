import { useState } from "react";
import { KeyRound, RefreshCw } from "lucide-react";
import { useStaffSession } from "@/lib/staff";
import { ChangeMyPinModal, staffColorHex, staffInitials, TIER_LABEL } from "./staff-ui";

/**
 * Current-staff chip (0233) shown in the POS top bar and the back-office chrome.
 * Renders the signed-in staff member (colour avatar + name + tier) as a
 * "换人 / switch" button: clicking clears the staff token — keeping the working
 * outlet — which drops StaffGate back to the PIN screen. A sibling "改 PIN"
 * button (Loo 2026-07-18) lets EVERY tier rotate its own PIN (hidden in
 * owner-mode, whose sid is null — no personal PIN to rotate). Returns null
 * when there's no staff session (principal on-behalf / unlinked salesperson)
 * so the host can fall back to its default chip.
 */
export default function StaffSwitchChip({ variant }: { variant: "pos" | "kit" }) {
  const staff = useStaffSession((s) => s.staff);
  const clearToken = useStaffSession((s) => s.clearToken);
  const [pinOpen, setPinOpen] = useState(false);
  if (!staff) return null;

  const tier = TIER_LABEL[staff.tier];
  const pinModal =
    pinOpen && staff.sid ? (
      <ChangeMyPinModal sid={staff.sid} name={staff.name} onClose={() => setPinOpen(false)} />
    ) : null;

  if (variant === "pos") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <button
          type="button"
          className="pos-staff-chip pos-staff-chip--btn"
          onClick={clearToken}
          title="Switch staff"
          data-testid="staff-switch-chip"
        >
          <span className="pos-staff-chip__avatar" style={{ background: staffColorHex(staff.color) }}>
            {staffInitials(staff.name)}
          </span>
          <span style={{ textAlign: "left" }}>
            {staff.name}
            <span className="pos-staff-chip__role" style={{ display: "block" }}>
              {tier}
            </span>
          </span>
          <span className="pos-staff-chip__switch">
            <RefreshCw size={12} strokeWidth={2} />
            Switch
          </span>
        </button>
        {staff.sid && (
          <button
            type="button"
            className="pos-staff-chip pos-staff-chip--btn"
            onClick={() => setPinOpen(true)}
            title="Change my PIN"
            data-testid="staff-changepin-chip"
          >
            <span className="pos-staff-chip__switch">
              <KeyRound size={12} strokeWidth={2} />
              PIN
            </span>
          </button>
        )}
        {pinModal}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={clearToken}
        title="Switch staff"
        data-testid="staff-switch-chip"
        className="inline-flex items-center gap-2.5 pl-1 pr-3 py-1 rounded-full bg-secondary hover:ring-1 hover:ring-primary transition-shadow cursor-pointer"
      >
        <span
          className="inline-flex items-center justify-center w-7 h-7 rounded-full text-white text-[11px] font-semibold"
          style={{ background: staffColorHex(staff.color) }}
        >
          {staffInitials(staff.name)}
        </span>
        <span className="text-left">
          <span className="block text-[13px] font-semibold leading-tight">{staff.name}</span>
          <span className="block text-[11px] text-muted-foreground">
            {tier}
          </span>
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary ml-1">
          <RefreshCw size={12} strokeWidth={2} />
          Switch
        </span>
      </button>
      {staff.sid && (
        <button
          type="button"
          onClick={() => setPinOpen(true)}
          title="Change my PIN"
          data-testid="staff-changepin-chip"
          className="inline-flex items-center gap-1 px-3 py-2 rounded-full bg-secondary hover:ring-1 hover:ring-primary transition-shadow cursor-pointer text-[11px] font-semibold text-primary"
        >
          <KeyRound size={12} strokeWidth={2} />
          PIN
        </button>
      )}
      {pinModal}
    </span>
  );
}
