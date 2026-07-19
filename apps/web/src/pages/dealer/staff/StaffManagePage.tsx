import { createPortal } from "react-dom";
import { ArrowLeft } from "lucide-react";
import StaffSection from "./StaffSection";
import StoreAccountSection from "./StoreAccountSection";

/**
 * In-POS staff management overlay (Loo 2026-07-19: the dealer principal had NO
 * tab anywhere in the POS to add their sales manager / sales executive — the
 * only staff surface lived behind the back-office Settings page, reached via
 * an Exit icon that reads as "sign out"). Full-screen POS shell, same pattern
 * as the "My orders" OrderStatusPage; the body is the shared <StaffSection>
 * (also mounted in DealerSettings) so both surfaces manage staff identically.
 *
 * Opened from the top-bar "Staff" pill, which DealerPos shows only for a
 * principal / manager-tier staff session — StaffSection re-checks the tier and
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
        {/* Back floats top-left; everything else lives in ONE centred column so
            the page doesn't hug the left edge (Loo 2026-07-19). */}
        <button
          className="icon-btn"
          onClick={onClose}
          aria-label="Back"
          data-testid="staff-manage-back"
          style={{ position: "absolute", top: 22, left: 32 }}
        >
          <ArrowLeft size={16} strokeWidth={1.75} />
        </button>
        <div style={{ width: "100%", maxWidth: 780, margin: "0 auto", padding: "26px 32px 40px" }}>
          <div className="os-head__eyebrow">Store team</div>
          <h1 className="os-head__title" style={{ margin: "6px 0 10px" }}>
            Staff &amp; PINs
          </h1>
          <p style={{ margin: "0 0 18px", fontSize: 13, color: "var(--fg-muted)" }}>
            Add a staff member — their 6-digit PIN is set in the same step, so they appear on the
            sign-in screen right away.
          </p>
          <StaffSection />
          {/* Store credential (dealer principal only — renders null otherwise). */}
          <StoreAccountSection />
        </div>
      </div>
    </div>,
    document.body,
  );
}
