import { describe, it, expect } from "vitest";
import { PORTAL_MODULES, PORTAL_NAV, navBlocks, navItemHref } from "./portal-nav";

/**
 * ⭐ THE FINANCE MODULES — Chew, 2026-10-03 (`docs/finance/MASTER.md` §4 and the
 * COPY-STANDARD section "Finance (Chew)").
 *
 *     Dashboard
 *     Payments            Monitor · Payment Records          (unchanged)
 *     Payables            AP · Payables · Bills · Payment Vouchers · Suppliers
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
      "Payables: AP · Payables · Bills · Payment Vouchers · Suppliers",
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
