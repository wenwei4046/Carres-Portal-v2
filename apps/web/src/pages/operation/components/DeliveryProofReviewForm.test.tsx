import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/api";

const mutate = vi.fn();
const mutation = {
  mutate,
  isPending: false,
  error: null as Error | null,
};

vi.mock("@/lib/queries", () => ({
  useReviewDeliveryProof: () => mutation,
}));

import DeliveryProofReviewForm from "./DeliveryProofReviewForm";

function show(allEvidenceReadable = true) {
  return render(
    <DeliveryProofReviewForm
      doNumber="DO-140926-0007"
      attemptId="00000000-0000-4000-8000-000000000001"
      sourceVersion="2026-09-16T01:00:00.000Z"
      allEvidenceReadable={allEvidenceReadable}
    />,
  );
}

beforeEach(() => {
  mutate.mockReset();
  mutation.isPending = false;
  mutation.error = null;
});

describe("DeliveryProofReviewForm — Delivery's one governed review form", () => {
  it("chooses a result first and writes only when Save review is pressed", () => {
    show();
    fireEvent.click(screen.getByRole("radio", { name: "Accept proof" }));
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save review" }));
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
      decision: "accepted",
      attemptId: "00000000-0000-4000-8000-000000000001",
      sourceVersion: "2026-09-16T01:00:00.000Z",
      idempotencyKey: expect.any(String),
    }));
  });

  it("requires a reason for more proof or rejection", () => {
    show();
    fireEvent.click(screen.getByRole("radio", { name: "Reject proof" }));
    expect(screen.getByRole("button", { name: "Save review" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/^Reason/), { target: { value: "The goods are not visible" } });
    fireEvent.click(screen.getByRole("button", { name: "Save review" }));
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
      decision: "rejected",
      reason: "The goods are not visible",
    }));
  });

  it("blocks acceptance when any current proof file cannot be read", () => {
    show(false);
    expect(screen.getByRole("radio", { name: "Accept proof" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/Photo could not be loaded.*Try again/);
    expect(screen.getByRole("radio", { name: "Request more proof" })).not.toBeDisabled();
    expect(screen.getByRole("radio", { name: "Reject proof" })).not.toBeDisabled();
  });

  it("keeps one retry key and states uncertain and stale outcomes", () => {
    const view = show();
    fireEvent.click(screen.getByRole("radio", { name: "Accept proof" }));
    fireEvent.click(screen.getByRole("button", { name: "Save review" }));
    const firstKey = mutate.mock.calls[0]?.[0].idempotencyKey;
    fireEvent.click(screen.getByRole("button", { name: "Save review" }));
    expect(mutate.mock.calls[1]?.[0].idempotencyKey).toBe(firstKey);

    mutation.error = new Error("network down");
    view.rerender(
      <DeliveryProofReviewForm doNumber="DO-140926-0007" attemptId={null} sourceVersion="2026-09-16T01:00:00.000Z" allEvidenceReadable />,
    );
    expect(screen.getByText("Not confirmed · Try again")).toBeInTheDocument();

    mutation.error = new ApiError(409, "The delivery proof changed.", { code: "stale_proof_evidence" });
    view.rerender(
      <DeliveryProofReviewForm doNumber="DO-140926-0007" attemptId={null} sourceVersion="2026-09-16T01:00:00.000Z" allEvidenceReadable />,
    );
    expect(screen.getByText("Action changed · Review again")).toBeInTheDocument();
  });
});
