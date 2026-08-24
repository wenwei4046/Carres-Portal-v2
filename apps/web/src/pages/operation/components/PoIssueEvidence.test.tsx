import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const apiFetch = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...a: unknown[]) => apiFetch(...a) };
});

import PoIssueEvidence, {
  confirmedSendFor,
  type PoSendEvidence,
} from "./PoIssueEvidence";

/**
 * THE ONE EVIDENCE JOURNEY, SHARED BY BOTH SURFACES
 * (CARD-2026-08-22-purchasing-02 §5.3 / §9 Task 6; migrations 0377 · 0378).
 *
 * Its whole job is to keep two facts apart — an app that OPENED and a PDF that
 * ARRIVED — and to bind the second one to the exact version the operator saw.
 */
const PO = {
  id: "PO-20260823-4041",
  supplierId: "s-hooka",
  supplierName: "Hooka",
  destinationId: "d1",
  destination: "Carres Klang",
};

const opened: PoSendEvidence = {
  channel: "whatsapp",
  sent_at: "2026-08-23T09:02:00Z",
  kind: "external_open",
  recipient: null,
  po_version: null,
};
const sentV1: PoSendEvidence = {
  channel: "whatsapp",
  sent_at: "2026-08-23T09:10:00Z",
  kind: "confirmed_sent",
  recipient: "Hooka Purchasing Group",
  po_version: 1,
};

const onConfirmed = vi.fn();
const onOpened = vi.fn();
/**
 * ⭐ THE SUPPLIER'S REAL DOORS ARE PASSED IN (closure §7). This component is the
 * ONE communication area now, so the WhatsApp group, the email address and the
 * drafted message come from whoever knows the supplier. A surface with none on
 * file names the gap instead of offering a button that opens nothing.
 */
const DOORS = {
  whatsapp: { url: "https://chat.whatsapp.com/hooka", isGroup: true },
  mailto: "mailto:buy@hooka.my",
  message: "Hi Hooka, please build PO-20260823-4041.",
  supplierName: "Hooka",
};
const renderIt = (
  version: number,
  evidence: PoSendEvidence[] = [],
  doors: typeof DOORS | undefined = DOORS,
) =>
  render(
    <PoIssueEvidence
      po={PO}
      version={version}
      evidence={evidence}
      doors={doors}
      onOpened={onOpened}
      onConfirmed={onConfirmed}
    />,
  );

beforeEach(() => {
  apiFetch.mockReset();
  onConfirmed.mockClear();
});

describe("an app that OPENED never completes Issue PO", () => {
  it("a PO with only opens still reads as not reached", () => {
    renderIt(1, [opened]);
    expect(screen.getByTestId(`so-batch-evidence-${PO.id}`)).toHaveTextContent(
      "has not reached Hooka",
    );
    expect(screen.getByTestId("so-batch-evidence-confirm")).toBeInTheDocument();
  });

  it("the open is kept as communication history, because it is true", () => {
    renderIt(1, [opened]);
    expect(screen.getByTestId(`so-batch-evidence-history-${PO.id}`)).toHaveTextContent(
      "WhatsApp opened",
    );
  });

  it("`confirmedSendFor` never returns an open, at any version", () => {
    expect(confirmedSendFor([opened], 1)).toBeNull();
    expect(confirmedSendFor([opened], 2)).toBeNull();
  });
});

describe("confirmed evidence is bound to ONE version", () => {
  it("Version 1 evidence completes Version 1", () => {
    renderIt(1, [sentV1, opened]);
    const panel = screen.getByTestId(`so-batch-evidence-${PO.id}`);
    expect(panel).toHaveTextContent("PO-20260823-4041 · Version 1 reached Hooka");
    expect(panel).toHaveTextContent("Hooka Purchasing Group");
    expect(screen.queryByTestId("so-batch-evidence-confirm")).not.toBeInTheDocument();
  });

  it("⭐ Version 1 evidence does NOT complete Version 2", () => {
    renderIt(2, [sentV1, opened]);
    expect(screen.getByTestId(`so-batch-evidence-${PO.id}`)).toHaveTextContent(
      "PO-20260823-4041 · Version 2 has not reached Hooka",
    );
    // The act is offered again, because the new document is unsent.
    expect(screen.getByTestId("so-batch-evidence-confirm")).toBeInTheDocument();
    // ...and Version 1's send stays as history rather than disappearing.
    expect(screen.getByTestId(`so-batch-evidence-history-${PO.id}`)).toHaveTextContent(
      "Version 1 sent to Hooka Purchasing Group",
    );
  });

  it("the derivation is pure and says so", () => {
    expect(confirmedSendFor([sentV1], 1)).toBe(sentV1);
    expect(confirmedSendFor([sentV1], 2)).toBeNull();
  });
});

