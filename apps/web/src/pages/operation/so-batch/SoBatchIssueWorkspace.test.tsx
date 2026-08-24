import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { PurchasingDestination, SoBatchDocument } from "@carres/shared";

vi.mock("@/lib/pdf/render", () => ({
  renderPoPdf: vi.fn(async () => new Blob(["%PDF-1.4"], { type: "application/pdf" })),
}));
const apiFetch = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...a: unknown[]) => apiFetch(...a) };
});

import SoBatchIssueWorkspace from "./SoBatchIssueWorkspace";

/**
 * THE GUIDED ISSUE JOURNEY (CARD-2026-08-22-purchasing-02 §5).
 *
 * 50% work, 50% the actual document. One supplier × destination at a time, an
 * honest `1 of N`, and — the whole reason this surface exists — Issue PO stays
 * OPEN until somebody records that the PDF really reached the supplier.
 */

const KLANG: PurchasingDestination = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Carres Klang",
  isDefault: true,
  active: true,
};
const BULOH: PurchasingDestination = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "AL Sungai Buloh",
  isDefault: false,
  active: true,
};

function doc(over: Partial<SoBatchDocument> = {}): SoBatchDocument {
  return {
    key: `s-hooka::${KLANG.id}`,
    supplierId: "s-hooka",
    supplierName: "Hooka",
    destinationId: KLANG.id,
    qty: 2,
    lines: [
      {
        demandId: "build::o1::b1",
        orderId: "o1",
        so: 1318,
        item: "Booqit",
        variant: "King",
        skus: ["B1201S-K"],
        qty: 2,
        goodsMustArrive: "2026-08-19",
        issueRef: { proposalKey: "s-hooka::mattress", buildKey: "b1" },
        costs: [{ sku: "B1201S-K", unitCost: 100 }],
      },
    ],
    supplierKind: "own_logistics",
    ...over,
  };
}

const SECOND = doc({
  key: `s-ohana::${BULOH.id}`,
  supplierId: "s-ohana",
  supplierName: "Ohana",
  destinationId: BULOH.id,
  qty: 1,
  lines: [
    {
      demandId: "build::o2::b2",
      orderId: "o2",
      so: 1321,
      item: "Haven",
      variant: "Queen",
      skus: ["H1401S-Q"],
      qty: 1,
      goodsMustArrive: "2026-08-25",
      issueRef: { proposalKey: "s-ohana::mattress", buildKey: "b2" },
      costs: [{ sku: "H1401S-Q", unitCost: 250 }],
    },
  ],
  supplierKind: "own_logistics",
});

const onBack = vi.fn();
const onDone = vi.fn();

function renderWorkspace(documents: SoBatchDocument[] = [doc()]) {
  return render(
    <SoBatchIssueWorkspace
      documents={documents}
      destinations={[KLANG, BULOH]}
      procurementPartners={[{ id: "p-nets", name: "NETS" }]}
      onBack={onBack}
      onDone={onDone}
    />,
  );
}

/* jsdom ships no object-URL implementation; the browser does. Stubbed so the
   PDF path can be exercised at all — the component's own failure branch is
   asserted separately below. */
beforeEach(() => {
  onBack.mockClear();
  onDone.mockClear();
  apiFetch.mockReset();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:so-batch-test"),
  });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});

