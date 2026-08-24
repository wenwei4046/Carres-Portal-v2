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
    category: "mattress",
    orderId: null,
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
  category: "mattress",
  orderId: null,
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
/**
 * ⭐ THE READS THIS SURFACE MAKES BEFORE ANYBODY PRESSES ANYTHING.
 *
 * `cost-approvals` (0380) answers which exceptions a manager already approved,
 * and `sends` (closure §8) is the PERSISTED outbound evidence — this surface
 * used to invent a row after a confirmation and call it history. Both are reads;
 * the default here is "nothing on file", which is the honest baseline.
 */
function stubReads(over?: (path: string) => unknown | undefined) {
  apiFetch.mockImplementation(async (path: string, init?: unknown) => {
    const hit = over?.(path);
    if (hit !== undefined) return hit;
    if (path.includes("/cost-approvals")) return { approvals: [] };
    if (path.endsWith("/sends")) return { sends: [] };
    if (path.includes("/print-data")) {
      return { po_number: "PO-1", po_id: "PO-1", version: 1, lines: [] };
    }
    if (path.includes("issue-batch")) return { pos: [] };
    void init;
    return {};
  });
}

/** The ISSUE request's body, whatever reads happened around it. */
function issueBody() {
  const call = apiFetch.mock.calls.find(([p]) => String(p).includes("issue-batch"));
  expect(call, "no issue request was made").toBeTruthy();
  return JSON.parse((call![1] as { body: string }).body);
}

/** The issue succeeds and creates nothing this test looks at. */
const issuesOk = () =>
  stubReads((path) => (path.includes("issue-batch") ? { ok: true, pos: [] } : undefined));

/**
 * A MANAGER'S STANDING APPROVAL for one exception (0380). PO Duty cannot write
 * one for itself, so a changed price or a Free of Charge cannot be issued until
 * this exists.
 */
function withApproval(a: {
  sku: string;
  treatment: "hand_entered" | "free_of_charge";
  unitCost?: number | null;
  approvedBy?: string;
}) {
  stubReads((path) => {
    if (path.includes("/cost-approvals")) {
      return {
        approvals: [
          {
            sku: a.sku,
            treatment: a.treatment,
            unitCost: a.unitCost ?? null,
            approvedBy: a.approvedBy ?? "Jess",
            expiresOn: null,
          },
        ],
      };
    }
    if (path.includes("issue-batch")) return { ok: true, pos: [] };
    return undefined;
  });
}

beforeEach(() => {
  onBack.mockClear();
  onDone.mockClear();
  apiFetch.mockReset();
  stubReads();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:so-batch-test"),
  });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});

