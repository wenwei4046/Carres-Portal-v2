import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReadyStockResponse, ReadyStockUnit } from "@carres/shared";

const apiFetch = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...a: unknown[]) => apiFetch(...a) };
});
const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (m: string) => toastError(m), success: (m: string) => toastSuccess(m) },
}));

import { useSoBatchReadyStock } from "./ReadyStockCell";

/**
 * READY STOCK ON THE ITEM ROW — the operator's half of the contract
 * (owner ruling 2026-09-18; Purchasing MASTER §9.1).
 *
 * The database half is proved against a real Postgres. What is proved HERE is
 * what the operator can see and do: that the two counts are never a zero the
 * read did not measure, that the picker is the six approved columns, that a
 * draft writes nothing, that the saved set can be reopened, changed, emptied
 * and abandoned, and that a refusal saves nothing and keeps the draft.
 */

const ORDER = "order-1";
const LINE_A = "22222222-2222-2222-2222-22222222222a";
const LINE_B = "22222222-2222-2222-2222-22222222222b";
const UNIT_A = "33333333-0000-0000-0000-00000000000a";
const UNIT_COUNTED = "33333333-0000-0000-0000-00000000000e";
const UNIT_CONSIGNED = "33333333-0000-0000-0000-000000000065";

function unit(over: Partial<ReadyStockUnit> & { itemId: string }): ReadyStockUnit {
  return {
    unitCode: "U1-000-001",
    identityScope: "unit",
    sku: "1013Jager/Fab3-Queen/PC151-01",
    condition: "exhibition",
    siteName: "Carres Klang Warehouse",
    holderName: null,
    ownership: "carres_owned",
    supplier: "Nice Furniture",
    qty: 1,
    dateIn: "2026-08-01",
    poNo: "PO-20260820-4827",
    matchingLineIds: [LINE_A],
    lineIds: [LINE_A],
    reservedForLineId: null,
    blocked: null,
    ...over,
  };
}

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
        qty: 2,
        reservedQty: 0,
        reservedUnitCodes: [],
        onPoQty: 0,
        remainingQty: 2,
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
      unit({ itemId: UNIT_A }),
      unit({
        itemId: UNIT_COUNTED,
        unitCode: "QTY-000000001",
        identityScope: "quantity",
        condition: "new",
        qty: 893,
        dateIn: "2026-08-05",
        poNo: null,
        blocked: "counted_stock",
      }),
      unit({
        itemId: UNIT_CONSIGNED,
        unitCode: "U1-000-065",
        condition: "new",
        ownership: "supplier_consignment",
        supplier: "Dorsettloft",
        dateIn: null,
        poNo: null,
      }),
    ],
    ...over,
  };
}

/** The cell and the row its disclosure opens, for ONE item line. */
function Harness({
  line = LINE_A,
  onSaved,
  onPendingChange,
}: {
  line?: string;
  onSaved?: (o: string, l: readonly string[]) => void;
  onPendingChange?: (o: string, pending: boolean) => void;
}) {
  const rs = useSoBatchReadyStock({ orderId: ORDER, so: 1251, onSaved, onPendingChange });
  return (
    <div>
      <div data-testid="cell-slot">{rs.cell(line)}</div>
      <div data-testid="detail-slot">{rs.detail(line)}</div>
    </div>
  );
}

