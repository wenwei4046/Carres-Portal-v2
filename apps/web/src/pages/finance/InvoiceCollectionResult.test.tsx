import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvoiceRegisterRow } from "@carres/shared/payment-invoice-register";
import InvoiceCollectionResult from "./InvoiceCollectionResult";

const state = vi.hoisted(() => ({ posts: [] as Array<{ url: string; body: unknown }> }));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    state.posts.push({ url, body: JSON.parse(init?.body ?? "{}") });
    return { outcome: {} };
  }),
}));
vi.mock("@/lib/queries", () => ({
  qk: { finance: { invoiceRegister: () => ["finance", "invoice-register"] } },
}));

function iso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
}

const INVOICE = { id: "i1", order_id: "o1" } as InvoiceRegisterRow;

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onClose = vi.fn();
  render(<QueryClientProvider client={qc}>
    <InvoiceCollectionResult invoice={INVOICE} onClose={onClose} />
  </QueryClientProvider>);
  return { onClose };
}

beforeEach(() => { state.posts = []; });

describe("Record the result (§3)", () => {
  it("offers the five approved words and nothing else", () => {
    show();
    for (const word of [
      "Customer paid", "Customer will pay on a date", "Customer needs help",
      "Customer disputes the amount", "Customer did not answer",
    ]) expect(screen.getByText(word)).toBeInTheDocument();
    // Nothing is recordable until a result is picked.
    expect(screen.getByRole("button", { name: "Record the result" })).toBeDisabled();
  });
  it("only the promise asks for a date, and a past day cannot be offered", () => {
    show();
    fireEvent.click(screen.getByText("Customer did not answer"));
    expect(screen.queryByLabelText("The day the customer promised")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Customer will pay on a date"));
    const date = screen.getByLabelText("The day the customer promised");
    expect(date).toHaveAttribute("min", iso(0));
    // The door stays shut until a valid day is given.
    expect(screen.getByRole("button", { name: "Record the result" })).toBeDisabled();
    fireEvent.change(date, { target: { value: iso(5) } });
    expect(screen.getByRole("button", { name: "Record the result" })).toBeEnabled();
  });
  it("`Customer paid` says on screen that it is NOT money", () => {
    show();
    fireEvent.click(screen.getByText("Customer paid"));
    expect(screen.getByTestId("said-paid-is-not-money"))
      .toHaveTextContent("The amount still needed does not change until the payment is recorded");
  });
  it("records the promise with its date through the one door", async () => {
    show();
    fireEvent.click(screen.getByText("Customer will pay on a date"));
    fireEvent.change(screen.getByLabelText("The day the customer promised"),
      { target: { value: iso(5) } });
    fireEvent.change(screen.getByLabelText("Anything to add"),
      { target: { value: "salary day" } });
    fireEvent.click(screen.getByRole("button", { name: "Record the result" }));
    await waitFor(() => expect(state.posts).toHaveLength(1));
    expect(state.posts[0]).toMatchObject({
      url: "/api/finance/invoices/i1/collection-outcome",
      body: { outcome: "will_pay_on_date", promisedDate: iso(5), note: "salary day" },
    });
  });
  it("a result that carries no date sends none", async () => {
    show();
    fireEvent.click(screen.getByText("Customer disputes the amount"));
    fireEvent.click(screen.getByRole("button", { name: "Record the result" }));
    await waitFor(() => expect(state.posts).toHaveLength(1));
    expect(state.posts[0].body).toMatchObject({ outcome: "disputes_amount", promisedDate: null });
  });
});
