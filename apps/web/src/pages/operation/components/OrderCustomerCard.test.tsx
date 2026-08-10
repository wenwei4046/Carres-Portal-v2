import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode, MutableRefObject } from "react";
import { OrderCustomerCard } from "./OrderDetailDrawer";

/**
 * OrderCustomerCard — the customer block's read view and its safe-edit mode.
 * `useUpdateOrder` is mocked so we capture the PATCH payload without a network
 * call; qk + the shared zod schema stay real (the card validates with the same
 * schema the API uses).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * 2026-08-08 — WHY THIS SUITE WAS REWRITTEN, AND WHAT IT NOW PROVES.
 *
 * Four of its five tests opened the edit mode by clicking an `Edit` button on
 * the card. **That button was deliberately removed** and the reason is still
 * in the component's own words (`OrderDetailDrawer.tsx:5023-5025`):
 *
 *   "Edit moved to the panel ⋮ (Jess 2026-07-11 — every panel's actions live
 *    in its header ⋮; the redundant inline button is gone). Read-only by
 *    default; the ⋮ 'Edit details' opens the safe Save / Cancel mode."
 *
 * The capability did not go away — it changed DOOR. The card exposes its own
 * `start()` through the `startEditRef` prop, and that ref IS the ⋮'s handle.
 * So the three tests that guarded real business behaviour — PATCH only the
 * changed field · a too-short name is refused · a no-op Save just closes —
 * are kept exactly as they were and simply enter through the door that
 * exists. Deleting them would have thrown away the `update_order` contract to
 * settle a button.
 *
 * The two remaining tests are inverted rather than deleted, so the removed
 * button cannot quietly come back without naming the ruling it would reopen.
 * ───────────────────────────────────────────────────────────────────────────
 */

let mutate: ReturnType<typeof vi.fn>;
let isPending = false;

vi.mock("@/lib/queries", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useUpdateOrder: () => ({ mutate, isPending }),
  };
});

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

const placeOrder = {
  id: "o1",
  status: "place",
  customer_name: "Tan Ah Kow",
  customer_phone: "012-3456789",
  customer_address: "5, Jln A, Penang",
};

/**
 * Mounts the card the way the panel ⋮ does — holding its `startEditRef` — and
 * hands back the opener. This is the real door: `openEdit()` here is exactly
 * what "Edit details" on the panel header calls.
 */
function renderWithDoor(order = placeOrder) {
  const door: MutableRefObject<(() => void) | null> = { current: null };
  wrap(<OrderCustomerCard order={order} startEditRef={door} />);
  return {
    openEdit: () => {
      // The card publishes `start` into the ref from an effect, so by the time
      // render() returns it is populated. If it ever is not, this throws with
      // a name rather than silently testing the read view.
      if (!door.current) throw new Error("startEditRef was never populated");
      act(() => door.current!());
    },
  };
}

beforeEach(() => {
  mutate = vi.fn();
  isPending = false;
});

describe("OrderCustomerCard — the read view", () => {
  it("shows the customer's details read-only", () => {
    wrap(<OrderCustomerCard order={placeOrder} />);
    expect(screen.getByText("Tan Ah Kow")).toBeInTheDocument();
    expect(screen.getByText("012-3456789")).toBeInTheDocument();
    expect(screen.getByText("5, Jln A, Penang")).toBeInTheDocument();
  });

  it("offers NO inline Edit button — Jess 2026-07-11 moved it to the panel ⋮", () => {
    // Inverted, not deleted. §4's frozen rule is "one editing surface per
    // fact"; an inline button reappearing beside the ⋮ would be two doors onto
    // one act, which is the C defect the architecture names by letter.
    wrap(<OrderCustomerCard order={placeOrder} />);
    expect(screen.queryByRole("button", { name: /Edit/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });
});

describe("OrderCustomerCard — the safe-edit mode, entered through startEditRef", () => {
  it("the ⋮'s door opens the Save / Cancel mode", () => {
    const { openEdit } = renderWithDoor();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    openEdit();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("edits the address and PATCHes ONLY the changed field", () => {
    const { openEdit } = renderWithDoor();
    openEdit();
    fireEvent.change(screen.getByLabelText("Address"), {
      target: { value: "99, New Road, Ipoh, Perak" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({
      customer: { address: "99, New Road, Ipoh, Perak" },
    });
  });

  it("blocks an invalid (too-short) name and does NOT PATCH", () => {
    const { openEdit } = renderWithDoor();
    openEdit();
    fireEvent.change(screen.getByLabelText("Customer name"), {
      target: { value: "A" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText(/at least 2/i)).toBeInTheDocument();
  });

  it("Save with no edits just closes — no PATCH", () => {
    const { openEdit } = renderWithDoor();
    openEdit();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mutate).not.toHaveBeenCalled();
    // back to the read-only view
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.getByText("Tan Ah Kow")).toBeInTheDocument();
  });
});
