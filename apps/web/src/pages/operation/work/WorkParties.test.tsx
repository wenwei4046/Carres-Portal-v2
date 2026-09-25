/**
 * THE RIGHT PANEL'S CROSS-CARD LAWS (Workspace §5.10): the 72px shell, one
 * card open at a time, ONE blue action, and an unreadable order that says so.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { OperationWorkItem } from "@carres/shared";
import { PartyCardShell, ToneLine } from "./PartyCardShell";
import { primaryPartyOf } from "./WorkParties";

const scopeState = { failed: true };
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
    expect(toggle.className).toContain("h-[70px]"); // + the 1px edge = 72px
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    /* The name carries the party, its state and the act — not a bare verb. */
    expect(toggle).toHaveAccessibleName(/Customer · Lim Kuan Yang.*Contact due today.*Show Customer details/);
    expect(screen.getByTestId("party-x-heading").className).toContain("text-[15px]");
    expect(screen.getByTestId("party-x-heading").className).toContain("leading-5");
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

describe("ONE blue action across the panel", () => {
  it("missed beats today beats the selected work's party beats future", () => {
    expect(primaryPartyOf({ logistics: "today", customer: "missed", supplier: "ahead" }, "logistics")).toBe("customer");
    expect(primaryPartyOf({ logistics: "ahead", customer: "today", supplier: null }, "logistics")).toBe("customer");
    expect(primaryPartyOf({ logistics: "ahead", customer: "ahead", supplier: "ahead" }, "supplier")).toBe("supplier");
    expect(primaryPartyOf({ logistics: null, customer: null, supplier: null }, "logistics")).toBeNull();
  });
});

describe("an order the panel cannot read", () => {
  it("says so — never a guessed Logistics not assigned", async () => {
    const WorkParties = (await import("./WorkParties")).default;
    const item = { object: { kind: "sales_order", id: "order-1", label: "SO-1362" }, interaction: { mode: "open_module" } } as unknown as OperationWorkItem;
    render(<MemoryRouter><WorkParties item={item} openParty={null} onOpenParty={() => {}} /></MemoryRouter>);
    expect(screen.getByTestId("work-mission-unavailable")).toHaveTextContent("Order details unavailable");
    expect(screen.getByText("The work item still exists, but its Sales Order could not be loaded.")).toBeInTheDocument();
    expect(screen.queryByText("Logistics not assigned")).not.toBeInTheDocument();
  });

  it("an order simply outside the Operation list draws nothing (not a failure)", async () => {
    scopeState.failed = false;
    const WorkParties = (await import("./WorkParties")).default;
    const item = { object: { kind: "sales_order", id: "order-9", label: "SO-9" }, interaction: { mode: "open_module" } } as unknown as OperationWorkItem;
    const { container } = render(<MemoryRouter><WorkParties item={item} openParty={null} onOpenParty={() => {}} /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
    scopeState.failed = true;
  });

  it("a work item that names no Sales Order draws no mission at all", async () => {
    const WorkParties = (await import("./WorkParties")).default;
    const item = { object: { kind: "manual_purchase", id: "mp-1", label: "MP-12" }, interaction: { mode: "open_module" } } as unknown as OperationWorkItem;
    const { container } = render(<MemoryRouter><WorkParties item={item} openParty={null} onOpenParty={() => {}} /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });
});
