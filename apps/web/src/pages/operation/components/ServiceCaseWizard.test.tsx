import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";

import ServiceCaseWizard from "./ServiceCaseWizard";

/**
 * S1's acceptance, exactly as the card words it: "a new hire can file a
 * complete case without typing a sentence."
 *
 * These tests type NOTHING except the sales order number in the search box —
 * every other answer is a click. If a future change reintroduces a required
 * free-text field, the first test stops passing.
 */

const apiFetchMock = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...a: unknown[]) => apiFetchMock(...a) }));

const ORDER = {
  id: "ord-1",
  so: "SO-1147",
  refNos: ["CR0418"],
  customerName: "Ryan Chong",
  customerPhone: "012-3456789",
  customerAddress: "1 Jalan Test",
  deliveryDate: null,
  lines: [
    { id: "line-sofa", sku: "SF2201 3 Seater", qty: 1, sourcePo: null },
    { id: "line-mat", sku: "MS1401F-K", qty: 2, sourcePo: null },
  ],
};

const CONFIG = {
  types: [{ id: "t1", code: "warranty_claim", label: "Warranty Claim", sortOrder: 1, active: true }],
  statuses: [
    { id: "s1", code: "pending", label: "Pending", sortOrder: 1, active: true, isClosed: false },
  ],
};

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation((path: string) => {
    if (path.startsWith("/api/ops/service-cases/config")) return Promise.resolve(CONFIG);
    if (path.startsWith("/api/ops/service-cases/lookup")) {
      return Promise.resolve({ order: ORDER, matches: 1 });
    }
    return Promise.resolve({ id: "new-case", caseNo: "SC2607-02" });
  });
});

/** fireEvent + a flush, rather than adding @testing-library/user-event as a new
 *  dependency for one file. */
async function click(el: HTMLElement) {
  fireEvent.click(el);
  await waitFor(() => {});
}
async function typeInto(el: HTMLElement, value: string) {
  fireEvent.change(el, { target: { value } });
  await waitFor(() => {});
}

/** Walk the wizard to the end. The ONLY typing is the SO number. */
async function fileASofaCase() {
  await click(screen.getByRole("button", { name: "Customer" }));

  await typeInto(screen.getByPlaceholderText(/SO-1147/), "SO-1147");
  await click(screen.getByRole("button", { name: /Find/ }));
  await screen.findByText(/SF2201 3 Seater/);
  await click(screen.getByText("SF2201 3 Seater"));
  await click(screen.getByRole("button", { name: "Next" }));

  await click(await screen.findByRole("button", { name: "Colour uneven" }));
  await click(await screen.findByRole("button", { name: /^No/ }));
  await click(await screen.findByRole("button", { name: "Repair" }));
}

