import { describe, it, expect } from "vitest";
import {
  PROOF_DECISIONS,
  attemptEvidenceInput,
  latestEvidenceAtOf,
  proofDecisionLabel,
  proofReviewInput,
  proofReviewStateOf,
  signedDoAttachInput,
  signedDeliveryDocumentOf,
} from "./delivery-proof";

describe("Proof and its review — Delivery MASTER §6.1 (0489)", () => {
  it("the three review words are the MASTER's, and each key spells its word", () => {
    expect(PROOF_DECISIONS.map((d) => d.label)).toEqual([
      "Proof Accepted",
      "More Proof Required",
      "Proof Rejected",
    ]);
    expect(proofDecisionLabel("rejected")).toBe("Proof Rejected");
    expect(proofDecisionLabel("nonsense")).toBeNull();
  });

  it("a decision that asks for more, or refuses, must say why; acceptance needs no reason", () => {
    expect(proofReviewInput.safeParse({ decision: "accepted" }).success).toBe(true);
    expect(proofReviewInput.safeParse({ decision: "rejected", reason: " " }).success).toBe(false);
    expect(proofReviewInput.safeParse({ decision: "more_required" }).success).toBe(false);
    expect(
      proofReviewInput.safeParse({ decision: "rejected", reason: "Photo shows the lobby, not the goods" }).success,
    ).toBe(true);
    expect(proofReviewInput.safeParse({ decision: "approved" }).success).toBe(false);
  });

  it("evidence is a photo, a video or a document, at least one file per act", () => {
    expect(attemptEvidenceInput.safeParse({ files: [] }).success).toBe(false);
    expect(attemptEvidenceInput.safeParse({ files: [{ path: "a.jpg", kind: "photo" }] }).success).toBe(true);
    expect(attemptEvidenceInput.safeParse({ files: [{ path: "a.txt", kind: "note" }] }).success).toBe(false);
    expect(signedDoAttachInput.safeParse({ doFilePath: "" }).success).toBe(false);
    expect(signedDoAttachInput.safeParse({ doFilePath: "order-x/do.pdf", signerName: "Mr Tan" }).success).toBe(true);
  });

  it("the review state is ONE arithmetic: no file = nothing to review; a file without a review = pending", () => {
    expect(proofReviewStateOf({ latestEvidenceAt: null, reviews: [] })).toEqual({ state: "none", reviewedAt: null });
    expect(proofReviewStateOf({ latestEvidenceAt: "2026-09-10T02:00:00Z", reviews: [] })).toEqual({
      state: "pending",
      reviewedAt: null,
    });
  });

  it("the latest review decides — and a NEWER upload reopens the question", () => {
    const reviews = [
      { decision: "rejected" as const, reviewed_at: "2026-09-10T03:00:00Z" },
      { decision: "accepted" as const, reviewed_at: "2026-09-11T03:00:00Z" },
    ];
    expect(proofReviewStateOf({ latestEvidenceAt: "2026-09-10T02:00:00Z", reviews })).toEqual({
      state: "accepted",
      reviewedAt: "2026-09-11T03:00:00Z",
    });
    expect(proofReviewStateOf({ latestEvidenceAt: "2026-09-12T02:00:00Z", reviews })).toEqual({
      state: "pending",
      reviewedAt: "2026-09-11T03:00:00Z",
    });
    expect(
      proofReviewStateOf({ latestEvidenceAt: "2026-09-10T02:00:00Z", reviews: [reviews[0]!] }).state,
    ).toBe("rejected");
  });

  it("the newest file is read across the ledger stamped with THIS document, its attempt evidence and the signed paper", () => {
    expect(
      latestEvidenceAtOf({
        ledger: [
          { doNumber: "DO-1", at: "2026-09-10T01:00:00Z" },
          { doNumber: "DO-2", at: "2026-09-13T01:00:00Z" },
          { doNumber: null, at: "2026-09-14T01:00:00Z" },
        ],
        doNumber: "DO-1",
        attemptEvidence: [{ recorded_at: "2026-09-11T01:00:00Z" }],
        signedDoUploadedAt: "2026-09-12T01:00:00Z",
      }),
    ).toBe("2026-09-12T01:00:00Z");
    expect(latestEvidenceAtOf({ ledger: null, doNumber: "DO-1", attemptEvidence: [], signedDoUploadedAt: null })).toBeNull();
  });
});


describe("signedDeliveryDocumentOf — exact document ownership", () => {
  const mirror = { do_number: "DO-2", do_file_path: "order/final.pdf", do_uploaded_at: "2026-09-13T12:00:00Z" };
  const bound = { do_number: "DO-1", kind: "document" as const, path: "order/first.pdf", recorded_at: "2026-09-13T10:00:00Z" };
  it("never lends the final signature to an intermediate document or an unknown legacy number", () => {
    expect(signedDeliveryDocumentOf({ documentNumber: "DO-1", order: mirror })).toBeNull();
    expect(signedDeliveryDocumentOf({ documentNumber: "DO-1", order: { ...mirror, do_number: null } })).toBeNull();
  });
  it("retains a trip’s own bound paper when the order mirror moves to another DO", () => {
    expect(signedDeliveryDocumentOf({ documentNumber: "DO-1", order: mirror, evidence: [bound] })).toEqual({ path: bound.path, uploadedAt: bound.recorded_at });
  });
  it("accepts the matching legacy mirror and chooses the newest own file", () => {
    expect(signedDeliveryDocumentOf({ documentNumber: "DO-2", order: mirror, evidence: [bound] })).toEqual({ path: mirror.do_file_path, uploadedAt: mirror.do_uploaded_at });
    const newer = { ...bound, recorded_at: "2026-09-13T13:00:00Z", path: "order/new.pdf" };
    expect(signedDeliveryDocumentOf({ documentNumber: "DO-1", evidence: [bound, newer] })?.path).toBe(newer.path);
  });
  it("ignores photos, empty paths and another document’s evidence", () => {
    expect(signedDeliveryDocumentOf({ documentNumber: "DO-1", evidence: [{ ...bound, kind: "photo" }, { ...bound, path: " " }, { ...bound, do_number: "DO-2" }] })).toBeNull();
  });
});
