import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReadyStockResponse } from "@carres/shared";

const apiFetch = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...a: unknown[]) => apiFetch(...a) };
});
const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (m: string) => toastError(m), success: (m: string) => toastSuccess(m) } }));

import ReadyStockPanel from "./ReadyStockPanel";

/**
 * READY STOCK — the operator's half of the contract.
 *
 * The database half is proved in `apps/api/src/test/ready-stock-reservation.test.ts`
 * against a real Postgres. What is proved HERE is what the operator can see and
 * do: that viewing reserves nothing, that a counted row cannot be chosen, that
 * two item lines of one SKU make the operator say which, and that purchasing
 * selection and stock selection never touch each other.
 */

const ORDER = "order-1";
const LINE_A = "22222222-2222-2222-2222-22222222222a";
const LINE_B = "22222222-2222-2222-2222-22222222222b";

function response(over: Partial<ReadyStockResponse> = {}): ReadyStockResponse {
  return {
    orderId: ORDER,
    so: 1251,
    reference: "SO-1251",
    lines: [
      {
        orderLineId: LINE_A,
        sku: "1013Jager/Fab3-Queen/PC151-01",
        item: "Jager bedframe",
        qty: 1,
        reservedQty: 0,
        reservedUnitCodes: [],
        onPoQty: 0,
        remainingQty: 1,
      },
      {
        orderLineId: LINE_B,
        sku: "1013Jager/Fab3-Queen/PC151-01",
        item: "Jager bedframe",
        qty: 1,
        reservedQty: 0,
        reservedUnitCodes: [],
        onPoQty: 0,
        remainingQty: 1,
      },
    ],
    units: [
      {
        itemId: "33333333-0000-0000-0000-00000000000a",
        unitCode: "U1-000-001",
        identityScope: "unit",
        sku: "1013Jager/Fab3-Queen/PC151-01",
        condition: "exhibition",
        siteName: "Carres Klang Warehouse",
        holderName: null,
        ownership: "carres_owned",
        supplier: null,
        qty: 1,
        poNo: null,
      dateIn: "2026-08-01",
        matchingLineIds: [LINE_A, LINE_B],
        blocked: null,
      },
      {
        itemId: "33333333-0000-0000-0000-00000000000e",
        unitCode: "QTY-000000001",
        identityScope: "quantity",
        sku: "1013Jager/Fab3-Queen/PC151-01",
        condition: "new",
        siteName: "Carres Klang Warehouse",
        holderName: null,
        ownership: "carres_owned",
        supplier: null,
        qty: 893,
        poNo: null,
      dateIn: "2026-08-05",
        matchingLineIds: [LINE_A, LINE_B],
        blocked: "counted_stock",
      },
      {
        itemId: "33333333-0000-0000-0000-000000000065",
        unitCode: "U1-000-065",
        identityScope: "unit",
        sku: "1013Jager/Fab3-Queen/PC151-01",
        condition: "new",
        siteName: "Carres Klang Warehouse",
        holderName: null,
        ownership: "supplier_consignment",
        supplier: "Dorsettloft",
        qty: 1,
        poNo: null,
      dateIn: "2026-08-06",
        matchingLineIds: [LINE_A, LINE_B],
        blocked: null,
      },
    ],
    ...over,
  };
}