describe("ServiceCaseWizard — a new hire files a case without writing a sentence", () => {
  it("files a complete case from clicks alone", async () => {
    const onSaved = vi.fn();
    render(wrap(<ServiceCaseWizard onClose={() => {}} onSaved={onSaved} />));

    await fileASofaCase();
    await click(screen.getByRole("button", { name: "Create Case" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());

    const post = apiFetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST",
    );
    expect(post).toBeTruthy();
    const body = JSON.parse((post![1] as RequestInit).body as string);

    // The answers land as KEYS...
    expect(body).toMatchObject({
      reportedBy: "customer",
      orderLineId: "line-sofa",
      productSku: "SF2201 3 Seater",
      productCategory: "sofa",
      issueType: "colour_uneven",
      usable: "no",
      customerWants: ["repair"],
    });
    // ...and the order link comes free with the product pick.
    expect(body.orderId).toBe("ord-1");
    expect(body.customerName).toBe("Ryan Chong");
    // ...and the prose every existing reader expects is composed, not typed.
    expect(body.whatHappened).toContain("Colour uneven");
    expect(body.whatHappened).toContain("Found by Customer");
  });

  it("never sends a priority — the database derives it from 'still usable'", async () => {
    render(wrap(<ServiceCaseWizard onClose={() => {}} onSaved={() => {}} />));

    await fileASofaCase();
    // The staff-facing consequence is shown, and it is not a control.
    expect(screen.getByText("Urgent")).toBeInTheDocument();
    expect(screen.getByText(/Tell the manager/)).toBeInTheDocument();

    await click(screen.getByRole("button", { name: "Create Case" }));
    const post = await waitFor(() => {
      const p = apiFetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === "POST",
      );
      expect(p).toBeTruthy();
      return p!;
    });
    expect(JSON.parse((post[1] as RequestInit).body as string)).not.toHaveProperty("priority");
  });

  it("offers the SOFA issue list for a sofa and the MATTRESS list for a mattress", async () => {
    render(wrap(<ServiceCaseWizard onClose={() => {}} onSaved={() => {}} />));

    await click(screen.getByRole("button", { name: "Customer" }));
    await typeInto(screen.getByPlaceholderText(/SO-1147/), "SO-1147");
    await click(screen.getByRole("button", { name: /Find/ }));

    // Sofa line → "Colour uneven" is a real complaint.
    await click(await screen.findByText("SF2201 3 Seater"));
    await click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("button", { name: "Colour uneven" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Missing parts" })).toBeInTheDocument();

    // Back to the product and switch to the mattress line.
    await click(screen.getByRole("button", { name: "Back" }));
    await click(await screen.findByText("MS1401F-K"));
    await click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByRole("button", { name: "Wrong SKU" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Colour uneven" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Missing parts" })).not.toBeInTheDocument();
  });

  it("clears an issue that the new product never offered", async () => {
    // Picking "Colour uneven" on a sofa and then switching to the mattress must
    // not file colour_uneven against a mattress — a key the wizard would never
    // have offered and that S5 could never explain.
    render(wrap(<ServiceCaseWizard onClose={() => {}} onSaved={() => {}} />));

    await fileASofaCase();
    await click(screen.getByRole("button", { name: "Back" })); // → step 4
    await click(screen.getByRole("button", { name: "Back" })); // → step 3
    await click(screen.getByRole("button", { name: "Back" })); // → step 2
    await click(await screen.findByText("MS1401F-K"));
    await click(screen.getByRole("button", { name: "Next" }));

    // Nothing is selected, so Next is refused until the question is answered.
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("cannot be submitted with a question left unanswered", async () => {
    render(wrap(<ServiceCaseWizard onClose={() => {}} onSaved={() => {}} />));

    await fileASofaCase();
    // Un-pick the only thing the customer wanted.
    await click(screen.getByRole("button", { name: "Repair" }));
    expect(screen.getByRole("button", { name: "Create Case" })).toBeDisabled();
  });

  it("still lets a case be filed when there is no sales order", async () => {
    // Every service case on file today has no linked order — the wizard must
    // not dead-end there.
    const onSaved = vi.fn();
    render(wrap(<ServiceCaseWizard onClose={() => {}} onSaved={onSaved} />));

    await click(screen.getByRole("button", { name: "Warehouse" }));
    await click(screen.getByRole("button", { name: /No sales order/ }));
    await click(await screen.findByRole("button", { name: "Bed frame" }));
    await typeInto(screen.getByLabelText("Customer name"), "Walk-in");
    await click(screen.getByRole("button", { name: "Next" }));

    await click(await screen.findByRole("button", { name: "Missing parts" }));
    await click(await screen.findByRole("button", { name: /^Temporarily/ }));
    await click(await screen.findByRole("button", { name: "Inspection" }));
    await click(screen.getByRole("button", { name: "Create Case" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const post = apiFetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST",
    )!;
    const body = JSON.parse((post[1] as RequestInit).body as string);
    expect(body.productCategory).toBe("bedframe");
    expect(body.orderId).toBeUndefined();
    expect(body.customerName).toBe("Walk-in");
  });
});
