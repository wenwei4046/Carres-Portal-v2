import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { OperationWorkItem } from "@carres/shared";
import WorkActionPanel from "./WorkActionPanel";

vi.mock("../components/DeliveryProofReviewWork", () => ({
  default: ({ doNumber }: { doNumber: string }) => <div>Delivery proof form for {doNumber}</div>,
}));

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

  it("resolves the admitted Delivery proof component without a Workspace copy of the form", () => {
    render(<WorkActionPanel item={{
      ...base,
      object: { ...base.object, id: "DO-140926-0007" },
      interaction: {
        mode: "embedded",
        actionKey: "delivery.proof_review",
        componentKey: "delivery.proof_review",
        capability: "POST /api/operation/delivery-orders/:doNumber/proof-review",
        inputContract: "ProofReviewInput",
        evidenceContract: "Latest governed Delivery proof package",
        idempotencyKey: "ProofReviewInput.idempotencyKey",
        staleVersion: "ProofReviewInput.sourceVersion",
        staleRefusal: "stale_proof_evidence",
        successReceipt: "Delivery proof review result, actor, time and source version",
        fallbackDestination: base.destination,
      },
    } as OperationWorkItem} onOpen={() => {}} />);
    expect(screen.getByText("Delivery proof form for DO-140926-0007")).toBeInTheDocument();
  });

  it("opens the owning object and gives read-only work no fake completion control", () => {
    const open = vi.fn();
    render(<WorkActionPanel item={{ ...base, interaction: { mode: "read_only", reason: "Only Yu Jun can record this.", fallbackDestination: base.destination } } as OperationWorkItem} onOpen={open} />);
    expect(screen.getByText("Only Yu Jun can record this.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save|Done|Record/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open DO-140926-0007" }));
    expect(open).toHaveBeenCalled();
  });

  /* THE DETAIL DENSITY — owner ruling 2026-09-25, exact values below 960px. */
  it("below 960px: 12px cards, 16/22 title, 13/18 action, 32px open button beside the result, 36px disclosure", () => {
    render(<WorkActionPanel item={{ ...base, interaction: { mode: "open_module" } } as OperationWorkItem} onOpen={() => {}} />);
    const header = screen.getByTestId("work-detail-header");
    expect(header.className).toContain("p-3");
    expect(header.className).toContain("rounded-work");
    expect(header.className).not.toMatch(/min-h-/);
    const title = screen.getByTestId("work-detail-title");
    expect(title.className).toContain("text-[16px]");
    expect(title.className).toContain("leading-[22px]");
    expect(title.className).toContain("font-semibold");
    expect(screen.getByTestId("work-detail-action").className).toContain("text-body");
    const task = screen.getByTestId("work-detail-task");
    expect(task.className).toContain("p-3");
    expect(task.className).not.toMatch(/min-h-/);
    const row = screen.getByTestId("work-detail-open-row");
    expect(row.className).toContain("flex");
    expect(row).toHaveTextContent("Proof review recorded");
    const open = screen.getByRole("button", { name: "Open DO-140926-0007" });
    expect(open.className).toContain("h-8");
    expect(open.className).toContain("text-body");
    const summary = screen.getByText("Owner, timing and source");
    expect(summary.className).toContain("h-9");
    expect(summary.className).toContain("text-[12px]");
  });
});
