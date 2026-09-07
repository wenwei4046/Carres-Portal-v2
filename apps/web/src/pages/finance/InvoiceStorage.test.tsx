import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InvoiceStorage, { type StorageCaseRow } from "./InvoiceStorage";

const state = vi.hoisted(() => ({
  cases: [] as unknown[],
  posts: [] as Array<{ url: string; body: unknown }>,
}));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    if (init?.method === "POST") {
      state.posts.push({ url, body: JSON.parse(init.body ?? "{}") });
      return { case: {} };
    }
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

beforeEach(() => { state.cases = []; state.posts = []; });

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
  it("a sofa case offers no extra-free door", async () => {
    state.cases = [{ ...CASE, id: "c2", product_group: "sofa", rule_extra_free_allowed: false,
      rule_charge_amount: 200, rule_cycle_days: 14 }];
    show();
    await waitFor(() => expect(screen.getByTestId("storage-case-sofa")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Request more free days" })).not.toBeInTheDocument();
  });
});
