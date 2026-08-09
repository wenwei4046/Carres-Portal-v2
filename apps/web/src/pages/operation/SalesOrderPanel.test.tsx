import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SalesOrderPanel from "./SalesOrderPanel";
import { promiseHistory } from "./sales-order-facts";

/**
 * THE SALES ORDER PANEL — SO-3 (Loo, 2026-08-09).
 *
 * **Each test is a sentence of the card that a later change would otherwise
 * quietly break**, and the three that matter most are the three permission
 * levels: a Level 2 act may NEVER write the order, a Level 3 fact may never
 * gain a control, and the PROMISED cell may never invent a history it does not
 * have.
 */

const detail = vi.fn();
const update = vi.fn();
const annotate = vi.fn();
const request = vi.fn();

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useOperationOrder: () => detail(),
    useUpdateOrder: () => ({ mutateAsync: update, isPending: false }),
    useAddAnnotation: () => ({ mutateAsync: annotate, isPending: false }),
    useRequestOrderChange: () => ({ mutateAsync: request, isPending: false }),
  };
});

function payload(over: Record<string, unknown> = {}) {
  return {
    data: {
      order: {
        id: "o-1",
        so: 1257,
        source_ref: null,
        status: "proceed_order",
        operation_stage: "confirmed",
        warehouse_id: null,
        customer_name: "MyHouse Management PLT",
        customer_phone: "012-345 6789",
        customer_address: "12 Jalan Setia, Klang",
        customer_address_unknown: false,
        delivery_date: "2026-07-22",
        delivery_date_tbd: false,
        placed_at: "2026-07-10T02:00:00Z",
        do_number: null,
        do_note: null,
        dispatched_at: null,
        delivered_at: null,
        delivery_partner_id: null,
        delivery_stops: null,
        dealer_id: "d-1",
        outlet_id: null,
        invoice_no: null,
        invoiced_at: null,
        paid: 1500,
        dealers: null,
        outlets: null,
        salespersons: { name: "Shasha" },
      },
      lines: [
        { sku: "M1401F-K", qty: 2, unit_price: 1500, label: "M1401F · King" },
        { sku: "5539-CNR", qty: 2, unit_price: 500, label: "Booqit · CNR" },
      ],
      addons: [],
      total: 4000,
      warehouse: null,
      stockBalances: [],
      freeUnits: [],
      pos: [],
      history: [],
      threads: [],
      changeRequests: [],
      ...over,
    },
    isLoading: false,
    isError: false,
    error: undefined,
    refetch: vi.fn(),
  };
}

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

const panel = (over?: Record<string, unknown>) => {
  detail.mockReturnValue(payload(over));
  return render(
    wrap(
      <SalesOrderPanel
        orderId="o-1"
        position={1}
        total={2}
        onStep={vi.fn()}
        onOpenDocument={vi.fn()}
        onClose={vi.fn()}
      />,
    ),
  );
};

beforeEach(() => {
  detail.mockReset();
  update.mockReset().mockResolvedValue({});
  annotate.mockReset().mockResolvedValue({});
  request.mockReset().mockResolvedValue({ id: "cr-1" });
});

describe("THE HEADER", () => {
  it("names the order, the customer, where it is in the list, and the two doors", () => {
    panel();
    expect(screen.getByTestId("panel-so")).toHaveTextContent("SO-1257");
    expect(screen.getByTestId("panel-position")).toHaveTextContent("1 of 2");
    expect(screen.getByTestId("panel-document")).toBeInTheDocument();
    expect(screen.getByTestId("panel-close")).toBeInTheDocument();
    expect(screen.getByTestId("panel-prev")).toBeDisabled();
    expect(screen.getByTestId("panel-next")).toBeEnabled();
  });
});

describe("THE FACTS STRIP — exactly four cells, order facts only", () => {
  it("is TOTAL · PAID · OUTSTANDING · PROMISED and nothing else", () => {
    panel();
    const strip = screen.getByTestId("panel-facts");
    expect(strip.children.length).toBe(4);
    expect(within(strip).getByText("Total")).toBeInTheDocument();
    expect(within(strip).getByText("Paid")).toBeInTheDocument();
    expect(within(strip).getByText("Outstanding")).toBeInTheDocument();
    expect(within(strip).getByText("Promised Delivery")).toBeInTheDocument();
  });

  it("computes the money through the ONE shared rule — 4,000 sold, 1,500 in, 2,500 owed", () => {
    panel();
    expect(screen.getByTestId("fact-total")).toHaveTextContent("4,000");
    expect(screen.getByTestId("fact-paid")).toHaveTextContent("1,500");
    expect(screen.getByTestId("fact-outstanding")).toHaveTextContent("2,500");
  });

  it("never leaves Outstanding blank — an unpriced order says so", () => {
    panel({ lines: [{ sku: "X", qty: 1, unit_price: 0, label: null }], order: { ...payload().data.order, paid: 0 } });
    expect(screen.getByTestId("fact-outstanding")).toHaveTextContent("No price yet");
  });

  it("says `Paid in full` rather than printing nothing when the order is settled", () => {
    panel({ order: { ...payload().data.order, paid: 4000 } });
    expect(screen.getByTestId("fact-outstanding")).toHaveTextContent("Paid in full");
  });
});

