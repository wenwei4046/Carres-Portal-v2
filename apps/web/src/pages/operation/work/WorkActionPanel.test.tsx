import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { OperationWorkItem } from "@carres/shared";
import WorkActionPanel from "./WorkActionPanel";

const base = {
  object: { label: "DO-140926-0007", kind: "delivery_order" }, module: "delivery",
  problem: "Delivery proof needs review", action: "Review the delivery proof", recipient: null,
  requiredResult: "Proof review recorded", completionPredicate: "delivery_proof_reviews exists",
  completionStatement: "The proof review is recorded", owner: { state: "primary" },
  timing: { actionOn: "2026-09-17" }, destination: "/operation/delivery-orders/DO-140926-0007",
} as OperationWorkItem;

describe("WorkActionPanel", () => {
  it("shows operator-safe completion words and hosts the owning embedded form", () => {
    render(<WorkActionPanel item={{ ...base, interaction: { mode: "embedded" } } as OperationWorkItem} embedded={<div>Delivery owned form</div>} onOpen={() => {}} />);
    expect(screen.getByText("Finish when: The proof review is recorded")).toBeInTheDocument();
    expect(screen.queryByText("delivery_proof_reviews exists")).not.toBeInTheDocument();
    expect(screen.getByText("Delivery owned form")).toBeInTheDocument();
  });

  it("opens the owning object and gives read-only work no fake completion control", () => {
    const open = vi.fn();
    render(<WorkActionPanel item={{ ...base, interaction: { mode: "read_only", reason: "Only Yu Jun can record this.", fallbackDestination: base.destination } } as OperationWorkItem} onOpen={open} />);
    expect(screen.getByText("Only Yu Jun can record this.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save|Done|Record/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open DO-140926-0007" }));
    expect(open).toHaveBeenCalled();
  });
});
