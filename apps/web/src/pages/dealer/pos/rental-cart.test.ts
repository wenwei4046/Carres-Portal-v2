import { describe, it, expect } from "vitest";
import {
  cartAccepts,
  cartModeOf,
  isRentalLine,
  mixRefusalMessage,
  rentalAttrs,
  rentalContractTotal,
  rentalMonthlyTotal,
  rentalOf,
} from "./rental-cart";
import type { DraftLine } from "../new-order/draft";

/**
 * The law Loo locked: "rent and outright 不能在同一张单".
 *
 * These tests exist because every other surface (rail locks, add guard, cart
 * totals, submit branch) trusts this module to answer the same way. If it can
 * be fooled into calling a rental line an ordinary sale, a monthly fee reaches
 * `orders.total` as if it were a one-off price.
 */

const line = (sku: string, attrs: Record<string, unknown> | null = null): DraftLine => ({
  localId: sku,
  sku,
  qty: 1,
  attrs,
  unitPrice: 100,
  label: sku,
});

const rental = (planId = "plan-1", termMonths = 84, monthlyFee = 59) =>
  line(
    "CLOUD-Q",
    rentalAttrs({
      planId,
      termMonths,
      monthlyFee,
      contractTotal: monthlyFee * termMonths,
      variantLabel: "Queen",
    }),
  );

describe("rentalOf / isRentalLine", () => {
  it("reads a well-formed rental payload", () => {
    const r = rentalOf(rental());
    expect(r).not.toBeNull();
    expect(r?.planId).toBe("plan-1");
    expect(r?.termMonths).toBe(84);
    expect(r?.monthlyFee).toBe(59);
    expect(r?.variantLabel).toBe("Queen");
  });

  it("treats an ordinary sale line as not-rental", () => {
    expect(isRentalLine(line("MA-001"))).toBe(false);
    expect(rentalOf(line("MA-001"))).toBeNull();
  });

  it("refuses a malformed payload rather than half-believing it", () => {
    // These are the shapes a hand-edited or legacy draft could produce. Each
    // must read as "not a rental", never as a rental with a broken plan.
    expect(isRentalLine(line("X", { rental: {} }))).toBe(false);
    expect(isRentalLine(line("X", { rental: { planId: "" , termMonths: 84 } }))).toBe(false);
    expect(isRentalLine(line("X", { rental: { planId: "p" } }))).toBe(false);
    expect(isRentalLine(line("X", { rental: { planId: "p", termMonths: 0 } }))).toBe(false);
    expect(isRentalLine(line("X", { rental: "nope" }))).toBe(false);
    expect(isRentalLine(line("X", { rental: null }))).toBe(false);
  });

  it("survives a line with no attrs at all", () => {
    expect(isRentalLine({ attrs: null })).toBe(false);
    expect(isRentalLine({})).toBe(false);
  });
});

describe("cartModeOf", () => {
  it("an empty cart accepts either kind", () => {
    expect(cartModeOf([])).toBe("empty");
    expect(cartAccepts([], "rental")).toBe(true);
    expect(cartAccepts([], "outright")).toBe(true);
  });

  it("one sale line makes it an outright cart", () => {
    const cart = [line("MA-001")];
    expect(cartModeOf(cart)).toBe("outright");
    expect(cartAccepts(cart, "outright")).toBe(true);
    expect(cartAccepts(cart, "rental")).toBe(false);
  });

  it("one rental line makes it a rental cart", () => {
    const cart = [rental()];
    expect(cartModeOf(cart)).toBe("rental");
    expect(cartAccepts(cart, "rental")).toBe(true);
    expect(cartAccepts(cart, "outright")).toBe(false);
  });

  it("a mixed cart reports RENTAL — the safe answer, not the average", () => {
    // Only reachable from a draft saved before this rule existed. Reporting
    // rental routes it to the agreement path (where the server re-validates)
    // instead of letting a monthly fee ride into orders.total.
    const cart = [line("MA-001"), rental()];
    expect(cartModeOf(cart)).toBe("rental");
  });
});

describe("the refusal message", () => {
  it("tells the operator which way round the problem is", () => {
    expect(mixRefusalMessage("rental")).toMatch(/normal sale/i);
    expect(mixRefusalMessage("outright")).toMatch(/rental/i);
    // no jargon, and it always says what to do next
    expect(mixRefusalMessage("rental")).toMatch(/own order/i);
    expect(mixRefusalMessage("outright")).toMatch(/own order/i);
  });
});

describe("rental totals", () => {
  it("sums the monthly fee and the whole-term value separately", () => {
    const cart = [rental("p1", 84, 59), rental("p2", 60, 45)];
    expect(rentalMonthlyTotal(cart)).toBe(104);
    expect(rentalContractTotal(cart)).toBe(59 * 84 + 45 * 60);
  });

  it("ignores non-rental lines instead of counting their price", () => {
    expect(rentalMonthlyTotal([line("MA-001")])).toBe(0);
    expect(rentalContractTotal([line("MA-001")])).toBe(0);
  });

  it("is zero for an empty cart", () => {
    expect(rentalMonthlyTotal([])).toBe(0);
    expect(rentalContractTotal([])).toBe(0);
  });
});