function draw(
  data: ReadyStockResponse | (() => Promise<unknown>) = response(),
  props: Parameters<typeof Harness>[0] = {},
  saveResult: unknown = { reserved: 1, added: 1, released: 0, reference: "SO-1251", units: [] },
) {
  apiFetch.mockImplementation(async (path: string) => {
    if (typeof path === "string" && path.endsWith("/ready-stock")) {
      return typeof data === "function" ? data() : data;
    }
    return saveResult;
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Harness {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiFetch.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
});

/** The cell's own test id exists while the read is in flight, so waiting for
 *  the ELEMENT is not waiting for the ANSWER. This waits for the answer. */
async function settled(line = LINE_A): Promise<HTMLElement> {
  const cell = await screen.findByTestId(`ready-stock-cell-${line}`);
  await waitFor(() => expect(cell).not.toHaveTextContent("Loading…"));
  return cell;
}

async function openPicker(line = LINE_A) {
  await screen.findByTestId(`ready-stock-toggle-${line}`);
  fireEvent.click(screen.getByTestId(`ready-stock-toggle-${line}`));
  await screen.findByTestId(`ready-stock-detail-${line}`);
}

/* ─── THE CELL: FOUR STATES, AND NONE OF THEM IS A FALSE ZERO ───────────── */

describe("the cell", () => {
  it("states the two counts for THIS item line", async () => {
    draw();
    const cell = await settled();
    /* Two free exact Units match this line; the counted row is on the shelf and
       is not bindable, so it is shown in the table and not counted here. */
    expect(cell).toHaveTextContent("2 available");
    expect(cell).toHaveTextContent("0 reserved");
  });

  it("counts a saved reservation on the second line, and only this line's", async () => {
    draw(
      response({
        units: [
          unit({ itemId: UNIT_A, reservedForLineId: LINE_A, matchingLineIds: [LINE_A] }),
          unit({
            itemId: UNIT_CONSIGNED,
            unitCode: "U1-000-065",
            reservedForLineId: LINE_B,
            matchingLineIds: [LINE_B],
            lineIds: [LINE_B],
          }),
        ],
      }),
    );
    const cell = await settled();
    expect(cell).toHaveTextContent("0 available");
    expect(cell).toHaveTextContent("1 reserved");
  });

  /** ⛔ The one thing the ruling names twice: loading is never zero. */
  it("says it is loading rather than printing a zero", () => {
    draw(() => new Promise(() => {}));
    const cell = screen.getByTestId(`ready-stock-cell-${LINE_A}`);
    expect(cell).toHaveTextContent("Loading…");
    expect(cell).not.toHaveTextContent("0");
    expect(screen.queryByTestId(`ready-stock-toggle-${LINE_A}`)).toBeNull();
  });

  it("says the read failed, and offers a retry, rather than printing a zero", async () => {
    draw(async () => {
      throw new Error("network");
    });
    const cell = await settled();
    expect(cell).toHaveTextContent("Could not be read");
    expect(cell).not.toHaveTextContent("0 available");
    expect(within(cell).getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByTestId(`ready-stock-toggle-${LINE_A}`)).toBeNull();
  });

  it("prints `0` and NO disclosure only when a successful read found nothing", async () => {
    draw(response({ units: [] }));
    const cell = await settled();
    expect(cell).toHaveTextContent("0");
    expect(cell).not.toHaveTextContent("available");
    expect(screen.queryByTestId(`ready-stock-toggle-${LINE_A}`)).toBeNull();
  });

  /** A saved reservation stays reachable even when the shelf is empty. */
  it("keeps the disclosure when free stock is zero but a reservation is saved", async () => {
    draw(
      response({
        units: [unit({ itemId: UNIT_A, reservedForLineId: LINE_A })],
      }),
    );
    const cell = await settled();
    expect(cell).toHaveTextContent("0 available");
    expect(cell).toHaveTextContent("1 reserved");
    expect(screen.getByTestId(`ready-stock-toggle-${LINE_A}`)).toBeInTheDocument();
  });

  it("exposes the disclosure's expanded state to the keyboard", async () => {
    draw();
    const toggle = await screen.findByTestId(`ready-stock-toggle-${LINE_A}`);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAccessibleName("Show Ready Stock");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAccessibleName("Hide Ready Stock");
  });
});

/* ─── THE PICKER: THE SIX APPROVED COLUMNS ──────────────────────────────── */

describe("the stock table", () => {
  it("draws the approved six columns, in order", async () => {
    draw();
    await openPicker();
    const heads = screen
      .getAllByRole("columnheader")
      .map((h) => h.textContent?.trim())
      .filter(Boolean);
    expect(heads).toEqual([
      "Goods Received Date",
      "Stock Location",
      "Supplier",
      "PO No / Ref No",
      "Condition",
    ]);
  });

  it("puts the document reference and the Unit ID in ONE cell, on two lines", async () => {
    draw();
    await openPicker();
    const row = screen.getByTestId(`ready-stock-unit-${UNIT_A}`);
    const reference = within(row).getByText("PO-20260820-4827");
    expect(reference.parentElement).toHaveTextContent("U1-000-001");
    /* In full — a shortened number names a document that does not exist. */
    expect(within(row).queryByText("PO-260820-4827")).toBeNull();
  });

  it("states a missing receipt date and a missing document, and invents neither", async () => {
    draw();
    await openPicker();
    const row = screen.getByTestId(`ready-stock-unit-${UNIT_CONSIGNED}`);
    expect(within(row).getAllByText("Not recorded").length).toBe(2);
  });

  it("prints the receipt DATE without a time", async () => {
    draw();
    await openPicker();
    const row = screen.getByTestId(`ready-stock-unit-${UNIT_A}`);
    expect(row.textContent).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it("keeps Condition a grade, not availability", async () => {
    draw();
    await openPicker();
    const row = screen.getByTestId(`ready-stock-unit-${UNIT_A}`);
    expect(within(row).getByText("Display")).toBeInTheDocument();
    expect(within(row).getByRole("checkbox")).toBeEnabled();
  });

  it("names the actual location and the actual supplier", async () => {
    draw();
    await openPicker();
    const row = screen.getByTestId(`ready-stock-unit-${UNIT_A}`);
    expect(within(row).getByText("Carres Klang Warehouse")).toBeInTheDocument();
    expect(within(row).getByText("Nice Furniture")).toBeInTheDocument();
  });

  it("says when the goods belong to a supplier", async () => {
    draw();
    await openPicker();
    const row = screen.getByTestId(`ready-stock-unit-${UNIT_CONSIGNED}`);
    expect(within(row).getByText("Dorsettloft")).toBeInTheDocument();
    expect(within(row).getByText("Supplier owned")).toBeInTheDocument();
  });

  it("shows counted stock, refuses the choice, and never calls its key a Unit ID", async () => {
    draw();
    await openPicker();
    const row = screen.getByTestId(`ready-stock-unit-${UNIT_COUNTED}`);
    expect(within(row).queryByRole("checkbox")).toBeNull();
    expect(within(row).queryByText("QTY-000000001")).toBeNull();
    expect(within(row).getByText("Counted stock")).toBeInTheDocument();
  });

  /** The item line is structural now: there is nothing left to choose. */
  it("asks for no item line, because the picker opened under one", async () => {
    draw();
    await openPicker();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByText(/For item line/)).toBeNull();
  });

  it("scrolls sideways inside its own box rather than widening the page", async () => {
    draw();
    await openPicker();
    const detail = screen.getByTestId(`ready-stock-detail-${LINE_A}`);
    const scroller = detail.querySelector(".overflow-x-auto");
    expect(scroller).not.toBeNull();
    expect(scroller!.querySelector("table")).not.toBeNull();
  });

  it("states an empty shelf as a fact", async () => {
    draw(
      response({
        units: [unit({ itemId: UNIT_CONSIGNED, lineIds: [LINE_B], matchingLineIds: [LINE_B] })],
      }),
    );
    /* No free unit and no saved one on THIS line: the cell is `0` with no
       disclosure, so there is nothing to open. */
    const cell = await settled();
    expect(cell).toHaveTextContent("0");
    expect(screen.queryByTestId(`ready-stock-toggle-${LINE_A}`)).toBeNull();
  });
});

/* ─── THE DRAFT, AND THE ONE SAVE ───────────────────────────────────────── */

describe("the selection journey", () => {
  it("writes nothing while the operator ticks and unticks", async () => {
    draw();
    await openPicker();
    const row = screen.getByTestId(`ready-stock-unit-${UNIT_A}`);
    fireEvent.click(within(row).getByRole("checkbox"));
    expect(screen.getByTestId(`ready-stock-count-${LINE_A}`)).toHaveTextContent("1 chosen");
    fireEvent.click(within(row).getByRole("checkbox"));
    expect(screen.getByTestId(`ready-stock-count-${LINE_A}`)).toHaveTextContent("No Unit chosen");
    expect(apiFetch.mock.calls.every(([p]) => String(p).endsWith("/ready-stock"))).toBe(true);
  });

  it("offers `Choose Ready Unit` while nothing is saved, and sends the whole set", async () => {
    draw();
    await openPicker();
    fireEvent.click(
      within(screen.getByTestId(`ready-stock-unit-${UNIT_A}`)).getByRole("checkbox"),
    );
    fireEvent.click(screen.getByTestId(`ready-stock-save-${LINE_A}`));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    const post = apiFetch.mock.calls.find(([p]) => String(p).endsWith("/ready-stock/save"));
    expect(post).toBeTruthy();
    expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({
      orderId: ORDER,
      orderLineId: LINE_A,
      itemIds: [UNIT_A],
    });
  });

  it("saves a stock choice with no purchase order in sight", async () => {
    draw();
    await openPicker();
    fireEvent.click(
      within(screen.getByTestId(`ready-stock-unit-${UNIT_A}`)).getByRole("checkbox"),
    );
    fireEvent.click(screen.getByTestId(`ready-stock-save-${LINE_A}`));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(apiFetch.mock.calls.some(([p]) => String(p).includes("issue"))).toBe(false);
  });

  it("shows `Change selection` once a set is saved, and no per-Unit Undo", async () => {
    draw(response({ units: [unit({ itemId: UNIT_A, reservedForLineId: LINE_A })] }));
    await openPicker();
    expect(screen.getByTestId(`ready-stock-change-${LINE_A}`)).toHaveTextContent(
      "Change selection",
    );
    expect(screen.queryByTestId(`ready-stock-save-${LINE_A}`)).toBeNull();
    expect(screen.queryByRole("button", { name: /Undo|Release/ })).toBeNull();
  });

  it("reopens the saved set on `Change selection`", async () => {
    draw(
      response({
        units: [unit({ itemId: UNIT_A, reservedForLineId: LINE_A }), unit({ itemId: UNIT_CONSIGNED, unitCode: "U1-000-065" })],
      }),
    );
    await openPicker();
    fireEvent.click(screen.getByTestId(`ready-stock-change-${LINE_A}`));
    expect(
      within(screen.getByTestId(`ready-stock-unit-${UNIT_A}`)).getByRole("checkbox"),
    ).toBeChecked();
    expect(
      within(screen.getByTestId(`ready-stock-unit-${UNIT_CONSIGNED}`)).getByRole("checkbox"),
    ).not.toBeChecked();
    expect(screen.getByTestId(`ready-stock-save-${LINE_A}`)).toHaveTextContent("Save changes");
  });

  it("saves the replacement set — a Unit removed and a Unit added, in one act", async () => {
    draw(
      response({
        units: [unit({ itemId: UNIT_A, reservedForLineId: LINE_A }), unit({ itemId: UNIT_CONSIGNED, unitCode: "U1-000-065" })],
      }),
      {},
      { reserved: 1, added: 1, released: 1, reference: "SO-1251", units: [] },
    );
    await openPicker();
    fireEvent.click(screen.getByTestId(`ready-stock-change-${LINE_A}`));
    fireEvent.click(
      within(screen.getByTestId(`ready-stock-unit-${UNIT_A}`)).getByRole("checkbox"),
    );
    fireEvent.click(
      within(screen.getByTestId(`ready-stock-unit-${UNIT_CONSIGNED}`)).getByRole("checkbox"),
    );
    fireEvent.click(screen.getByTestId(`ready-stock-save-${LINE_A}`));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    const post = apiFetch.mock.calls.find(([p]) => String(p).endsWith("/ready-stock/save"));
    /* ONE call, carrying the COMPLETE intended set — never a release call
       followed by a reserve call. */
    expect(
      apiFetch.mock.calls.filter(([p]) => String(p).endsWith("/ready-stock/save")),
    ).toHaveLength(1);
    expect(JSON.parse(String((post![1] as RequestInit).body)).itemIds).toEqual([UNIT_CONSIGNED]);
  });

  /**
   * ⭐ THE SWAP THE OWNER'S JOURNEY NAMES. `matchingLineIds` is the server's
   * answer about the CURRENT saved state, so on a one-piece line that already
   * holds a Unit every free Unit reads `No item line needs it`. Giving one back
   * in the draft is what makes room for its replacement — and the door still
   * recomputes the line's requirement on the locked row.
   */
  it("frees a replacement once the draft gives a saved Unit back", async () => {
    draw(
      response({
        units: [
          unit({ itemId: UNIT_A, reservedForLineId: LINE_A, matchingLineIds: [] }),
          /* The line needs nothing more while A is saved, so the server offers
             this one against no line at all. */
          unit({
            itemId: UNIT_CONSIGNED, unitCode: "U1-000-065",
            matchingLineIds: [], blocked: "no_line_needs_it",
          }),
        ],
      }),
      {},
      { reserved: 1, added: 1, released: 1, reference: "SO-1251", units: [] },
    );
    await openPicker();
    fireEvent.click(screen.getByTestId(`ready-stock-change-${LINE_A}`));
    /* Before anything is given back there is no room, and the row says so. */
    expect(
      within(screen.getByTestId(`ready-stock-unit-${UNIT_CONSIGNED}`)).queryByRole("checkbox"),
    ).toBeNull();
    expect(screen.getByTestId(`ready-stock-unit-${UNIT_CONSIGNED}`)).toHaveTextContent(
      "No item line needs it",
    );
    /* Give A back — and the replacement becomes choosable. */
    fireEvent.click(
      within(screen.getByTestId(`ready-stock-unit-${UNIT_A}`)).getByRole("checkbox"),
    );
    const replacement = within(
      screen.getByTestId(`ready-stock-unit-${UNIT_CONSIGNED}`),
    ).getByRole("checkbox");
    fireEvent.click(replacement);
    /* And there is room for exactly ONE — the draft can never exceed what was
       saved plus what the server said was needed. */
    expect(screen.getByTestId(`ready-stock-count-${LINE_A}`)).toHaveTextContent("1 chosen");
    fireEvent.click(screen.getByTestId(`ready-stock-save-${LINE_A}`));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    const post = apiFetch.mock.calls.find(([p]) => String(p).endsWith("/ready-stock/save"));
    expect(JSON.parse(String((post![1] as RequestInit).body)).itemIds).toEqual([UNIT_CONSIGNED]);
  });

  it("still refuses counted stock, whatever the draft gave back", async () => {
    draw(
      response({
        units: [
          unit({ itemId: UNIT_A, reservedForLineId: LINE_A, matchingLineIds: [] }),
          unit({
            itemId: UNIT_COUNTED, unitCode: "QTY-000000001", identityScope: "quantity",
            qty: 893, matchingLineIds: [], blocked: "counted_stock",
          }),
        ],
      }),
    );
    await openPicker();
    fireEvent.click(screen.getByTestId(`ready-stock-change-${LINE_A}`));
    fireEvent.click(
      within(screen.getByTestId(`ready-stock-unit-${UNIT_A}`)).getByRole("checkbox"),
    );
    expect(
      within(screen.getByTestId(`ready-stock-unit-${UNIT_COUNTED}`)).queryByRole("checkbox"),
    ).toBeNull();
    expect(screen.getByTestId(`ready-stock-unit-${UNIT_COUNTED}`)).toHaveTextContent(
      "Counted stock",
    );
  });

  it("removes every choice — an empty set is a real instruction", async () => {
    draw(
      response({ units: [unit({ itemId: UNIT_A, reservedForLineId: LINE_A })] }),
      {},
      { reserved: 0, added: 0, released: 1, reference: "SO-1251", units: [] },
    );
    await openPicker();
    fireEvent.click(screen.getByTestId(`ready-stock-change-${LINE_A}`));
    fireEvent.click(
      within(screen.getByTestId(`ready-stock-unit-${UNIT_A}`)).getByRole("checkbox"),
    );
    fireEvent.click(screen.getByTestId(`ready-stock-save-${LINE_A}`));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    const post = apiFetch.mock.calls.find(([p]) => String(p).endsWith("/ready-stock/save"));
    expect(JSON.parse(String((post![1] as RequestInit).body)).itemIds).toEqual([]);
  });

  it("restores the saved set on `Cancel`, and writes nothing", async () => {
    draw(response({ units: [unit({ itemId: UNIT_A, reservedForLineId: LINE_A })] }));
    await openPicker();
    fireEvent.click(screen.getByTestId(`ready-stock-change-${LINE_A}`));
    fireEvent.click(
      within(screen.getByTestId(`ready-stock-unit-${UNIT_A}`)).getByRole("checkbox"),
    );
    expect(screen.getByTestId(`ready-stock-count-${LINE_A}`)).toHaveTextContent("No Unit chosen");
    fireEvent.click(screen.getByTestId(`ready-stock-cancel-${LINE_A}`));
    expect(screen.getByTestId(`ready-stock-count-${LINE_A}`)).toHaveTextContent("1 chosen");
    expect(apiFetch.mock.calls.every(([p]) => String(p).endsWith("/ready-stock"))).toBe(true);
  });

  it("holds `Save changes` until the set actually differs", async () => {
    draw(response({ units: [unit({ itemId: UNIT_A, reservedForLineId: LINE_A })] }));
    await openPicker();
    fireEvent.click(screen.getByTestId(`ready-stock-change-${LINE_A}`));
    expect(screen.getByTestId(`ready-stock-save-${LINE_A}`)).toBeDisabled();
    fireEvent.click(
      within(screen.getByTestId(`ready-stock-unit-${UNIT_A}`)).getByRole("checkbox"),
    );
    expect(screen.getByTestId(`ready-stock-save-${LINE_A}`)).toBeEnabled();
  });

  it("tells the Register an edit is pending, and that it is over once saved", async () => {
    const onPendingChange = vi.fn();
    draw(response(), { onPendingChange });
    await openPicker();
    fireEvent.click(
      within(screen.getByTestId(`ready-stock-unit-${UNIT_A}`)).getByRole("checkbox"),
    );
    await waitFor(() => expect(onPendingChange).toHaveBeenCalledWith(ORDER, true));
    fireEvent.click(screen.getByTestId(`ready-stock-save-${LINE_A}`));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    await waitFor(() =>
      expect(onPendingChange).toHaveBeenLastCalledWith(ORDER, false),
    );
  });

  it("tells the Register which item line was answered", async () => {
    const onSaved = vi.fn();
    draw(response(), { onSaved });
    await openPicker();
    fireEvent.click(
      within(screen.getByTestId(`ready-stock-unit-${UNIT_A}`)).getByRole("checkbox"),
    );
    fireEvent.click(screen.getByTestId(`ready-stock-save-${LINE_A}`));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(ORDER, [LINE_A]));
  });

  it("states what the act did, in Units", async () => {
    draw(response(), {}, { reserved: 2, added: 1, released: 1, reference: "SO-1251", units: [] });
    await openPicker();
    fireEvent.click(
      within(screen.getByTestId(`ready-stock-unit-${UNIT_A}`)).getByRole("checkbox"),
    );
    fireEvent.click(screen.getByTestId(`ready-stock-save-${LINE_A}`));
    const act = await screen.findByTestId(`ready-stock-act-${LINE_A}`);
    expect(act).toHaveTextContent("2 Units on this item line");
    expect(act).toHaveTextContent("1 added · 1 given back");
  });
});

/* ─── REFUSAL, AND THE OUTCOME NOBODY KNOWS ─────────────────────────────── */

describe("a refusal", () => {
  function drawRefusing(body: Record<string, unknown>, props: Parameters<typeof Harness>[0] = {}) {
    apiFetch.mockImplementation(async (path: string) => {
      if (String(path).endsWith("/ready-stock")) return response();
      const { ApiError } = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
      throw new ApiError(409, "conflict", body);
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <Harness {...props} />
      </QueryClientProvider>,
    );
  }

  it("prints the door's own sentence, names the Unit, and says nothing changed", async () => {
    drawRefusing({ code: "unit_no_longer_free", itemId: UNIT_CONSIGNED });
    await openPicker();
    for (const id of [UNIT_A, UNIT_CONSIGNED]) {
      fireEvent.click(within(screen.getByTestId(`ready-stock-unit-${id}`)).getByRole("checkbox"));
    }
    fireEvent.click(screen.getByTestId(`ready-stock-save-${LINE_A}`));
    const act = await screen.findByTestId(`ready-stock-act-${LINE_A}`);
    expect(act).toHaveTextContent("Someone else took that Unit.");
    expect(act).toHaveTextContent("Unit ID · U1-000-065");
    expect(act).toHaveTextContent("Nothing was changed.");
  });

  it("names a release the door would not make", async () => {
    drawRefusing({ code: "unit_cannot_be_released", itemId: UNIT_A });
    await openPicker();
    fireEvent.click(
      within(screen.getByTestId(`ready-stock-unit-${UNIT_A}`)).getByRole("checkbox"),
    );
    fireEvent.click(screen.getByTestId(`ready-stock-save-${LINE_A}`));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "That Unit cannot be given back — it has already left the shelf.",
      ),
    );
  });

  it("preserves the draft, so the operator unticks one rather than rebuilding", async () => {
    drawRefusing({ code: "unit_no_longer_free", itemId: UNIT_CONSIGNED });
    await openPicker();
    for (const id of [UNIT_A, UNIT_CONSIGNED]) {
      fireEvent.click(within(screen.getByTestId(`ready-stock-unit-${id}`)).getByRole("checkbox"));
    }
    fireEvent.click(screen.getByTestId(`ready-stock-save-${LINE_A}`));
    await screen.findByTestId(`ready-stock-act-${LINE_A}`);
    expect(screen.getByTestId(`ready-stock-count-${LINE_A}`)).toHaveTextContent("2 chosen");
  });

  it("tells the Register nothing when the act was refused", async () => {
    const onSaved = vi.fn();
    drawRefusing({ code: "unit_no_longer_free" }, { onSaved });
    await openPicker();
    fireEvent.click(
      within(screen.getByTestId(`ready-stock-unit-${UNIT_A}`)).getByRole("checkbox"),
    );
    fireEvent.click(screen.getByTestId(`ready-stock-save-${LINE_A}`));
    await screen.findByTestId(`ready-stock-act-${LINE_A}`);
    expect(onSaved).not.toHaveBeenCalled();
  });

  /**
   * ⭐ A TIMEOUT IS NOT A REFUSAL. A request that never came back says nothing
   * about a transaction that may well have COMMITTED, and `Nothing was changed.`
   * there is a guess wearing the clothes of a fact.
   */
  it("never claims nothing changed when the result is not known", async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (String(path).endsWith("/ready-stock")) return response();
      throw new Error("network timeout");
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    );
    await openPicker();
    fireEvent.click(
      within(screen.getByTestId(`ready-stock-unit-${UNIT_A}`)).getByRole("checkbox"),
    );
    fireEvent.click(screen.getByTestId(`ready-stock-save-${LINE_A}`));
    const act = await screen.findByTestId(`ready-stock-act-${LINE_A}`);
    expect(act).toHaveTextContent("could not confirm the result");
    expect(act).not.toHaveTextContent("Nothing was changed.");
    expect(act).toHaveTextContent("Check the Unit IDs above before choosing again.");
    await waitFor(() =>
      expect(screen.getByTestId(`ready-stock-count-${LINE_A}`)).toHaveTextContent(
        "No Unit chosen",
      ),
    );
  });

  it("drops last act's sentence the moment the draft moves", async () => {
    drawRefusing({ code: "unit_no_longer_free" });
    await openPicker();
    const row = screen.getByTestId(`ready-stock-unit-${UNIT_A}`);
    fireEvent.click(within(row).getByRole("checkbox"));
    fireEvent.click(screen.getByTestId(`ready-stock-save-${LINE_A}`));
    await screen.findByTestId(`ready-stock-act-${LINE_A}`);
    fireEvent.click(within(row).getByRole("checkbox"));
    expect(screen.queryByTestId(`ready-stock-act-${LINE_A}`)).toBeNull();
  });
});

