import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { OperationWorkItem } from "@carres/shared";
import WorkActionPanel from "./WorkActionPanel";

vi.mock("../components/DeliveryProofReviewWork", () => ({
  default: ({ doNumber, onSaved }: { doNumber: string; onSaved?: (receipt: string) => void }) => <div>Delivery proof form for {doNumber}<button type="button" onClick={() => onSaved?.(`Delivery proof accepted · ${doNumber}`)}>Complete proof review</button></div>,
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
    expect(screen.getByText("The proof review is recorded")).toBeInTheDocument();
    expect(screen.queryByText(/Finish when:/i)).not.toBeInTheDocument();
    expect(screen.queryByText("delivery_proof_reviews exists")).not.toBeInTheDocument();
    expect(screen.getByText("Delivery owned form")).toBeInTheDocument();
  });

  it("does not repeat the selected card as CURRENT FACT, ACTION and REQUIRED RESULT blocks", () => {
    render(<WorkActionPanel item={{ ...base, interaction: { mode: "open_module", fallbackDestination: base.destination } } as OperationWorkItem} onOpen={() => {}} />);
    expect(screen.queryByText("CURRENT FACT")).not.toBeInTheDocument();
    expect(screen.queryByText("ACTION")).not.toBeInTheDocument();
    expect(screen.queryByText("REQUIRED RESULT")).not.toBeInTheDocument();
    expect(screen.getByText("Delivery proof needs review")).toBeInTheDocument();
  });

  it("resolves the admitted Delivery proof component without a Workspace copy of the form", () => {
    const completed = vi.fn();
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
    } as OperationWorkItem} onOpen={() => {}} onCompleted={completed} />);
    expect(screen.getByText("Delivery proof form for DO-140926-0007")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Complete proof review" }));
    expect(completed).toHaveBeenCalledWith("Delivery proof accepted · DO-140926-0007");
  });

  it("opens the owning object and gives read-only work no fake completion control", () => {
    const open = vi.fn();
    render(<WorkActionPanel item={{ ...base, interaction: { mode: "read_only", reason: "Only Yu Jun can record this.", fallbackDestination: base.destination } } as OperationWorkItem} onOpen={open} />);
    expect(screen.getByText("Only Yu Jun can record this.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save|Done|Record/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open DO-140926-0007" }));
    expect(open).toHaveBeenCalled();
  });

  it("opens with O in the detail navigation but never while typing in a field", () => {
    const open = vi.fn();
    const view = render(
      <WorkActionPanel
        item={{ ...base, interaction: { mode: "embedded" } } as OperationWorkItem}
        embedded={<textarea aria-label="Reason" />}
        onOpen={open}
      />,
    );
    fireEvent.keyDown(view.container.firstElementChild as HTMLElement, { key: "o" });
    expect(open).toHaveBeenCalledOnce();
    open.mockReset();
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Reason" }), { key: "o" });
    expect(open).not.toHaveBeenCalled();
  });
});
