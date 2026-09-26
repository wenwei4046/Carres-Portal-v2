/**
 * THE RIGHT PANEL (Workspace §5.10, owner ruling B 2026-09-26): the ACTION
 * card for every work item — with the owning module's message when it has
 * one — and the party-card shell the owning pages keep.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { OperationWorkItem } from "@carres/shared";
import { PartyCardShell, ToneLine } from "./PartyCardShell";

const scopeState = { failed: true };
const ordersState: { error: unknown } = { error: null };
vi.mock("@/lib/queries", () => ({
  useOperationOrders: () => ({ error: ordersState.error, isLoading: false, refetch: vi.fn() }),
  useLogisticsCardFacts: () => ({ data: null, isError: false }),
  useDeliveryPartners: () => ({ data: { partners: [] } }),
  useCatalog: () => ({ data: undefined }),
}));
vi.mock("../delivery-scope-card", () => ({
  useOrderIdFromRef: () => null,
  useDeliveryScopeCard: () => ({ card: null, loading: false, failed: scopeState.failed }),
}));

describe("the party-card shell", () => {
  it("is exactly 72px collapsed with a 15/20 heading, one 12/16 status line and a 40×40 chevron", () => {
    render(
      <PartyCardShell testId="party-x" party="Customer" heading="Customer · Lim Kuan Yang" progress="1 of 3" status={<ToneLine tone="current">Contact due today</ToneLine>} open={false} onToggle={() => {}}>
        <p>body</p>
      </PartyCardShell>,
    );
    const toggle = screen.getByTestId("party-x-toggle");
    expect(toggle.className).toContain("h-[56px]"); // the compact card (Jess, 2026-09-26)
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    /* The name carries the party, its state and the act — not a bare verb. */
    expect(toggle).toHaveAccessibleName(/Customer · Lim Kuan Yang.*Contact due today.*Show Customer details/);
    expect(screen.getByTestId("party-x-heading").className).toContain("text-[13px]");
    expect(screen.getByTestId("party-x-heading").className).toContain("leading-[18px]");
    expect(screen.getByText("Contact due today").parentElement?.className).toContain("text-[12px]");
    expect(screen.queryByText("body")).not.toBeInTheDocument();
    expect(screen.getByTestId("party-x-chevron").className).toContain("h-10");
    expect(screen.getByTestId("party-x-chevron").className).toContain("w-10");
  });

  it("Escape collapses the open card and returns focus to its heading", () => {
    const onToggle = vi.fn();
    render(
      <PartyCardShell testId="party-x" party="Supplier" heading="Supplier · 3 suppliers" status="2 of 3 POs issued" open onToggle={onToggle}>
        <button type="button">inside</button>
      </PartyCardShell>,
    );
    fireEvent.keyDown(screen.getByText("inside"), { key: "Escape" });
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(document.activeElement).toBe(screen.getByTestId("party-x-toggle"));
  });
});

describe("Escape belongs to the control that owns it (#1608 review)", () => {
  it.each([
    ["an input", <input key="i" aria-label="Date the customer asked for" />],
    ["a listbox", <div key="l" role="listbox" tabIndex={0}>options</div>],
  ])("Escape inside %s keeps the card open", (_label, control) => {
    const onToggle = vi.fn();
    render(
      <PartyCardShell testId="party-x" party="Customer" heading="Customer · Lim" status="Scheduled 27 Oct" open onToggle={onToggle}>
        {control}
      </PartyCardShell>,
    );
    const target = screen.queryByRole("textbox") ?? screen.getByRole("listbox");
    fireEvent.keyDown(target, { key: "Escape" });
    expect(onToggle).not.toHaveBeenCalled();
  });
});

describe("the ACTION card is the panel", () => {
  const item = {
    object: { kind: "sales_order", id: "order-1", label: "SO-1362" }, module: "delivery", ruleKey: "confirm_delivery_date",
    problem: "The delivery is not scheduled", action: "Call AL Logistics", recipient: "AL Logistics",
    requiredResult: "Scheduled delivery recorded", completionStatement: "Scheduled delivery recorded",
    timing: { actionOn: "2026-09-22", placement: "missed" }, interaction: { mode: "open_module" },
  } as unknown as OperationWorkItem;

  it("draws the ACTION card even when the order cannot be loaded — the act never waits for the record", async () => {
    const WorkParties = (await import("./WorkParties")).default;
    render(<MemoryRouter><WorkParties items={[item]} openParty={null} onOpenParty={() => {}} /></MemoryRouter>);
    expect(screen.getByTestId("work-detail-title")).toHaveTextContent("Call AL Logistics");
    expect(screen.getByTestId("work-detail-action")).toHaveTextContent("due Tue, 22 Sep");
    expect(screen.getByTestId("work-detail-fact")).toHaveTextContent("The delivery is not scheduled");
    expect(screen.getByRole("button", { name: "Open SO-1362" })).toBeInTheDocument();
    /* No whole-order view in Work (ruling B): no Route, no party cards. */
    expect(screen.queryByText("Logistics not assigned")).not.toBeInTheDocument();
    expect(screen.queryByTestId("work-order-route")).not.toBeInTheDocument();
    expect(screen.queryByTestId("logistics-card")).not.toBeInTheDocument();
  });

  it("a work item that names no Sales Order gets the same card with no message", async () => {
    const WorkParties = (await import("./WorkParties")).default;
    const mp = { ...item, object: { kind: "manual_purchase", id: "mp-1", label: "MP-12" }, module: "purchasing", action: "Approve purchase", recipient: null } as unknown as OperationWorkItem;
    render(<MemoryRouter><WorkParties items={[mp]} openParty={null} onOpenParty={() => {}} /></MemoryRouter>);
    expect(screen.getByTestId("work-detail-title")).toHaveTextContent("Approve purchase");
    expect(screen.queryByTestId("work-detail-communication")).not.toBeInTheDocument();
  });
});