describe("50% work + 50% the actual document", () => {
  /**
   * ⭐ 50 / 50 AT 1130px AND WIDER; STACKED BELOW IT (closure §10).
   *
   * The split used to be unconditional, so a narrower window gave each half
   * under 565px: the PDF page became unreadable and the decision controls
   * clipped. jsdom computes no media queries, so the CONTRACT is asserted on the
   * classes — the breakpoint itself is walked in the browser.
   */
  it("gives each side half the content area from 1130px up, and stacks below it", () => {
    renderWorkspace();
    const split = screen.getByTestId("so-batch-issue-split");
    /* ⭐ A FLEX COLUMN when stacked, a two-column GRID from the breakpoint.
       Walked at 1129px on 2026-08-24: a one-column GRID compressed the work row
       to 208px and clipped the cost block, the blocker and both buttons with no
       scrollbar, because the row reported that it fitted. */
    expect(split.className).toContain("flex-col");
    expect(split.className).toContain("min-[1130px]:grid");
    expect(split.className).toContain("min-[1130px]:grid-cols-2");
    expect(split.className).not.toContain("grid-cols-1");
    /* Stacked, the SPLIT scrolls; side by side, each half scrolls itself. */
    expect(split.className).toContain("overflow-y-auto");
    expect(split.className).toContain("min-[1130px]:overflow-hidden");
    const work = screen.getByTestId("so-batch-issue-work");
    const preview = screen.getByTestId("so-batch-issue-preview");
    /* Neither pane may be compressed below its content when stacked. */
    expect(work.className).toContain("shrink-0");
    expect(preview.className).toContain("shrink-0");
    expect(work.className).toContain("min-[1130px]:min-h-0");
    /* The work comes FIRST when stacked: the operator's next act is there, and
       a document they cannot read is not worth the top half. */
    expect(work.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    /* And the stacked PDF keeps a readable height instead of collapsing. */
    expect(preview.className).toContain("min-h-[70vh]");
    /* The divider follows the direction the panes sit in. */
    expect(work.className).toContain("border-b");
    expect(work.className).toContain("min-[1130px]:border-r");
  });

  it("never clips an action: the decision side scrolls rather than hiding its buttons", () => {
    renderWorkspace();
    const work = screen.getByTestId("so-batch-issue-work");
    expect(work.className).toContain("min-[1130px]:overflow-y-auto");
    /* And the 50px destination header truncates a long title instead of
       wrapping it into a row that cannot show the second line (walked 375px). */
    expect(screen.getByTestId("so-batch-issue-count").className).toContain("whitespace-nowrap");
    /* `Back to buying` and `Issue PO` are always reachable, at any width. */
    expect(screen.getByTestId("so-batch-issue-back")).toBeInTheDocument();
    expect(screen.getByTestId("so-batch-issue-create")).toBeInTheDocument();
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
    /* Reads are fine — the surface asks which exceptions a manager already
       approved (0380). What it must not do is WRITE. */
    for (const [path, init] of apiFetch.mock.calls) {
      expect((init as { method?: string } | undefined)?.method ?? "GET").toBe("GET");
      expect(String(path)).not.toContain("issue-batch");
    }
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
      "po-open-whatsapp",
      "po-open-email",
      "so-batch-evidence-download",
      "so-batch-evidence-confirm",
    ]) {
      expect(screen.queryByTestId(id), id).not.toBeInTheDocument();
    }
  });
});

