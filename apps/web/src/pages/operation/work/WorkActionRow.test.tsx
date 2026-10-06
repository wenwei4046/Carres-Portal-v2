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
  it("keeps object, problem and action as separate ranks and labels the whole row", () => {
    const select = vi.fn();
    render(<WorkActionRow item={item} selected onSelect={select} />);
    const row = screen.getByRole("button", { name: /DO-140926-0007.*Delivery proof needs review.*Review the delivery proof/ });
    expect(row).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Do it here")).toBeInTheDocument();
    fireEvent.click(row);
    expect(select).toHaveBeenCalled();
  });

  it("does not repeat a mode label for an ordinary module door", () => {
    render(<WorkActionRow item={{ ...item, interaction: { mode: "open_module", fallbackDestination: "/delivery" } } as OperationWorkItem} selected={false} onSelect={() => {}} />);
    expect(screen.queryByText("Open module")).not.toBeInTheDocument();
    expect(screen.queryByText("Do it here")).not.toBeInTheDocument();
  });
});
