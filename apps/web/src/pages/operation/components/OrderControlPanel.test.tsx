import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { DELIVERY_TIME_SLOTS } from "@carres/shared";
import type { OpsOrderControlResponse } from "@carres/shared";
import OrderControlPanel from "./OrderControlPanel";

/**
 * OrderControlPanel — the editable "Master Sheet, live" overlay (P2). These
 * tests cover the two fields added when finishing the editable drawer
 * (project-orders-control-spec, Slice "补完编辑栏位"):
 *   - the delivery time-slot dropdown (the spec's "date + time slot")
 *   - the read-only payment summary (Total / Paid / Outstanding) pulled from
 *     real order money, with the Outstanding cell flipping to "Settled".
 *
 * All five data hooks are mocked so the panel renders without react-query —
 * mirrors the vi.mock(@/lib/queries) pattern used across operation tests.
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

function renderPanel(props: { paid: number; orderTotal: number }) {
  controlState = { data: { control: null }, isLoading: false };
  return render(
    <OrderControlPanel
      orderId="00000000-0000-0000-0000-0000000000a1"
      customerAddress="66, SS 24 Taman Megah, 47301 PJ, Petaling Jaya, Selangor"
      status="place"
      deliveryDate={null}
      deliveryDateTbd={false}
      proceedDate={null}
      opsAssignedLogistic={null}
      deliveryPartnerId={null}
      paid={props.paid}
      orderTotal={props.orderTotal}
    />,
  );
}

describe("OrderControlPanel — finished editable fields", () => {
  it("renders the delivery time-slot dropdown with the suggested windows", () => {
    renderPanel({ paid: 0, orderTotal: 1000 });
    for (const slot of DELIVERY_TIME_SLOTS) {
      expect(
        screen.getByRole("option", { name: slot }),
      ).toBeInTheDocument();
    }
  });

  it("shows Total / Paid / Outstanding from real order money while owing", () => {
    renderPanel({ paid: 500, orderTotal: 2000 });
    const summary = screen.getByTestId("payment-summary");
    expect(within(summary).getByText("Total")).toBeInTheDocument();
    expect(within(summary).getByText("RM 2,000")).toBeInTheDocument();
    expect(within(summary).getByText("RM 500")).toBeInTheDocument();
    // Outstanding = 2000 - 500 = 1500, still owing.
    expect(within(summary).getByText("RM 1,500")).toBeInTheDocument();
    expect(within(summary).queryByText("Settled")).not.toBeInTheDocument();
  });

  it("collapses Outstanding to 'Settled' once paid covers the total", () => {
    renderPanel({ paid: 2000, orderTotal: 2000 });
    const summary = screen.getByTestId("payment-summary");
    expect(within(summary).getByText("Settled")).toBeInTheDocument();
  });

  it("shows '—' (not a false 'Settled') when the order has no line total", () => {
    // AutoCount-imported orders carry a paid deposit but no line prices, so
    // total = 0 — outstanding is unknown, not zero.
    renderPanel({ paid: 1347, orderTotal: 0 });
    const summary = screen.getByTestId("payment-summary");
    expect(within(summary).getByText("RM 1,347")).toBeInTheDocument();
    expect(within(summary).queryByText("Settled")).not.toBeInTheDocument();
    // Both Total and Outstanding render as the em-dash placeholder.
    expect(within(summary).getAllByText("—")).toHaveLength(2);
  });
});
