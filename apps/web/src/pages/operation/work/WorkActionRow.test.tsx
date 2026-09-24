import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { OperationWorkItem } from "@carres/shared";
import WorkActionRow from "./WorkActionRow";

const item = {
  object: { label: "DO-140926-0007" }, module: "delivery", problem: "Delivery proof needs review",
  action: "Review the delivery proof", recipient: null, requiredResult: "Proof review recorded",
  interaction: { mode: "embedded" }, timing: { actionOn: "2026-09-17", placement: "on_day" },
  owner: { state: "primary" }, broken: false,
} as OperationWorkItem;

describe("WorkActionRow", () => {
  it("ranks the fact above the action and keeps the document number in the footer", () => {
    const select = vi.fn();
    render(<WorkActionRow item={item} selected onSelect={select} />);
    const row = screen.getByRole("button", { name: /DO-140926-0007.*Delivery proof needs review.*Review the delivery proof/ });
    expect(row).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Delivery proof needs review")).toHaveClass("font-semibold");
    expect(screen.queryByText("Do it here")).not.toBeInTheDocument();
    expect(screen.getByTestId("work-card-footer")).toHaveTextContent("DO-140926-0007");
    fireEvent.click(row);
    expect(select).toHaveBeenCalled();
  });

  it("prints exact promise failure instead of a generic broken label or missed-age sentence", () => {
    render(<WorkActionRow item={{
      ...item,
      broken: true,
      problem: "Not delivered",
      action: "Arrange a new delivery date",
      timing: { ...item.timing, placement: "missed", missedAge: { state: "counted", workingDays: 1 } },
    } as OperationWorkItem} selected={false} onSelect={() => {}} />);
    expect(screen.getByText("Not delivered")).toBeInTheDocument();
    expect(screen.queryByText(/Broken commitment/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/working day missed/i)).not.toBeInTheDocument();
  });

  it("does not repeat a mode label for an ordinary module door", () => {
    render(<WorkActionRow item={{ ...item, interaction: { mode: "open_module", fallbackDestination: "/delivery" } } as OperationWorkItem} selected={false} onSelect={() => {}} />);
    expect(screen.queryByText("Open module")).not.toBeInTheDocument();
    expect(screen.queryByText("Do it here")).not.toBeInTheDocument();
  });
});
