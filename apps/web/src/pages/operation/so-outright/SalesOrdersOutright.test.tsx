import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const testState = vi.hoisted(() => ({ user: "TEST-return-a", orders: [] as unknown[], names: new Map(), error: null as unknown, loading: false }));
const retry = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ useAuth: Object.assign((select: (s: unknown) => unknown) => select({user:{id:testState.user},role:"operation"}), {getState:()=>({user:{id:testState.user},role:"operation"})}) }));
vi.mock("@/lib/queries", async () => ({
  ...await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries"),
  useSalesOrderRegisterOrders: () => ({data:testState.error || testState.loading ? undefined : {orders:testState.orders},isLoading:testState.loading,isError:!!testState.error,error:testState.error,refetch:retry}),
  useSalesOrderRegisterFacts: () => ({data:{facts:{},failed:{}},isPending:false,isError:false}),
}));
vi.mock("../sales-order-register-readings", async () => ({
  ...await vi.importActual<typeof import("../sales-order-register-readings")>("../sales-order-register-readings"),
  useCatalogNames: () => testState.names,
}));
vi.mock("./pay-by", async () => ({...await vi.importActual<typeof import("./pay-by")>("./pay-by"), usePayBy:()=>()=>({state:"ok",row:null})}));
vi.mock("../components/ShellTasks", () => ({
  TasksPill: () => <span>TEST Tasks</span>,
  useShellTasks: Object.assign((select: (s: unknown) => unknown) => select({open:false}), {getState:()=>({setOpen:vi.fn()})}),
}));
import SalesOrdersOutright from "./SalesOrdersOutright";
import { ApiError } from "@/lib/api";

function Detail() {
  const location = useLocation();
  return <><p>TEST source record</p><Link to={(location.state as {salesOrderRegisterReturn:string}).salesOrderRegisterReturn}>Back to Sales Orders</Link></>;
}
function mount(at = "/operation/orders?cols=payment&f.payment=Owes") {
  return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false,enabled:false}}})}>
    <MemoryRouter initialEntries={[at]}><Routes>
      <Route path="/operation/orders" element={<SalesOrdersOutright />} />
      <Route path="/operation/orders/so/:id" element={<Detail />} />
    </Routes></MemoryRouter>
  </QueryClientProvider>);
}
const footer = () => screen.getByTestId("outright-footer");
beforeEach(() => {
  testState.user = `TEST-return-${expect.getState().currentTestName}`;
  localStorage.clear();
  testState.error = null; testState.loading = false; retry.mockClear();
  testState.orders = Array.from({length:60}, (_, n) => ({
    id:`TEST-order-${n+1}`,so:1001+n,status:"proceed_order",operation_stage:"confirmed",
    customer_name:`TEST Customer ${n+1}`,placed_at:"2026-09-01T02:00:00Z",proceeded_at:"2026-09-02T02:00:00Z",
    paid:500,order_lines:[{id:`TEST-line-${n+1}`,sku:"TEST-MATTRESS",qty:1,unit_price:2500}],order_addons:[],
    delivery_date:null,delivery_date_tbd:true,ops_delivery_orders:[],receipt_documents:[],allocated_receipts:[],
  }));
});

