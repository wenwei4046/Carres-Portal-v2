import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GuaranteeEntitlementDto } from "@carres/shared";

import GuaranteeCoverStrip from "./GuaranteeCoverStrip";

/**
 * The strip is the "this customer bought a guarantee" marker on the Customer
 * block of both order-detail surfaces. Two properties matter more than looks:
 * it must stay INVISIBLE on an ordinary order (so the ~190 pre-guarantee orders
 * are untouched), and it must show the DERIVED status, not the stored one.
 */

const state: { items: GuaranteeEntitlementDto[]; error: boolean } = { items: [], error: false };

vi.mock("@/lib/queries", () => ({
  useOrderGuarantees: () =>
    state.error ? { data: undefined } : { data: { items: state.items, truncated: false } },
}));

function ent(over: Partial<GuaranteeEntitlementDto> = {}): GuaranteeEntitlementDto {
  return {
    id: "g1",
    orderId: "o1",
    so: 1240,
    orderLineId: "l1",
    guaranteeSku: "GRT-MATTRESS-15Y",
    guaranteeLabel: "Mattress Guarantee 15 Years",
    unitNo: 1,
    coversLineId: "l0",
    coversSku: "B1201S-K",
    coversLabel: "B1201S King",
    coversModelId: "m1",
    customerId: null,
    customerName: "Tan",
    customerPhone: "0125478547",
    phoneKey: "125478547",
    coverageYears: 15,
    remedy: "replace",
    startsOn: "2026-08-01",
    expiresOn: "2041-08-01",
    status: "active",
    effectiveStatus: "active",
    claimedAt: null,
    claimCaseId: null,
    claimCaseNo: null,
    claimNotes: null,
    replacementSku: null,
    voidReason: null,
    ...over,
  };
}

describe("GuaranteeCoverStrip", () => {
  it("renders nothing when the order carries no guarantee", () => {
    state.items = [];
    state.error = false;
    const { container } = render(<GuaranteeCoverStrip orderId="o1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the read fails — a broken lookup must not break the customer card", () => {
    state.items = [];
    state.error = true;
    const { container } = render(<GuaranteeCoverStrip orderId="o1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("names the covered item and the end date", () => {
    state.items = [ent()];
    state.error = false;
    render(<GuaranteeCoverStrip orderId="o1" />);
    expect(screen.getByText("Guarantee")).toBeInTheDocument();
    expect(screen.getByText(/B1201S King/)).toBeInTheDocument();
    expect(screen.getByText(/15y to 2041-08-01/)).toBeInTheDocument();
    expect(screen.getByText("Covered")).toBeInTheDocument();
  });

  it("shows the DERIVED status word, so an out-of-window guarantee reads Expired", () => {
    state.items = [ent({ status: "active", effectiveStatus: "expired" })];
    state.error = false;
    render(<GuaranteeCoverStrip orderId="o1" />);
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });

  it("says the cover starts on delivery before the order is delivered", () => {
    state.items = [ent({ status: "pending", effectiveStatus: "pending", expiresOn: null })];
    state.error = false;
    render(<GuaranteeCoverStrip orderId="o1" />);
    expect(screen.getByText("Starts on delivery")).toBeInTheDocument();
  });

  it("hides a voided guarantee — a cancelled order's promise is not a promise", () => {
    state.items = [ent({ status: "void", effectiveStatus: "void" })];
    state.error = false;
    const { container } = render(<GuaranteeCoverStrip orderId="o1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists one row per unit when the customer bought two", () => {
    state.items = [
      ent({ id: "g1", unitNo: 1, coversLabel: "B1201S King" }),
      ent({ id: "g2", unitNo: 2, coversLabel: "B1201S Single" }),
    ];
    state.error = false;
    render(<GuaranteeCoverStrip orderId="o1" />);
    expect(screen.getByText(/B1201S King/)).toBeInTheDocument();
    expect(screen.getByText(/B1201S Single/)).toBeInTheDocument();
  });
});