describe("Issue PO creates every document in one request", () => {
  /** The issue response, WITH the supplier's real doors (closure §7). */
  const ISSUED = {
    ok: true,
    pos: [
      {
        id: "PO-2041",
        supplierId: "s-hooka",
        supplierName: "Hooka",
        destinationId: KLANG.id,
        destination: "Carres Klang",
        whatsappGroupUrl: "https://chat.whatsapp.com/hooka",
        contactEmail: "buy@hooka.my",
        contact: "+60 12-345 6789",
      },
    ],
  };
  function issued() {
    stubReads((path) => (path.includes("issue-batch") ? ISSUED : undefined));
  }

  it("posts ONE batch request, not one per document", async () => {
    issued();
    renderWorkspace([doc(), SECOND]);
    fireEvent.click(screen.getByTestId("so-batch-issue-create"));
    /* ONE issue request, however many documents and however many reads the
       surface made around it. */
    const writes = () =>
      apiFetch.mock.calls.filter(([p]) => String(p).includes("issue-batch"));
    await waitFor(() => expect(writes()).toHaveLength(1));
    const [path, init] = writes()[0]!;
    expect(path).toBe("/api/operation/purchase/to-order/issue-batch");
    const body = JSON.parse((init as { body: string }).body);
    expect(body.selections).toHaveLength(2);
    expect(body.selections[0].allocations).toEqual([
      { destinationId: KLANG.id, qty: 2 },
    ]);
  });

  it("a failure creates nothing and says what to do about it", async () => {
    /* ⭐ THE TWO LINES (closure §9). The surface used to print the raw error
       message — an operator cannot act on `allocation_mismatch`. */
    stubReads((path) => {
      if (!path.includes("issue-batch")) return undefined;
      throw Object.assign(new Error("refused"), {
        body: {
          code: "allocation_mismatch",
          message: "You arranged 10 units and must buy 11.",
          action: "Change the Deliver To split so the units add up, then issue again.",
        },
      });
    });
    renderWorkspace();
    fireEvent.click(screen.getByTestId("so-batch-issue-create"));
    await waitFor(() => {
      const err = screen.getByTestId("so-batch-issue-error");
      expect(err).toHaveTextContent("You arranged 10 units and must buy 11.");
      expect(err).toHaveTextContent("Change the Deliver To split");
    });
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
    stubReads((path) => {
      if (path.includes("issue-batch")) {
        return {
          ok: true,
          pos: [
            {
              id: "PO-2041", supplierId: "s-hooka", supplierName: "Hooka",
              destinationId: KLANG.id, destination: "Carres Klang",
              whatsappGroupUrl: "https://chat.whatsapp.com/hooka",
              contactEmail: "buy@hooka.my",
              contact: "+60 12-345 6789",
            },
          ],
        };
      }
      /* The official document reports Version 2 — the operator is looking at a
         REVISED purchase order, and that is what must be recorded. */
      if (path.includes("print-data")) {
        return { po_number: "PO-2041", po_id: "PO-2041", version: 2, lines: [] };
      }
      return undefined;
    });
    renderWorkspace();
    fireEvent.click(screen.getByTestId("so-batch-issue-create"));
    await screen.findByTestId("so-batch-evidence-PO-2041");
    apiFetch.mockReset();
    stubReads();
  }

  it("says what has not happened yet, naming the exact version", async () => {
    await reachEvidence();
    expect(screen.getByTestId("so-batch-evidence-PO-2041")).toHaveTextContent(
      "PO-2041 · Version 2 has not reached Hooka",
    );
  });

  it("opening WhatsApp or email writes NOTHING and completes NOTHING", async () => {
    await reachEvidence();
    apiFetch.mockClear();
    fireEvent.click(screen.getByTestId("po-open-whatsapp"));
    fireEvent.click(screen.getByTestId("po-open-email"));
    /* SO Batch Purchase writes NO `external_open`: that row belongs to the
       Purchase Order object, and a second writer of it would be a second truth
       about the same document. */
    expect(apiFetch).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByTestId("so-batch-evidence-PO-2041")).toHaveTextContent(
      "has not reached",
    );
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
    const confirmCall = () =>
      apiFetch.mock.calls.find(([p]) => String(p).includes("confirm-sent"));
    await waitFor(() => expect(confirmCall()).toBeTruthy());
    const [path, init] = confirmCall()!;
    expect(path).toBe("/api/operation/pos/PO-2041/confirm-sent");
    expect(path).not.toContain("/sends");
    const body = JSON.parse((init as { body: string }).body);
    /* ⭐ THE VERSION RIDES, and it is the one the RENDERED document reported —
       not a list row, not a second fetch (0378). */
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
    const blocker = screen.getByTestId("so-batch-issue-blocker");
    /* ⭐ THE TWO LINES (closure §9): the fact, then the act. */
    expect(blocker).toHaveTextContent("X-NEW-K has no transaction cost.");
    expect(blocker).toHaveTextContent("Type the agreed cost of X-NEW-K");
  });

  /**
   * ⭐ A TYPED PRICE IS A COMMERCIAL EXCEPTION (0380; closure §2).
   *
   * PO Duty could type any Transaction Cost and issue it on its own word.
   * Operations executes the buy; it does not decide what Carres agrees to pay,
   * so the button stays shut until somebody else has approved the number — and
   * the surface says whose approval is missing rather than waiting to refuse.
   */
  it("a typed cost still waits for a manager, and says so", () => {
    renderWorkspace([noCost]);
    fireEvent.change(screen.getByTestId("so-batch-cost-X-NEW-K"), {
      target: { value: "480" },
    });
    expect(screen.getByTestId("so-batch-issue-create")).toBeDisabled();
    const hint = screen.getByTestId("so-batch-needs-approval-X-NEW-K");
    expect(hint).toHaveTextContent("This is not the Catalog price.");
    expect(hint).toHaveTextContent("Ask a manager to approve this price for Hooka.");
    const blocker = screen.getByTestId("so-batch-issue-blocker");
    expect(blocker).toHaveTextContent("Nobody approved this price for X-NEW-K.");
  });

  it("an approved typed cost unblocks it, names the approver, and rides as hand-entered", async () => {
    withApproval({ sku: "X-NEW-K", treatment: "hand_entered", unitCost: 480, approvedBy: "Jess" });
    renderWorkspace([noCost]);
    fireEvent.change(screen.getByTestId("so-batch-cost-X-NEW-K"), {
      target: { value: "480" },
    });
    await waitFor(() =>
      expect(screen.getByTestId("so-batch-approved-X-NEW-K")).toHaveTextContent(
        "Jess approved this price.",
      ),
    );
    expect(screen.getByTestId("so-batch-issue-create")).toBeEnabled();
    fireEvent.click(screen.getByTestId("so-batch-issue-create"));
    await waitFor(() => expect(issueBody()).toBeTruthy());
    const body = issueBody();
    expect(body.documentDecisions[0].lineDecisions).toEqual([
      {
        sku: "X-NEW-K", treatment: "normal", unitCost: 480,
        costSource: "hand_entered", expectedCatalogCost: null,
      },
    ]);
    // ...and the decision names the exact document it belongs to.
    expect(body.documentDecisions[0].documentKey).toBe(noCost.key);
  });

  /**
   * ⭐ AN UNTOUCHED CATALOG PRICE IS DECLARED TOO (0380; closure §2).
   *
   * It used to be OMITTED, on the reasoning that the server would read its own
   * catalog and stamp it. That WAS the defect: the database then compared the
   * live value against itself and agreed every time, so a supplier price that
   * moved between the review and Issue PO was adopted with nobody's approval and
   * nobody's knowledge. What the operator SAW now travels with the line.
   */
  it("an untouched Catalog price is DECLARED, so the server has something to compare", async () => {
    issuesOk();
    renderWorkspace();
    fireEvent.click(screen.getByTestId("so-batch-issue-create"));
    await waitFor(() => expect(issueBody()).toBeTruthy());
    expect(issueBody().documentDecisions[0].lineDecisions).toEqual([
      {
        sku: "B1201S-K",
        treatment: "normal",
        costSource: "catalog",
        unitCost: 100,
        expectedCatalogCost: 100,
      },
    ]);
  });

  it("a CHANGED catalog price is sent as hand-entered, never as `catalog`", async () => {
    withApproval({ sku: "B1201S-K", treatment: "hand_entered", unitCost: 150 });
    renderWorkspace();
    fireEvent.change(screen.getByTestId("so-batch-cost-B1201S-K"), {
      target: { value: "150" },
    });
    await waitFor(() => expect(screen.getByTestId("so-batch-issue-create")).toBeEnabled());
    fireEvent.click(screen.getByTestId("so-batch-issue-create"));
    await waitFor(() => expect(issueBody()).toBeTruthy());
    const body = issueBody();
    expect(body.documentDecisions[0].lineDecisions[0]).toEqual({
      sku: "B1201S-K", treatment: "normal", unitCost: 150,
      costSource: "hand_entered",
      /* The price it was reviewed against — so the server can tell an agreed
         difference from a supplier moving the price after the operator looked. */
      expectedCatalogCost: 100,
    });
  });

  it("Free of Charge needs a reason, and says so until it has one", () => {
    renderWorkspace([noCost]);
    fireEvent.click(screen.getByTestId("so-batch-foc-X-NEW-K"));
    expect(screen.getByTestId("so-batch-issue-create")).toBeDisabled();
    expect(screen.getByTestId("so-batch-issue-blocker")).toHaveTextContent(
      "X-NEW-K is Free of Charge with no reason.",
    );
    fireEvent.change(screen.getByTestId("so-batch-foc-reason-X-NEW-K"), {
      target: { value: "   " },
    });
    expect(screen.getByTestId("so-batch-issue-create")).toBeDisabled();
  });

  /**
   * ⭐ AND A REASON IS NOT AN APPROVAL (0380; closure §2). PO Duty could mark a
   * line Free of Charge with only a reason string. Giving goods away is a
   * commercial decision, so it needs the same approval a changed price needs.
   */
  it("Free of Charge with a reason still waits for a manager", () => {
    renderWorkspace([noCost]);
    fireEvent.click(screen.getByTestId("so-batch-foc-X-NEW-K"));
    fireEvent.change(screen.getByTestId("so-batch-foc-reason-X-NEW-K"), {
      target: { value: "Supplier replacement" },
    });
    expect(screen.getByTestId("so-batch-issue-create")).toBeDisabled();
    expect(screen.getByTestId("so-batch-issue-blocker")).toHaveTextContent(
      "Nobody approved this price for X-NEW-K.",
    );
  });

  it("an APPROVED Free of Charge rides the request, and asks no price", async () => {
    withApproval({ sku: "X-NEW-K", treatment: "free_of_charge" });
    renderWorkspace([noCost]);
    fireEvent.click(screen.getByTestId("so-batch-foc-X-NEW-K"));
    fireEvent.change(screen.getByTestId("so-batch-foc-reason-X-NEW-K"), {
      target: { value: "Supplier replacement" },
    });
    expect(screen.queryByTestId("so-batch-cost-X-NEW-K")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("so-batch-issue-create")).toBeEnabled());
    fireEvent.click(screen.getByTestId("so-batch-issue-create"));
    await waitFor(() => expect(issueBody()).toBeTruthy());
    expect(issueBody().documentDecisions[0].lineDecisions).toEqual([
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
    const blocker = screen.getByTestId("so-batch-issue-blocker");
    expect(blocker).toHaveTextContent("Hooka does not deliver. Nobody is collecting.");
    expect(blocker).toHaveTextContent("Choose who collects the goods, then issue again.");
  });

  it("choosing one unblocks it and rides the request", async () => {
    issuesOk();
    renderWorkspace([pickup]);
    fireEvent.change(screen.getByTestId("so-batch-partner"), { target: { value: "p-nets" } });
    expect(screen.getByTestId("so-batch-issue-create")).toBeEnabled();
    fireEvent.click(screen.getByTestId("so-batch-issue-create"));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const body = issueBody();
    expect(body.documentDecisions[0].procurementPartnerId).toBe("p-nets");
  });

  it("an own-logistics document is offered no partner control at all", () => {
    renderWorkspace();
    expect(screen.queryByTestId("so-batch-partner")).not.toBeInTheDocument();
  });

  it("its partner is null on the wire — never omitted, never smuggled", async () => {
    issuesOk();
    renderWorkspace();
    fireEvent.click(screen.getByTestId("so-batch-issue-create"));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const body = issueBody();
    expect(body.documentDecisions[0].procurementPartnerId).toBeNull();
  });
});

describe("a decision is sent for EVERY document, not just the one on screen", () => {
  it("two documents produce two decisions, each keyed to its own pair", async () => {
    issuesOk();
    renderWorkspace([doc(), SECOND]);
    fireEvent.click(screen.getByTestId("so-batch-issue-create"));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const body = issueBody();
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
    /* ⭐ NO VERSION MEANS NOTHING SAFE TO CONFIRM (0378). The document never
       rendered, so the operator cannot have seen a version, so the form that
       would declare one is not offered at all. */
    expect(screen.queryByTestId("so-batch-evidence-confirm")).not.toBeInTheDocument();
    expect(screen.getByTestId("so-batch-evidence-waiting")).toHaveTextContent("not_found");
  });
});

/**
 * ⭐ CLOSURE §8 — THE EVIDENCE IS THE SERVER'S, NOT THIS TAB'S MEMORY.
 *
 * This surface used to hand the evidence panel a row it had MADE UP after a
 * successful confirmation: right version, invented channel, no recipient, no
 * actor, no server time. It read as evidence and was a memory — and a reload
 * showed nothing at all.
 */
describe("closure §8 · outbound evidence is read back, never remembered", () => {
  const PO = {
    id: "PO-20260824-4827",
    supplierId: "s-hooka",
    supplierName: "Hooka",
    destinationId: KLANG.id,
    destination: "Carres Klang",
    whatsappGroupUrl: "https://chat.whatsapp.com/hooka",
    contactEmail: "buy@hooka.my",
    contact: "+60 12-345 6789",
  };

  async function reach(sends: unknown[] = [], version = 1) {
    stubReads((path) => {
      if (path.includes("issue-batch")) return { ok: true, pos: [PO] };
      if (path.endsWith("/sends")) return { sends };
      if (path.includes("print-data")) {
        return { po_number: PO.id, po_id: PO.id, version, lines: [] };
      }
      return undefined;
    });
    renderWorkspace();
    fireEvent.click(screen.getByTestId("so-batch-issue-create"));
    await screen.findByTestId(`so-batch-evidence-${PO.id}`);
  }

  it("reads the persisted po_sends for the document on screen", async () => {
    await reach();
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(`/api/operation/pos/${PO.id}/sends`),
    );
  });

  it("shows a persisted confirmed send with its channel, recipient and actor", async () => {
    await reach([
      {
        channel: "whatsapp",
        sent_at: "2026-08-24T02:10:00Z",
        kind: "confirmed_sent",
        recipient: "Hooka Purchasing Group",
        po_version: 1,
        sent_by_name: "Shasha",
      },
    ]);
    const panel = await screen.findByTestId(`so-batch-evidence-${PO.id}`);
    await waitFor(() => expect(panel).toHaveTextContent("Version 1 reached Hooka"));
    expect(panel).toHaveTextContent("WhatsApp to Hooka Purchasing Group by Shasha");
  });

  /**
   * ⭐ AN OLD SEND NEVER PROVES A NEW VERSION WAS SENT (0378).
   *
   * The supplier holds Version 1. Version 2 exists. Issue PO must stay OPEN, and
   * the Version 1 evidence must stay visible AS HISTORY — a revision whose
   * predecessor's send closed it is a document nobody ever posted.
   */
  it("a confirmed send of an EARLIER version stays history and closes nothing", async () => {
    await reach(
      [
        {
          channel: "whatsapp",
          sent_at: "2026-08-24T02:10:00Z",
          kind: "confirmed_sent",
          recipient: "Hooka Purchasing Group",
          po_version: 1,
          sent_by_name: "Shasha",
        },
      ],
      2,
    );
    const panel = await screen.findByTestId(`so-batch-evidence-${PO.id}`);
    await waitFor(() => expect(panel).toHaveTextContent("Version 2 has not reached Hooka"));
    expect(screen.getByTestId("so-batch-evidence-confirm")).toBeInTheDocument();
    expect(screen.getByTestId(`so-batch-evidence-history-${PO.id}`)).toHaveTextContent(
      "Version 1 sent to Hooka Purchasing Group by WhatsApp · Shasha",
    );
    expect(onDone).not.toHaveBeenCalled();
  });

  it("an external OPEN is history and never closes the act", async () => {
    await reach([
      {
        channel: "email",
        sent_at: "2026-08-24T02:00:00Z",
        kind: "external_open",
        recipient: null,
        po_version: null,
        sent_by_name: "Li Ching",
      },
    ]);
    const panel = await screen.findByTestId(`so-batch-evidence-${PO.id}`);
    await waitFor(() => expect(panel).toHaveTextContent("has not reached Hooka"));
    expect(screen.getByTestId(`so-batch-evidence-history-${PO.id}`)).toHaveTextContent(
      "Email opened · Li Ching",
    );
  });

  it("re-reads the evidence after the operator records a send", async () => {
    await reach();
    apiFetch.mockClear();
    fireEvent.change(screen.getByTestId("so-batch-evidence-recipient"), {
      target: { value: "Hooka Purchasing Group" },
    });
    fireEvent.click(screen.getByTestId("so-batch-evidence-confirm"));
    await waitFor(() =>
      expect(
        apiFetch.mock.calls.some(([p]) => String(p).endsWith("/sends")),
      ).toBe(true),
    );
  });

  /** ⭐ CLOSURE §7 — the supplier's REAL door, not a generic web page. */
  it("opens the supplier's own WhatsApp group and email address", async () => {
    await reach();
    const wa = (await screen.findByTestId("po-open-whatsapp")) as HTMLAnchorElement;
    expect(wa.getAttribute("href")).toBe("https://chat.whatsapp.com/hooka");
    expect(wa).toHaveTextContent("Open WhatsApp group");
    const mail = screen.getByTestId("po-open-email") as HTMLAnchorElement;
    expect(mail.getAttribute("href")).toContain("mailto:buy%40hooka.my");
  });

  /** ⭐ CLOSURE §6 — `Download PDF` hands over a PDF, never the payload. */
  it("Download PDF renders the document, and never links at /print-data", async () => {
    await reach();
    const btn = await screen.findByTestId("so-batch-evidence-download");
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.getAttribute("href")).toBeNull();
    const { renderPoPdf } = await import("@/lib/pdf/render");
    vi.mocked(renderPoPdf).mockClear();
    fireEvent.click(btn);
    await waitFor(() => expect(renderPoPdf).toHaveBeenCalled());
  });
});