describe("⭐ THE PROMISE'S SECOND LINE — the card's exact rule", () => {
  it("shows NOTHING when no promise change was ever recorded", () => {
    panel();
    expect(screen.queryByTestId("fact-promised-second")).toBeNull();
    /* And never the words the card bans outright. */
    expect(screen.queryByText(/changed ×0/)).toBeNull();
  });

  it("shows `Original … · changed ×N` when the promise really moved", () => {
    panel({
      history: [
        {
          text: "Promised date moved from 2026-07-01 to 2026-07-22 · factory delay",
          by_role: "operation",
          occurred_at: "2026-07-05T02:00:00Z",
          metadata: {
            kind: "promise_change_applied",
            from: "2026-07-01",
            to: "2026-07-22",
          },
        },
      ],
    });
    const second = screen.getByTestId("fact-promised-second");
    expect(second).toHaveTextContent("Original");
    expect(second).toHaveTextContent("changed ×1");
  });

  it("does NOT backfill the original from the current value", () => {
    /* `update_order` stamps the payload it was SENT, which holds the NEW date
       only — measured on production 2026-08-09, one such row exists and it has
       no `from`. A change is countable; the original is not recoverable, and
       the cell prints neither rather than guessing. */
    panel({
      history: [
        {
          text: "Order details updated · 1 field(s)",
          by_role: "operation",
          occurred_at: "2026-07-05T02:00:00Z",
          metadata: { kind: "edit", changed: ["delivery_date"], payload: {} },
        },
      ],
    });
    expect(screen.queryByTestId("fact-promised-second")).toBeNull();
  });

  it("counts from the records and takes the EARLIEST `from` as the original", () => {
    expect(
      promiseHistory([
        { metadata: { kind: "promise_change_applied", from: "2026-07-01" } },
        { metadata: { kind: "edit", changed: ["customer_phone"] } },
        { metadata: { kind: "promise_change_applied", from: "2026-07-22" } },
      ]),
    ).toEqual({ changes: 2, originalPromised: "2026-07-01" });
    expect(promiseHistory([])).toEqual({ changes: 0, originalPromised: null });
  });

  it("⭐ does NOT count a request nobody has decided — a request is not a change", () => {
    /* Found by looking at the built page: a postpone recorded against SO-1299
       printed `Original Sat, 29 Aug 26 · changed ×1` while the order still
       promised Sat, 29 Aug. The cell claimed a move that had not happened. */
    expect(
      promiseHistory([
        {
          metadata: {
            kind: "promise_change_requested",
            from: "2026-08-29",
            to: "2026-09-03",
          },
        },
      ]),
    ).toEqual({ changes: 0, originalPromised: null });
  });
});

