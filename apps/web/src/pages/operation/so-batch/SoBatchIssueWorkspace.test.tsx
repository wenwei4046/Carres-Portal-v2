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
      },
    ],
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
    },
  ],
});

const onBack = vi.fn();
const onDone = vi.fn();

function renderWorkspace(documents: SoBatchDocument[] = [doc()]) {
  return render(
    <SoBatchIssueWorkspace
      documents={documents}
      destinations={[KLANG, BULOH]}
      onBack={onBack}
      onDone={onDone}
    />,
  );
}

beforeEach(() => {
  onBack.mockClear();
  onDone.mockClear();
  apiFetch.mockReset();
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
    renderWorkspace();
    fireEvent.click(screen.getByTestId("so-batch-issue-create"));
    await screen.findByTestId("so-batch-evidence-PO-2041");
    apiFetch.mockReset();
  }

  it("says what has not happened yet, in the document's own words", async () => {
    await reachEvidence();
    expect(screen.getByTestId("so-batch-evidence-PO-2041")).toHaveTextContent(
      "PO-2041 has not reached Hooka",
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
    expect(body).toEqual({ channel: "whatsapp", recipient: "Hooka Purchasing Group" });
    expect(body).not.toHaveProperty("poVersion");
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