describe("persisted evidence survives a reload", () => {
  it("the panel is drawn from the SERVER's rows, not from local state", () => {
    // No interaction at all — this is a fresh mount, exactly as a reload is.
    renderIt(1, [sentV1]);
    const panel = screen.getByTestId(`so-batch-evidence-${PO.id}`);
    expect(panel).toHaveTextContent("reached Hooka");
    expect(panel).toHaveTextContent("WhatsApp to Hooka Purchasing Group");
    expect(screen.queryByTestId("so-batch-evidence-confirm")).not.toBeInTheDocument();
  });

  it("the recipient and channel shown are the RECORDED ones", () => {
    renderIt(1, [{ ...sentV1, channel: "email", recipient: "buy@hooka.my" }]);
    expect(screen.getByTestId("so-batch-evidence-recipient")).toHaveValue("buy@hooka.my");
    expect(screen.getByTestId("so-batch-evidence-channel")).toHaveValue("email");
    expect(screen.getByTestId("so-batch-evidence-recipient")).toBeDisabled();
  });
});

describe("the confirmation declares the version it is looking at", () => {
  it("sends poVersion with the channel and recipient", async () => {
    apiFetch.mockResolvedValue({ ok: true });
    renderIt(3);
    fireEvent.change(screen.getByTestId("so-batch-evidence-recipient"), {
      target: { value: "Hooka Purchasing Group" },
    });
    fireEvent.click(screen.getByTestId("so-batch-evidence-confirm"));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = apiFetch.mock.calls[0]!;
    expect(path).toBe("/api/operation/pos/PO-20260823-4041/confirm-sent");
    expect(JSON.parse((init as { body: string }).body)).toEqual({
      channel: "whatsapp",
      recipient: "Hooka Purchasing Group",
      poVersion: 3,
    });
  });

  it("a stale version is reported in the approved two lines", async () => {
    apiFetch.mockRejectedValue(
      Object.assign(new Error("stale"), {
        body: {
          code: "stale_po_version",
          message: "Purchase order changed",
          action: "Open the latest PDF and send it again.",
        },
      }),
    );
    renderIt(1);
    fireEvent.change(screen.getByTestId("so-batch-evidence-recipient"), {
      target: { value: "Hooka" },
    });
    fireEvent.click(screen.getByTestId("so-batch-evidence-confirm"));
    const err = await screen.findByTestId("so-batch-evidence-error");
    expect(err).toHaveTextContent("Purchase order changed");
    expect(err).toHaveTextContent("Open the latest PDF and send it again.");
    // Nothing was completed.
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it("the tools still complete nothing — they open, and the act stays open", () => {
    renderIt(1);
    fireEvent.click(screen.getByTestId("po-open-whatsapp"));
    fireEvent.click(screen.getByTestId("po-open-email"));
    /* An OPEN is history (`external_open`) and the caller records it. It does
       not confirm anything and it never calls `confirm-sent`. */
    expect(onOpened.mock.calls.map((c) => c[0])).toEqual(["whatsapp", "email"]);
    expect(apiFetch).not.toHaveBeenCalled();
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(screen.getByTestId("so-batch-evidence-confirm")).toBeInTheDocument();
  });
});

describe("both surfaces use THIS component — one law, not two", () => {
  const HERE = dirname(fileURLToPath(import.meta.url));

  it("SO Batch Purchase mounts it", () => {
    const src = readFileSync(
      join(HERE, "..", "so-batch", "SoBatchIssueWorkspace.tsx"),
      "utf8",
    );
    expect(src).toContain("PoIssueEvidence");
  });

  it("Purchase Order detail mounts it too", () => {
    const src = readFileSync(join(HERE, "..", "OperationPurchaseOrders.tsx"), "utf8");
    expect(src).toContain('import PoIssueEvidence from "./components/PoIssueEvidence"');
    expect(src).toContain("<PoIssueEvidence");
    // It reads the PERSISTED rows and the PO's current version.
    expect(src).toContain("evidence={sends}");
    expect(src).toContain("version={po.version ?? 1}");
  });

  it("Purchase Order detail no longer claims there is no `I've sent` action", () => {
    const src = readFileSync(join(HERE, "..", "OperationPurchaseOrders.tsx"), "utf8");
    expect(src).not.toMatch(/There is still no "I've sent" button/);
  });

  it("neither surface spells its own confirmation door", () => {
    for (const rel of [
      ["..", "so-batch", "SoBatchIssueWorkspace.tsx"],
      ["..", "OperationPurchaseOrders.tsx"],
    ]) {
      const src = readFileSync(join(HERE, ...rel), "utf8");
      expect(src, rel.join("/")).not.toContain("confirm-sent");
    }
  });
});
