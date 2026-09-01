import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DeliveryResultAction from "./DeliveryResultAction";

const recordAttempt = vi.fn();
const retryAllocation = vi.fn();
let allocationError = false;

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useOrderAllocation: () => ({
      data: allocationError ? undefined : {
        allocation: {
          orderId: "order-a",
          soRef: "SO-1205",
          lines: [
            {
              sku: "JAGER-SS",
              committedQty: 2,
              reservedUnits: [
                {
                  id: "00000000-0000-0000-0000-000000000101",
                  unitCode: "UNIT-101",
                  sku: "JAGER-SS",
                  status: "reserved",
                  condition: "new",
                  warehouseId: "warehouse-a",
                  poNo: "PO-1",
                  qty: 1,
                  dateIn: "2026-08-18",
                },
                {
                  id: "00000000-0000-0000-0000-000000000102",
                  unitCode: "UNIT-102",
                  sku: "JAGER-SS",
                  status: "reserved",
                  condition: "new",
                  warehouseId: "warehouse-a",
                  poNo: "PO-1",
                  qty: 1,
                  dateIn: "2026-08-18",
                },
              ],
              soldUnits: [],
              reservedQty: 2,
              soldQty: 0,
              outstandingQty: 0,
            },
          ],
          unmatchedUnits: [
            {
              id: "00000000-0000-0000-0000-000000000199",
              unitCode: "UNIT-199",
              sku: "LEGACY-SKU",
              status: "reserved",
              condition: "new",
              warehouseId: "warehouse-a",
              poNo: "PO-0",
              qty: 1,
              dateIn: "2026-08-18",
            },
            {
              id: "00000000-0000-0000-0000-000000000198",
              unitCode: "UNIT-198-SOLD",
              sku: "OLD-SKU",
              status: "sold",
              condition: "new",
              warehouseId: "warehouse-a",
              poNo: "PO-0",
              qty: 1,
              dateIn: "2026-08-18",
            },
          ],
          totals: { committedQty: 2, reservedQty: 2, soldQty: 0, outstandingQty: 0 },
        },
      },
      isLoading: false,
      isError: allocationError,
      refetch: retryAllocation,
    }),
    useRecordDeliveryAttempt: () => ({ mutate: recordAttempt, isPending: false }),
    useAttachDoMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <DeliveryResultAction
        order={{ id: "order-a", so: 1205, do_number: "DO-260831-1205" }}
        lines={[{ sku: "JAGER-SS", qty: 2 }]}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  recordAttempt.mockReset();
  retryAllocation.mockReset();
  allocationError = false;
});

describe("DeliveryResultAction", () => {
  it("Partially Delivered requires exact delivered Units, a reason, goods location and explanation", () => {
    mount();
    fireEvent.click(screen.getByTestId("do-result-primary-action"));
    fireEvent.click(screen.getByRole("button", { name: "Partially Delivered" }));

    expect(screen.getByLabelText("Delivery Result reason")).toBeInTheDocument();
    expect(screen.getByLabelText("Goods location")).toBeInTheDocument();
    expect(screen.getByLabelText("Explanation")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /UNIT-101/ })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /UNIT-102/ })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /UNIT-199/ })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /UNIT-198-SOLD/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Record Partially Delivered" })).toBeDisabled();
  });

  it("Failed Delivery does not offer delivered Unit selection", () => {
    mount();
    fireEvent.click(screen.getByTestId("do-result-primary-action"));
    fireEvent.click(screen.getByRole("button", { name: "Failed" }));

    expect(screen.getByText("Failed Delivery")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /UNIT-101/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Record Failed Delivery" })).toBeDisabled();
  });

  it("does not record a result when Stock's Unit read failed", () => {
    allocationError = true;
    mount();
    fireEvent.click(screen.getByTestId("do-result-primary-action"));
    fireEvent.click(screen.getByRole("button", { name: "Failed" }));
    fireEvent.change(screen.getByLabelText("Delivery Result reason"), {
      target: { value: "customer_unreachable" },
    });
    fireEvent.change(screen.getByLabelText("Goods location"), {
      target: { value: "still_with_logistics" },
    });
    fireEvent.change(screen.getByLabelText("Explanation"), {
      target: { value: "Customer could not be reached." },
    });

    expect(screen.getByText("Units could not be loaded")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retryAllocation).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Record Failed Delivery" })).toBeDisabled();
  });

  it("records a partial result through the one attempt door with exact Unit ids", () => {
    mount();
    fireEvent.click(screen.getByTestId("do-result-primary-action"));
    fireEvent.click(screen.getByRole("button", { name: "Partially Delivered" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /UNIT-101/ }));
    fireEvent.change(screen.getByLabelText("Delivery Result reason"), {
      target: { value: "customer_rejected_goods" },
    });
    fireEvent.change(screen.getByLabelText("Goods location"), {
      target: { value: "still_with_logistics" },
    });
    fireEvent.change(screen.getByLabelText("Explanation"), {
      target: { value: "Customer accepted one Unit; the other stays with NETS." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record Partially Delivered" }));

    expect(recordAttempt).toHaveBeenCalledWith(
      {
        result: "partial",
        reasonKey: "customer_rejected_goods",
        whereGoods: "still_with_logistics",
        note: "Customer accepted one Unit; the other stays with NETS.",
        deliveredItemIds: ["00000000-0000-0000-0000-000000000101"],
        returned: [],
      },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });
});
