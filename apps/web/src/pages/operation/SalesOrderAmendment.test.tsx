import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { SalesOrderAmendment as Amendment } from "@/lib/queries";
import SalesOrderAmendmentLane from "./SalesOrderAmendment";

const submitMutate = vi.fn();
const decideMutate = vi.fn();
const agreementMutate = vi.fn();
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
    useRecordAmendmentAgreement: () => ({ mutate: agreementMutate, isPending: false }),
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
  agreementMutate.mockReset();
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

  /* The decision reason was the ONLY thing this asked for until 0564. It now
     also needs the customer's recorded agreement, because approving is what
     makes the change real — see "the customer agreement gate" below. The
     reason is still required, and that is what this still proves. */
  it("lets Principal approve or reject with a recorded decision reason", () => {
    role = "principal";
    live = {
      ...fresh,
      customer_agreement_kind: "signed_document",
      customer_agreement_reference: "SO-1319-amendment-signed.pdf",
      customer_agreement_covers_proposal: true,
    };
    draw();
    expect(screen.getByTestId("amendment-approve")).toBeDisabled();
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


/**
 * ⭐ CUSTOMER AGREEMENT EVIDENCE — APPROVED / LOCKED, owner ruling 2026-09-22
 * (`docs/orders/MASTER.md`; enforced by migration `0564`).
 *
 *   "A change to the customer's actual agreement must have a recorded,
 *    traceable basis for that customer's acceptance before it takes effect...
 *    A manager's statement or checkbox saying the customer agreed is not
 *    sufficient by itself and cannot substitute for the evidence."
 *
 * The database refuses the approval either way; these tests are about the
 * screen refusing to walk the principal into a refusal they cannot fix from
 * where they are standing.
 */
describe("the customer agreement gate", () => {
  const agreed: Amendment = {
    ...fresh,
    customer_agreement_kind: "customer_confirmation",
    customer_agreement_reference: "WhatsApp 2026-09-22 19:40 +60100000000",
    customer_agreement_detail: "Customer agreed to the third piece",
    customer_agreement_at: "2026-09-22T11:40:00.000Z",
    customer_agreement_covers_proposal: true,
  };

  it("says plainly that a change nobody agreed to cannot take effect", () => {
    live = fresh;
    draw();
    expect(screen.getByTestId("amendment-agreement-missing").textContent).toContain(
      "cannot take effect yet",
    );
    // ...and the proposal is NOT thrown away: "The request may remain recorded
    // while evidence is incomplete."
    expect(screen.getByText(/Waiting for management/)).toBeTruthy();
  });

  it("refuses Approve while nothing shows the customer agreed — but never Reject", () => {
    live = fresh;
    role = "principal";
    draw();
    fireEvent.change(screen.getByLabelText("Management decision reason"), {
      target: { value: "the customer told me on the phone" },
    });
    expect(screen.getByTestId("amendment-approve")).toBeDisabled();
    // Refusing a change needs no customer agreement.
    expect(screen.getByRole("button", { name: "Reject" })).not.toBeDisabled();
  });

  it("opens Approve once the recorded basis covers the proposal", () => {
    live = agreed;
    role = "principal";
    draw();
    fireEvent.change(screen.getByLabelText("Management decision reason"), {
      target: { value: "evidence checked" },
    });
    expect(screen.getByTestId("amendment-approve")).not.toBeDisabled();
  });

  it("shows the approver the basis they are being asked to check", () => {
    live = agreed;
    role = "principal";
    draw();
    const panel = screen.getByTestId("amendment-agreement");
    expect(panel.textContent).toContain("Customer confirmation");
    expect(panel.textContent).toContain("WhatsApp 2026-09-22 19:40 +60100000000");
  });

  /* "Following conflict review or a changed proposal, verify that the evidence
     still covers the resulting terms; do not silently reuse approval for
     different terms." */
  it("closes Approve again when the basis no longer covers the terms", () => {
    live = { ...agreed, customer_agreement_covers_proposal: false };
    role = "principal";
    draw();
    fireEvent.change(screen.getByLabelText("Management decision reason"), {
      target: { value: "close enough" },
    });
    expect(screen.getByTestId("amendment-approve")).toBeDisabled();
    expect(screen.getByTestId("amendment-agreement-stale").textContent).toContain(
      "no longer what the customer agreed to",
    );
  });

  /* Sales records the basis; the approver checks it. Operation therefore keeps
     the form while it may not decide anything. */
  it("lets Sales record the basis, and never accepts a bare assertion", () => {
    live = fresh;
    role = "operation";
    draw();
    const save = screen.getByTestId("amendment-agreement-save");
    // Nothing typed is nothing recorded — there is no tick box to press.
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Where the customer's own message can be found/), {
      target: { value: "WhatsApp 2026-09-22 19:40 +60100000000" },
    });
    expect(save).not.toBeDisabled();
    fireEvent.click(save);
    expect(agreementMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        amendmentId: fresh.id,
        kind: "customer_confirmation",
        reference: "WhatsApp 2026-09-22 19:40 +60100000000",
      }),
    );
  });

  it("stops offering the form once the basis is recorded and still covers", () => {
    live = agreed;
    role = "operation";
    draw();
    expect(screen.queryByTestId("amendment-agreement-form")).toBeNull();
  });
});