function draw(data: ReadyStockResponse | (() => Promise<unknown>) = response()) {
  apiFetch.mockImplementation(async (path: string) => {
    if (typeof path === "string" && path.endsWith("/ready-stock")) {
      return typeof data === "function" ? data() : data;
    }
    return { reserved: 1, reference: "SO-1251", units: [] };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ReadyStockPanel orderId={ORDER} so={1251} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiFetch.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
});

async function open() {
  fireEvent.click(screen.getByRole("button", { name: /Ready Stock/ }));
  await screen.findByText("U1-000-001");
}

/* ─── VIEWING IS NOT RESERVING ──────────────────────────────────────────── */

describe("viewing", () => {
  it("reads nothing until the section is opened", () => {
    draw();
    expect(apiFetch).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Ready Stock/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("reads, and writes nothing, when opened", async () => {
    draw();
    await open();
    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [path, init] = apiFetch.mock.calls[0] as [string, RequestInit | undefined];
    expect(path).toContain("/ready-stock");
    expect(init?.method ?? "GET").toBe("GET");
  });

  it("keeps Condition as a grade, not as availability", async () => {
    draw();
    await open();
    /* An Exhibition Unit is fully available and choosable. */
    const row = screen.getByTestId("stock-picker-unit-33333333-0000-0000-0000-00000000000a");
    expect(within(row).getByText("Display")).toBeInTheDocument();
    expect(within(row).getByRole("checkbox")).toBeEnabled();
  });

  it("names the site the goods are actually at", async () => {
    draw();
    await open();
    expect(screen.getAllByText("Carres Klang Warehouse").length).toBeGreaterThan(0);
  });

  /** `Covered` is retired from SO Batch Purchase; the fact is what is said. */
  it("says no item line needs a Unit rather than calling it covered", async () => {
    draw(
      response({
        units: response().units.map((u) => ({
          ...u,
          matchingLineIds: [],
          blocked: u.identityScope === "quantity" ? ("counted_stock" as const) : ("no_line_needs_it" as const),
        })),
      }),
    );
    await open();
    const row = screen.getByTestId("stock-picker-unit-33333333-0000-0000-0000-00000000000a");
    expect(within(row).getByText("No item line needs it")).toBeInTheDocument();
    expect(within(row).queryByText(/Covered/)).toBeNull();
    expect(within(row).queryByRole("checkbox")).toBeNull();
  });

  it("says whose goods a consignment Unit is", async () => {
    draw();
    await open();
    const row = screen.getByTestId("stock-picker-unit-33333333-0000-0000-0000-000000000065");
    /* ⭐ THE APPROVED PICKER NAMES THE SUPPLIER AND SAYS WHOSE THE GOODS ARE
       (owner ruling 2026-09-18). The retired table had an `Owner` column that
       printed the bare word `Supplier` and hid the name behind a tooltip; the
       name is a decision fact and now prints, with the ownership beneath it. */
    expect(within(row).getByText("Supplier-owned")).toBeInTheDocument();
  });
});

/* ─── COUNTED STOCK IS NOT A UNIT ───────────────────────────────────────── */

describe("counted stock", () => {
  it("shows the row, refuses the choice, and never prints its key as a Unit ID", async () => {
    draw();
    await open();
    const row = screen.getByTestId("stock-picker-unit-33333333-0000-0000-0000-00000000000e");
    expect(within(row).queryByRole("checkbox")).toBeNull();
    expect(within(row).queryByText("QTY-000000001")).toBeNull();
    /* COPY-STANDARD: a quantity-scoped goods line has no Unit ID by law, so
       its Unit ID cell is the absence dash. `No Unit ID` would imply one is
       owed. What the goods ARE is said in its own column. */
    expect(within(row).getAllByText("—").length).toBeGreaterThan(0);
    expect(within(row).queryByText(/No Unit ID/)).toBeNull();
    expect(within(row).getByText("Counted stock")).toBeInTheDocument();
    /* `Qty` left the picker with the ruling's six columns; a counted row still
       says how many pieces it stands for, beside its grade. */
    expect(within(row).getByText("893 counted")).toBeInTheDocument();
  });
});

/* ─── TWO ITEM LINES OF ONE SKU ─────────────────────────────────────────── */

describe("two item lines of one SKU", () => {
  it("makes the operator say which line the Unit answers", async () => {
    draw();
    await open();
    const row = screen.getByTestId("stock-picker-unit-33333333-0000-0000-0000-00000000000a");
    expect(within(row).getByRole("combobox")).toBeInTheDocument();
    expect(within(row).getAllByRole("option")).toHaveLength(2);
  });

  it("sends the exact Unit and the exact line it was chosen for", async () => {
    draw();
    await open();
    const row = screen.getByTestId("stock-picker-unit-33333333-0000-0000-0000-00000000000a");
    fireEvent.click(within(row).getByRole("checkbox"));
    fireEvent.change(within(row).getByRole("combobox"), { target: { value: LINE_B } });
    fireEvent.click(screen.getByRole("button", { name: "Choose Ready Unit" }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    const post = apiFetch.mock.calls.find(([p]) => String(p).endsWith("/ready-stock/reserve"));
    expect(post).toBeTruthy();
    expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({
      orderId: ORDER,
      picks: [{ itemId: "33333333-0000-0000-0000-00000000000a", orderLineId: LINE_B }],
    });
  });

  /**
   * WHICH LINE and WHETHER TO CHOOSE are two decisions, and the operator may
   * make them in either order. Held in one map, changing the dropdown on an
   * unticked row silently did nothing — a control that looks live and is not.
   */
  it("keeps the line the operator picked BEFORE ticking the box", async () => {
    draw();
    await open();
    const row = screen.getByTestId("stock-picker-unit-33333333-0000-0000-0000-00000000000a");
    fireEvent.change(within(row).getByRole("combobox"), { target: { value: LINE_B } });
    fireEvent.click(within(row).getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Choose Ready Unit" }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    const post = apiFetch.mock.calls.find(([p]) => String(p).endsWith("/ready-stock/reserve"));
    expect(JSON.parse(String((post![1] as RequestInit).body)).picks).toEqual([
      { itemId: "33333333-0000-0000-0000-00000000000a", orderLineId: LINE_B },
    ]);
  });

  it("prints one line only when only one line can be meant", async () => {
    draw(
      response({
        units: response().units.map((u) => ({ ...u, matchingLineIds: [LINE_A] })),
      }),
    );
    await open();
    const row = screen.getByTestId("stock-picker-unit-33333333-0000-0000-0000-00000000000a");
    expect(within(row).queryByRole("combobox")).toBeNull();
    expect(within(row).getByText("Jager bedframe")).toBeInTheDocument();
  });
});

/* ─── SELECTION SCOPE ───────────────────────────────────────────────────── */

describe("selection", () => {
  it("is disabled until a Unit is chosen", async () => {
    draw();
    await open();
    expect(screen.getByRole("button", { name: "Choose Ready Unit" })).toBeDisabled();
    expect(screen.getByText("No Unit chosen")).toBeInTheDocument();
  });

  it("enables the act and counts what is chosen", async () => {
    draw();
    await open();
    const row = screen.getByTestId("stock-picker-unit-33333333-0000-0000-0000-00000000000a");
    fireEvent.click(within(row).getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Choose Ready Unit" })).toBeEnabled();
    expect(screen.getByText("1 chosen")).toBeInTheDocument();
  });

  it("un-chooses on a second click", async () => {
    draw();
    await open();
    const row = screen.getByTestId("stock-picker-unit-33333333-0000-0000-0000-00000000000a");
    fireEvent.click(within(row).getByRole("checkbox"));
    fireEvent.click(within(row).getByRole("checkbox"));
    expect(screen.getByText("No Unit chosen")).toBeInTheDocument();
  });

  /** Purchasing selection lives in the goods table above and shares no state. */
  it("owns no purchasing checkbox of its own", async () => {
    draw();
    await open();
    const panel = screen.getByTestId(`ready-stock-${ORDER}`);
    /* Two choosable Units, and nothing else in this section is tickable. */
    expect(within(panel).getAllByRole("checkbox")).toHaveLength(2);
  });
});

/* ─── FAILURE, RETRY AND STALE SELECTION ────────────────────────────────── */

describe("failure and retry", () => {
  it("offers a retry rather than an empty table when the read fails", async () => {
    draw(async () => {
      throw new Error("network");
    });
    fireEvent.click(screen.getByRole("button", { name: /Ready Stock/ }));
    expect(
      await screen.findByRole("button", { name: /Ready Stock could not be read/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("No stock on the shelf matches this order.")).toBeNull();
  });

  /** A refused act: the read succeeds, the reserve door answers `body`. */
  function drawRefusing(body: Record<string, unknown>, onReserved?: (o: string, l: readonly string[]) => void) {
    apiFetch.mockImplementation(async (path: string) => {
      if (String(path).endsWith("/ready-stock")) return response();
      const { ApiError } = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
      throw new ApiError(409, "conflict", body);
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <ReadyStockPanel orderId={ORDER} so={1251} onReserved={onReserved} />
      </QueryClientProvider>,
    );
  }

  it("prints the server's own refusal when a stale choice is refused", async () => {
    drawRefusing({ code: "unit_no_longer_free" });
    await open();
    const row = screen.getByTestId("stock-picker-unit-33333333-0000-0000-0000-00000000000a");
    fireEvent.click(within(row).getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Choose Ready Unit" }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Someone else took that Unit."),
    );
  });

  it("names the Unit that stopped the act, and says nothing was reserved", async () => {
    /* The door is atomic, so a refusal is the WHOLE act. What the operator
       needs is which of their choices to fix — 0473 sends the Unit. */
    drawRefusing({
      code: "unit_no_longer_free",
      itemId: "33333333-0000-0000-0000-000000000065",
    });
    await open();
    for (const id of [
      "33333333-0000-0000-0000-00000000000a",
      "33333333-0000-0000-0000-000000000065",
    ]) {
      fireEvent.click(within(screen.getByTestId(`stock-picker-unit-${id}`)).getByRole("checkbox"));
    }
    fireEvent.click(screen.getByRole("button", { name: "Choose Ready Unit" }));
    const act = await screen.findByTestId(`ready-stock-act-${ORDER}`);
    expect(act).toHaveTextContent("Someone else took that Unit.");
    expect(act).toHaveTextContent("Unit ID · U1-000-065");
    expect(act).toHaveTextContent("No Unit was reserved.");
  });

  it("keeps the choice after a refusal — the operator unticks one, not all", async () => {
    drawRefusing({
      code: "unit_no_longer_free",
      itemId: "33333333-0000-0000-0000-000000000065",
    });
    await open();
    for (const id of [
      "33333333-0000-0000-0000-00000000000a",
      "33333333-0000-0000-0000-000000000065",
    ]) {
      fireEvent.click(within(screen.getByTestId(`stock-picker-unit-${id}`)).getByRole("checkbox"));
    }
    fireEvent.click(screen.getByRole("button", { name: "Choose Ready Unit" }));
    await screen.findByTestId(`ready-stock-act-${ORDER}`);
    expect(screen.getByText("2 chosen")).toBeInTheDocument();
  });

  it("tells the Register NOTHING when the act was refused", async () => {
    const onReserved = vi.fn();
    drawRefusing({ code: "unit_no_longer_free" }, onReserved);
    await open();
    const row = screen.getByTestId("stock-picker-unit-33333333-0000-0000-0000-00000000000a");
    fireEvent.click(within(row).getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Choose Ready Unit" }));
    await screen.findByTestId(`ready-stock-act-${ORDER}`);
    expect(onReserved).not.toHaveBeenCalled();
  });

  /**
   * ⭐ A TIMEOUT IS NOT A REFUSAL — 2026-09-11.
   *
   * A confirmed refusal is the door saying no: the transaction rolled back and
   * nothing was reserved. A request that never came back says nothing at all
   * about the transaction, which may have committed. Printing
   * `No Unit was reserved.` there is a guess wearing the clothes of a fact,
   * and the operator's next move is to press again and reserve a second Unit.
   */
  it("never claims nothing was reserved when the result is not known", async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (String(path).endsWith("/ready-stock")) return response();
      throw new Error("network timeout");
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ReadyStockPanel orderId={ORDER} so={1251} />
      </QueryClientProvider>,
    );
    await open();
    const row = screen.getByTestId("stock-picker-unit-33333333-0000-0000-0000-00000000000a");
    fireEvent.click(within(row).getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Choose Ready Unit" }));
    const act = await screen.findByTestId(`ready-stock-act-${ORDER}`);
    expect(act).toHaveTextContent("could not confirm the result");
    expect(act).not.toHaveTextContent("No Unit was reserved.");
    expect(act).toHaveTextContent("Check the Unit IDs below before choosing again.");
  });

  it("re-reads the authoritative record, and drops the choice, on an unknown result", async () => {
    const reads: string[] = [];
    apiFetch.mockImplementation(async (path: string) => {
      if (String(path).endsWith("/ready-stock")) {
        reads.push(String(path));
        return response();
      }
      throw new Error("network timeout");
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ReadyStockPanel orderId={ORDER} so={1251} />
      </QueryClientProvider>,
    );
    await open();
    const before = reads.length;
    const row = screen.getByTestId("stock-picker-unit-33333333-0000-0000-0000-00000000000a");
    fireEvent.click(within(row).getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Choose Ready Unit" }));
    await screen.findByTestId(`ready-stock-act-${ORDER}`);
    /* Pressing the same button again on an unknown outcome is exactly how a
       Unit gets reserved twice, so the choice does not survive it. */
    await waitFor(() => expect(screen.getByText("No Unit chosen")).toBeInTheDocument());
    await waitFor(() => expect(reads.length).toBeGreaterThan(before));
  });

  it("drops last act's sentence the moment the choice moves", async () => {
    drawRefusing({ code: "unit_no_longer_free" });
    await open();
    const row = screen.getByTestId("stock-picker-unit-33333333-0000-0000-0000-00000000000a");
    fireEvent.click(within(row).getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Choose Ready Unit" }));
    await screen.findByTestId(`ready-stock-act-${ORDER}`);
    fireEvent.click(within(row).getByRole("checkbox"));
    expect(screen.queryByTestId(`ready-stock-act-${ORDER}`)).toBeNull();
  });

  it("states an empty shelf as a fact", async () => {
    draw(response({ units: [] }));
    fireEvent.click(screen.getByRole("button", { name: /Ready Stock/ }));
    expect(
      await screen.findByText("No stock on the shelf matches this order."),
    ).toBeInTheDocument();
  });
});

/* ─── WHAT THE ACT DID, AND WHAT IT TOLD THE REGISTER ───────────────────── */

describe("a successful act", () => {
  /** The read succeeds and the door commits exactly what it names. */
  function drawCommitting(
    units: Array<{ itemId: string; orderLineId: string }>,
    onReserved?: (o: string, l: readonly string[]) => void,
  ) {
    apiFetch.mockImplementation(async (path: string) => {
      if (String(path).endsWith("/ready-stock")) return response();
      return { reserved: units.length, reference: "SO-1251", units };
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <ReadyStockPanel orderId={ORDER} so={1251} onReserved={onReserved} />
      </QueryClientProvider>,
    );
  }

  it("names every Unit that went in, not just how many", async () => {
    drawCommitting([
      { itemId: "33333333-0000-0000-0000-00000000000a", orderLineId: LINE_A },
      { itemId: "33333333-0000-0000-0000-000000000065", orderLineId: LINE_B },
    ]);
    await open();
    for (const id of [
      "33333333-0000-0000-0000-00000000000a",
      "33333333-0000-0000-0000-000000000065",
    ]) {
      fireEvent.click(within(screen.getByTestId(`stock-picker-unit-${id}`)).getByRole("checkbox"));
    }
    fireEvent.click(screen.getByRole("button", { name: "Choose Ready Unit" }));
    const act = await screen.findByTestId(`ready-stock-act-${ORDER}`);
    expect(act).toHaveTextContent("Reserved 2 Units to SO-1251");
    expect(act).toHaveTextContent("Unit ID · U1-000-001 · U1-000-065");
  });

  it("counts what the DOOR committed, never what the browser asked for", async () => {
    /* The browser chose two; the door's answer is the only truth about what
       is now reserved, and it is the answer that gets printed. */
    drawCommitting([{ itemId: "33333333-0000-0000-0000-00000000000a", orderLineId: LINE_A }]);
    await open();
    for (const id of [
      "33333333-0000-0000-0000-00000000000a",
      "33333333-0000-0000-0000-000000000065",
    ]) {
      fireEvent.click(within(screen.getByTestId(`stock-picker-unit-${id}`)).getByRole("checkbox"));
    }
    fireEvent.click(screen.getByRole("button", { name: "Choose Ready Unit" }));
    const act = await screen.findByTestId(`ready-stock-act-${ORDER}`);
    expect(act).toHaveTextContent("Reserved 1 Unit to SO-1251");
    expect(act).toHaveTextContent("Unit ID · U1-000-001");
    expect(act).not.toHaveTextContent("U1-000-065");
  });

  it("tells the Register which ITEM LINES were answered, once each", async () => {
    const onReserved = vi.fn();
    drawCommitting(
      [
        { itemId: "33333333-0000-0000-0000-00000000000a", orderLineId: LINE_A },
        { itemId: "33333333-0000-0000-0000-000000000065", orderLineId: LINE_A },
      ],
      onReserved,
    );
    await open();
    for (const id of [
      "33333333-0000-0000-0000-00000000000a",
      "33333333-0000-0000-0000-000000000065",
    ]) {
      fireEvent.click(within(screen.getByTestId(`stock-picker-unit-${id}`)).getByRole("checkbox"));
    }
    fireEvent.click(screen.getByRole("button", { name: "Choose Ready Unit" }));
    await screen.findByTestId(`ready-stock-act-${ORDER}`);
    expect(onReserved).toHaveBeenCalledWith(ORDER, [LINE_A]);
  });

  it("clears the stock choice, because those Units are no longer choosable", async () => {
    drawCommitting([{ itemId: "33333333-0000-0000-0000-00000000000a", orderLineId: LINE_A }]);
    await open();
    const row = screen.getByTestId("stock-picker-unit-33333333-0000-0000-0000-00000000000a");
    fireEvent.click(within(row).getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Choose Ready Unit" }));
    await screen.findByTestId(`ready-stock-act-${ORDER}`);
    expect(screen.getByText("No Unit chosen")).toBeInTheDocument();
  });
});

/* ─── THE RESULT KEEPS THE ORIGINAL DEMAND ──────────────────────────────── */

describe("after reserving", () => {
  it("states the original demand, the exact Unit IDs and what is still to buy", async () => {
    draw(
      response({
        lines: [
          {
            orderLineId: LINE_A,
            sku: "1013Jager/Fab3-Queen/PC151-01",
            item: "Jager bedframe",
            qty: 3,
            reservedQty: 1,
            reservedUnitCodes: ["U1-000-001"],
            onPoQty: 1,
            remainingQty: 1,
          },
        ],
      }),
    );
    await open();
    expect(
      screen.getByText(/Requested 3 = Ready Stock 1 \+ On PO 1 \+ To purchase 1/),
    ).toBeInTheDocument();
    expect(screen.getByText("Unit ID · U1-000-001")).toBeInTheDocument();
  });
});

/* ─── LAYOUT AND KEYBOARD ───────────────────────────────────────────────── */

describe("layout and keyboard", () => {
  it("scrolls sideways inside its own box rather than widening the page", async () => {
    draw();
    await open();
    const panel = screen.getByTestId(`ready-stock-${ORDER}`);
    const scroller = panel.querySelector(".overflow-x-auto");
    expect(scroller).not.toBeNull();
    expect(scroller!.querySelector("table")).not.toBeNull();
  });

  it("holds every Unit row at ONE ruled height", async () => {
    draw();
    await open();
    /* 42px, not 38: the approved picker's document cell carries TWO lines —
       `PO No / Ref No` over the Unit ID — and every row is that tall whether
       or not it has a reference, so a Unit with no provenance does not sit
       shorter than its neighbour (UI MASTER §6.8). */
    for (const row of screen.getAllByTestId(/^stock-picker-unit-/)) {
      expect(row).toHaveStyle({ height: "42px" });
    }
  });

  it("gives the disclosure and every control an accessible name", async () => {
    draw();
    await open();
    expect(screen.getByRole("button", { name: /Ready Stock/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(
      screen.getByRole("checkbox", { name: "Choose U1-000-001" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Item line for U1-000-001" }),
    ).toBeInTheDocument();
  });

  it("is operable from the keyboard alone", async () => {
    draw();
    await open();
    const box = screen.getByRole("checkbox", { name: "Choose U1-000-001" });
    box.focus();
    expect(box).toHaveFocus();
    fireEvent.click(box);
    const act = screen.getByRole("button", { name: "Choose Ready Unit" });
    act.focus();
    expect(act).toHaveFocus();
    expect(act).toBeEnabled();
  });
});