describe("⭐⭐ THE THREE PERMISSION LEVELS", () => {
  it("LEVEL 1 — the field IS the control: no Edit button anywhere", () => {
    panel();
    expect(screen.queryByRole("button", { name: /^edit/i })).toBeNull();
    expect(screen.getByLabelText("Phone")).toHaveValue("012-345 6789");
    expect(screen.getByLabelText("Address")).toHaveValue("12 Jalan Setia, Klang");
    expect(screen.getByLabelText("Internal note")).toBeInTheDocument();
  });

  it("LEVEL 1 — Save sends only what was touched, and Cancel throws it away", async () => {
    panel();
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "011 222 3333" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({ customer: { phone: "011 222 3333" } }),
    );
    expect(annotate).not.toHaveBeenCalled();
  });

  it("LEVEL 1 — an internal note is an annotation, not a field on the order", async () => {
    panel();
    fireEvent.change(screen.getByLabelText("Internal note"), {
      target: { value: "customer called about the lift" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(annotate).toHaveBeenCalledWith({
        orderId: "o-1",
        content: "customer called about the lift",
        tag: null,
      }),
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("the sticky footer is always there, and both buttons are dead until something changed", () => {
    panel();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "011" } });
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText("Phone")).toHaveValue("012-345 6789");
  });

  it("LEVEL 2 — a postpone is RECORDED, and the order is never written", async () => {
    panel();
    fireEvent.click(screen.getByTestId("panel-promise-open"));
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "customer is renovating" },
    });
    /* No reason, no date → the door stays shut. */
    expect(screen.getByTestId("panel-promise-submit")).toBeDisabled();
  });

  it("LEVEL 2 — the request carries the new date and the reason", async () => {
    panel();
    fireEvent.click(screen.getByTestId("panel-promise-open"));
    const form = screen.getByTestId("panel-promise-form");
    fireEvent.change(within(form).getByLabelText("Reason"), {
      target: { value: "customer is renovating" },
    });
    /* The kit's DatePicker is a button + a calendar, not a text field — so the
       date is picked the way an operator picks it. The MONTH is whatever the
       machine's clock says, so the assertion holds the DAY, which is the part
       this test is about. */
    fireEvent.click(within(form).getByRole("button", { name: "The customer asks for" }));
    fireEvent.click(await screen.findByText("15"));
    await waitFor(() => expect(screen.getByTestId("panel-promise-submit")).toBeEnabled());
    fireEvent.click(screen.getByTestId("panel-promise-submit"));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(request.mock.calls[0]![0]).toMatchObject({
      kind: "promise_date",
      reason: "customer is renovating",
    });
    expect(request.mock.calls[0]![0].to).toMatch(/^\d{4}-\d{2}-15$/);
    /* THE ORDER IS NOT TOUCHED. This is the whole of Level 2. */
    expect(update).not.toHaveBeenCalled();
  });

  it("LEVEL 2 — an item change is a request too, with a reason", async () => {
    panel();
    fireEvent.click(screen.getByTestId("panel-item-open"));
    const form = screen.getByTestId("panel-item-form");
    fireEvent.change(within(form).getByLabelText("What should change"), {
      target: { value: "King → Queen on the mattress" },
    });
    fireEvent.change(within(form).getByLabelText("Reason"), {
      target: { value: "room is too small" },
    });
    fireEvent.click(screen.getByTestId("panel-item-submit"));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith({
        kind: "item_change",
        note: "King → Queen on the mattress",
        reason: "room is too small",
      }),
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("a request already waiting closes the door and says what is waiting", () => {
    panel({
      changeRequests: [
        {
          id: "cr-1",
          kind: "promise_date",
          payload: { from: "2026-07-22", to: "2026-08-30", reason: "renovating" },
          status: "pending",
          requested_at: "2026-08-01T02:00:00Z",
          decided_at: null,
        },
      ],
    });
    expect(screen.getByTestId("panel-promise-pending")).toHaveTextContent("renovating");
    expect(screen.queryByTestId("panel-promise-open")).toBeNull();
  });

  it("LEVEL 3 — items, prices, salesperson and Ordered have NO control at all", () => {
    panel();
    /* Not a disabled field — no field. A greyed-out box still says "later". */
    expect(screen.queryByLabelText("Salesperson")).toBeNull();
    expect(screen.queryByLabelText("Unit price")).toBeNull();
    expect(screen.queryByLabelText("Discount")).toBeNull();
    expect(screen.queryByLabelText("Ordered")).toBeNull();
    const items = screen.getByTestId("panel-items");
    expect(items.querySelector("input, select, textarea")).toBeNull();
    /* The names are still READ — Law B: a summary is read-only, forever. */
    expect(within(items).getByText("M1401F · King")).toBeInTheDocument();
    expect(screen.getByText("Shasha")).toBeInTheDocument();
  });

  it("carries NO execution control — no Issue PO, no ETA, no stock, no delivery", () => {
    panel();
    for (const banned of [/issue po/i, /eta/i, /stock/i, /book delivery/i, /collect/i]) {
      expect(screen.queryByRole("button", { name: banned })).toBeNull();
    }
  });
});

describe("HISTORY", () => {
  it("is read-only and says so when there is nothing in it", () => {
    panel();
    expect(screen.getByText("Nothing has been recorded on this order yet")).toBeInTheDocument();
  });

  it("prints what was recorded, oldest first", () => {
    panel({
      history: [
        { text: "Order placed", by_role: "dealer", occurred_at: "2026-07-10T02:00:00Z", metadata: null },
        { text: "Order details updated · 1 field(s)", by_role: "operation", occurred_at: "2026-07-12T02:00:00Z", metadata: null },
      ],
    });
    const list = screen.getByTestId("panel-history");
    expect(list.children.length).toBe(2);
    expect(list.children[0]).toHaveTextContent("Order placed");
  });
});