describe("50% work + 50% the actual document", () => {
  it("gives each side half the content area from 1130px up", () => {
    renderWorkspace();
    const split = screen.getByTestId("so-batch-issue-split");
    expect(split.className).toContain("grid-cols-2");
    expect(screen.getByTestId("so-batch-issue-work")).toBeInTheDocument();
    expect(screen.getByTestId("so-batch-issue-preview")).toBeInTheDocument();
  });

  it("is a full surface, never a modal", () => {
    renderWorkspace();
    expect(document.querySelector("[role='dialog']")).toBeNull();
    expect(screen.getByTestId("so-batch-issue-workspace").getAttribute("role")).not.toBe(
      "dialog",
    );
  });

  it("names the supplier and the destination the document is for", () => {
    renderWorkspace();
    expect(screen.getByTestId("so-batch-issue-title")).toHaveTextContent("Hooka");
    expect(screen.getByTestId("so-batch-issue-title")).toHaveTextContent("Carres Klang");
  });

  it("counts honestly: 1 of 2, and moves both ways", () => {
    renderWorkspace([doc(), SECOND]);
    expect(screen.getByTestId("so-batch-issue-count")).toHaveTextContent("1 of 2");
    fireEvent.click(screen.getByTestId("so-batch-issue-next"));
    expect(screen.getByTestId("so-batch-issue-count")).toHaveTextContent("2 of 2");
    expect(screen.getByTestId("so-batch-issue-title")).toHaveTextContent("Ohana");
    fireEvent.click(screen.getByTestId("so-batch-issue-prev"));
    expect(screen.getByTestId("so-batch-issue-count")).toHaveTextContent("1 of 2");
  });

  it("one document says so, and offers no navigation", () => {
    renderWorkspace();
    expect(screen.getByTestId("so-batch-issue-count")).toHaveTextContent("1 of 1");
    expect(screen.queryByTestId("so-batch-issue-next")).not.toBeInTheDocument();
  });

  it("shows the lines, their source Sales Order and the arrival date", () => {
    renderWorkspace();
    const work = screen.getByTestId("so-batch-issue-work");
    expect(work).toHaveTextContent("B1201S-K");
    expect(work).toHaveTextContent("SO-1318");
    expect(work).toHaveTextContent("2");
  });

  it("Back to buying returns without creating anything", () => {
    renderWorkspace();
    fireEvent.click(screen.getByTestId("so-batch-issue-back"));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe("before creation the preview is visibly not sendable", () => {
  it("says the number does not exist yet, and that Issue PO makes it", () => {
    renderWorkspace();
    const preview = screen.getByTestId("so-batch-issue-preview");
    expect(preview).toHaveTextContent("Issue PO creates the number");
  });

  it("offers no send, no download and no print before the PO exists", () => {
    renderWorkspace();
    for (const id of [
      "so-batch-evidence-whatsapp",
      "so-batch-evidence-email",
      "so-batch-evidence-download",
      "so-batch-evidence-confirm",
    ]) {
      expect(screen.queryByTestId(id), id).not.toBeInTheDocument();
    }
  });
});

describe("Issue PO creates every document in one request", () => {
  function issued() {
    apiFetch.mockResolvedValue({
      ok: true,
      pos: [
        {
          id: "PO-2041",
          supplierId: "s-hooka",
          supplierName: "Hooka",
          destinationId: KLANG.id,
          destination: "Carres Klang",
        },
      ],
    });
  }

  it("posts ONE batch request, not one per document", async () => {
    issued();
    renderWorkspace([doc(), SECOND]);
    fireEvent.click(screen.getByTestId("so-batch-issue-create"));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    const [path, init] = apiFetch.mock.calls[0]!;
    expect(path).toBe("/api/operation/purchase/to-order/issue-batch");
    const body = JSON.parse((init as { body: string }).body);
    expect(body.selections).toHaveLength(2);
    expect(body.selections[0].allocations).toEqual([
      { destinationId: KLANG.id, qty: 2 },
    ]);
  });

  it("a failure creates nothing and keeps the operator on the surface", async () => {
    apiFetch.mockRejectedValue(new Error("allocation_mismatch"));
    renderWorkspace();
    fireEvent.click(screen.getByTestId("so-batch-issue-create"));
    await waitFor(() =>
      expect(screen.getByTestId("so-batch-issue-error")).toHaveTextContent(
        "allocation_mismatch",
      ),
    );
    expect(onDone).not.toHaveBeenCalled();
    // Still reviewable, still returnable.
    expect(screen.getByTestId("so-batch-issue-back")).toBeInTheDocument();
  });

  it("after creation the official number is shown and Issue PO is gone", async () => {
    issued();
    renderWorkspace();
    fireEvent.click(screen.getByTestId("so-batch-issue-create"));
    await screen.findByTestId("so-batch-evidence-PO-2041");
    expect(screen.getByTestId("so-batch-evidence-PO-2041")).toHaveTextContent("PO-2041");
    expect(screen.queryByTestId("so-batch-issue-create")).not.toBeInTheDocument();
  });
});

describe("Issue PO stays open until the PDF actually reaches the supplier", () => {
  async function reachEvidence() {
    apiFetch.mockImplementation((path: string) =>
      path.includes("issue-batch")
        ? Promise.resolve({
            ok: true,
            pos: [
              {
                id: "PO-2041", supplierId: "s-hooka", supplierName: "Hooka",
                destinationId: KLANG.id, destination: "Carres Klang",
              },
            ],
          })
        : /* The official document reports Version 2 — the operator is looking
             at a REVISED purchase order, and that is what must be recorded. */
          Promise.resolve({ po_number: "PO-2041", po_id: "PO-2041", version: 2, lines: [] }),
    );
    renderWorkspace();
    fireEvent.click(screen.getByTestId("so-batch-issue-create"));
    await screen.findByTestId("so-batch-evidence-PO-2041");
    apiFetch.mockReset();
    apiFetch.mockResolvedValue({ ok: true });
  }

  it("says what has not happened yet, naming the exact version", async () => {
    await reachEvidence();
    expect(screen.getByTestId("so-batch-evidence-PO-2041")).toHaveTextContent(
      "PO-2041 · Version 2 has not reached Hooka",
    );
  });

  it("opening WhatsApp or email writes NOTHING and completes NOTHING", async () => {
    await reachEvidence();
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    fireEvent.click(screen.getByTestId("so-batch-evidence-whatsapp"));
    fireEvent.click(screen.getByTestId("so-batch-evidence-email"));
    expect(apiFetch).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByTestId("so-batch-evidence-PO-2041")).toHaveTextContent(
      "has not reached",
    );
    open.mockRestore();
  });

  it("Record the PDF sent needs a channel and a recipient", async () => {
    await reachEvidence();
    expect(screen.getByTestId("so-batch-evidence-confirm")).toBeDisabled();
    fireEvent.change(screen.getByTestId("so-batch-evidence-recipient"), {
      target: { value: "   " },
    });
    expect(screen.getByTestId("so-batch-evidence-confirm")).toBeDisabled();
    fireEvent.change(screen.getByTestId("so-batch-evidence-recipient"), {
      target: { value: "Hooka Purchasing Group" },
    });
    expect(screen.getByTestId("so-batch-evidence-confirm")).toBeEnabled();
  });

  it("records channel and recipient through the confirm door — never /sends", async () => {
    await reachEvidence();
    apiFetch.mockResolvedValue({ ok: true });
    fireEvent.change(screen.getByTestId("so-batch-evidence-recipient"), {
      target: { value: "Hooka Purchasing Group" },
    });
    fireEvent.click(screen.getByTestId("so-batch-evidence-confirm"));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = apiFetch.mock.calls[0]!;
    expect(path).toBe("/api/operation/pos/PO-2041/confirm-sent");
    expect(path).not.toContain("/sends");
    const body = JSON.parse((init as { body: string }).body);
    /* ⭐ THE VERSION RIDES, and it is the one the RENDERED document reported —
       not a list row, not a second fetch (0377). */
    expect(body).toEqual({
      channel: "whatsapp",
      recipient: "Hooka Purchasing Group",
      poVersion: 2,
    });
  });

  it("when every document is confirmed, the journey is finished", async () => {
    await reachEvidence();
    apiFetch.mockResolvedValue({ ok: true });
    fireEvent.change(screen.getByTestId("so-batch-evidence-recipient"), {
      target: { value: "Hooka Purchasing Group" },
    });
    fireEvent.click(screen.getByTestId("so-batch-evidence-confirm"));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it("never says a banned generic word while it waits", async () => {
    await reachEvidence();
    const text = screen.getByTestId("so-batch-issue-workspace").textContent ?? "";
    for (const banned of ["Pending", "Follow up", "Needs attention", "Waiting", "Today"]) {
      expect(text, banned).not.toContain(banned);
    }
  });
});


/**
 * THE GOVERNED DOCUMENT DECISIONS (Card §5.2, §7.3).
 *
 * The left side is the ONLY editable issue surface, so every commercial fact a
 * purchase order needs has to be settleable HERE. An operator who meets
 * `cost_required` or `pickup_partner_required` must be able to fix it without
 * leaving the journey — an error message is not a control.
 */
const noCost = doc({
  lines: [
    {
      demandId: "build::o9::b9", orderId: "o9", so: 1399, item: "Orphan",
      variant: "King", skus: ["X-NEW-K"], qty: 1, goodsMustArrive: "2026-09-01",
      issueRef: { proposalKey: "s-hooka::mattress", buildKey: "b9" },
      costs: [{ sku: "X-NEW-K", unitCost: null }],
    },
  ],
});

const pickup = doc({ supplierKind: "factory_pickup" });

describe("Transaction Cost, or Free of Charge with a reason", () => {
  it("shows the Catalog price it already has, and does not ask again", () => {
    renderWorkspace();
    const cost = screen.getByTestId("so-batch-cost-B1201S-K") as HTMLInputElement;
    expect(cost.value).toBe("100");
    expect(screen.getByTestId("so-batch-issue-create")).toBeEnabled();
  });

  it("a SKU Catalog has no price for BLOCKS the issue until somebody states one", () => {
    renderWorkspace([noCost]);
    expect(screen.getByTestId("so-batch-issue-create")).toBeDisabled();
    expect(screen.getByTestId("so-batch-issue-blocker")).toHaveTextContent(
      "X-NEW-K needs a transaction cost",
    );
  });

  it("typing a cost unblocks it, and rides the request as hand-entered", async () => {
    apiFetch.mockResolvedValue({ ok: true, pos: [] });
    renderWorkspace([noCost]);
    fireEvent.change(screen.getByTestId("so-batch-cost-X-NEW-K"), {
      target: { value: "480" },
    });
    expect(screen.getByTestId("so-batch-issue-create")).toBeEnabled();
    fireEvent.click(screen.getByTestId("so-batch-issue-create"));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const body = JSON.parse((apiFetch.mock.calls[0]![1] as { body: string }).body);
    expect(body.documentDecisions[0].lineDecisions).toEqual([
      { sku: "X-NEW-K", treatment: "normal", unitCost: 480, costSource: "hand_entered" },
    ]);
  });

  it("an untouched Catalog price is NOT sent — the server reads its own", async () => {
    apiFetch.mockResolvedValue({ ok: true, pos: [] });
    renderWorkspace();
    fireEvent.click(screen.getByTestId("so-batch-issue-create"));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const body = JSON.parse((apiFetch.mock.calls[0]![1] as { body: string }).body);
    expect(body.documentDecisions[0]?.lineDecisions ?? []).toEqual([]);
  });

  it("a CHANGED catalog price is sent as hand-entered, never as `catalog`", async () => {
    apiFetch.mockResolvedValue({ ok: true, pos: [] });
    renderWorkspace();
    fireEvent.change(screen.getByTestId("so-batch-cost-B1201S-K"), {
      target: { value: "150" },
    });
    fireEvent.click(screen.getByTestId("so-batch-issue-create"));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const body = JSON.parse((apiFetch.mock.calls[0]![1] as { body: string }).body);
    expect(body.documentDecisions[0].lineDecisions[0]).toEqual({
      sku: "B1201S-K", treatment: "normal", unitCost: 150, costSource: "hand_entered",
    });
  });

  it("Free of Charge needs a reason, and says so until it has one", () => {
    renderWorkspace([noCost]);
    fireEvent.click(screen.getByTestId("so-batch-foc-X-NEW-K"));
    expect(screen.getByTestId("so-batch-issue-create")).toBeDisabled();
    expect(screen.getByTestId("so-batch-issue-blocker")).toHaveTextContent(
      "X-NEW-K needs a reason",
    );
    fireEvent.change(screen.getByTestId("so-batch-foc-reason-X-NEW-K"), {
      target: { value: "   " },
    });
    expect(screen.getByTestId("so-batch-issue-create")).toBeDisabled();
  });

  it("Free of Charge with a reason rides the request, and asks no price", async () => {
    apiFetch.mockResolvedValue({ ok: true, pos: [] });
    renderWorkspace([noCost]);
    fireEvent.click(screen.getByTestId("so-batch-foc-X-NEW-K"));
    fireEvent.change(screen.getByTestId("so-batch-foc-reason-X-NEW-K"), {
      target: { value: "Supplier replacement" },
    });
    expect(screen.queryByTestId("so-batch-cost-X-NEW-K")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("so-batch-issue-create"));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const body = JSON.parse((apiFetch.mock.calls[0]![1] as { body: string }).body);
    expect(body.documentDecisions[0].lineDecisions).toEqual([
      { sku: "X-NEW-K", treatment: "free_of_charge", reason: "Supplier replacement" },
    ]);
  });

  it("a zero or negative cost is not a price", () => {
    renderWorkspace([noCost]);
    for (const bad of ["0", "-5"]) {
      fireEvent.change(screen.getByTestId("so-batch-cost-X-NEW-K"), { target: { value: bad } });
      expect(screen.getByTestId("so-batch-issue-create"), bad).toBeDisabled();
    }
  });
});

describe("a factory-pickup document needs its procurement partner", () => {
  it("blocks the issue until one is chosen, and names what is missing", () => {
    renderWorkspace([pickup]);
    expect(screen.getByTestId("so-batch-issue-create")).toBeDisabled();
    expect(screen.getByTestId("so-batch-issue-blocker")).toHaveTextContent(
      "Hooka → Carres Klang needs a procurement partner",
    );
  });

  it("choosing one unblocks it and rides the request", async () => {
    apiFetch.mockResolvedValue({ ok: true, pos: [] });
    renderWorkspace([pickup]);
    fireEvent.change(screen.getByTestId("so-batch-partner"), { target: { value: "p-nets" } });
    expect(screen.getByTestId("so-batch-issue-create")).toBeEnabled();
    fireEvent.click(screen.getByTestId("so-batch-issue-create"));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const body = JSON.parse((apiFetch.mock.calls[0]![1] as { body: string }).body);
    expect(body.documentDecisions[0].procurementPartnerId).toBe("p-nets");
  });

  it("an own-logistics document is offered no partner control at all", () => {
    renderWorkspace();
    expect(screen.queryByTestId("so-batch-partner")).not.toBeInTheDocument();
  });

  it("its partner is null on the wire — never omitted, never smuggled", async () => {
    apiFetch.mockResolvedValue({ ok: true, pos: [] });
    renderWorkspace();
    fireEvent.click(screen.getByTestId("so-batch-issue-create"));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const body = JSON.parse((apiFetch.mock.calls[0]![1] as { body: string }).body);
    expect(body.documentDecisions[0].procurementPartnerId).toBeNull();
  });
});

describe("a decision is sent for EVERY document, not just the one on screen", () => {
  it("two documents produce two decisions, each keyed to its own pair", async () => {
    apiFetch.mockResolvedValue({ ok: true, pos: [] });
    renderWorkspace([doc(), SECOND]);
    fireEvent.click(screen.getByTestId("so-batch-issue-create"));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const body = JSON.parse((apiFetch.mock.calls[0]![1] as { body: string }).body);
    expect(body.documentDecisions).toHaveLength(2);
    expect(body.documentDecisions.map((d: { supplierId: string }) => d.supplierId)).toEqual([
      "s-hooka",
      "s-ohana",
    ]);
  });

  it("a blocker on document 2 blocks the batch from document 1's screen", () => {
    renderWorkspace([doc(), noCost]);
    expect(screen.getByTestId("so-batch-issue-count")).toHaveTextContent("1 of 2");
    expect(screen.getByTestId("so-batch-issue-create")).toBeDisabled();
    // ...and it says which document, so the operator knows where to go.
    expect(screen.getByTestId("so-batch-issue-blocker")).toHaveTextContent("X-NEW-K");
  });
});


/**
 * THE RIGHT-HAND SIDE IS THE ACTUAL DOCUMENT (Card §5.2).
 *
 * Not the `/print-data` JSON in an iframe — that would show a payload and call
 * it a purchase order. The same `renderPoPdf` template Purchase Orders prints
 * from, so the operator checks the exact bytes the supplier receives.
 */
describe("after creation the preview is the real official PDF", () => {
  const renderMod = () => import("@/lib/pdf/render");

  async function created() {
    apiFetch.mockImplementation((path: string) =>
      path.includes("issue-batch")
        ? Promise.resolve({
            ok: true,
            pos: [
              {
                id: "PO-20260822-4041", supplierId: "s-hooka", supplierName: "Hooka",
                destinationId: KLANG.id, destination: "Carres Klang",
              },
            ],
          })
        : Promise.resolve({
            po_number: "PO-20260822-4041", po_id: "PO-20260822-4041",
            version: 1, lines: [],
          }),
    );
    renderWorkspace();
    fireEvent.click(screen.getByTestId("so-batch-issue-create"));
    await screen.findByTestId("so-batch-evidence-PO-20260822-4041");
  }

  it("renders the PO template, not the JSON endpoint", async () => {
    await created();
    const frame = await screen.findByTestId("so-batch-pdf-PO-20260822-4041");
    expect(frame.tagName).toBe("IFRAME");
    const src = frame.getAttribute("src") ?? "";
    expect(src.startsWith("blob:")).toBe(true);
    expect(src).not.toContain("print-data");
    const { renderPoPdf } = await renderMod();
    expect(renderPoPdf).toHaveBeenCalled();
  });

  it("asks the document endpoint for the EXACT PO it created", async () => {
    await created();
    await screen.findByTestId("so-batch-pdf-PO-20260822-4041");
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/operation/pos/PO-20260822-4041/print-data",
    );
  });

  it("a render that fails SAYS so, and offers NOTHING to confirm", async () => {
    apiFetch.mockImplementation((path: string) =>
      path.includes("issue-batch")
        ? Promise.resolve({
            ok: true,
            pos: [
              {
                id: "PO-2099", supplierId: "s-hooka", supplierName: "Hooka",
                destinationId: KLANG.id, destination: "Carres Klang",
              },
            ],
          })
        : Promise.reject(new Error("not_found")),
    );
    renderWorkspace();
    fireEvent.click(screen.getByTestId("so-batch-issue-create"));
    await waitFor(() =>
      expect(screen.getByTestId("so-batch-pdf-placeholder-PO-2099")).toHaveTextContent(
        "not_found",
      ),
    );
    /* ⭐ NO VERSION MEANS NOTHING SAFE TO CONFIRM (0377). The document never
       rendered, so the operator cannot have seen a version, so the form that
       would declare one is not offered at all. */
    expect(screen.queryByTestId("so-batch-evidence-confirm")).not.toBeInTheDocument();
    expect(screen.getByTestId("so-batch-evidence-waiting")).toHaveTextContent("not_found");
  });
});
