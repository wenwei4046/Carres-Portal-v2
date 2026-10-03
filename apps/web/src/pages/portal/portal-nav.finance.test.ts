import { describe, it, expect } from "vitest";
import { PORTAL_MODULES, PORTAL_NAV, navBlocks, navItemHref, visibleItems } from "./portal-nav";

/**
 * ⭐ THE FINANCE MODULES — Chew, 2026-10-03 (`docs/finance/MASTER.md` §4 and the
 * COPY-STANDARD section "Finance (Chew)").
 *
 *     Dashboard
 *     Payments            Monitor · Payment Records          (unchanged)
 *     Payables            AP · Payables · Bills · Payment Vouchers · Payment Requests · Credit Notes · Suppliers
 *     Receivables         AR · Receivables · Other debtors · Other receipts
 *     Bank & Cards        Daily Bank · Card settlement · Card money waiting · Money moves
 *     Ledger              Journal · General Ledger · Trial Balance · Self-check
 *     Reports
 *     Rental Approver · Subscriptions · Dealers               (unchanged)
 *
 * Payables sits above Receivables to keep the owner ruling of 2026-09-14
 * (`AP · Payables` above AR). Grouping is presentation only, so every page
 * keeps its address.
 */

const FINANCE = PORTAL_NAV.find((g) => g.area === "finance")!;

const shape = (role: "finance" | "principal") =>
  navBlocks(FINANCE, role).map((b) =>
    b.kind === "module"
      ? `${b.module.label}: ${b.pages.map((p) => p.label).join(" · ")}`
      : b.item.label,
  );

describe("the Finance modules (Chew, 2026-10-03)", () => {
  it("draws the approved shape, in order", () => {
    expect(shape("finance")).toEqual([
      "Dashboard",
      "Payments: Monitor · Payment Records",
      "Payables: AP · Payables · Bills · Payment Vouchers · Payment Requests · Credit Notes · Suppliers",
      "Receivables: AR · Receivables · Other debtors · Other receipts",
      "Bank & Cards: Daily Bank · Card settlement · Card money waiting · Money moves",
      "Ledger: Journal · General Ledger · Trial Balance · Self-check",
      "Reports",
      "Rental Approver",
      "Subscriptions",
      "Dealers",
    ]);
  });

  it("the principal sees the same Finance rail", () => {
    expect(shape("principal")).toEqual(shape("finance"));
  });

  it("uses the approved module words", () => {
    const label = (section: string) => PORTAL_MODULES.find((m) => m.section === section)?.label;
    expect(["Payables", "Receivables", "Bank & Cards", "Ledger", "Reports"].map(label)).toEqual([
      "Payables",
      "Receivables",
      "Bank & Cards",
      "Ledger",
      "Reports",
    ]);
    expect(PORTAL_MODULES.some((m) => /money (in|out)/i.test(m.label))).toBe(false);
  });

  /* Grouping moved no address: every bookmark and in-page link still lands. */
  it("every Finance page keeps its address", () => {
    const hrefs = Object.fromEntries(FINANCE.items.map((it) => [it.key, navItemHref(FINANCE, it)]));
    expect(hrefs).toEqual({
      dashboard: "/finance/dashboard",
      ap: "/finance/ap-outstanding",
      ar: "/finance/ar",
      bills: "/finance/bills",
      "payment-vouchers": "/finance/payment-vouchers",
      "payment-requests": "/finance/payment-requests",
      "credit-notes": "/finance/credit-notes",
      "supplier-finance": "/finance/suppliers",
      payments: "/finance/monitor",
      "payment-records": "/finance/payments",
      "rental-approver": "/finance/rental-approver",
      subscriptions: "/finance/subscriptions",
      "other-debtors": "/finance/other-debtors",
      "other-receipts": "/finance/other-receipts",
      "daily-bank": "/finance/daily-bank",
      "card-settlement": "/finance/card-settlement",
      "card-money-waiting": "/finance/card-money-waiting",
      "money-moves": "/finance/money-moves",
      dealers: "/finance/dealers",
      ledger: "/finance/ledger",
      "general-ledger": "/finance/ledger/general-ledger",
      "trial-balance": "/finance/ledger/trial-balance",
      "self-check": "/finance/ledger/self-check",
      reports: "/finance/reports",
    });
  });

  it("no other area has a page in a Finance module", () => {
    const financeSections = new Set(["Payables", "Receivables", "Bank & Cards", "Ledger", "Reports"]);
    const elsewhere = PORTAL_NAV.filter((g) => g.area !== "finance").flatMap((g) =>
      g.items.filter((it) => it.section && financeSections.has(it.section)).map((it) => `${g.area}:${it.key}`),
    );
    expect(elsewhere).toEqual([]);
  });
});

/**
 * ⭐ THE ONE SHARED-MENU ENTRY CHEW APPROVED (2026-10-03, Finance MASTER §3.3):
 * Payment Requests shows to the Operation staff the boss allows — by a grant,
 * not a role — and opens the page in Finance. Nobody else of Operation sees it.
 */
describe("Payment Requests in the Operations rail", () => {
  const OPERATIONS = PORTAL_NAV.find((g) => g.area === "operation")!;
  const keys = (caps?: ReadonlySet<"payment-requester">) => visibleItems(OPERATIONS, "operation", caps).map((i) => i.key);

  it("is hidden without the grant, and shows with it", () => {
    expect(keys()).not.toContain("payment-requests");
    expect(keys(new Set(["payment-requester"] as const))).toContain("payment-requests");
  });

  it("opens the Finance page and sits in Workspace", () => {
    const item = OPERATIONS.items.find((i) => i.key === "payment-requests")!;
    expect(navItemHref(OPERATIONS, item)).toBe("/finance/payment-requests");
    expect(item.section).toBe("Workspace");
    expect(item.needs).toBe("payment-requester");
  });

  it("the grant changes nothing else in the rail", () => {
    const withGrant = keys(new Set(["payment-requester"] as const)).filter((k) => k !== "payment-requests");
    expect(withGrant).toEqual(keys());
  });
});
