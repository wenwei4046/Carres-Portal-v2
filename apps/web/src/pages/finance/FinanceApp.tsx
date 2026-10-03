import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
// Unified Internal Portal (2026-06-30) — shared role-aware rail.
import PortalSidebar from "@/pages/portal/PortalSidebar";
import { useAuth } from "@/lib/auth";
import FinanceDashboard from "./FinanceDashboard";
import FinanceAR from "./FinanceAR";
import PaymentRecords from "./PaymentRecords";
import PaymentMonitor from "./PaymentMonitor";
import LegacyPaymentRedirect from "./LegacyPaymentRedirect";
import FinanceReports from "./FinanceReports";
import FinancePaymentReport from "./FinancePaymentReport";
import FinanceRentalApprover from "./FinanceRentalApprover";
import FinanceSubscriptionMonth from "./FinanceSubscriptionMonth";
import OtherDebtorsPage from "./other-money-in/OtherDebtorsPage";
import PrincipalDealers from "../principal/PrincipalDealers";
import OtherReceiptsPage from "./other-money-in/OtherReceiptsPage";
import MoneyMovesPage from "./money-moves/MoneyMovesPage";
import CardSettlementPage from "./card-settlement/CardSettlementPage";
import CardMoneyWaiting from "./card-settlement/CardMoneyWaiting";
import DailyBankPage from "./daily-bank/DailyBankPage";
// The read-only Finance Ledger — three destinations, three nav rows.
import LedgerJournal from "./ledger/LedgerJournal";
import LedgerTrialBalance from "./ledger/LedgerTrialBalance";
import GeneralLedger from "./ledger/GeneralLedger";
import LedgerSelfCheck from "./ledger/LedgerSelfCheck";
import SupplierBills from "./payables/SupplierBills";
import PaymentVouchers from "./payables/PaymentVouchers";
import FinanceSettings from "./settings/FinanceSettings";
import DealerCommission from "./reports/DealerCommission";
import CardCharges from "./reports/CardCharges";
import CashFlow from "./reports/CashFlow";
import ApAging from "./reports/ApAging";
import StockValue from "./reports/StockValue";
import Collection from "./reports/Collection";
import Forecast from "./reports/Forecast";
import ApOutstanding from "./payables/ApOutstanding";
import SupplierFinancePage from "./payables/SupplierFinancePage";
import SupplierCreditNotes from "./payables/SupplierCreditNotes";
import PaymentRequests from "./payment-requests/PaymentRequests";

/**
 * Finance (HQ Internal) shell — sidebar + main routing area.
 * Phase 5 born with 8 tabs; the Recon workspace retired 2026-09-07 under
 * payment/MASTER.md §13 (Bank Matching is an intentional reject — its data
 * and API remain, the page and navigation left).
 *
 * Phase 5 100% — all 8 pages live (Chunk A + Chunk B + Chunk C). The
 * ChunkBCStub component is no longer used; preserved for the (currently
 * empty) future deferral surface in case a Phase 6+ page lands here as
 * a stub before its real implementation.
 *
 * URL prefix `/finance/*`. Mirrors PartnerApp's React-Router-driven
 * nested routing pattern so finance staff can deep-link to e.g.
 * `/finance/ar` and have the sidebar highlight the right tab.
 */
