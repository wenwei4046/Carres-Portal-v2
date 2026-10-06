/**
 * ⭐ EVERY PERMITTED ORDER, THE SAME TOTAL, THE SAME EXPORT (SO A3-3,
 * 2026-10-06 · Orders MASTER §0.0 "Register, filters, reports and exports":
 * "More than 500 matching orders do not disappear; list, totals and
 * all-matching export reconcile; selected-row export is explicitly distinct;
 * pagination changes loading only").
 *
 * The server's ONE-ANSWER read (`useOperationOrders`) stops at the newest 500
 * orders; the Register's own read (`useSalesOrderRegisterOrders`) holds every
 * page. Both are seeded here exactly as the server answers them for a
 * 612-order population, so a Register that went back to the one-answer read
 * would show 500 rows, a `500 of 612` footer, a 500-order summary and a
 * 500-row export — and every test below would fail.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { operationOrderListRow } from "@/lib/queries";
import SalesOrdersRegister from "./SalesOrdersRegister";

const mocks = vi.hoisted(() => ({
  sheet: vi.fn((_data: unknown, _options?: unknown) => ({})),
  write: vi.fn(),
  pdf: vi.fn(async (_options: unknown) => new Blob()),
}));
vi.mock("xlsx", () => ({ utils: { json_to_sheet: mocks.sheet, book_new: () => ({}), book_append_sheet: vi.fn() }, writeFile: mocks.write }));
vi.mock("@/lib/pdf/render", () => ({ renderRegisterListPdf: mocks.pdf }));
vi.mock("@/components/kit/PdfPreview", () => ({ default: () => <div data-testid="pdf-preview">PDF pages</div> }));

const POPULATION = 612;
/* Newest first, as the server orders them. Even orders are unpaid, odd ones
   carry a RM 250 deposit, so two payment groups of 306 each. */
const ORDERS: operationOrderListRow[] = Array.from({ length: POPULATION }, (_, n) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  so: 30_000 - n,
  status: "proceed_order",
  operation_stage: "confirmed",
  warehouse_id: null,
  customer_name: n % 2 === 0 ? "Kimmy Tan" : "Ahmad",
  customer_phone: "019-3478913",
  placed_at: new Date(Date.UTC(2026, 9, 1) - n * 3_600_000).toISOString(),
  delivery_date: "2026-11-30",
  delivery_date_tbd: false,
  delivery_partner_id: null,
  request_for_delivery_at: null,
  partner_accepted_at: null,
  partner_rejected_at: null,
  partner_rejected_reason: null,
  delivery_partners: null,
  do_number: null,
  dispatched_at: null,
  delivered_at: null,
  outlet_id: null,
  dealer_id: "d-1",
  dealers: { name: "Carres Kelana Jaya" },
  order_supplier_threads: [],
  order_annotations: [],
  paid: n % 2 === 0 ? 0 : 250,
  order_lines: [{ sku: "B1201S-K", qty: 1, unit_price: 1000, label: "B1201S · King" }],
  order_addons: [],
  original_request: [{ revision: 1, snapshot: { header: { delivery_date: "2026-11-30", delivery_date_tbd: false } } }],
}) as operationOrderListRow);
const OLDEST_SO = `SO-${30_000 - (POPULATION - 1)}`;

type ListState = {
  data: { orders: operationOrderListRow[]; salesOrderTotal?: number | null } | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
};
const searchOf = (args: unknown[]) => (args[0] as { search?: string } | undefined)?.search ?? "";
/* React Query answers the SAME object until the data changes; a mock that
   built a new one per render would re-render the grid forever. */
const answers = new Map<string, ListState>();
function stable(key: string, build: () => ListState): ListState {
  if (!answers.has(key)) answers.set(key, build());
  return answers.get(key)!;
}
const matching = (search: string) => ORDERS.filter((o) => !search || o.customer_name.toLowerCase().includes(search.toLowerCase()));
/** `GET /api/operation/orders` without `paged`: the newest 500, the exact total. */
const oneAnswer = vi.fn((...args: unknown[]): ListState => stable(`one:${JSON.stringify(args[0] ?? {})}`, () => ({
  data: { orders: matching(searchOf(args)).slice(0, 500), salesOrderTotal: POPULATION },
  isLoading: false, isError: false, error: null, refetch: () => {},
})));
/** The Register's own read: every page, answered once complete. */
let everyPage: (...args: unknown[]) => ListState;
const everyPageSpy = vi.fn((...args: unknown[]) => everyPage(...args));
const EXPANSION = { data: { lines: [] }, isLoading: false, isError: false };
const CATALOG = { data: undefined };
const FACTS = { data: { facts: {}, failed: { obligations: false, cases: false } } };
const DEMAND = { data: undefined, isLoading: false, isError: false, error: null, refetch: () => {} };

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useOperationOrders: (...args: unknown[]) => oneAnswer(...args),
    useSalesOrderRegisterOrders: (...args: unknown[]) => everyPageSpy(...args),
    useSalesOrderExpansion: () => EXPANSION,
    useCatalog: () => CATALOG,
    useSalesOrderRegisterFacts: () => FACTS,
    useMonthlyDemandFacts: () => DEMAND,
  };
});

function mount(at = "/operation/orders") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[at]}>
        <SalesOrdersRegister />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const summary = () => screen.getByTestId("sales-orders-summary");
