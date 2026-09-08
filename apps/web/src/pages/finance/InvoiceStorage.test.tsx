import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InvoiceStorage, { type StorageCaseRow } from "./InvoiceStorage";

const state = vi.hoisted(() => ({
  cases: [] as unknown[],
  requests: [] as unknown[],
  posts: [] as Array<{ url: string; body: unknown }>,
}));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    if (init?.method === "POST") {
      state.posts.push({ url, body: JSON.parse(init.body ?? "{}") });
      return { case: {} };
    }
    if (url.includes("/later-delivery-requests")) return { requests: state.requests };
    if (url.includes("/payment-storage")) return { cases: state.cases };
    throw new Error(`unexpected ${url}`);
  }),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: { storage: { from: () => ({ upload: vi.fn(async () => ({ error: null })) }) } },
}));

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
}

const CASE: StorageCaseRow = {
  id: "c1", order_id: "o1", product_group: "mattress_bedframe",
  readiness_witnessed_on: todayPlus(-20), customer_delay_witnessed_on: todayPlus(-20),
  delay_witness_note: "Customer asked to hold", storage_start: todayPlus(-20),
  rule_free_days: 14, rule_charge_amount: 150, rule_cycle_days: 30,
  rule_extra_free_allowed: true, approved_free_until: null, approval_reason: null,
  status: "open",
};

function show(canAct = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}>
    <InvoiceStorage orderId="o1" canAct={canAct} />
  </QueryClientProvider>);
}

beforeEach(() => { state.cases = []; state.requests = []; state.posts = []; });

