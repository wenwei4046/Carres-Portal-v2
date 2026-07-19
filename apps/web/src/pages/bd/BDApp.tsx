import { Navigate, Route, Routes } from "react-router-dom";
import DealerPos from "@/pages/dealer/DealerPos";

/**
 * BD (Business Development) shell — 2026-07-19 (Loo): the ERP-style Network
 * Pulse dashboard (Dashboard / Dealers / Inquiries) is DELETED. BD lands
 * straight in the SAME full-screen POS a dealer sees and works the whole
 * network from inside it:
 *
 *   - place an order for any dealership — the CUSTOMER step's dealer card
 *     picks the acting store (the principal on-behalf mechanism, reused);
 *   - My orders → BdOrdersBoard: every dealer's 3-lane board, By-dealer
 *     filter, per-dealer totals, and the POS order drawer (same edit rules,
 *     proceed lock unchanged) + per-order audit History;
 *   - Accounts → BdAccountsPage: open dealer accounts (principal-parity) and
 *     manage each store's staff & PINs.
 *
 * No StaffGate — BD is an HQ email login, not a PIN-tier store identity
 * (same exemption as the principal on-behalf POS). Old /bd/* bookmarks
 * (dashboard / dealers / inquiries) all land back on the POS.
 */
export default function BDApp() {
  return (
    <Routes>
      <Route index element={<DealerPos />} />
      <Route path="*" element={<Navigate to="/bd" replace />} />
    </Routes>
  );
}
