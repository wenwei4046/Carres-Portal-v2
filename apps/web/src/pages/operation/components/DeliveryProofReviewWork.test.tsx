import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DeliveryProofReviewWork from "./DeliveryProofReviewWork";

const useDeliveryOrder = vi.fn();
vi.mock("@/lib/queries", () => ({ useDeliveryOrder: (...args: unknown[]) => useDeliveryOrder(...args) }));
vi.mock("./DeliveryProofReviewForm", () => ({
  default: ({ doNumber, attemptId, sourceVersion, allEvidenceReadable }: {
    doNumber: string; attemptId: string | null; sourceVersion: string; allEvidenceReadable: boolean;
  }) => <div data-testid="owned-form">{doNumber}|{attemptId}|{sourceVersion}|{String(allEvidenceReadable)}</div>,
}));

describe("DeliveryProofReviewWork", () => {
  beforeEach(() => {
    useDeliveryOrder.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        deliveryOrder: { orders: { ops_order_control: { delivery_photos: [] }, do_uploaded_at: null } },
        attempts: [{ id: "attempt-1", result: "delivered", recorded_at: "2026-09-16T01:00:00.000Z" }],
        attemptEvidence: [{
          attempt_id: "attempt-1", kind: "photo", path: "proof.jpg", url: "https://example.com/proof.jpg",
          recorded_at: "2026-09-16T02:00:00.000Z",
        }],
      },
    });
  });

  it("keeps acceptance closed until every current Delivery photo has loaded", () => {
    render(<DeliveryProofReviewWork doNumber="DO-140926-0007" />);
    expect(screen.getByTestId("owned-form")).toHaveTextContent("DO-140926-0007|attempt-1|2026-09-16T02:00:00.000Z|false");
    fireEvent.load(screen.getByRole("img", { name: "Delivery proof photo 1" }));
    expect(screen.getByTestId("owned-form")).toHaveTextContent("DO-140926-0007|attempt-1|2026-09-16T02:00:00.000Z|true");
  });

  it("keeps the owning-object fallback truthful when current evidence cannot be loaded", () => {
    useDeliveryOrder.mockReturnValue({ isPending: false, isError: true, data: undefined });
    render(<DeliveryProofReviewWork doNumber="DO-140926-0007" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Delivery proof could not be loaded.");
    expect(screen.queryByTestId("owned-form")).not.toBeInTheDocument();
  });
});
