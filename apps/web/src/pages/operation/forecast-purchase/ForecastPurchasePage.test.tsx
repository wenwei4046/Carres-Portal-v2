/**
 * FORECAST PURCHASE · OUTRIGHT — the page (owner 13 Oct 2026; Purchasing
 * MASTER §9.14). What it shows, what a tick means, why a tick is refused, and
 * the one write: `Send for approval` raises Manual Purchase Requests through
 * the existing door and never issues a PO (owner ruling 2026-10-14, A).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ForecastPurchaseResponse, ForecastPurchaseSize } from "@carres/shared";

vi.mock("../components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
vi.mock("@/lib/api", async (original) => ({ ...(await original<typeof import("@/lib/api")>()), apiFetch: vi.fn() }));
vi.mock("@/components/kit/Toast", async (original) => ({ ...(await original<typeof import("@/components/kit/Toast")>()), notify: vi.fn() }));
import { apiFetch } from "@/lib/api";
import { notify } from "@/components/kit/Toast";
import ForecastPurchasePage from "./ForecastPurchasePage";

const size = (over: Partial<ForecastPurchaseSize>): ForecastPurchaseSize => ({
  sku: "A-K", modelId: "a", model: "TEST model A", category: "mattress", size: "King",
  supplierId: "s1", supplier: "TEST Supplier One", sold: [0, 0, 0], sold14: 0, free: 0, onPo: 0, requested: 0, requests: [], ...over,
});
const PAYLOAD: ForecastPurchaseResponse = {
  today: "2026-10-13",
  months: ["2026-08", "2026-09", "2026-10"],
  mondays: ["2026-10-12", "2026-10-19", "2026-10-26"],
  deliverTo: { id: "d1", name: "TEST Warehouse" },
  minDeliveryDays: 0,
  approver: { id: "u-approver", name: "TEST Approver" },
  poDuty: { id: "u-duty", name: "TEST Duty" },
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

const FORECAST = "/api/operation/purchase/forecast";
const PLAN = "/api/operation/purchasing/requests/plan";
const REQUESTS = "/api/operation/purchasing/requests";
/** The plan's answer: every asked SKU arrives on the given date (null = production days not set). */
const planFor = (arrival: (sku: string) => string | null) => (body: { skus: string[] }) => ({
  proceedDate: "2026-10-13", planUnavailable: false, deliveryDateDefault: null,
  lines: body.skus.map((sku) => ({ sku, supplierId: "s", supplierName: "s", category: "mattress", productionDays: 7, arrival: arrival(sku) })),
});
type Answers = { forecast?: () => Promise<unknown>; plan?: (body: { skus: string[] }) => unknown; create?: (body: Record<string, unknown>) => unknown };
function mount(path = "/operation?tab=forecast-purchase", answers: Answers | (() => Promise<unknown>) = {}) {
  const a: Answers = typeof answers === "function" ? { forecast: answers } : answers;
  vi.mocked(apiFetch).mockImplementation((async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (url === FORECAST) return (a.forecast ?? (async () => PAYLOAD))();
    if (url === PLAN) return (a.plan ?? planFor(() => "2026-10-20"))(body);
    if (url === REQUESTS && init?.method === "POST") return (a.create ?? (() => ({ id: "new-request", approval_required: true })))(body);
    throw new Error(`unexpected call ${url}`);
  }) as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}><ForecastPurchasePage /></MemoryRouter>
    </QueryClientProvider>,
  );
}
const rowNames = () => screen.getAllByTestId(/^forecast-model-/).map((cell) => cell.firstElementChild!.textContent);
/** Open a model's sizes. The list remembers an opened row for the visit, so a
 *  row an earlier test opened is already open here. */
async function openSizes(modelId: string) {
  await screen.findByTestId(`forecast-model-${modelId}`);
  if (!screen.queryByTestId(`forecast-sizes-${modelId}`)) fireEvent.click(screen.getByTestId(`forecast-expand-${modelId}`));
  return screen.findByTestId(`forecast-sizes-${modelId}`);
}

