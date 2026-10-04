import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReadyStockResponse, SoBatchOrderRow } from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useWholeRoundReadyStock } from "./useWholeRoundReadyStock";
const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async () => ({ ...await vi.importActual<typeof import("@/lib/api")>("@/lib/api"), apiFetch: api }));
const LINE = "22222222-2222-4222-8222-222222222222";
const UNIT = "33333333-3333-4333-8333-333333333333";
const order = { orderId: "o1", proceededAt: "2026-09-01", requestedDeliveryDate: "2026-10-12" } as SoBatchOrderRow;
function stock(reserved = false): ReadyStockResponse {
  return { orderId: "o1", so: 1, reference: "SO-1", lines: [{ orderLineId: LINE,
    sku: "A", item: "A", qty: 1, reservedQty: reserved ? 1 : 0, reservedUnitCodes: [], onPoQty: 0, remainingQty: reserved ? 0 : 1 }],
    units: [{ itemId: UNIT, unitCode: "U1-001", identityScope: "unit", sku: "A", condition: "new",
      siteName: "Carres Klang", warehouseId: "klang", holderName: null, ownership: "carres_owned", supplier: null,
      qty: 1, dateIn: "2026-09-01", matchingLineIds: [LINE], blocked: null, reservedForLineId: reserved ? LINE : null }] };
}
const changed = vi.fn();
function Harness({ orders = [order], visible = ["o1"] }: { orders?: SoBatchOrderRow[]; visible?: string[] }) {
  const model = useWholeRoundReadyStock(changed);
  return <><button onClick={() => void model.match(orders)}>Match</button>
    <button onClick={() => model.toggle(model.offers.flatMap(offer => offer.units.map(unit => unit.itemId)), true)}>Choose</button>
    <button onClick={() => void model.proceed(new Set(visible))}>Proceed</button>
    <output data-testid="state">{JSON.stringify({ active: model.active, count: model.offers.length,
      chosen: model.chosen.size, unknown: model.unknown, busy: model.busy, error: model.error })}</output></>;
}
function draw(orders?: SoBatchOrderRow[], visible?: string[]) {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Harness orders={orders} visible={visible} /></QueryClientProvider>);
}
const state = () => JSON.parse(screen.getByTestId("state").textContent!);
beforeEach(() => { api.mockReset(); changed.mockClear(); });
async function choose() {
  fireEvent.click(screen.getByText("Match"));
  await waitFor(() => expect(state().active).toBe(true));
  fireEvent.click(screen.getByText("Choose"));
}
it("matching and ticking only read source facts and do not reserve", async () => {
  api.mockResolvedValue(stock()); draw(); await choose();
  expect(state().chosen).toBe(1);
  expect(api.mock.calls.every(([, options]) => options?.method !== "POST")).toBe(true);
  expect(changed).not.toHaveBeenCalled();
});
it("accepts exact confirmed Units through the existing reservation door", async () => {
  api.mockImplementation(async (_path, options) => options?.method === "POST"
    ? { reserved: 1, reference: "SO-1", units: [{ itemId: UNIT, orderLineId: LINE }] } : stock());
  draw(); await choose(); fireEvent.click(screen.getByText("Proceed"));
  await waitFor(() => expect(state().count).toBe(0));
  expect(changed).toHaveBeenCalledWith("o1", [LINE]);
  expect(api.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
});
it("recovers a lost write response by reading exact held Units without resubmitting", async () => {
  let posted = false;
  api.mockImplementation(async (_path, options) => {
    if (options?.method === "POST") { posted = true; throw new Error("response_lost"); }
    return stock(posted);
  });
  draw(); await choose(); fireEvent.click(screen.getByText("Proceed"));
  await waitFor(() => expect(state().count).toBe(0));
  expect(state().unknown).toBe(false);
  expect(api.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
});
it("keeps an unreadable write outcome blocked instead of blindly trying again", async () => {
  let posted = false;
  api.mockImplementation(async (_path, options) => {
    if (options?.method === "POST") { posted = true; throw new Error("response_lost"); }
    if (posted) throw new Error("read_unavailable");
    return stock();
  });
  draw(); await choose(); fireEvent.click(screen.getByText("Proceed"));
  await waitFor(() => expect(state().unknown && !state().busy).toBe(true));
  fireEvent.click(screen.getByText("Proceed"));
  expect(api.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
});
it("retains a definitely refused choice and rechecks through SQL on a deliberate retry", async () => {
  api.mockImplementation(async (_path, options) => {
    if (options?.method === "POST") throw new ApiError(409, "unit_no_longer_free", { code: "unit_no_longer_free" });
    return stock();
  });
  draw(); await choose(); fireEvent.click(screen.getByText("Proceed"));
  await waitFor(() => expect(state().error && !state().busy).toBeTruthy());
  expect(state().count).toBe(1); expect(state().unknown).toBe(false);
});
it("does not treat an already-covered order's compatibility flag as conflicting stock facts", async () => {
  const covered = stock();
  covered.orderId = "o2";
  covered.lines[0]!.orderLineId = "44444444-4444-4444-8444-444444444444";
  covered.lines[0]!.remainingQty = 0;
  covered.units[0]!.matchingLineIds = [];
  covered.units[0]!.blocked = "no_line_needs_it";
  api.mockImplementation(async path => path.includes("/o2/") ? covered : stock());
  draw([order, { ...order, orderId: "o2" }]); await choose();
  expect(state().count).toBe(1);
  expect(state().error).toBeNull();
});
it("never reserves chosen Units whose Sales Order is outside current visible membership", async () => {
  api.mockResolvedValue(stock()); draw([order], []); await choose();
  fireEvent.click(screen.getByText("Proceed"));
  expect(api.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(0);
  expect(changed).not.toHaveBeenCalled();
});
it("keeps successful exact reservations when a later order refuses and retries only that remaining order", async () => {
  const second = stock();
  second.orderId = "o2";
  const secondLine = "44444444-4444-4444-8444-444444444444";
  const secondUnit = "55555555-5555-4555-8555-555555555555";
  second.lines[0]!.orderLineId = secondLine;
  second.units[0]!.itemId = secondUnit;
  second.units[0]!.unitCode = "U2-001";
  second.units[0]!.matchingLineIds = [secondLine];
  let refused = true;
  api.mockImplementation(async (path, options) => {
    if (options?.method !== "POST") return path.includes("/o2/") ? second : stock();
    const body = JSON.parse(options.body);
    if (body.orderId === "o2" && refused) throw new ApiError(409, "unit_no_longer_free", {});
    return { reserved: 1, reference: "SO-1", units: body.picks };
  });
  draw([order, { ...order, orderId: "o2" }], ["o1", "o2"]); await choose();
  fireEvent.click(screen.getByText("Proceed"));
  await waitFor(() => expect(state().error && !state().busy).toBeTruthy());
  expect(state().count).toBe(1); expect(state().chosen).toBe(1);
  refused = false;
  fireEvent.click(screen.getByText("Proceed"));
  await waitFor(() => expect(state().count).toBe(0));
  expect(api.mock.calls.filter(([, options]) => options?.method === "POST")
    .map(([, options]) => JSON.parse(options.body).orderId)).toEqual(["o1", "o2", "o2"]);
});
