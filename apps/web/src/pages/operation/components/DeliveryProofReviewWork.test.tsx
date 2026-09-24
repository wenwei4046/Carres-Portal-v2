import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DeliveryProofReviewWork from "./DeliveryProofReviewWork";

const useDeliveryOrder = vi.fn();
vi.mock("@/lib/queries", () => ({ useDeliveryOrder: (...args: unknown[]) => useDeliveryOrder(...args) }));
vi.mock("./DeliveryProofReviewForm", () => ({
  default: ({ doNumber, attemptId, sourceVersion, allEvidenceReadable, onRetryEvidence }: {
    doNumber: string; attemptId: string | null; sourceVersion: string; allEvidenceReadable: boolean; onRetryEvidence?: () => void;
  }) => <div data-testid="owned-form">{doNumber}|{attemptId}|{sourceVersion}|{String(allEvidenceReadable)}{!allEvidenceReadable && onRetryEvidence ? <button type="button" onClick={onRetryEvidence}>Try again</button> : null}</div>,
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

  it("reviews photos in one accessible viewer and returns focus to the thumbnail", async () => {
    useDeliveryOrder.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        deliveryOrder: { orders: { ops_order_control: { delivery_photos: [] }, do_uploaded_at: null } },
        attempts: [{ id: "attempt-1", result: "delivered", recorded_at: "2026-09-16T01:00:00.000Z" }],
        attemptEvidence: [
          { attempt_id: "attempt-1", kind: "photo", path: "one.jpg", url: "https://example.com/one.jpg", recorded_at: "2026-09-16T02:00:00.000Z" },
          { attempt_id: "attempt-1", kind: "photo", path: "two.jpg", url: "https://example.com/two.jpg", recorded_at: "2026-09-16T02:01:00.000Z" },
        ],
      },
    });
    render(<DeliveryProofReviewWork doNumber="DO-140926-0007" />);
    const first = screen.getByRole("button", { name: "View delivery proof photo 1" });
    first.focus();
    fireEvent.click(first);
    expect(screen.getByRole("dialog")).toHaveTextContent("Photo 1 of 2");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowRight" });
    expect(screen.getByRole("dialog")).toHaveTextContent("Photo 2 of 2");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(first).toHaveFocus());
  });

  it("offers a real retry when a current photo cannot be read", () => {
    render(<DeliveryProofReviewWork doNumber="DO-140926-0007" />);
    const photo = screen.getByRole("img", { name: "Delivery proof photo 1" });
    fireEvent.error(photo);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByRole("img", { name: "Delivery proof photo 1" })).not.toBe(photo);
  });

  it("keeps the owning-object fallback truthful when current evidence cannot be loaded", () => {
    useDeliveryOrder.mockReturnValue({ isPending: false, isError: true, data: undefined });
    render(<DeliveryProofReviewWork doNumber="DO-140926-0007" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Delivery proof could not be loaded.");
    expect(screen.queryByTestId("owned-form")).not.toBeInTheDocument();
  });
});
