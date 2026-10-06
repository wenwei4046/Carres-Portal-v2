/**
 * ⭐ CONCURRENT EDITING — a commit carries the order the editor opened
 * (orders/MASTER §0.0 "Approved handoff scopes", owner-approved 2026-10-01:
 * "Two editors cannot silently overwrite one another; conflict keeps the draft
 * and exposes what changed; same amendment entry, no new draft engine").
 *
 * These render the REAL object page. Ana opens SO-1319 and corrects the phone;
 * meanwhile a colleague renames the customer. Ana's Save is refused; her draft
 * stays, the page shows what the colleague changed, and her second Save
 * carries the colleague's name — the name is never silently put back.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { salesOrderEditBaseline } from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import SalesOrderWorkspace, { rebaseDraft, draftFromOrderDetail } from "./SalesOrderWorkspace";
import { DraftReview } from "./SalesOrderChangePanels";

const apiFetch = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});
vi.mock("@/lib/pdf/render", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pdf/render")>("@/lib/pdf/render");
  return { ...actual, renderSalesOrderPdf: () => new Promise(() => {}) };
});

const ID = "11111111-1111-1111-1111-111111111111";
const L1 = "22222222-2222-2222-2222-222222222222";
/* Invented values — never a real customer's. */
const OPENED = {
  id: ID, so: 1319, status: "proceed_order", operation_stage: "proceed_order",
  customer_name: "Customer", customer_phone: "0100000000", customer_email: null,
  customer_address: null, customer_address_line1: null, customer_address_line2: null, customer_address_city: null,
  customer_address_state: null, customer_address_postcode: null, customer_address_unknown: true,
  customer_billing: null, customer_billing_same: true, customer_emergency: null,
  customer_race: null, customer_gender: null, customer_birthday: null, entry_data: null,
  delivery_floor: 1, delivery_has_lift: false, delivery_stair_items: null,
  placed_at: "2026-09-01T02:00:00Z", delivery_date: "2026-10-26", delivery_date_tbd: false, proceed_date: "2026-09-02",
  source_ref: null, source_system: null, paid: 0, dealer_id: null, outlet_id: null, salesperson_id: null,
  dealers: null, outlets: null, salespersons: null, installment_months: null, payment_method: null,
  do_number: null, invoice_no: null, invoiced_at: null, delivered_at: null, dispatched_at: null,
  warehouse_id: null, delivery_partner_id: null,
};
const LINES = [{ id: L1, sku: "TRION-Q", qty: 1, unit_price: 2749, attrs: null, source_po: null }];
const COLLEAGUE = { ...OPENED, customer_name: "Customer Tan" };
const detail = (order: typeof OPENED) => ({
  editBaseline: JSON.parse(JSON.stringify(salesOrderEditBaseline(order, LINES, []))),
  order, lines: LINES, addons: [], total: 2749, warehouse: null, stockBalances: [], freeUnits: [], pos: [], history: [], threads: [],
});

