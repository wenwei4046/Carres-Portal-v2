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
 *
 * S2 adds the other half: "submitting without required evidence is impossible."
 * The photos are the last step, and Create Case stays disabled until the
 * checklist for THAT issue type is satisfied.
 */

const apiFetchMock = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...a: unknown[]) => apiFetchMock(...a) }));

/** The real uploader shrinks images on a canvas and talks to Supabase Storage —
 *  neither exists in jsdom. What matters here is the GATE, not the transport. */
const uploadMock = vi.fn();
vi.mock("@/lib/case-evidence-upload", () => ({
  uploadCaseEvidence: (...a: unknown[]) => uploadMock(...a),
  attachCaseEvidence: vi.fn(),
}));

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

let uploadSeq = 0;

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation((path: string) => {
    if (path.startsWith("/api/ops/service-cases/unit-problems")) return Promise.resolve({ cases: [] });
    if (path.startsWith("/api/ops/service-cases/config")) return Promise.resolve(CONFIG);
    if (path.startsWith("/api/ops/service-cases/lookup")) {
      return Promise.resolve({ order: ORDER, matches: 1 });
    }
    return Promise.resolve({ id: "new-case", caseNo: "SC2607-02" });
  });

  uploadSeq = 0;
  uploadMock.mockReset();
  uploadMock.mockImplementation(
    (target: { draftId: string }, slot: string) =>
      Promise.resolve({ slot, path: `draft/${target.draftId}/f${++uploadSeq}-${slot}.jpg` }),
  );
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

/** Hand a file to the tick-list line labelled `label`. */
async function upload(label: string, name = "photo.jpg", type = "image/jpeg") {
  const input = screen.getByLabelText(label);
  fireEvent.change(input, { target: { files: [new File(["x"], name, { type })] } });
  await waitFor(() => {});
}

/** Answer the five questions for a sofa colour complaint. Ends on step 5 with
 *  the wants picked; the ONLY typing is the SO number. */
