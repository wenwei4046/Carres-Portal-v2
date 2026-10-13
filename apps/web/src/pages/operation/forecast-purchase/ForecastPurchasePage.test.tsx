/**
 * FORECAST PURCHASE · OUTRIGHT — the page (owner 13 Oct 2026; Purchasing
 * MASTER §9.14). What it shows, what a tick means, why a tick is refused, and
 * that the review writes nothing while `Place PO` is not switched on.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ForecastPurchaseResponse, ForecastPurchaseSize } from "@carres/shared";

vi.mock("../components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
vi.mock("@/lib/api", async (original) => ({ ...(await original<typeof import("@/lib/api")>()), apiFetch: vi.fn() }));
import { apiFetch } from "@/lib/api";
import ForecastPurchasePage from "./ForecastPurchasePage";

const size = (over: Partial<ForecastPurchaseSize>): ForecastPurchaseSize => ({
  sku: "A-K", modelId: "a", model: "TEST model A", category: "mattress", size: "King",
  supplierId: "s1", supplier: "TEST Supplier One", sold: [0, 0, 0], sold14: 0, free: 0, onPo: 0, ...over,
});
const PAYLOAD: ForecastPurchaseResponse = {
  today: "2026-10-13",
  months: ["2026-08", "2026-09", "2026-10"],
  mondays: ["2026-10-12", "2026-10-19", "2026-10-26"],
  sizes: [
    // A · King: 6 in 14 days, level 6, cap 3, stock 1 (+1 on PO): suggest 3.
    size({ sku: "A-K", size: "King", sold: [2, 9, 6], sold14: 6, free: 1, onPo: 1 }),
    // A · Queen: enough stock.
    size({ sku: "A-Q", size: "Queen", sold: [1, 4, 2], sold14: 2, free: 5 }),
    // B · Queen: a suggestion and no supplier.
    size({ sku: "B-Q", modelId: "b", model: "TEST model B", size: "Queen", supplierId: null, supplier: null, sold: [0, 3, 4], sold14: 4 }),
    // C · Queen (bedframe, another supplier): suggest 1.
    size({ sku: "C-Q", modelId: "c", model: "TEST model C", category: "bedframe", size: "Queen", supplierId: "s2", supplier: "TEST Supplier Two", sold: [0, 2, 2], sold14: 2 }),
    // D never sold in the window: not listed.
    size({ sku: "D-Q", modelId: "d", model: "TEST model D", size: "Queen", free: 4 }),
  ],
};

function mount(path = "/operation?tab=forecast-purchase", answer: () => Promise<unknown> = async () => PAYLOAD) {
  vi.mocked(apiFetch).mockImplementation(answer as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}><ForecastPurchasePage /></MemoryRouter>
    </QueryClientProvider>,
  );
}
const rowNames = () => screen.getAllByTestId(/^forecast-model-/).map((cell) => cell.firstElementChild!.textContent);

beforeEach(() => { localStorage.clear(); vi.mocked(apiFetch).mockReset(); });

describe("Forecast Purchase · Outright", () => {
  it("reads the one forecast endpoint and lists the models that sold, best seller of last month first", async () => {
    mount();
    await screen.findByTestId("forecast-model-a");
    expect(apiFetch).toHaveBeenCalledWith("/api/operation/purchase/forecast");
    expect(rowNames()).toEqual(["TEST model A", "TEST model B", "TEST model C"]);
    expect(screen.queryByText("TEST model D")).not.toBeInTheDocument();
    expect(screen.getByTestId("forecast-model-a")).toHaveTextContent("TEST Supplier One · 2 sizes");
    expect(screen.getByTestId("forecast-model-b")).toHaveTextContent("Supplier not set · 1 size");
    expect(screen.getByTestId("forecast-footer")).toHaveTextContent("3 models · in pcs · suggestion only, you decide");
  });

  it("heads the columns with the three months, Free stock and the three Mondays", async () => {
    mount();
    await screen.findByTestId("forecast-model-a");
    const heads = screen.getAllByRole("columnheader").map((th) => th.textContent?.replace(/\s+/g, " ").trim()).filter(Boolean);
    expect(heads).toEqual(["Model", "Aug", "Sep", "Oct", "Free stock", "12 Oct Mon", "19 Oct Mon", "26 Oct Mon"]);
    // This month carries the neutral column band, and no other column does.
    expect(screen.getByRole("columnheader", { name: /^Oct/ }).className).toMatch(/thBand/);
    expect(screen.getByRole("columnheader", { name: /^Sep/ }).className).not.toMatch(/thBand/);
  });

  it("a model row adds its sizes: sold per month, free stock with what is on a PO, and each Monday", async () => {
    mount();
    await screen.findByTestId("forecast-model-a");
    expect(screen.getByTestId("forecast-sold-0-a")).toHaveTextContent("3");
    expect(screen.getByTestId("forecast-sold-1-a")).toHaveTextContent("13");
    expect(screen.getByTestId("forecast-sold-2-a")).toHaveTextContent("8");
    expect(screen.getByTestId("forecast-free-a")).toHaveTextContent("7");
    expect(screen.getByTestId("forecast-week-0-a")).toHaveTextContent("3");
  });

  it("opens to one line per size, in the fixed order, with a greyed tick that says why", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("forecast-expand-a"));
    const lines = within(screen.getByTestId("forecast-sizes-a"));
    expect(lines.getAllByTestId(/^forecast-size-[A-Z]/).map((line) => line.getAttribute("data-testid"))).toEqual(["forecast-size-A-K", "forecast-size-A-Q"]);
    expect(lines.getByTestId("forecast-size-tick-A-K")).toBeEnabled();
    const refused = lines.getByTestId("forecast-size-tick-A-Q");
    expect(refused).toBeDisabled();
    expect(refused).toHaveAccessibleName("Select TEST model A Queen. Enough stock · nothing to buy");
  });

  it("a model with no supplier cannot be ticked, and says so", async () => {
    mount();
    const box = await screen.findByTestId("forecast-select-b");
    expect(box).toBeDisabled();
    expect(box.closest("label")).toHaveAccessibleName("Supplier not set");
  });

  it("a model tick takes every size that has a suggestion; the bar counts items, pcs and POs", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("forecast-select-a"));
    expect(screen.getByTestId("selection-bar")).toHaveTextContent("1 item selected · 3 pcs · 1 PO");
    expect(screen.getByTestId("forecast-create")).toHaveTextContent("Create 1 PO");
    // Another supplier and category is another PO.
    fireEvent.click(screen.getByTestId("forecast-select-c"));
    expect(screen.getByTestId("selection-bar")).toHaveTextContent("2 items selected · 4 pcs · 2 POs");
    expect(screen.getByTestId("forecast-create")).toHaveTextContent("Create 2 POs");
  });

  it("the Summary gives this Monday's suggestion that can be ordered, the next two Mondays, and by supplier", async () => {
    mount();
    await screen.findByTestId("forecast-model-a");
    // 3 (A King) + 1 (C Queen); B has no supplier and is not in the headline.
    expect(screen.getByTestId("forecast-summary-now")).toHaveTextContent("4pcsSuggested");
    expect(screen.getByTestId("forecast-summary-week")).toHaveTextContent("Mon, 12 Oct");
    expect(screen.getByTestId("forecast-summary-week-1")).toHaveTextContent("Mon, 19 Oct");
    expect(screen.getByTestId("forecast-summary-week-2")).toHaveTextContent("Mon, 26 Oct");
    const suppliers = screen.getByTestId("forecast-summary-suppliers");
    expect(suppliers).toHaveTextContent("TEST Supplier One3 pcs");
    expect(suppliers).toHaveTextContent("TEST Supplier Two1 pc");
  });

  it("Suggested keeps the models with a size to consider; Ordered is empty until a PO can be placed here", async () => {
    mount("/operation?tab=forecast-purchase&show=suggested", async () => ({
      ...PAYLOAD, sizes: [...PAYLOAD.sizes, size({ sku: "E-Q", modelId: "e", model: "TEST model E", size: "Queen", sold: [0, 1, 0], free: 2 })],
    }));
    await screen.findByTestId("forecast-model-a");
    expect(rowNames()).toEqual(["TEST model A", "TEST model B", "TEST model C"]);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "All" }));
    expect(rowNames()).toContain("TEST model E");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Ordered" }));
    expect(await screen.findByText("No forecast PO this week.")).toBeInTheDocument();
  });

  it("the review lists what is ticked, and Place PO and Skip this week are not switched on", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("forecast-select-a"));
    fireEvent.click(screen.getByTestId("forecast-create"));
    const review = await screen.findByRole("dialog");
    expect(review).toHaveTextContent("Review 1 PO");
    expect(review).toHaveTextContent("3 pcs · Outright · back to stock level");
    expect(within(review).getByTestId("forecast-review-line-A-K")).toHaveTextContent("TEST model AKing3 pcsTEST Supplier One");
    expect(within(review).getByTestId("forecast-review-place")).toBeDisabled();
    expect(within(review).getByTestId("forecast-review-skip")).toBeDisabled();
    fireEvent.click(within(review).getByTestId("forecast-review-back"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // Only the read was ever called: nothing was written.
    expect(vi.mocked(apiFetch).mock.calls.every(([path]) => path === "/api/operation/purchase/forecast")).toBe(true);
  });

  it("says so when the forecast cannot be read, and offers to try again", async () => {
    mount(undefined, async () => { throw new Error("boom"); });
    expect(await screen.findByTestId("forecast-error")).toHaveTextContent("The forecast could not be read. Try again.");
  });

  it("says nothing was sold when no model sold in the three months", async () => {
    mount(undefined, async () => ({ ...PAYLOAD, sizes: [] }));
    expect(await screen.findByText(/there is nothing to suggest/)).toBeInTheDocument();
  });
});
