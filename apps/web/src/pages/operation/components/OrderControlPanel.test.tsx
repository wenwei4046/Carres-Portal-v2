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
interface TestLedgerRow {
  id: string;
  amount: number;
  kind: "payment" | "deposit" | "storage";
  method: string;
  paid_on: string;
  receipt_no: string | null;
}
let paymentsState: {
  data: { payments: TestLedgerRow[] } | undefined;
  isLoading: boolean;
};

const noopMutation = { mutate: vi.fn(), isPending: false };

vi.mock("@/lib/queries", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useOrderControl: () => controlState,
    useOrderPayments: () => paymentsState,
    useDeliveryPartners: () => ({
      data: { partners: [] },
      isLoading: false,
      isError: false,
    }),
    useSaveOrderControl: () => noopMutation,
    useSetOpsAssignedLogistic: () => noopMutation,
    useOperationSetDeliveryDate: () => noopMutation,
    useRecordPayment: () => noopMutation,
    useVoidPayment: () => noopMutation,
    useCollectStorage: () => noopMutation,
    useRequestStorageWaiver: () => noopMutation,
    useDecideStorageWaiver: () => noopMutation,
  };
});

function Harness({ paid, total, orderId }: { paid: number; total: number; orderId?: string }) {
  const form = useOrderControlForm("00000000-0000-0000-0000-0000000000a1");
  return (
    <>
      <DeliveryTimeSlotField form={form} />
      <PaymentControlFields form={form} paid={paid} total={total} orderId={orderId} />
    </>
  );
}

function renderPieces(props: {
  paid: number;
  total: number;
  orderId?: string;
  balance?: number;
  payments?: TestLedgerRow[];
}) {
  // Operation tracks the imported OWING amount (ops_order_control.balance), not a
  // bill/total — so a test that wants an outstanding keys a `balance`.
  controlState = {
    data: {
      control: props.balance != null ? ({ balance: props.balance } as never) : null,
    },
    isLoading: false,
  };
  paymentsState = { data: { payments: props.payments ?? [] }, isLoading: false };
  return render(<Harness paid={props.paid} total={props.total} orderId={props.orderId} />);
}

describe("Order-control form pieces — split field groups", () => {
  it("renders the delivery time-slot dropdown with the suggested windows", () => {
    renderPieces({ paid: 0, total: 1000 });
    for (const slot of DELIVERY_TIME_SLOTS) {
      expect(screen.getByRole("option", { name: slot })).toBeInTheDocument();
    }
  });

  it("shows Owing / Paid / Outstanding from the imported balance while owing", () => {
    renderPieces({ paid: 500, total: 2000, balance: 2000 });
    const summary = screen.getByTestId("payment-summary");
    expect(within(summary).getByText("Owing (RM)")).toBeInTheDocument();
    // Outstanding = owing 2000 − Paid (deposit 500) = 1500.
    expect(within(summary).getByText("RM 1,500")).toBeInTheDocument();
    expect(within(summary).queryByText("Settled")).not.toBeInTheDocument();
  });

  it("collapses Outstanding to 'Settled' once paid covers the owing", () => {
    renderPieces({ paid: 2000, total: 2000, balance: 2000 });
    const summary = screen.getByTestId("payment-summary");
    expect(within(summary).getByText("Settled")).toBeInTheDocument();
  });

  it("shows '—' (not a false 'Settled') when the order has no line total", () => {
    // AutoCount-imported orders carry a paid deposit but no line prices, so
    // total = 0 — outstanding is unknown, not zero.
    renderPieces({ paid: 1347, total: 0 });
    const summary = screen.getByTestId("payment-summary");
    expect(within(summary).queryByText("Settled")).not.toBeInTheDocument();
    // No bill (total 0 + balance empty) → Outstanding shows the em-dash.
    expect(within(summary).getAllByText("—").length).toBeGreaterThanOrEqual(1);
  });
});

/** Balance job (migration 0184) — the ledger path renders when an orderId is
 *  passed, deriving Outstanding from the real payments (storage excluded). */
describe("PaymentControlFields — ledger (with orderId)", () => {
  const ID = "00000000-0000-0000-0000-0000000000a1";

  it("lists ledger entries and derives Outstanding from goods payments", () => {
    renderPieces({
      paid: 0,
      total: 5000,
      balance: 5000,
      orderId: ID,
      payments: [
        { id: "p1", amount: 1000, kind: "deposit", method: "cash", paid_on: "2026-06-20", receipt_no: "R1-1" },
        { id: "p2", amount: 1500, kind: "payment", method: "bank", paid_on: "2026-06-25", receipt_no: "R1-2" },
        { id: "p3", amount: 200, kind: "storage", method: "cash", paid_on: "2026-06-26", receipt_no: "R1-3" },
      ],
    });
    const summary = screen.getByTestId("payment-summary");
    // The ledger block renders + the record-payment entry point.
    expect(within(summary).getByText("Record payment")).toBeInTheDocument();
    expect(within(summary).getByText(/R1-1/)).toBeInTheDocument();
    // Outstanding = bill 5000 − goods (1000 + 1500) = 2500; storage excluded.
    expect(within(summary).getByText("RM 2,500")).toBeInTheDocument();
  });

  it("shows the empty-ledger hint when no payments yet", () => {
    renderPieces({ paid: 0, total: 5000, orderId: ID, payments: [] });
    expect(screen.getByText("No payments recorded yet.")).toBeInTheDocument();
  });

  it("offers a balance Due date field", () => {
    renderPieces({ paid: 0, total: 5000, orderId: ID, payments: [] });
    expect(screen.getByLabelText("Balance due date")).toBeInTheDocument();
  });
});
