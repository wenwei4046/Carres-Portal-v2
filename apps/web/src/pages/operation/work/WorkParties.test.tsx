/**
 * THE PARTY SHELL — Customer and Supplier collapsed cards are exactly 72px
 * below 960px (owner density ruling 2026-09-25): 12px sides, 15/20 heading,
 * a 40×40 chevron; 8px between party cards.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { OperationWorkItem } from "@carres/shared";

vi.mock("../delivery-scope-card", () => ({
  useOrderIdFromRef: () => "order-1",
  useDeliveryScopeCard: () => ({
    card: { scope: { o: { customer_name: "LIM KUAN YANG", customer_phone: "012", customer_address: "Klang" } } },
    loading: false,
  }),
}));
vi.mock("@/lib/queries", () => ({
  useLogisticsCardFacts: () => ({ data: { routes: [{ purchaseOrders: [{ poNo: "PO1", supplier: "Hookka" }] }] } }),
}));
vi.mock("./LogisticsCard", () => ({
  default: () => <div data-testid="logistics-card" />,
  PARTY_COPY: { poLine: (po: string, s: string) => `${po} · ${s}`, openPurchasing: "Open Purchasing" },
}));

import WorkParties from "./WorkParties";

const item = { object: { kind: "sales_order", id: "order-1", label: "SO-1362" } } as unknown as OperationWorkItem;

describe("WorkParties — density below 960px", () => {
  it("Customer and Supplier collapse to exactly 72px with 12px sides, 15/20 headings and a 40×40 chevron", () => {
    render(<MemoryRouter><WorkParties item={item} /></MemoryRouter>);
    expect(screen.getByTestId("work-parties").className).toContain("gap-2");
    for (const party of ["party-customer", "party-supplier"]) {
      const toggle = screen.getByTestId(`${party}-toggle`);
      expect(toggle.className).toContain("h-[72px]");
      expect(toggle.className).toContain("px-3");
      expect(toggle.querySelector("span")?.className).toContain("text-[15px]");
      expect(toggle.querySelector("span")?.className).toContain("leading-5");
      const chevron = screen.getByTestId(`${party}-chevron`);
      expect(chevron.className).toContain("h-10");
      expect(chevron.className).toContain("w-10");
    }
  });
});
