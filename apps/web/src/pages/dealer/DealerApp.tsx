import { Navigate, Route, Routes } from "react-router-dom";
import DealerPos from "./DealerPos";
import StaffGate from "./staff/StaffGate";

/**
 * Dealer router — POS-only (Loo 2026-07-19: the Orders / Products / Settings
 * back-office tabs are deleted; everything a store does lives inside the
 * full-screen POS — the My orders board, the Staff & PINs overlay with outlets
 * + store credential, and the Quotes drawer). Any legacy back-office URL
 * (e.g. a /dealer/orders bookmark) redirects to the POS.
 *
 * Everything is wrapped in <StaffGate> (0233): after the store login, a
 * dealer/showroom either runs the one-time setup wizard or taps a name + PIN
 * before the app renders; a salesperson auto-signs-in from its linked row. The
 * principal on-behalf POS is exempt — PrincipalApp mounts DealerPos directly,
 * outside this gate.
 */
export default function DealerApp() {
  return (
    <StaffGate>
      <Routes>
        <Route index element={<DealerPos />} />
        <Route path="*" element={<Navigate to="/dealer" replace />} />
      </Routes>
    </StaffGate>
  );
}
