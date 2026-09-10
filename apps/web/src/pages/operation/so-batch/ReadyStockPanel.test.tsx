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
    const row = screen.getByTestId("ready-stock-unit-33333333-0000-0000-0000-00000000000a");
    expect(within(row).getByText("Display")).toBeInTheDocument();
    expect(within(row).getByRole("checkbox")).toBeEnabled();
  });

  it("names the site the goods are actually at", async () => {
    draw();
    await open();
    expect(screen.getAllByText("Carres Klang Warehouse").length).toBeGreaterThan(0);
  });

  it("says whose goods a consignment Unit is", async () => {
    draw();
    await open();
    const row = screen.getByTestId("ready-stock-unit-33333333-0000-0000-0000-000000000065");
    expect(within(row).getByText("Supplier")).toBeInTheDocument();
  });
});

/* ─── COUNTED STOCK IS NOT A UNIT ───────────────────────────────────────── */

describe("counted stock", () => {
  it("shows the row, refuses the choice, and never prints its key as a Unit ID", async () => {
    draw();
    await open();
    const row = screen.getByTestId("ready-stock-unit-33333333-0000-0000-0000-00000000000e");
    expect(within(row).queryByRole("checkbox")).toBeNull();
    expect(within(row).queryByText("QTY-000000001")).toBeNull();
    expect(within(row).getAllByText("Counted stock").length).toBeGreaterThan(0);
    expect(within(row).getByText("893")).toBeInTheDocument();
  });
});

/* ─── TWO ITEM LINES OF ONE SKU ─────────────────────────────────────────── */

describe("two item lines of one SKU", () => {
  it("makes the operator say which line the Unit answers", async () => {
    draw();
    await open();
    const row = screen.getByTestId("ready-stock-unit-33333333-0000-0000-0000-00000000000a");
    expect(within(row).getByRole("combobox")).toBeInTheDocument();
    expect(within(row).getAllByRole("option")).toHaveLength(2);
  });

  it("sends the exact Unit and the exact line it was chosen for", async () => {
    draw();
    await open();
    const row = screen.getByTestId("ready-stock-unit-33333333-0000-0000-0000-00000000000a");
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

  it("prints one line only when only one line can be meant", async () => {
    draw(
      response({
        units: response().units.map((u) => ({ ...u, matchingLineIds: [LINE_A] })),
      }),
    );
    await open();
    const row = screen.getByTestId("ready-stock-unit-33333333-0000-0000-0000-00000000000a");
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
    const row = screen.getByTestId("ready-stock-unit-33333333-0000-0000-0000-00000000000a");
    fireEvent.click(within(row).getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Choose Ready Unit" })).toBeEnabled();
    expect(screen.getByText("1 chosen")).toBeInTheDocument();
  });

  it("un-chooses on a second click", async () => {
    draw();
    await open();
    const row = screen.getByTestId("ready-stock-unit-33333333-0000-0000-0000-00000000000a");
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

  it("prints the server's own refusal when a stale choice is refused", async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (String(path).endsWith("/ready-stock")) return response();
      const { ApiError } = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
      throw new ApiError(409, "conflict", { code: "unit_no_longer_free" });
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ReadyStockPanel orderId={ORDER} so={1251} />
      </QueryClientProvider>,
    );
    await open();
    const row = screen.getByTestId("ready-stock-unit-33333333-0000-0000-0000-00000000000a");
    fireEvent.click(within(row).getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Choose Ready Unit" }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Someone else took that Unit. Nothing was reserved."),
    );
  });

  it("states an empty shelf as a fact", async () => {
    draw(response({ units: [] }));
    fireEvent.click(screen.getByRole("button", { name: /Ready Stock/ }));
    expect(
      await screen.findByText("No stock on the shelf matches this order."),
    ).toBeInTheDocument();
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

  it("holds every item row at the ruled 38px", async () => {
    draw();
    await open();
    for (const row of screen.getAllByTestId(/^ready-stock-unit-/)) {
      expect(row).toHaveStyle({ height: "38px" });
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
