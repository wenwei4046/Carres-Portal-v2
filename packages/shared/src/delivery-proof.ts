/**
 * PROOF AND ITS REVIEW — Delivery MASTER §6.1 (owner ruling 2026-09-13; 0489).
 *
 * Proof is bound to the exact event it proves. An uploaded file records what
 * the driver sent; it is not proof accepted and not a successful delivery.
 * Operation reviews delivery proof as `Proof Accepted`, `More Proof Required`
 * or `Proof Rejected`, each with a reason. `Proof Accepted` is the fact that
 * turns `Delivered` green everywhere and closes `Upload delivery proof`;
 * `Proof Rejected` reopens it with the reason.
 */
import { z } from "zod";

export const PROOF_DECISIONS = [
  { key: "accepted", label: "Proof Accepted" },
  { key: "more_required", label: "More Proof Required" },
  { key: "rejected", label: "Proof Rejected" },
] as const;
export type ProofDecisionKey = (typeof PROOF_DECISIONS)[number]["key"];
export const PROOF_DECISION_KEYS = PROOF_DECISIONS.map((d) => d.key) as [ProofDecisionKey, ...ProofDecisionKey[]];
export function proofDecisionLabel(key: string | null | undefined): string | null {
  return PROOF_DECISIONS.find((d) => d.key === key)?.label ?? null;
}

export const proofReviewInput = z
  .object({
    attemptId: z.string().uuid().nullish(),
    decision: z.enum(PROOF_DECISION_KEYS),
    reason: z.string().trim().max(1000).nullish(),
  })
  .refine((v) => v.decision === "accepted" || Boolean(v.reason && v.reason.trim()), {
    message: "Say why more proof is needed, or why it is rejected.",
    path: ["reason"],
  });
export type ProofReviewInput = z.infer<typeof proofReviewInput>;

export const attemptEvidenceInput = z.object({
  files: z
    .array(z.object({ path: z.string().trim().min(1).max(400), kind: z.enum(["photo", "video", "document"]) }))
    .min(1)
    .max(50),
});
export type AttemptEvidenceInput = z.infer<typeof attemptEvidenceInput>;

export interface DeliveryProofReviewRow {
  id: string;
  order_id: string;
  do_number: string;
  attempt_id: string | null;
  decision: ProofDecisionKey;
  reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string;
}

export interface DeliveryAttemptEvidenceRow {
  id: string;
  attempt_id: string;
  order_id: string;
  do_number: string | null;
  path: string;
  kind: "photo" | "video" | "document";
  recorded_by: string | null;
  recorded_at: string;
}

/**
 * The review state of one document's proof — ONE arithmetic (Law D), read by
 * Monitor, the Delivery Orders register, the DO object and Work:
 *
 *   none           nothing to review: no file on record yet
 *   pending        a file arrived after the latest review (or no review yet)
 *   accepted       the latest review accepted, and nothing newer arrived
 *   more_required  the latest review asked for more, nothing newer arrived
 *   rejected       the latest review refused, nothing newer arrived
 *
 * A newer upload reopens the question: evidence after a review is unreviewed.
 */
export type ProofReviewState = "none" | "pending" | "accepted" | "more_required" | "rejected";

export function proofReviewStateOf(input: {
  /** Newest file on record for this document — ledger or attempt evidence. */
  latestEvidenceAt: string | null;
  reviews: ReadonlyArray<Pick<DeliveryProofReviewRow, "decision" | "reviewed_at">>;
}): { state: ProofReviewState; reviewedAt: string | null } {
  const latest = [...input.reviews].sort((a, b) => b.reviewed_at.localeCompare(a.reviewed_at))[0] ?? null;
  if (!latest) return { state: input.latestEvidenceAt ? "pending" : "none", reviewedAt: null };
  if (input.latestEvidenceAt && input.latestEvidenceAt > latest.reviewed_at) {
    return { state: "pending", reviewedAt: latest.reviewed_at };
  }
  return { state: latest.decision, reviewedAt: latest.reviewed_at };
}

/** The signed Delivery Order, filed against a delivered or partially delivered
 *  trip through `delivery_signed_do_attach` — never the deliver-and-deduct door. */
export const signedDoAttachInput = z.object({
  doFilePath: z.string().trim().min(1, "The signed Delivery Order file is required.").max(400),
  signerName: z.string().trim().max(120).nullish(),
  signaturePath: z.string().trim().max(400).nullish(),
});
export type SignedDoAttachInput = z.infer<typeof signedDoAttachInput>;

/** The newest file on record for one document — the ledger entries stamped
 *  with it, its attempt evidence, and the signed paper's own clock. */
export function latestEvidenceAtOf(input: {
  ledger: ReadonlyArray<{ doNumber?: string | null; at: string }> | null | undefined;
  doNumber: string;
  attemptEvidence: ReadonlyArray<{ recorded_at: string }>;
  signedDoUploadedAt: string | null | undefined;
}): string | null {
  let latest: string | null = null;
  const consider = (at: string | null | undefined) => {
    if (at && (!latest || at > latest)) latest = at;
  };
  for (const entry of input.ledger ?? []) {
    if ((entry.doNumber ?? "").trim() === input.doNumber) consider(entry.at);
  }
  for (const e of input.attemptEvidence) consider(e.recorded_at);
  consider(input.signedDoUploadedAt);
  return latest;
}


/** The newest signed file belonging to THIS document, never a sibling DO.
 * The order-level mirror is usable only when it names the same document.
 * Bound evidence preserves older trips after the order mirror moves on. */
export function signedDeliveryDocumentOf(input: {
  documentNumber: string;
  order?: { do_number?: string | null; do_file_path?: string | null; do_uploaded_at?: string | null } | null;
  evidence?: ReadonlyArray<Pick<DeliveryAttemptEvidenceRow, "do_number" | "kind" | "path" | "recorded_at">>;
}): { path: string; uploadedAt: string | null } | null {
  const candidates: Array<{ path: string; uploadedAt: string | null }> = (input.evidence ?? [])
    .filter((e) => e.do_number === input.documentNumber && e.kind === "document" && e.path.trim())
    .map((e) => ({ path: e.path, uploadedAt: e.recorded_at }));
  if (input.order?.do_number === input.documentNumber && input.order.do_file_path) {
    candidates.push({ path: input.order.do_file_path, uploadedAt: input.order.do_uploaded_at ?? null });
  }
  return candidates.sort((a, b) => (b.uploadedAt ?? "").localeCompare(a.uploadedAt ?? ""))[0] ?? null;
}