const summaryValue = (label: string) => within(summary()).getByText(label).nextElementSibling as HTMLElement;
const footer = () => screen.getByTestId("grid-footer");
async function exportCurrentViewAs(format: "Excel" | "PDF") {
  fireEvent.keyDown(screen.getByRole("button", { name: "Page tools" }), { key: "Enter" });
  fireEvent.click(screen.getByRole("menuitem", { name: "Export" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: format }));
}
const exportedSoNumbers = () => (mocks.sheet.mock.calls[0]![0] as Array<Record<string, string>>).map((row) => row["SO No"]);

beforeEach(() => {
  answers.clear();
  everyPage = (...args) => stable(`every:${JSON.stringify(args[0] ?? {})}`, () => ({
    data: { orders: matching(searchOf(args)), salesOrderTotal: POPULATION },
    isLoading: false, isError: false, error: null, refetch: () => {},
  }));
  everyPageSpy.mockClear();
  oneAnswer.mockClear();
  localStorage.clear();
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("A3-3 · more than 500 permitted orders", () => {
  it("lists all 612 — the oldest included — and asks for every page, not the newest 500", () => {
    mount();
    expect(everyPageSpy).toHaveBeenCalledWith({ stage: "proceeded" });
    expect(oneAnswer.mock.calls.some((args) => (args[0] as { stage?: string } | undefined)?.stage === "proceeded")).toBe(false);
    expect(screen.getAllByText(OLDEST_SO)).not.toHaveLength(0);
    expect(screen.getAllByRole("checkbox", { name: "Select row" })).toHaveLength(POPULATION);
  });

  it("the rail summary, the footer and the server total reconcile", () => {
    mount();
    expect(summaryValue("Sales orders")).toHaveTextContent(String(POPULATION));
    expect(summaryValue("Total payable")).toHaveTextContent("612,000");
    expect(summaryValue("Paid to date")).toHaveTextContent("76,500");
    expect(summaryValue("Balance due")).toHaveTextContent("535,500");
    /* Nothing narrows the list, so the footer is the plain count of all 612. */
    expect(footer()).toHaveTextContent(/^612 sales orders/);
    expect(footer()).not.toHaveTextContent(" of ");
  });

  it("Export Excel of the current view writes all 612 rows, the oldest included", async () => {
    mount();
    await exportCurrentViewAs("Excel");
    await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(1));
    expect(exportedSoNumbers()).toHaveLength(POPULATION);
    expect(exportedSoNumbers()).toContain(OLDEST_SO);
  });

  it("the list PDF of the current view carries the same 612 rows", async () => {
    /* jsdom has no object URLs; the preview only needs one to exist. */
    const blobUrls = URL as unknown as { createObjectURL?: unknown; revokeObjectURL?: unknown };
    const saved = { create: blobUrls.createObjectURL, revoke: blobUrls.revokeObjectURL };
    blobUrls.createObjectURL = () => "blob:preview";
    blobUrls.revokeObjectURL = () => {};
    try {
      mount();
      await exportCurrentViewAs("PDF");
      await waitFor(() => expect(mocks.pdf).toHaveBeenCalledTimes(1));
      expect((mocks.pdf.mock.calls[0]![0] as { rows: unknown[] }).rows).toHaveLength(POPULATION);
    } finally {
      blobUrls.createObjectURL = saved.create;
      blobUrls.revokeObjectURL = saved.revoke;
    }
  });

  it("a search over the whole population: list, summary, footer and export are the same 306", async () => {
    mount();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Kimmy" } });
    await waitFor(() => expect(footer()).toHaveTextContent(/^306 of 612 sales orders/));
    expect(everyPageSpy).toHaveBeenCalledWith({ stage: "proceeded", search: "Kimmy" });
    expect(summaryValue("Sales orders")).toHaveTextContent("306");
    expect(summaryValue("Total payable")).toHaveTextContent("306,000");
    await exportCurrentViewAs("Excel");
    await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(1));
    expect(exportedSoNumbers()).toHaveLength(306);
    expect(exportedSoNumbers()).toContain(`SO-${30_000 - 610}`);
  });

  it("ticked-row export stays exactly the ticked rows", async () => {
    mount();
    const boxes = screen.getAllByRole("checkbox", { name: "Select row" });
    fireEvent.click(boxes[0]!);
    fireEvent.click(boxes[POPULATION - 1]!);
    expect(footer()).toHaveTextContent(/^2 selected sales orders/);
    fireEvent.click(screen.getByRole("button", { name: /Export Excel \(2\)/ }));
    await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(1));
    expect(exportedSoNumbers()).toEqual(["SO-30000", OLDEST_SO]);
  });

  it("Group by counts every order of the population", () => {
    mount("/operation/orders?group=payment");
    expect(screen.getByTestId("grid-group-toggle-unpaid")).toHaveTextContent(/Unpaid\s*306/);
    expect(screen.getByTestId("grid-group-toggle-partial")).toHaveTextContent(/Partially paid\s*306/);
  });

  it("Cards show every order of the population", () => {
    mount("/operation/orders?view=cards");
    expect(within(screen.getByTestId("sales-orders-cards")).getAllByTestId(/^sales-order-card-/)).toHaveLength(POPULATION);
  });

  it("while pages are still loading, no count, total or footer number is printed", () => {
    everyPage = () => stable("loading", () => ({ data: undefined, isLoading: true, isError: false, error: null, refetch: () => {} }));
    mount();
    for (const label of ["Sales orders", "Total payable", "Paid to date", "Balance due"]) {
      expect(summaryValue(label)).toHaveTextContent(/^Loading$/);
    }
    expect(summary()).not.toHaveTextContent(/\d/);
    expect(footer()).toHaveTextContent(/^Loading…$/);
  });
});