describe("Outright Summary source states", () => {
  it.each([403, 500])("a %s read never becomes zero orders or zero money in Summary", (status) => {
    testState.error = new ApiError(status, "TEST secret transport detail", null);
    localStorage.setItem("carres.outright.summary", "1");
    mount();
    const summary = screen.getByTestId("outright-summary");
    expect(summary).not.toHaveTextContent("Proceeded orders");
    expect(summary).not.toHaveTextContent("RM 0");
    expect(screen.queryByTestId("outright-footer")).toBeNull();
    expect(screen.queryByText("TEST secret transport detail")).toBeNull();
    if (status === 403) {
      expect(summary).toHaveTextContent("You cannot view sales orders");
      expect(within(summary).queryByRole("button", {name:"Try again"})).toBeNull();
    } else {
      expect(summary).toHaveTextContent("Sales orders could not be loaded");
      fireEvent.click(within(summary).getByRole("button", {name:"Try again"}));
      expect(retry).toHaveBeenCalledTimes(1);
    }
  });
  it("loading holds the Summary values rather than showing zero", () => {
    testState.loading = true; localStorage.setItem("carres.outright.summary", "1");
    mount();
    const summary = screen.getByTestId("outright-summary");
    expect(summary).toHaveTextContent("Loading orders");
    expect(summary).not.toHaveTextContent("Proceeded orders");
  });
  it("a genuinely empty successful read still shows its zero facts", () => {
    testState.orders = []; localStorage.setItem("carres.outright.summary", "1");
    mount();
    const summary = screen.getByTestId("outright-summary");
    expect(summary).toHaveTextContent("Proceeded orders0");
    expect(summary).toHaveTextContent("Proceeded valueRM 0");
    expect(within(summary).queryByRole("alert")).toBeNull();
  });
});

describe("Outright record return context", () => {
  it("returns to the same sorted page, selected row and grid scroll with URL filters retained", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", {name:/^SO no\./}));
    fireEvent.click(screen.getByRole("button", {name:/^SO no\./}));
    fireEvent.click(screen.getByRole("button", {name:"Next page"}));
    expect(footer()).toHaveTextContent("2 / 3");
    expect(screen.getAllByTestId(/^outright-row-/)[0]).toHaveTextContent("SO-1040");
    fireEvent.click(screen.getByRole("checkbox", {name:"Select SO-1040"}));
    // The grid restores a page on its first painted frame, before user scroll.
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    const scroll = screen.getByTestId("grid-scroll");
    scroll.scrollTop = 240; fireEvent.scroll(scroll);
    fireEvent.click(screen.getByText("SO-1040", {exact:true}));
    expect(screen.getByRole("link", {name:"Back to Sales Orders"})).toHaveAttribute("href", "/operation/orders?cols=payment&f.payment=Owes");
    fireEvent.click(screen.getByRole("link", {name:"Back to Sales Orders"}));
    await waitFor(()=>expect(footer()).toHaveTextContent("2 / 3"));
    expect(screen.getAllByTestId(/^outright-row-/)[0]).toHaveTextContent("SO-1040");
    expect(screen.getByRole("checkbox", {name:"Select SO-1040"})).toBeChecked();
    await waitFor(()=>expect(screen.getByTestId("grid-scroll").scrollTop).toBe(240));
  });

  it("retains the chosen row count on return, but a changed scope starts on its first page", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", {name:"Rows 20"}));
    fireEvent.click(screen.getByRole("menuitemradio", {name:/^50$/}));
    fireEvent.click(screen.getByRole("button", {name:"Next page"}));
    expect(footer()).toHaveTextContent("2 / 2");
    fireEvent.click(screen.getByText("SO-1051", {exact:true}));
    fireEvent.click(screen.getByRole("link", {name:"Back to Sales Orders"}));
    await waitFor(()=>expect(footer()).toHaveTextContent("2 / 2"));
    expect(screen.getByRole("button", {name:"Rows 50"})).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", {name:/^All$/}));
    expect(footer()).toHaveTextContent("1 / 2");
  });

  it("does not restore another signed-in person's page or selection", async () => {
    const a = mount();
    fireEvent.click(screen.getByRole("button", {name:"Next page"}));
    fireEvent.click(screen.getByRole("checkbox", {name:"Select SO-1021"}));
    a.unmount(); testState.user = "TEST-return-different-person";
    mount();
    await waitFor(()=>expect(footer()).toHaveTextContent("1 / 3"));
    expect(screen.getAllByRole("checkbox").every((c)=>!(c as HTMLInputElement).checked)).toBe(true);
  });
});