describe("the Storage section", () => {
  it("no case says the §6 rule honestly, and finance sees no doors", async () => {
    show(false);
    await waitFor(() => expect(screen.getByTestId("invoice-storage"))
      .toHaveTextContent("No storage case."));
    expect(screen.getByTestId("invoice-storage"))
      .toHaveTextContent("Storage begins only when the goods are ready AND the customer delays the delivery.");
    expect(screen.queryByRole("button", { name: "Record storage start" })).not.toBeInTheDocument();
  });
  it("a case says its start, day, free end and the §7 charge through the ONE arithmetic", async () => {
    state.cases = [CASE];
    show();
    // Day 21 of storage: free ended day 14, one 30-day period commenced.
    await waitFor(() => expect(screen.getByTestId("storage-case-mattress_bedframe"))
      .toHaveTextContent("today is day 21"));
    const card = screen.getByTestId("storage-case-mattress_bedframe");
    expect(card).toHaveTextContent("Mattress / Bedframe");
    expect(card).toHaveTextContent("1 charge period started · RM 150.00 — 1 not on a Storage Invoice yet.");
  });
  it("Record storage start sends both witnessed facts and the note to the door", async () => {
    show();
    await waitFor(() => expect(screen.getByRole("button", { name: "Record storage start" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Record storage start" }));
    fireEvent.change(screen.getByLabelText("Goods were ready on"), { target: { value: "2026-09-06" } });
    fireEvent.change(screen.getByLabelText("Customer delayed on"), { target: { value: "2026-09-07" } });
    fireEvent.change(screen.getByLabelText("What happened"), { target: { value: "Customer asked to hold" } });
    expect(screen.getByTestId("storage-start-form"))
      .toHaveTextContent("Storage starts on the LATER of the two dates.");
    fireEvent.click(screen.getAllByRole("button", { name: "Record storage start" }).at(-1)!);
    await waitFor(() => expect(state.posts).toHaveLength(1));
    expect(state.posts[0].body).toMatchObject({
      orderId: "o1", productGroup: "mattress_bedframe",
      readinessOn: "2026-09-06", customerDelayOn: "2026-09-07",
      witnessNote: "Customer asked to hold",
    });
  });
  it("the extra-free door demands the written request before it can send", async () => {
    state.cases = [CASE];
    show();
    await waitFor(() => expect(screen.getByRole("button", { name: "Request more free days" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Request more free days" }));
    fireEvent.change(screen.getByLabelText("Free until"), { target: { value: "2026-09-27" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Customer travelling" } });
    // No file yet — the §6 sentence stands and the door stays shut.
    expect(screen.getByTestId("storage-extra-free-form"))
      .toHaveTextContent("No written request means no free storage.");
    expect(screen.getByRole("button", { name: "Approve free storage" })).toBeDisabled();
  });
  it("unbilled commenced periods offer Create Storage Invoice, and the door fires the charge", async () => {
    state.cases = [CASE];
    show();
    await waitFor(() => expect(screen.getByRole("button", { name: "Create Storage Invoice" })).toBeInTheDocument());
    // Day 21: one period commenced, none billed — the card says so.
    expect(screen.getByTestId("storage-case-mattress_bedframe"))
      .toHaveTextContent("1 not on a Storage Invoice yet.");
    fireEvent.click(screen.getByRole("button", { name: "Create Storage Invoice" }));
    await waitFor(() => expect(state.posts).toHaveLength(1));
    expect(state.posts[0]).toMatchObject({
      url: "/api/finance/payment-storage/charge", body: { caseId: "c1" } });
  });
  it("a fully billed case says so and offers no charge door", async () => {
    state.cases = [{ ...CASE, billed_through_period: 1 }];
    show();
    await waitFor(() => expect(screen.getByTestId("storage-case-mattress_bedframe"))
      .toHaveTextContent("all on a Storage Invoice."));
    expect(screen.queryByRole("button", { name: "Create Storage Invoice" })).not.toBeInTheDocument();
  });
  it("End storage states its reason and posts to the closing door; a closed case offers no doors", async () => {
    state.cases = [CASE];
    show();
    await waitFor(() => expect(screen.getByRole("button", { name: "End storage" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "End storage" }));
    const form = screen.getByTestId("storage-end-form");
    fireEvent.change(screen.getByLabelText("Why the storage ended"), { target: { value: "Goods delivered" } });
    fireEvent.click(within(form).getByRole("button", { name: "End storage" }));
    await waitFor(() => expect(state.posts).toHaveLength(1));
    expect(state.posts[0]).toMatchObject({
      url: "/api/finance/payment-storage/close",
      body: { caseId: "c1", reason: "Goods delivered" } });
  });
  it("a closed case is history: no charge, no extra free, no end door", async () => {
    state.cases = [{ ...CASE, status: "closed" }];
    show();
    await waitFor(() => expect(screen.getByTestId("storage-case-mattress_bedframe"))
      .toHaveTextContent("· Closed"));
    expect(screen.queryByRole("button", { name: "Create Storage Invoice" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request more free days" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "End storage" })).not.toBeInTheDocument();
  });
  it("a sofa case offers no extra-free door", async () => {
    state.cases = [{ ...CASE, id: "c2", product_group: "sofa", rule_extra_free_allowed: false,
      rule_charge_amount: 200, rule_cycle_days: 14 }];
    show();
    await waitFor(() => expect(screen.getByTestId("storage-case-sofa")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Request more free days" })).not.toBeInTheDocument();
  });
});

// §6 (0451) — the customer's written request to delay.
describe("Request a later delivery date", () => {
  it("records what the customer asked for, and says it does not move the date", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Record the customer's later date" }));
    const form = screen.getByTestId("storage-later-date-form");
    expect(form).toHaveTextContent("This records what the customer asked for. It does not change the delivery date.");
    // A telephone call is not enough — the button stays shut with no file.
    fireEvent.change(screen.getByLabelText("The date the customer asked for"),
      { target: { value: todayPlus(21) } });
    fireEvent.click(screen.getByLabelText("The customer acknowledged the storage terms"));
    expect(screen.getByRole("button", { name: "Record the request" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("What the customer sent"),
      { target: { files: [new File(["x"], "whatsapp.jpg", { type: "image/jpeg" })] } });
    fireEvent.click(screen.getByLabelText("The customer asked for free storage"));
    expect(screen.getByRole("button", { name: "Record the request" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Record the request" }));
    await waitFor(() => expect(state.posts.length).toBeGreaterThan(0));
    const post = state.posts.at(-1)!;
    expect(post.url).toBe("/api/finance/payment-storage/later-delivery-request");
    expect(post.body).toMatchObject({
      requestedDate: todayPlus(21),
      termsAcknowledged: true,
      freeStorageRequested: true,
      reasonKey: "customer_reschedule",
    });
  });

  /** §6 charges storage for CUSTOMER delay only, so a Carres-side reason must
   *  not even be offerable — otherwise the form grows a second rule. */
  it("offers only customer-side reasons", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Record the customer's later date" }));
    const options = within(screen.getByLabelText("Reason"))
      .getAllByRole("option").map((o) => (o as HTMLOptionElement).value);
    expect(options).toContain("customer_renovation");
    expect(options).not.toContain("stock_not_ready");
    expect(options).not.toContain("driver_unavailable");
  });

  it("shows what the customer already asked for, with the acknowledgement", async () => {
    state.requests = [{
      id: "r1", order_id: "o1", requested_date: todayPlus(30),
      reason_key: "customer_renovation", reason_detail: "kitchen not finished",
      terms_acknowledged: true, free_storage_requested: true,
      evidence_url: "a/b.jpg", recorded_at: "2026-09-08T00:00:00Z",
    }];
    show();
    const panel = await screen.findByTestId("later-delivery-requests");
    expect(panel).toHaveTextContent("Customer renovation");
    expect(panel).toHaveTextContent("kitchen not finished");
    expect(panel).toHaveTextContent("asked for free storage");
    expect(panel).toHaveTextContent("storage terms acknowledged");
  });
});

