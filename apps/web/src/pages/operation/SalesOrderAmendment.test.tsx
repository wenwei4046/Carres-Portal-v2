import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { SalesOrderAmendment as Amendment } from "@/lib/queries";
import SalesOrderAmendmentLane from "./SalesOrderAmendment";

const submitMutate = vi.fn();
const decideMutate = vi.fn();
let live: Amendment | null = null;
let role: "operation" | "principal" = "operation";

vi.mock("@/lib/auth", () => ({
  useAuth: (selector: (state: { role: typeof role }) => unknown) => selector({ role }),
}));
vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useSalesOrderAmendment: () => ({ data: { amendment: live } }),
    useSalesOrderAmendmentImpact: () => ({
      data: live
        ? {
            amendment_id: live.id,
            stale: live.stale,
            commercial_delta: 500,
            findings: [
              { owner: "Purchasing", kind: "purchase_order", count: 1, blocks: false, href: "/operation?tab=purchase" },
              { owner: "Money", kind: "commercial_delta", count: 0, amount: 500, blocks: false, href: "/finance/payments" },
            ],
          }
        : undefined,
    }),
    useSubmitSalesOrderAmendment: () => ({ mutate: submitMutate, isPending: false }),
    useDecideSalesOrderAmendment: () => ({ mutate: decideMutate, isPending: false }),
  };
});

const ORDER_ID = "00000000-0000-0000-0000-0000000000d1";
const fresh: Amendment = {
  id: "00000000-0000-0000-0000-0000000000a1",
  status: "submitted",
  reason: "Customer wants one more",
  base_revision: 4,
  base_contractual_hash: "347fc81f",
  current_contractual_hash: "347fc81f",
  stale: false,
  proposed_snapshot: { lines: [{ id: "00000000-0000-0000-0000-0000000000e1", sku: "B1201S-K", qty: 3, unit_price: 2499 }] },
  submitted_at: "2026-08-10T03:36:33.000Z",
};

function draw() {
  return render(
    <SalesOrderAmendmentLane
      orderId={ORDER_ID}
      currentLines={[{ id: "00000000-0000-0000-0000-0000000000e1", sku: "B1201S-K", qty: 2, unit_price: 2499 }]}
    />,
  );
}

beforeEach(() => {
  live = null;
  role = "operation";
  submitMutate.mockReset();
  decideMutate.mockReset();
});

describe("an amendment awaiting management", () => {
  beforeEach(() => { live = fresh; });

  it("shows owner impacts without moving their work into Sales Order", () => {
    draw();
    expect(screen.getByText("Purchasing")).toBeTruthy();
    expect(screen.getByText("Money")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Purchasing/ }).getAttribute("href")).toBe("/operation?tab=purchase");
  });

  it("lets operation route the request but not decide it", () => {
    draw();
    expect(screen.getByText(/Waiting for management/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve and apply" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
  });

  it("lets Principal approve or reject with a recorded decision reason", () => {
    role = "principal";
    draw();
    fireEvent.change(screen.getByLabelText("Management decision reason"), {
      target: { value: "Customer confirmed in writing" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Approve and apply" }));
    expect(decideMutate).toHaveBeenCalledWith({
      amendmentId: fresh.id,
      decision: "approve",
      note: "Customer confirmed in writing",
    });
  });

  it("refuses approval in the UI when the proposal is stale", () => {
    role = "principal";
    live = { ...fresh, stale: true, current_contractual_hash: "changed" };
    draw();
    expect(screen.getByText(/Out of date — propose again/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve and apply" })).toBeNull();
  });
});

describe("no amendment open", () => {
  it("offers one proposal door and no decision controls", () => {
    draw();
    expect(screen.getByTestId("amendment-open-form")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve and apply" })).toBeNull();
  });
});
