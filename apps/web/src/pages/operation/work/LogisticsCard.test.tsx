/**
 * THE LOGISTICS CARD — owner rulings 2026-09-24, held as tests.
 *
 * Collapsed: at most five facts — company (or `Logistics not assigned`), the
 * ONE action, `Checks n of 3`, `Scheduled delivery · {date}` when present,
 * ONE exception. Expanded: the owner's eight sections in order. The link shows
 * Copy + Revoke while active and Create only while none is active. The
 * outside message never carries the SO number and carries the current link.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { LogisticsCardFacts } from "@carres/shared";

const scopeState: { card: unknown } = { card: null };
const factsState: { data: LogisticsCardFacts | undefined } = { data: undefined };
const create = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const revoke = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };

vi.mock("../delivery-scope-card", () => ({
  useDeliveryScopeCard: () => ({ card: scopeState.card, loading: false, failed: false }),
}));
vi.mock("@/lib/queries", () => ({
  useLogisticsCardFacts: () => ({ data: factsState.data, isError: false }),
  useDeliveryPartners: () => ({ data: { partners: [{ id: "p-al", name: "AL Logistics", whatsapp_group_url: "https://chat.whatsapp.com/x" }] } }),
  useDeliveryLinkActs: () => ({ create, revoke }),
}));
vi.mock("../components/DeliveryBrief", () => ({
  DeliveryDatesEdit: () => <div data-testid="stub-dates-edit" />,
  LogisticsDetailsEdit: () => <div data-testid="stub-logistics-edit" />,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import LogisticsCard from "./LogisticsCard";

function card(over: Record<string, unknown> = {}, o: Record<string, unknown> = {}) {
  return {
    orderId: "order-1",
    leg: null,
    logisticsPartnerId: "p-al",
    logisticsPartnerName: "AL Logistics",
    confirmedDate: null,
    confirmedTime: null,
    doNumber: null,
    settled: false,
    stock: { line1: "Ready", line2: "2 of 2", ready: true },
    scope: {
      customerDeliveryIso: "2026-10-27",
      arrangement: { driver_name: "Ali", vehicle: "VBA 1234", condo_registration: null },
      o: {
        id: "order-1",
        so: 1362,
        source_ref: ["TCF0541"],
        customer_name: "LIM KUAN YANG",
        customer_address: "12 Jalan Test, Klang",
        building_type: "Landed",
        order_lines: [{ sku: "B1201S-K", qty: 1, unit_price: 1000 }],
        order_addons: [],
        paid: 1000,
        proceeded_at: "2026-10-01T02:00:00Z",
        order_finance_exceptions: [],
        delivered_at: null,
        ...o,
      },
    },
    ...over,
  };
}

function facts(over: Partial<LogisticsCardFacts> = {}): LogisticsCardFacts {
  return {
    partner: { id: "p-al", name: "AL Logistics", hasPortal: false, kvDefault: false },
    routes: [{ key: "supplier_to_logistics", place: "AL Sungai Buloh", purchaseOrders: [{ poNo: "PO261001-1111", supplier: "Hookka", poDeliveryDate: "2026-10-20", receivedDate: null }], readyUnits: 0 }],
    link: null,
    lastRevokedAt: null,
    detailsReceivedAt: null,
    answer: null,
    history: [],
    ...over,
  };
}

function draw() {
  return render(
    <MemoryRouter>
      <LogisticsCard orderId="order-1" />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-23T02:00:00Z")); // Fri 23 Oct, Kuala Lumpur morning
  scopeState.card = card();
  factsState.data = facts();
});
afterEach(() => vi.useRealTimers());

describe("collapsed — at most five facts", () => {
  it("company, the one action, the check count — nothing else when nothing is scheduled or wrong", () => {
    draw();
    const toggle = screen.getByTestId("logistics-card-toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByTestId("logistics-card-heading").textContent).toBe("Logistics · AL Logistics");
    expect(screen.getByTestId("logistics-card-progress").textContent).toBe("Checks 0 of 3");
    const action = screen.getByTestId("logistics-card-action");
    expect(action).toHaveTextContent("Contact logistics today");
    expect(action).toHaveTextContent("Share the delivery details with AL Logistics · due 23 Oct");
    expect(screen.queryByTestId("logistics-card-scheduled")).toBeNull();
    expect(screen.queryByTestId("logistics-card-exception")).toBeNull();
    // Money, PO and GRN never sit on the collapsed card.
    expect(toggle.textContent).not.toMatch(/PO26|RM |GRN/);
  });

  it("`Logistics not assigned` when no company carries it", () => {
    scopeState.card = card({ logisticsPartnerId: null, logisticsPartnerName: null });
    factsState.data = facts({ partner: null });
    draw();
    expect(screen.getByTestId("logistics-card-heading").textContent).toBe("Logistics not assigned");
    expect(screen.getByTestId("logistics-card-action")).toHaveTextContent("Assign logistics");
  });

  it("the scheduled date prints alone when no time was recorded — never `No time agreed`", () => {
    scopeState.card = card({ confirmedDate: "2026-10-27" });
    factsState.data = facts({ detailsReceivedAt: "2026-10-22T03:00:00Z" });
    draw();
    expect(screen.getByTestId("logistics-card-scheduled").textContent).toBe("Scheduled delivery · 27 Oct");
    expect(screen.queryByText(/No time agreed/)).toBeNull();
    expect(screen.getByTestId("logistics-card-progress").textContent).toBe("Checks 2 of 3");
  });

  it("money shows its amount, and only once it affects this delivery", () => {
    scopeState.card = card({ confirmedDate: "2026-10-27" }, { paid: 0 });
    factsState.data = facts({ detailsReceivedAt: "2026-10-22T03:00:00Z" });
    draw();
    expect(screen.getByTestId("logistics-card-exception").textContent).toBe("RM 1,000.00 still to collect");
  });
});

describe("expanded — the owner's order", () => {
  it("prints the eight sections in order, with the three checks", () => {
    draw();
    fireEvent.click(screen.getByTestId("logistics-card-toggle"));
    const body = screen.getByTestId("logistics-card-body");
    const titles = within(body).getAllByRole("heading").map((h) => h.textContent);
    expect(titles).toEqual([
      "Current action",
      "Checks",
      "Scheduled delivery",
      "Assignment",
      "Stock route",
      "External link",
      "Communication",
      "Evidence and recent history",
    ]);
    expect(screen.getByTestId("logistics-check-t3")).toHaveTextContent("3 working days before · 23 Oct");
    expect(screen.getByTestId("logistics-check-t2")).toHaveTextContent("2 working days before · 24 Oct");
    expect(screen.getByTestId("logistics-check-t2")).toHaveTextContent("Opens 24 Oct");
    expect(screen.getByTestId("logistics-check-t1")).toHaveTextContent("1 working day before · 26 Oct");
    expect(screen.getByTestId("logistics-route-supplier_to_logistics")).toHaveTextContent("Supplier sends directly to logistics · AL Sungai Buloh");
  });

  it("the Delivery-owned form opens in place — Work draws no form of its own", () => {
    scopeState.card = card({ logisticsPartnerId: null, logisticsPartnerName: null });
    factsState.data = facts({ partner: null });
    draw();
    fireEvent.click(screen.getByTestId("logistics-card-toggle"));
    fireEvent.click(screen.getByTestId("logistics-card-edit-logistics"));
    expect(screen.getByTestId("stub-logistics-edit")).toBeTruthy();
  });
});

describe("the external link", () => {
  it("no link: only `Create link`", () => {
    // Details already received, so the current action is not the contact
    // step and the section itself carries the one `Create link`.
    factsState.data = facts({ detailsReceivedAt: "2026-10-22T03:00:00Z" });
    draw();
    fireEvent.click(screen.getByTestId("logistics-card-toggle"));
    const link = screen.getByTestId("logistics-card-link");
    expect(within(link).getByRole("button", { name: "Create link" })).toBeTruthy();
    expect(within(link).queryByRole("button", { name: "Revoke link" })).toBeNull();
    expect(within(link).queryByRole("button", { name: "Copy link" })).toBeNull();
  });

  it("active: `Copy link` and `Revoke link`, never `Create link` beside them", () => {
    factsState.data = facts({ link: { id: "l1", token: "A".repeat(43), createdAt: "2026-10-19T02:00:00Z", createdByName: "Chai", firstOpenedAt: null, lastOpenedAt: null } });
    draw();
    fireEvent.click(screen.getByTestId("logistics-card-toggle"));
    const link = screen.getByTestId("logistics-card-link");
    expect(within(link).getByRole("button", { name: "Copy link" })).toBeTruthy();
    expect(within(link).getByRole("button", { name: "Revoke link" })).toBeTruthy();
    expect(within(link).queryByRole("button", { name: "Create link" })).toBeNull();
    fireEvent.click(within(link).getByRole("button", { name: "Revoke link" }));
    expect(revoke.mutateAsync).toHaveBeenCalled();
  });

  it("a portal company never gets a link", () => {
    factsState.data = facts({ partner: { id: "p-nets", name: "NETS Logistics", hasPortal: true, kvDefault: true } });
    draw();
    fireEvent.click(screen.getByTestId("logistics-card-toggle"));
    const link = screen.getByTestId("logistics-card-link");
    expect(link).toHaveTextContent("NETS Logistics answers in its own portal.");
    expect(within(link).queryByRole("button")).toBeNull();
  });

  it("the prepared message leads with the customer's reference, carries the link, never the SO number", () => {
    factsState.data = facts({ link: { id: "l1", token: "A".repeat(43), createdAt: "2026-10-19T02:00:00Z", createdByName: null, firstOpenedAt: null, lastOpenedAt: null } });
    draw();
    fireEvent.click(screen.getByTestId("logistics-card-toggle"));
    const message = screen.getByTestId("logistics-card-message").textContent ?? "";
    expect(message.startsWith("TCF0541")).toBe(true);
    expect(message).toContain(`/delivery-link/${"A".repeat(43)}`);
    expect(message).not.toMatch(/SO-?1362/);
  });
});

describe("density below 768px — owner ruling 2026-09-25 (classes only; behaviour and words unchanged)", () => {
  it("collapsed: at least 72px, 12px sides, 15/20 heading, 13/18/600 action, 12/16 status, 12px checks, 40×40 chevron", () => {
    draw();
    const toggle = screen.getByTestId("logistics-card-toggle");
    expect(toggle.className).toContain("min-h-[72px]");
    expect(toggle.className).toContain("px-3");
    expect(screen.getByTestId("logistics-card-heading").className).toContain("text-[15px]");
    expect(screen.getByTestId("logistics-card-heading").className).toContain("leading-5");
    const [act, status] = Array.from(screen.getByTestId("logistics-card-action").children) as HTMLElement[];
    expect(act.className).toContain("text-[13px]");
    expect(act.className).toContain("leading-[18px]");
    expect(act.className).toContain("font-semibold");
    expect(status.className).toContain("text-[12px]");
    expect(status.className).toContain("leading-4");
    expect(screen.getByTestId("logistics-card-progress").className).toContain("text-[12px]");
    const chevron = screen.getByTestId("logistics-card-chevron");
    expect(chevron.className).toContain("h-10");
    expect(chevron.className).toContain("w-10");
  });

  it("expanded: 10px vertical padding and 8px between sections", () => {
    draw();
    fireEvent.click(screen.getByTestId("logistics-card-toggle"));
    const body = screen.getByTestId("logistics-card-body");
    expect(body.className).toContain("py-2.5");
    expect(body.className).toContain("gap-2");
    expect(body.className).toContain("px-3");
  });
});
