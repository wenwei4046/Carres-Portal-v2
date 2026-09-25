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

  /* THE WORK SUMMARY — Workspace §5.10 (owner approval 2026-09-25): one compact
     section, 16/22 problem, 13/18 action, the source door on the same row. */
  it("is one compact summary: 16/22 problem, 13/18 action, the door beside it, no audit inside", () => {
    render(<WorkActionPanel item={{ ...base, interaction: { mode: "open_module" } } as OperationWorkItem} onOpen={() => {}} />);
    const header = screen.getByTestId("work-detail-header");
    expect(header.className).toContain("p-3");
    expect(header.className).toContain("rounded-work");
    expect(header.className).not.toMatch(/min-h-/);
    const title = screen.getByTestId("work-detail-title");
    expect(title.className).toContain("text-[16px]");
    expect(title.className).toContain("leading-[22px]");
    expect(title.className).toContain("font-semibold");
    expect(screen.getByTestId("work-detail-action").className).toContain("text-[13px]");
    expect(screen.getByTestId("work-detail-open-row")).toContainElement(screen.getByRole("button", { name: "Open DO-140926-0007" }));
    /* No party cards → the required result says what finishes the act. */
    expect(screen.getByTestId("work-detail-result")).toHaveTextContent("Proof review recorded");
    /* Owner, timing and source is its own last section (WorkOwnerSource). */
    expect(screen.queryByText("Owner, timing and source")).not.toBeInTheDocument();
  });

  it("with party cards the result stays on the cards, not repeated in the summary", () => {
    render(<WorkActionPanel hasParties item={{ ...base, interaction: { mode: "open_module" } } as OperationWorkItem} onOpen={() => {}} />);
    expect(screen.queryByTestId("work-detail-result")).not.toBeInTheDocument();
  });

  it("says the party once", () => {
    render(<WorkActionPanel item={{ ...base, action: "Call AL Logistics", recipient: "AL Logistics", interaction: { mode: "open_module" } } as OperationWorkItem} onOpen={() => {}} />);
    expect(screen.getByTestId("work-detail-action")).toHaveTextContent(/^Call AL Logistics$/);
  });

  it("with every card collapsed the summary carries the ONE blue act, which opens that card", () => {
    const onClick = vi.fn();
    render(<WorkActionPanel hasParties primaryAct={{ label: "Contact logistics today", onClick }} item={{ ...base, interaction: { mode: "open_module" } } as OperationWorkItem} onOpen={() => {}} />);
    const act = screen.getByTestId("work-detail-primary-act");
    expect(act).toHaveTextContent("Contact logistics today");
    expect(act.className).toContain("bg-kit-blue-9");
    expect(screen.getByRole("button", { name: "Open DO-140926-0007" }).className).not.toContain("bg-kit-blue-9");
    fireEvent.click(act);
    expect(onClick).toHaveBeenCalled();
  });

  it("an embedded action keeps the blue: no summary act beside it", () => {
    render(<WorkActionPanel primaryAct={{ label: "Contact logistics today", onClick: () => {} }} item={{ ...base, interaction: { mode: "embedded" } } as OperationWorkItem} embedded={<div>form</div>} onOpen={() => {}} />);
    expect(screen.queryByTestId("work-detail-primary-act")).not.toBeInTheDocument();
  });
});