let colleagueSaved = false;
let commits: Array<Record<string, unknown>> = [];
function answer(second: "saved" | "refused-again" = "saved") {
  colleagueSaved = false;
  commits = [];
  apiFetch.mockReset();
  apiFetch.mockImplementation((path: unknown, init?: { method?: string; body?: string }) => {
    if (path === `/api/operation/orders/${ID}`) return Promise.resolve(detail(colleagueSaved ? COLLEAGUE : OPENED));
    if (path === `/api/operation/orders/${ID}/changes` && init?.method === "POST") {
      commits.push(JSON.parse(init.body ?? "{}"));
      if (commits.length === 1 || second === "refused-again") {
        colleagueSaved = true; // the colleague's Save landed after Ana opened the page
        return Promise.reject(new ApiError(409, "Action changed · Review again", {
          error: "conflict", code: "order_edit_stale", message: "Action changed · Review again", changed: ["customer_name"],
        }));
      }
      return Promise.resolve({ action: "saved", revision: 3, changed: ["customer_phone"] });
    }
    /* Every other read answers at once (empty), so a successful commit's
       refresh settles and the page can close its review. */
    if (typeof path === "string" && path.endsWith("/amendment")) return Promise.resolve({ amendment: null });
    return Promise.reject(new ApiError(404, "Not found", {}));
  });
}

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/operation/orders/so/${ID}`]}>
        <Routes>
          <Route path="/operation/orders/so/:orderId" element={<SalesOrderWorkspace />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The customer's phone box (`Phone` also labels the emergency contact's). */
const phoneBox = () => document.getElementById("so-phone") as HTMLInputElement | null;

async function editPhoneAndSave() {
  fireEvent.click(await screen.findByTestId("workspace-edit", {}, { timeout: 4000 }));
  await waitFor(() => expect(phoneBox()).not.toBeNull());
  fireEvent.change(phoneBox()!, { target: { value: "0199999999" } });
  fireEvent.click(await screen.findByTestId("workspace-save", {}, { timeout: 4000 }));
  fireEvent.change(await screen.findByLabelText(/Reason for change/, {}, { timeout: 4000 }), { target: { value: "New number" } });
  fireEvent.click(screen.getByTestId("workspace-confirm-save"));
}

beforeEach(() => {
  useAuth.setState({ role: "operation" });
});

describe("Sales Order page — a commit carries the order the editor opened", () => {
  it("the commit sends the baseline the page opened with", async () => {
    answer();
    mount();
    await editPhoneAndSave();
    await waitFor(() => expect(commits.length).toBe(1));
    expect(commits[0]!.expected).toEqual(detail(OPENED).editBaseline);
    expect((commits[0]!.header as Record<string, unknown>).customer_phone).toBe("0199999999");
  });

  it("refused: the draft stays, the page says `Action changed · Review again` and shows the colleague's change", async () => {
    answer();
    mount();
    await editPhoneAndSave();
    const panel = await screen.findByTestId("changed-since-opened", {}, { timeout: 4000 });
    expect(within(panel).getByRole("alert")).toHaveTextContent("Action changed · Review again");
    const row = within(panel).getByText("Full name").closest("tr")!;
    expect(row).toHaveTextContent("Customer");
    expect(row).toHaveTextContent("Customer Tan");
    /* Ana's own typing is still on screen, and the review is still open. */
    expect(phoneBox()!.value).toBe("0199999999");
    expect(screen.getByTestId("workspace-confirm-save")).toBeEnabled();
  });

  it("the second commit carries the order as it is NOW and keeps the colleague's name", async () => {
    answer();
    mount();
    await editPhoneAndSave();
    await screen.findByTestId("changed-since-opened", {}, { timeout: 4000 });
    fireEvent.click(screen.getByTestId("workspace-confirm-save"));
    await waitFor(() => expect(commits.length).toBe(2));
    expect(commits[1]!.expected).toEqual(detail(COLLEAGUE).editBaseline);
    const header = commits[1]!.header as Record<string, unknown>;
    expect(header.customer_phone).toBe("0199999999");
    expect(header.customer_name).toBe("Customer Tan");
    await waitFor(() => expect(screen.queryByTestId("changed-since-opened")).toBeNull(), { timeout: 4000 });
  });
});

describe("rebaseDraft — the same draft moves onto the order as it is now", () => {
  const opened = draftFromOrderDetail(OPENED as never, LINES as never, []);
  const current = draftFromOrderDetail({ ...COLLEAGUE, delivery_floor: 3 } as never, [{ ...LINES[0]!, qty: 2 }] as never, []);

  it("a fact the editor did not touch takes the colleague's value; a fact she changed keeps hers", () => {
    const mine = { ...opened, customer_phone: "0199999999" };
    const next = rebaseDraft(mine, opened, current);
    expect(next.customer_phone).toBe("0199999999");
    expect(next.customer_name).toBe("Customer Tan");
    expect(next.delivery_floor).toBe(3);
    expect(next.lines.map((l) => l.qty)).toEqual([2]);
  });

  it("goods she changed stay hers as a whole, so the review shows them against the order now", () => {
    const mine = { ...opened, lines: opened.lines.map((l) => ({ ...l, qty: 5 })) };
    const next = rebaseDraft(mine, opened, current);
    expect(next.lines.map((l) => l.qty)).toEqual([5]);
    expect(next.customer_name).toBe("Customer Tan");
  });
});

describe("DraftReview — the refused commit's panel", () => {
  const base = {
    rows: [], consequences: [], commercial: false, blocked: null, reason: "", onReason: () => {},
    askedOn: null, onAskedOn: () => {}, agreement: null, onAgreement: () => {},
  };
  it("prints nothing extra until a commit is refused", () => {
    render(<DraftReview {...base} />);
    expect(screen.queryByTestId("changed-since-opened")).toBeNull();
  });
  it("prints the governed sentence even when no row can be named", () => {
    render(<DraftReview {...base} changedSinceOpened={[]} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Action changed · Review again");
    expect(screen.queryByRole("table", { name: "Action changed · Review again" })).toBeNull();
  });
});
