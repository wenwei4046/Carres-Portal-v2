import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { DELIVERY_TIME_SLOTS } from "@carres/shared";
import type { OpsOrderControlResponse } from "@carres/shared";
import {
  useOrderControlForm,
  DeliveryTimeSlotField,
  PaymentControlFields,
} from "./OrderControlPanel";

/**
 * Order-control form pieces (P2 overlay, split per-category for the P5 drawer
 * redesign). Same coverage as the old monolithic panel, now against the split
 * field groups:
 *   - DeliveryTimeSlotField — the delivery time-slot dropdown
 *   - PaymentControlFields — the read-only Total / Paid / Outstanding summary,
 *     with the Outstanding cell flipping to "Settled".
 * The shared draft hook (useOrderControlForm) is exercised through a tiny
 * harness; all five data hooks are mocked so it renders without react-query.
 */

let controlState: {
  data: OpsOrderControlResponse | undefined;
  isLoading: boolean;
};

const noopMutation = { mutate: vi.fn(), isPending: false };

vi.mock("@/lib/queries", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useOrderControl: () => controlState,
    useDeliveryPartners: () => ({
      data: { partners: [] },
      isLoading: false,
      isError: false,
    }),
    useSaveOrderControl: () => noopMutation,
    useSetOpsAssignedLogistic: () => noopMutation,
    useOperationSetDeliveryDate: () => noopMutation,
  };
});

function Harness({ paid, total }: { paid: number; total: number }) {
  const form = useOrderControlForm("00000000-0000-0000-0000-0000000000a1");
  return (
    <>
      <DeliveryTimeSlotField form={form} />
      <PaymentControlFields form={form} paid={paid} total={total} />
    </>
  );
}

function renderPieces(props: { paid: number; total: number }) {
  controlState = { data: { control: null }, isLoading: false };
  return render(<Harness paid={props.paid} total={props.total} />);
}

describe("Order-control form pieces — split field groups", () => {
  it("renders the delivery time-slot dropdown with the suggested windows", () => {
    renderPieces({ paid: 0, total: 1000 });
    for (const slot of DELIVERY_TIME_SLOTS) {
      expect(screen.getByRole("option", { name: slot })).toBeInTheDocument();
    }
  });

  it("shows Total / Paid / Outstanding from real order money while owing", () => {
    renderPieces({ paid: 500, total: 2000 });
    const summary = screen.getByTestId("payment-summary");
    expect(within(summary).getByText("Total")).toBeInTheDocument();
    expect(within(summary).getByText("RM 2,000")).toBeInTheDocument();
    expect(within(summary).getByText("RM 500")).toBeInTheDocument();
    // Outstanding = 2000 - 500 = 1500, still owing.
    expect(within(summary).getByText("RM 1,500")).toBeInTheDocument();
    expect(within(summary).queryByText("Settled")).not.toBeInTheDocument();
  });

  it("collapses Outstanding to 'Settled' once paid covers the total", () => {
    renderPieces({ paid: 2000, total: 2000 });
    const summary = screen.getByTestId("payment-summary");
    expect(within(summary).getByText("Settled")).toBeInTheDocument();
  });

  it("shows '—' (not a false 'Settled') when the order has no line total", () => {
    // AutoCount-imported orders carry a paid deposit but no line prices, so
    // total = 0 — outstanding is unknown, not zero.
    renderPieces({ paid: 1347, total: 0 });
    const summary = screen.getByTestId("payment-summary");
    expect(within(summary).getByText("RM 1,347")).toBeInTheDocument();
    expect(within(summary).queryByText("Settled")).not.toBeInTheDocument();
    // Both Total and Outstanding render as the em-dash placeholder.
    expect(within(summary).getAllByText("—")).toHaveLength(2);
  });
});
