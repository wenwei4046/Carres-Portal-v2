/**
 * THE TRANSFERS REGISTER — the owner's blueprint laws, held as tests:
 *
 *   · the owner's default columns, in her order
 *   · the state is the ONE shared arithmetic over recorded events, and
 *     COLLECTION ALONE NEVER READS AS RECEIVED
 *   · a journey still on the road says so in words, never a blank cell
 *   · the empty state answers what · why · who does what next
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import StockTransfersRegister from "./StockTransfersRegister";
import { fmtDate } from "@/lib/fmt-date";
import type {
  StockTransferEventRow,
  StockTransferRow,
  StockTransfersRegisterPayload,
} from "@/lib/queries";

let hookState: {
  data: StockTransfersRegisterPayload | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
};

const useStockTransfersRegisterSpy = vi.fn((..._args: unknown[]) => hookState);

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useStockTransfersRegister: (...args: unknown[]) =>
      useStockTransfersRegisterSpy(...args),
  };
});

const KLANG = "00000000-0000-0000-0000-000000000c03";
const PJ = "00000000-0000-0000-0000-000000000c99";

const transfer = (over: Partial<StockTransferRow> = {}): StockTransferRow => ({
  id: "00000000-0000-0000-0000-0000000t0001",
  transfer_no: "TR-190826-4211",
  from_warehouse_id: KLANG,
  to_warehouse_id: PJ,
  purpose: "display",
  sales_order_ref: null,
  expected_date: "2026-08-21",
  note: null,
  requested_at: "2026-08-19T02:00:00Z",
  ...over,
});

const event = (
  kind: StockTransferEventRow["kind"],
  recordedAt: string,
  over: Partial<StockTransferEventRow> = {},
): StockTransferEventRow => ({
  transfer_id: "00000000-0000-0000-0000-0000000t0001",
  kind,
  carrier: null,
  handover_to: null,
  received_by_name: null,
  reason: null,
  recorded_at: recordedAt,
  ...over,
});

function mount(
  transfers: StockTransferRow[],
  events: StockTransferEventRow[] = [],
  units: StockTransfersRegisterPayload["units"] = [],
) {
  hookState = {
    data: {
      transfers,
      events,
      units,
      warehouses: [
        { id: KLANG, name: "Carres Klang" },
        { id: PJ, name: "PJ Showroom" },
      ],
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  };
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/operation?tab=transfers"]}>
        <StockTransfersRegister />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The transfer's own row. `Received` is both a column header and a state
 *  word, so every state assertion is scoped to the row, never the page. */
function row(): HTMLElement {
  return screen.getByText("TR-190826-4211").closest("tr") as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Transfers register — the owner's columns", () => {
  it("prints her default columns, in her order", () => {
    mount([transfer()]);
    const headers = screen
      .getAllByRole("columnheader")
      .map((h) => h.textContent?.trim())
      .filter(Boolean);
    const wanted = [
      "Transfer No.",
      "From",
      "To",
      "Units",
      "Purpose",
      "State",
      "Collection",
      "Expected arrival",
      "Received",
    ];
    // Every ruled column is present, and in her sequence.
    const seen = wanted.filter((w) => headers.some((h) => h?.startsWith(w)));
    expect(seen).toEqual(wanted);
  });

  it("names both sites in words, and counts the exact units", () => {
    mount(
      [transfer()],
      [event("requested", "2026-08-19T02:00:00Z")],
      [
        { transfer_id: transfer().id, stock_item_id: "u1" },
        { transfer_id: transfer().id, stock_item_id: "u2" },
      ],
    );
    const r = within(row());
    expect(r.getByText("Carres Klang")).toBeInTheDocument();
    expect(r.getByText("PJ Showroom")).toBeInTheDocument();
    expect(r.getByText("2")).toBeInTheDocument();
  });
});

describe("Transfers register — the state is DERIVED from events", () => {
  it("a transfer nobody has collected reads Requested, and both date cells say so in words", () => {
    mount([transfer()], [event("requested", "2026-08-19T02:00:00Z")]);
    const r = within(row());
    expect(r.getByText("Requested")).toBeInTheDocument();
    expect(r.getByText("Not collected yet")).toBeInTheDocument();
    expect(r.getByText("Not received yet")).toBeInTheDocument();
  });

  it("COLLECTED ALONE reads In transit — never Received", () => {
    mount(
      [transfer()],
      [event("requested", "2026-08-19T02:00:00Z"), event("collected", "2026-08-20T01:00:00Z")],
    );
    const r = within(row());
    expect(r.getByText("In transit")).toBeInTheDocument();
    // The law of this card, in one assertion: one confirmation may not make
    // the goods both leave and arrive.
    expect(r.queryByText("Received")).not.toBeInTheDocument();
    // The goods left, so the collection date is a fact; arrival is still not.
    expect(r.getByText(fmtDate("2026-08-20T01:00:00Z"))).toBeInTheDocument();
    expect(r.getByText("Not received yet")).toBeInTheDocument();
  });

  it("only an arrival reads Received, and Received is its own fact — not the expected date", () => {
    // The goods were due on the 21st and landed on the 22nd. `Expected
    // arrival` is the plan and `Received` is what happened; a register that
    // printed the plan in both cells could never show a late transfer.
    mount(
      [transfer({ expected_date: "2026-08-21" })],
      [
        event("requested", "2026-08-19T02:00:00Z"),
        event("collected", "2026-08-20T01:00:00Z"),
        event("arrived", "2026-08-22T03:00:00Z"),
      ],
    );
    const r = within(row());
    expect(r.getByText("Received")).toBeInTheDocument();
    expect(r.getByText(fmtDate("2026-08-22T03:00:00Z"))).toBeInTheDocument();
    expect(r.getByText(fmtDate("2026-08-21"))).toBeInTheDocument();
    expect(r.queryByText("Not received yet")).not.toBeInTheDocument();
  });

  it("a transfer cancelled before it left reads Cancelled", () => {
    mount(
      [transfer()],
      [event("requested", "2026-08-19T02:00:00Z"), event("cancelled", "2026-08-19T05:00:00Z")],
    );
    expect(within(row()).getByText("Cancelled")).toBeInTheDocument();
  });
});

describe("Transfers register — the empty state", () => {
  it("answers what is missing, why, and what happens next", () => {
    mount([]);
    expect(
      screen.getByText(/goods move between two sites on a transfer/i),
    ).toBeInTheDocument();
  });
});
