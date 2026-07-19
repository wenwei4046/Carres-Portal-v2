import { createPortal } from "react-dom";
import { ArrowLeft } from "lucide-react";
import OutletsSection from "./OutletsSection";
import StaffSection from "./StaffSection";
import StoreAccountSection from "./StoreAccountSection";

/**
 * In-POS staff management overlay (Loo 2026-07-19: the dealer principal had NO
 * tab anywhere in the POS to add their sales manager / sales executive).
 * Full-screen POS shell, same pattern as the "My orders" OrderStatusPage.
 * Since the back-office Orders / Products / Settings tabs were deleted
 * (Loo 2026-07-19, POS-only), this overlay is the store's ONE admin surface:
 * staff + PINs, outlets, and the store login credential.
 *
 * Opened from the top-bar "Staff" pill, which DealerPos shows only for a
 * principal / manager-tier staff session — each section re-checks the tier and
 * renders null for anyone else.
 */
export default function StaffManagePage({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div
      className="pos-proto"
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "var(--pos-bg)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Staff management"
      data-testid="pos-staff-manage"
    >
      <div className="os-page">
        <div className="os-head">
          <div className="os-head__left">
            <button
              className="icon-btn"
              onClick={onClose}
              aria-label="Back"
              data-testid="staff-manage-back"
            >
              <ArrowLeft size={16} strokeWidth={1.75} />
            </button>
            <div>
              <div className="os-head__eyebrow">团队 · Store team</div>
              <h1 className="os-head__title">Staff &amp; PINs</h1>
            </div>
          </div>
        </div>
        <div style={{ padding: "4px 32px 40px", width: "100%", maxWidth: 780 }}>
          <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--fg-muted)" }}>
            加了人、帮他设好 6 位 PIN，他就会出现在签到名单上 · Add a staff member and set
            their 6-digit PIN — they&apos;ll appear on the sign-in screen.
          </p>
          <StaffSection />
          {/* Outlets (principal only — moved from the deleted Settings page). */}
          <OutletsSection />
          {/* Store credential (dealer principal only — renders null otherwise). */}
          <StoreAccountSection />
        </div>
      </div>
    </div>,
    document.body,
  );
}