/* ─── KEYBOARD ──────────────────────────────────────────────────────────── */

describe("keyboard", () => {
  it("gives every control an accessible name and keeps them focusable", async () => {
    draw();
    await openPicker();
    const box = screen.getByRole("checkbox", { name: "Choose U1-000-001" });
    box.focus();
    expect(box).toHaveFocus();
    fireEvent.click(box);
    const act = screen.getByTestId(`ready-stock-save-${LINE_A}`);
    act.focus();
    expect(act).toHaveFocus();
    expect(act).toBeEnabled();
  });
});

/* ─── THE APPROVED APPEARANCE (§6.8–6.9) ────────────────────────────────── */

describe("appearance and geometry", () => {
  it("draws the picker at its CONTENT width, never stretched to the canvas", async () => {
    draw();
    await openPicker();
    const table = screen.getByRole("table");
    /* 36 + 120 + 136 + 136 + 144 + 110 — the six measured columns, and the
       frame scrolls sideways when the window is narrower. */
    expect(table).toHaveStyle({ width: "682px" });
    expect(table.className).not.toContain("w-full");
  });

  it("reserves one header height, so the picker and the goods table line up", async () => {
    draw();
    await openPicker();
    const heads = screen
      .getAllByRole("columnheader")
      .filter((th) => (th.textContent ?? "").trim() !== "");
    expect(heads).toHaveLength(5);
    for (const th of heads) expect(th).toHaveStyle({ height: "40px" });
  });

  it("keeps the stock frame NEUTRAL — a boundary is not a saved reservation", async () => {
    draw(response({ units: [unit({ itemId: UNIT_A, reservedForLineId: LINE_A })] }));
    await openPicker();
    const frame = screen.getByTestId(`ready-stock-detail-${LINE_A}`).firstElementChild!;
    expect(frame.className).toContain("border-kit-slate-6");
    expect(frame.className).not.toContain("blue");
  });

  it("uses the kit's own controls, not a hand-rolled copy of the mockup", async () => {
    draw(response({ units: [unit({ itemId: UNIT_A, reservedForLineId: LINE_A })] }));
    await openPicker();
    /* The governed 32px, one blue per block. */
    const change = screen.getByTestId(`ready-stock-change-${LINE_A}`);
    expect(change.className).toContain("h-8");
    expect(change.className).toContain("bg-white");
    fireEvent.click(change);
    const save = screen.getByTestId(`ready-stock-save-${LINE_A}`);
    expect(save.className).toContain("h-8");
    expect(save.className).toContain("bg-kit-blue-9");
  });
});
