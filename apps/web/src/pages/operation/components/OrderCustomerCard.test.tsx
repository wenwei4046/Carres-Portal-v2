import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { OrderCustomerCard } from "./OrderDetailDrawer";

/**
 * OrderCustomerCard — the inline customer-edit on the order drawer's Order
 * section (Jess 2026-06-25, #4 drawer edit). useUpdateOrder is mocked so we
 * capture the PATCH payload without a network call; qk + the shared zod schema
 * stay real (the card validates with the same schema the API uses).
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

beforeEach(() => {
  mutate = vi.fn();
  isPending = false;
});

describe("OrderCustomerCard", () => {
  it("shows read-only details + an Edit button for a Place order", () => {
    wrap(<OrderCustomerCard order={placeOrder} />);
    expect(screen.getByText("Tan Ah Kow")).toBeInTheDocument();
    expect(screen.getByText("5, Jln A, Penang")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Edit/ })).toBeInTheDocument();
  });

  it("hides Edit for a non-Place order (the update_order RPC would 422)", () => {
    wrap(<OrderCustomerCard order={{ ...placeOrder, status: "proceed_order" }} />);
    expect(screen.queryByRole("button", { name: /Edit/ })).not.toBeInTheDocument();
    // still shows the details read-only
    expect(screen.getByText("Tan Ah Kow")).toBeInTheDocument();
  });

  it("edits the address and PATCHes ONLY the changed field", () => {
    wrap(<OrderCustomerCard order={placeOrder} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
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
    wrap(<OrderCustomerCard order={placeOrder} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
    fireEvent.change(screen.getByLabelText("Customer name"), {
      target: { value: "A" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText(/at least 2/i)).toBeInTheDocument();
  });

  it("Save with no edits just closes — no PATCH", () => {
    wrap(<OrderCustomerCard order={placeOrder} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mutate).not.toHaveBeenCalled();
    // back to the read-only view
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Edit/ })).toBeInTheDocument();
  });
});