beforeEach(() => { localStorage.clear(); vi.mocked(apiFetch).mockReset(); vi.mocked(notify).mockReset(); });

describe("Forecast Purchase · Outright", () => {
  it("reads the one forecast endpoint and lists the models that sold, best seller of last month first", async () => {
    mount();
    await screen.findByTestId("forecast-model-a");
    expect(apiFetch).toHaveBeenCalledWith(FORECAST);
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
    const lines = within(await openSizes("a"));
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
    expect(screen.getByTestId("forecast-review-open")).toHaveTextContent("Review 1 PO");
    // Another supplier and category is another PO.
    fireEvent.click(screen.getByTestId("forecast-select-c"));
    expect(screen.getByTestId("selection-bar")).toHaveTextContent("2 items selected · 4 pcs · 2 POs");
    expect(screen.getByTestId("forecast-review-open")).toHaveTextContent("Review 2 POs");
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

  it("Suggested keeps the models with a suggestion; Ordered keeps the models with stock on its way", async () => {
    mount("/operation?tab=forecast-purchase&show=suggested", async () => ({
      ...PAYLOAD, sizes: [...PAYLOAD.sizes, size({ sku: "E-Q", modelId: "e", model: "TEST model E", size: "Queen", sold: [0, 1, 0], free: 2 })],
    }));
    await screen.findByTestId("forecast-model-a");
    expect(rowNames()).toEqual(["TEST model A", "TEST model B", "TEST model C"]);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "All" }));
    expect(rowNames()).toContain("TEST model E");
    // Model A has 1 pc on a PO: it is the only model with stock on its way.
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Ordered" }));
    expect(rowNames()).toEqual(["TEST model A"]);
  });

  it("Ordered says so when nothing is waiting for approval or on a PO", async () => {
    mount("/operation?tab=forecast-purchase&show=ordered", async () => ({ ...PAYLOAD, sizes: [size({ sku: "A-Q", size: "Queen", sold: [1, 4, 2], sold14: 2 })] }));
    expect(await screen.findByText("Nothing is waiting for approval or on a PO.")).toBeInTheDocument();
  });

  it("a size already asked for is not suggested again: its tick says where the request stands, and the request opens", async () => {
    mount(undefined, async () => ({ ...PAYLOAD, sizes: [
      // 6 in 14 days, level 6; 6 already asked for: nothing more to suggest.
      size({ sku: "A-K", size: "King", sold: [2, 9, 6], sold14: 6, requested: 6, requests: [{ id: "r1", no: "MPR-TEST-1", qty: 6, state: "waiting" }] }),
      size({ sku: "A-Q", size: "Queen", sold: [1, 4, 2], sold14: 2, free: 1, onPo: 1 }),
    ] }));
    expect(await screen.findByTestId("forecast-week-0-a")).toHaveTextContent("0");
    // Asked for is not stock yet: Free stock still reads what is here or on a PO.
    expect(screen.getByTestId("forecast-free-a")).toHaveTextContent("2");
    expect(screen.getByTestId("forecast-select-a").closest("label")).toHaveAccessibleName("Waiting for approval");
    await openSizes("a");
    const request = screen.getByTestId("forecast-size-request-A-K-r1");
    expect(request).toHaveTextContent("MPR-TEST-1 · 6 pcs · Waiting for approval");
    expect(request).toHaveAttribute("href", "/operation?tab=manual-purchase&mp=r1");
    expect(screen.getByTestId("forecast-size-tick-A-K")).toHaveAccessibleName("Select TEST model A King. Waiting for approval");
    expect(screen.getByTestId("forecast-size-onpo-A-Q")).toHaveTextContent("On PO · 1 pc");
  });

  it("the review lists what is ticked, when each request is asked to arrive, where it goes and who acts next", async () => {
    mount(undefined, { plan: planFor((sku) => (sku === "C-Q" ? "2026-10-23" : "2026-10-20")) });
    fireEvent.click(await screen.findByTestId("forecast-select-a"));
    fireEvent.click(screen.getByTestId("forecast-select-c"));
    fireEvent.click(screen.getByTestId("forecast-review-open"));
    const review = await screen.findByRole("dialog");
    expect(review).toHaveTextContent("Review 2 POs");
    expect(review).toHaveTextContent("4 pcs · Outright · back to stock level");
    expect(within(review).getByTestId("forecast-review-line-A-K")).toHaveTextContent("TEST model AKing3 pcsTEST Supplier One");
    await waitFor(() => expect(within(review).getByTestId("forecast-review-group-s1|mattress")).toHaveTextContent("TEST Supplier One · MattressDelivery Date Tue, 20 Oct"));
    expect(within(review).getByTestId("forecast-review-group-s2|bedframe")).toHaveTextContent("TEST Supplier Two · BedframeDelivery Date Fri, 23 Oct");
    expect(within(review).getByTestId("forecast-review-deliver-to")).toHaveTextContent("TEST Warehouse");
    expect(within(review).getByTestId("forecast-review-who")).toHaveTextContent("TEST Approver approves. TEST Duty then issues the PO and sends it to the supplier.");
    // The page offers no way to issue, skip or undo.
    expect(within(review).queryByText(/Place|Issue PO|Skip|Undo/)).not.toBeInTheDocument();
  });

  it("Send for approval raises one Ready Stock request per supplier and category through the existing door, and nothing else", async () => {
    const created: Array<Record<string, unknown>> = [];
    mount(undefined, { plan: planFor((sku) => (sku === "C-Q" ? "2026-10-23" : "2026-10-20")), create: (body) => { created.push(body); return { id: `r${created.length}`, approval_required: true }; } });
    fireEvent.click(await screen.findByTestId("forecast-select-a"));
    fireEvent.click(screen.getByTestId("forecast-select-c"));
    fireEvent.click(screen.getByTestId("forecast-review-open"));
    const send = await screen.findByTestId("forecast-review-send");
    expect(send).toHaveTextContent("Send for approval");
    await waitFor(() => expect(send).toBeEnabled());
    fireEvent.click(send);
    await waitFor(() => expect(notify).toHaveBeenCalledWith("success", "2 requests sent for approval"));
    expect(created).toEqual([
      { purpose: "ready_stock", destinationId: "d1", requiredBy: "2026-10-20", fulfilmentIntent: "additional_stock",
        purchaseRequirement: "Forecast Purchase · week of Mon, 12 Oct 26", lines: [{ sku: "A-K", qty: 3, requiredBy: "2026-10-20" }] },
      { purpose: "ready_stock", destinationId: "d1", requiredBy: "2026-10-23", fulfilmentIntent: "additional_stock",
        purchaseRequirement: "Forecast Purchase · week of Mon, 12 Oct 26", lines: [{ sku: "C-Q", qty: 1, requiredBy: "2026-10-23" }] },
    ]);
    // The review closes, the ticks are gone and the forecast is read again.
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByTestId("selection-bar")).not.toBeInTheDocument();
    await waitFor(() => expect(vi.mocked(apiFetch).mock.calls.filter(([url]) => url === FORECAST).length).toBeGreaterThan(1));
    // Every call was the read, the plan, or the existing request door.
    expect(new Set(vi.mocked(apiFetch).mock.calls.map(([url]) => url))).toEqual(new Set([FORECAST, PLAN, REQUESTS]));
  });

  it("a Delivery Date is never earlier than the Settings floor", async () => {
    const created: Array<Record<string, unknown>> = [];
    mount(undefined, { forecast: async () => ({ ...PAYLOAD, minDeliveryDays: 14 }), create: (body) => { created.push(body); return { id: "r1", approval_required: true }; } });
    fireEvent.click(await screen.findByTestId("forecast-select-a"));
    fireEvent.click(screen.getByTestId("forecast-review-open"));
    const send = await screen.findByTestId("forecast-review-send");
    await waitFor(() => expect(send).toBeEnabled());
    // The plan says 20 Oct; today (13 Oct) + 14 days is 27 Oct.
    expect(screen.getByTestId("forecast-review-group-s1|mattress")).toHaveTextContent("Delivery Date Tue, 27 Oct");
    fireEvent.click(send);
    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]).toMatchObject({ requiredBy: "2026-10-27" });
  });

  it("cannot be sent while production days are not set, and names the fix", async () => {
    mount(undefined, { plan: planFor(() => null) });
    fireEvent.click(await screen.findByTestId("forecast-select-a"));
    fireEvent.click(screen.getByTestId("forecast-review-open"));
    const review = await screen.findByRole("dialog");
    await waitFor(() => expect(review).toHaveTextContent("Production days are not set"));
    expect(review).toHaveTextContent("Add production days for TEST Supplier One · Mattress in Settings");
    const send = within(review).getByTestId("forecast-review-send");
    expect(send).toBeDisabled();
    expect(send).toHaveAttribute("title", "Send: lead days are not set");
  });

  it("cannot be sent with no default Deliver To, and says where to set it", async () => {
    mount(undefined, async () => ({ ...PAYLOAD, deliverTo: null }));
    fireEvent.click(await screen.findByTestId("forecast-select-a"));
    fireEvent.click(screen.getByTestId("forecast-review-open"));
    const review = await screen.findByRole("dialog");
    expect(within(review).getByTestId("forecast-review-deliver-to")).toHaveTextContent("No default Deliver To is set. Set one in Purchasing → Settings.");
    await waitFor(() => expect(vi.mocked(apiFetch).mock.calls.some(([url]) => url === PLAN)).toBe(true));
    expect(within(review).getByTestId("forecast-review-send")).toBeDisabled();
  });

  it("says nobody holds Purchasing Approver when the duty has no holder", async () => {
    mount(undefined, async () => ({ ...PAYLOAD, approver: null, poDuty: null }));
    fireEvent.click(await screen.findByTestId("forecast-select-a"));
    fireEvent.click(screen.getByTestId("forecast-review-open"));
    expect(await screen.findByTestId("forecast-review-who")).toHaveTextContent("Nobody holds Purchasing Approver. PO Duty then issues the PO and sends it to the supplier.");
  });

  it("a refusal stops the rest, keeps the review open and says how many were sent", async () => {
    let calls = 0;
    mount(undefined, { create: () => { calls += 1; if (calls === 2) throw new Error("TEST refusal from the door."); return { id: "r1", approval_required: true }; } });
    fireEvent.click(await screen.findByTestId("forecast-select-a"));
    fireEvent.click(screen.getByTestId("forecast-select-c"));
    fireEvent.click(screen.getByTestId("forecast-review-open"));
    const send = await screen.findByTestId("forecast-review-send");
    await waitFor(() => expect(send).toBeEnabled());
    fireEvent.click(send);
    expect(await screen.findByTestId("forecast-review-error")).toHaveTextContent("1 of 2 requests sent for approval. The rest were not sent. TEST refusal from the door.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(notify).not.toHaveBeenCalled();
  });

  it("says so when the forecast cannot be read, and offers to try again", async () => {
    mount(undefined, { forecast: async () => { throw new Error("boom"); } });
    expect(await screen.findByTestId("forecast-error")).toHaveTextContent("The forecast could not be read. Try again.");
  });

  it("says nothing was sold when no model sold in the three months", async () => {
    mount(undefined, async () => ({ ...PAYLOAD, sizes: [] }));
    expect(await screen.findByText(/there is nothing to suggest/)).toBeInTheDocument();
  });
});