async function answerASofaCase() {
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

/** Everything `colour_uneven` reported by the customer demands. */
async function uploadColourUnevenEvidence() {
  await upload("Screenshot of the customer's message");
  await upload("Photo of the whole item");
  await upload("Close-up of the problem", "close-1.jpg");
  await upload("Close-up of the problem", "close-2.jpg");
  await upload("Photo of the label on the item");
  await upload("Video of the whole item, 10 to 20 seconds", "pan.mp4", "video/mp4");
}

/** Walk the wizard all the way to a submittable case. */
async function fileASofaCase() {
  await answerASofaCase();
  await click(screen.getByRole("button", { name: "Next" })); // → step 6, the photos
  await uploadColourUnevenEvidence();
}

describe("ServiceCaseWizard — a new hire files a case without writing a sentence", () => {
  it("starts from the linked Sales Order without asking staff to find it again", async () => {
    render(wrap(
      <ServiceCaseWizard
        onClose={() => {}}
        onSaved={() => {}}
        initialOrder={{
          id: "00000000-0000-0000-0000-000000000001",
          so: "SO-1303",
          refNos: ["CR1303"],
          customerName: "Kimmy",
          customerPhone: "019-3478913",
          customerAddress: "12 Jalan Klang",
          deliveryDate: "2026-08-30",
          lines: [{ id: "00000000-0000-0000-0000-000000000002", sku: "MS1401F-K", qty: 1, sourcePo: null }],
        }}
      />,
    ));

    await click(screen.getByRole("button", { name: "Customer" }));

    expect(screen.getByText(/SO-1303 · Kimmy/)).toBeInTheDocument();
    expect(screen.getByText("MS1401F-K")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/SO-1147/)).not.toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/lookup"));
  });

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

    await answerASofaCase();
    await click(screen.getByRole("button", { name: "Back" })); // → step 4
    await click(screen.getByRole("button", { name: "Back" })); // → step 3
    await click(screen.getByRole("button", { name: "Back" })); // → step 2
    await click(await screen.findByText("MS1401F-K"));
    await click(screen.getByRole("button", { name: "Next" }));

    // Nothing is selected, so Next is refused until the question is answered.
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("cannot move past a question left unanswered", async () => {
    render(wrap(<ServiceCaseWizard onClose={() => {}} onSaved={() => {}} />));

    await answerASofaCase();
    // Un-pick the only thing the customer wanted.
    await click(screen.getByRole("button", { name: "Repair" }));
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("files unsold stock without a customer or customer confirmation", async () => {
    const onSaved = vi.fn();
    render(wrap(<ServiceCaseWizard onClose={() => {}} onSaved={onSaved} />));
    await click(screen.getByRole("button", { name: "Warehouse" }));
    await click(screen.getByRole("button", { name: /No sales order/ }));
    await click(screen.getByRole("button", { name: "Unsold stock" }));
    expect(screen.queryByLabelText("Customer name")).toBeNull();
    await click(screen.getByRole("button", { name: "Bed frame" }));
    await click(screen.getByRole("button", { name: "Next" }));
    await click(screen.getByRole("button", { name: "Missing parts" }));
    expect(screen.queryByText("What does the customer want?")).toBeNull();
    expect(screen.getByText(/Unsold stock. No customer affected./)).toBeInTheDocument();
    await upload("Photo of the whole item");
    await upload("Close-up of the problem");
    await click(screen.getByRole("button", { name: "Create Case" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const post = apiFetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST")!;
    const body = JSON.parse((post[1] as RequestInit).body as string);
    expect(body).toMatchObject({ customerImpact: "stock_only", customerName: "", customerWants: [] });
    expect(body.usable).toBeUndefined();
    expect(body.orderId).toBeUndefined();
  });

  it.each([false, true])("keeps later faults separate unless staff explicitly select the existing Case (%s)", async (selectExisting) => {
    const existingId = "11111111-1111-4111-8111-111111111111";
    const originalFetch = apiFetchMock.getMockImplementation()!;
    apiFetchMock.mockImplementation((path: string, ...rest: unknown[]) => path.startsWith("/api/ops/service-cases/unit-problems")
      ? Promise.resolve({ cases: [{ id: existingId, caseNo: "SC2609-01", openedAt: "2026-09-01", whatHappened: "Missing parts", statusIsClosed: false }] }) : originalFetch(path, ...rest));
    const onSaved = vi.fn();
    render(wrap(<ServiceCaseWizard onClose={() => {}} onSaved={onSaved} />));
    await click(screen.getByRole("button", { name: "Warehouse" }));
    await click(screen.getByRole("button", { name: /No sales order/ }));
    await click(screen.getByRole("button", { name: "Unsold stock" }));
    await click(screen.getByRole("button", { name: "Bed frame" }));
    await typeInto(screen.getByLabelText("Unit ID on the item (optional)"), "id-aaa000001");
    await click(screen.getByRole("button", { name: "Next" }));
    await click(screen.getByRole("button", { name: "Missing parts" }));
    const choose = await screen.findByRole("combobox", { name: "Case" });
    expect(choose).toHaveTextContent("New Case");
    if (selectExisting) {
      fireEvent.keyDown(choose, { key: "ArrowDown" });
      await click(await screen.findByRole("option", { name: /SC2609-01/ }));
    }
    await upload("Photo of the whole item");
    await upload("Close-up of the problem");
    await click(screen.getByRole("button", { name: selectExisting ? "Add evidence" : "Create Case" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const post = apiFetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST")!;
    const body = JSON.parse((post[1] as RequestInit).body as string);
    expect(body.existingCaseId).toBe(selectExisting ? existingId : undefined);
    expect(body.unitCode).toBe("id-aaa000001");
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
    await click(screen.getByRole("button", { name: "Next" }));

    // The warehouse found it, so no customer screenshot is demanded — but the
    // photos of the item still are.
    expect(screen.queryByLabelText("Screenshot of the customer's message")).toBeNull();
    await upload("Photo of the whole item");
    await upload("Close-up of the problem");

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

describe("ServiceCaseWizard — no evidence, no case (S2)", () => {
  it("keeps Create Case disabled until every required photo is in", async () => {
    render(wrap(<ServiceCaseWizard onClose={() => {}} onSaved={() => {}} />));

    await answerASofaCase();
    await click(screen.getByRole("button", { name: "Next" }));

    const create = () => screen.getByRole("button", { name: "Create Case" });
    expect(create()).toBeDisabled();

    // The checklist names what is missing while it is missing (rule 6).
    expect(screen.getByText(/Take these first:/)).toBeInTheDocument();

    await upload("Screenshot of the customer's message");
    await upload("Photo of the whole item");
    await upload("Close-up of the problem", "close-1.jpg");
    await upload("Photo of the label on the item");
    await upload("Video of the whole item, 10 to 20 seconds", "pan.mp4", "video/mp4");

    // Five of six: the SECOND close-up is still outstanding, so still refused.
    expect(create()).toBeDisabled();
    expect(screen.getByText(/Close-up of the problem \(1 of 2\)/)).toBeInTheDocument();

    await upload("Close-up of the problem", "close-2.jpg");
    expect(create()).toBeEnabled();
    expect(screen.queryByText(/Take these first:/)).toBeNull();
  });

  it("sends the uploaded paths with the draft they were uploaded against", async () => {
    const onSaved = vi.fn();
    render(wrap(<ServiceCaseWizard onClose={() => {}} onSaved={onSaved} />));

    await fileASofaCase();
    await click(screen.getByRole("button", { name: "Create Case" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());

    const post = apiFetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST",
    )!;
    const body = JSON.parse((post[1] as RequestInit).body as string);

    expect(body.draftId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.evidence).toHaveLength(6);
    // Every path sits under this draft's own prefix — the server refuses
    // anything that does not.
    for (const f of body.evidence) {
      expect(f.path.startsWith(`draft/${body.draftId}/`)).toBe(true);
    }
    expect(body.evidence.filter((f: { slot: string }) => f.slot === "closeup_photo")).toHaveLength(2);
    // The stamp is the server's business: the client sends slot + path only.
    expect(Object.keys(body.evidence[0]).sort()).toEqual(["path", "slot"]);
  });

  it("asks for the SKU label on a mattress and the video only on a sofa", async () => {
    // The checklist follows the ISSUE, and a mattress cannot report an uneven
    // colour at all — so the video is not part of its worst case.
    render(wrap(<ServiceCaseWizard onClose={() => {}} onSaved={() => {}} />));

    await click(screen.getByRole("button", { name: "Customer" }));
    await typeInto(screen.getByPlaceholderText(/SO-1147/), "SO-1147");
    await click(screen.getByRole("button", { name: /Find/ }));
    await click(await screen.findByText("MS1401F-K"));
    await click(screen.getByRole("button", { name: "Next" }));

    await click(await screen.findByRole("button", { name: "Wrong SKU" }));
    await click(await screen.findByRole("button", { name: /^Yes/ }));
    await click(await screen.findByRole("button", { name: "Replace" }));
    await click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByLabelText("Photo of the label on the item")).toBeInTheDocument();
    expect(screen.queryByLabelText("Video of the whole item, 10 to 20 seconds")).toBeNull();

    await upload("Photo of the label on the item");
    await upload("Photo of the whole item");
    await upload("Screenshot of the customer's message");
    expect(screen.getByRole("button", { name: "Create Case" })).toBeEnabled();
  });

  it("does not demand the carton photo — a box thrown away weeks ago is not evidence", async () => {
    render(wrap(<ServiceCaseWizard onClose={() => {}} onSaved={() => {}} />));

    await click(screen.getByRole("button", { name: "Customer" }));
    await typeInto(screen.getByPlaceholderText(/SO-1147/), "SO-1147");
    await click(screen.getByRole("button", { name: /Find/ }));
    await click(await screen.findByText("SF2201 3 Seater"));
    await click(screen.getByRole("button", { name: "Next" }));

    await click(await screen.findByRole("button", { name: "Damaged" }));
    await click(await screen.findByRole("button", { name: /^No/ }));
    await click(await screen.findByRole("button", { name: "Replace" }));
    await click(screen.getByRole("button", { name: "Next" }));

    // It is offered, and it says so...
    expect(screen.getByLabelText("Photo of the box it came in")).toBeInTheDocument();
    expect(screen.getByText("If you have it")).toBeInTheDocument();

    // ...and the case files without it.
    await upload("Photo of the whole item");
    await upload("Close-up of the problem", "a.jpg");
    await upload("Close-up of the problem", "b.jpg");
    await upload("Photo of the label on the item");
    await upload("Screenshot of the customer's message");
    expect(screen.getByRole("button", { name: "Create Case" })).toBeEnabled();
  });

  it("shows the upload's own error instead of silently doing nothing", async () => {
    uploadMock.mockRejectedValueOnce(new Error("That video is too big (48 MB)."));
    render(wrap(<ServiceCaseWizard onClose={() => {}} onSaved={() => {}} />));

    await answerASofaCase();
    await click(screen.getByRole("button", { name: "Next" }));
    await upload("Video of the whole item, 10 to 20 seconds", "big.mp4", "video/mp4");

    expect(await screen.findByText(/That video is too big/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Case" })).toBeDisabled();
  });
});