export default function FinanceApp() {
  // Payment MASTER §12 — operation staff (the Responsible Delivery Operation)
  // reach ONLY the Payments Monitor and Payment Records here; every
  // finance-only page bounces them to the Monitor instead of rendering
  // finance controls.
  const role = useAuth((s) => s.role);
  // Finance figures read with a plain zero (index.css `.finance-surface`).
  // Set on <body> so drawers portalled outside this tree get it too.
  useEffect(() => {
    document.body.classList.add("finance-surface");
    return () => document.body.classList.remove("finance-surface");
  }, []);
  const financeOnly = (page: React.ReactNode) =>
    role === "operation" ? <Navigate to="/finance/monitor" replace /> : page;
  return (
    /* ⭐ A FIXED FRAME, like the Operation shell (Payment Monitor Card 02,
       2026-09-16). With `min-h-screen` the page grew to its content, so a
       listing's sheet was never bounded: an opened row pushed the listing and
       its fixed footer off screen and the whole window scrolled, rail
       included. The frame is the viewport; a long page scrolls inside `main`. */
    <div className="flex h-screen bg-background text-foreground">
      <PortalSidebar />
      <main className="flex-1 min-w-0 min-h-0 overflow-y-auto">
        <Routes>
          <Route index element={role === "operation"
            ? <Navigate to="monitor" replace /> : <Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={financeOnly(<FinanceDashboard />)} />
          <Route path="ar"        element={financeOnly(<FinanceAR />)} />
          {/* The old AP page read finance_ap_aging: PO cost, not what is
              billed, and pay states nothing writes since 0477. What is
              unpaid per supplier is one page, so an old link lands there. */}
          <Route path="ap"        element={<Navigate to="/finance/ap-outstanding" replace />} />
          {/* 0477 — supplier bills, payment vouchers, and what is unpaid per
              supplier. A voucher is the one door money leaves by. */}
          <Route path="bills/*"            element={financeOnly(<SupplierBills />)} />
          <Route path="payment-vouchers/*" element={financeOnly(<PaymentVouchers />)} />
          <Route path="ap-outstanding"     element={financeOnly(<ApOutstanding />)} />
          {/* 0645 — staff ask Finance to pay a bill (Chew 2026-10-03). NOT finance-only:
              the Operation staff Finance or the boss allows reach it here, and the database
              shows each person only what they may see. */}
          <Route path="payment-requests/*" element={<PaymentRequests />} />
          {/* 0642 — a supplier's credit note takes money off what Carres owes (Chew 2026-10-03). */}
          <Route path="credit-notes/*"     element={financeOnly(<SupplierCreditNotes />)} />
          {/* 0636 — Finance's own tax and bank details per supplier (Chew 2026-10-03). */}
          <Route path="suppliers"          element={financeOnly(<SupplierFinancePage />)} />
          {/* PAYMENTS → Monitor · Payment Records (owner ruling 2026-09-12).
              Monitor is the SO-keyed collection control listing and opens the
              collection workspace (`?invoice=`); Payment Records is the
              permanent incoming-money listing. Both admit operation staff
              (§12). The technical `/finance/*` address stays; the UI does not
              present Payments as a Finance Portal. */}
          <Route path="monitor"   element={<PaymentMonitor />} />
          <Route path="payments"  element={<PaymentRecords />} />
          {/* RETIRED employee doors, kept as safe redirects (owner ruling
              2026-09-12): the standalone Invoices Register — an Invoice
              belongs to its Sales Order and the Monitor opens the exact one —
              carries `?invoice=` / `?order=` / the §17 Calendar params across;
              routine Refunds & Credits is a Payment MASTER §13 intentional
              reject (history stays on the payment object); the Bank Matching
              workspace retired 2026-09-07. The DATA and API routes remain. */}
          <Route path="invoices"  element={<LegacyPaymentRedirect to="/finance/monitor" />} />
          <Route path="refunds"   element={<Navigate to="/finance/payments" replace />} />
          <Route path="recon"     element={<Navigate to="/finance/payments" replace />} />
          <Route path="reports"   element={financeOnly(<FinanceReports />)} />
          {/* Payment MASTER §16 — Reports → Payment: the six approved
              read-only listings over the same register wires. */}
          <Route path="reports/payment" element={financeOnly(<FinancePaymentReport />)} />
          {/* 0544 — dealer commission and renovation rebate: rates and a read-only report. */}
          <Route path="reports/dealer-commission" element={financeOnly(<DealerCommission />)} />
          {/* Card sales, card fee and what reached the bank, per month and card company. */}
          <Route path="reports/card-charges" element={financeOnly(<CardCharges />)} />
          {/* 0638 — cash and bank money over a period, and what it was for (Chew 2026-10-03). */}
          <Route path="reports/cash-flow" element={financeOnly(<CashFlow />)} />
          {/* 0640 — what was owed to suppliers on a day, by age (Chew 2026-10-03). */}
          <Route path="reports/ap-aging" element={financeOnly(<ApAging />)} />
          {/* 0643 — the provisional month-end stock value (Chew 2026-10-03). */}
          <Route path="reports/stock-value" element={financeOnly(<StockValue />)} />
          {/* 0644 — deposit and balance per salesperson (Chew 2026-10-03). */}
          <Route path="reports/collection" element={financeOnly(<Collection />)} />
          {/* 0646 — the plan for a month beside its actual (Chew 2026-10-03). */}
          <Route path="reports/forecast" element={financeOnly(<Forecast />)} />
          {/* 0268 — the rent-to-own credit gate (9th tab). */}
          <Route path="rental-approver" element={financeOnly(<FinanceRentalApprover />)} />
          {/* 0538 — one month of subscription billing across every agreement. */}
          <Route path="subscriptions" element={financeOnly(<FinanceSubscriptionMonth />)} />
          {/* 0478 — money in that is not a sale: other debtor invoices and
              other receipts. Finance only; customer money stays in Payments. */}
          <Route path="other-debtors"  element={financeOnly(<OtherDebtorsPage />)} />
          <Route path="other-receipts" element={financeOnly(<OtherReceiptsPage />)} />
          {/* 0529 — bank transfers and card payouts between Finance's own accounts. */}
          <Route path="money-moves" element={financeOnly(<MoneyMovesPage />)} />
          {/* 0572 — card settlement files matched to the recorded card payments. */}
          <Route path="card-settlement" element={financeOnly(<CardSettlementPage />)} />
          {/* 0641 — each card payment not in the bank yet (Chew 2026-10-03). */}
          <Route path="card-money-waiting" element={financeOnly(<CardMoneyWaiting />)} />
          {/* 0637 — every money account on one day (Chew 2026-10-03). */}
          <Route path="daily-bank" element={financeOnly(<DailyBankPage />)} />
          {/* The principal also reaches this page from the Finance rail, and
              keeps Invite dealer, Suspend and Reactivate here (0543: those
              stay principal-only, not off for everyone on this address). */}
          <Route path="dealers" element={financeOnly(<PrincipalDealers channel="dealer" financeView={role !== "principal"} />)} />
          {/* The Finance Ledger (read-only). `?entry=JE-…` opens one entry. */}
          <Route path="ledger" element={financeOnly(<LedgerJournal />)} />
          {/* 0639 — every account's period, one block each (Chew 2026-10-03). */}
          <Route path="ledger/general-ledger" element={financeOnly(<GeneralLedger />)} />
          <Route path="ledger/trial-balance" element={financeOnly(<LedgerTrialBalance />)} />
          <Route path="ledger/self-check" element={financeOnly(<LedgerSelfCheck />)} />
          {/* 0512 — the one list of money accounts. */}
          <Route path="settings" element={financeOnly(<FinanceSettings />)} />
          <Route path="*"         element={<Navigate to="." replace />} />
        </Routes>
      </main>
    </div>
  );
}
