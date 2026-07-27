import {
  CASE_EVIDENCE_BUCKET,
  CASE_EVIDENCE_MAX_BYTES,
  caseEvidenceMimeFits,
  caseEvidenceSlot,
  type CaseEvidenceSlotKey,
  type SignCaseEvidenceUploadResponse,
} from "@carres/shared";
import { apiFetch } from "./api";
import { supabase } from "./supabase";
import { shrinkImage } from "./image-shrink";

/**
 * S2 evidence upload (migration 0287) — the repo's signed-upload-URL pattern
 * (same shape as the T6 delivery photo and the model photos): the bytes go
 * browser → Supabase directly and never pass through the Worker.
 *
 *   1. photos are shrunk to a <=2 MB / <=1600px JPEG; videos go up as they are
 *      (a phone clip cannot be re-encoded in the browser),
 *   2. POST /evidence/sign-upload → { token, path } — the SERVER builds the
 *      object key, so a client can neither pick nor overwrite a path,
 *   3. uploadToSignedUrl(path, token, blob),
 *   4. the caller hands the path to the case (create, or POST /:id/evidence),
 *      which stamps who uploaded it and when.
 *
 * `draftId` is the wizard's pre-case path: the files must be uploadable BEFORE
 * the case exists, because the case may not be created without them.
 */

export interface CaseEvidenceTarget {
  draftId?: string;
  caseId?: string;
}

export interface UploadedEvidence {
  slot: CaseEvidenceSlotKey;
  path: string;
}

/**
 * Throws with a message written for the operator, not the console — a failed
 * upload on this screen is a person standing in a warehouse holding a phone.
 */
export async function uploadCaseEvidence(
  target: CaseEvidenceTarget,
  slot: CaseEvidenceSlotKey,
  file: File,
): Promise<UploadedEvidence> {
  const spec = caseEvidenceSlot(slot);
  const kind = spec?.kind ?? "photo";

  if (!caseEvidenceMimeFits(kind, file.type)) {
    throw new Error(
      kind === "video"
        ? `"${spec?.label ?? slot}" needs a video. Pick a video from your phone.`
        : `"${spec?.label ?? slot}" needs a photo. Pick a photo, not a video.`,
    );
  }

  // Photos are re-encoded to JPEG and shrunk; videos go up untouched, so the
  // size has to be refused up front rather than by the bucket.
  let blob: Blob = file;
  let mimeType = file.type;
  if (kind === "photo") {
    blob = (await shrinkImage(file)).blob;
    mimeType = "image/jpeg";
  } else if (file.size > CASE_EVIDENCE_MAX_BYTES) {
    throw new Error(
      `That video is too big (${Math.round(file.size / 1024 / 1024)} MB). Film 10 to 20 seconds and try again.`,
    );
  }

  const sign = await apiFetch<SignCaseEvidenceUploadResponse>(
    "/api/ops/service-cases/evidence/sign-upload",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...target, slot, mimeType }),
    },
  );

  const { error } = await supabase.storage
    .from(CASE_EVIDENCE_BUCKET)
    .uploadToSignedUrl(sign.path, sign.token, blob, { contentType: mimeType });
  if (error) throw new Error(`Upload failed: ${error.message}`);

  return { slot, path: sign.path };
}

/** Append a file to a case already on file (the customer sends the photo the
 *  next day). The ledger is append-only — there is no remove. */
export async function attachCaseEvidence(
  caseId: string,
  slot: CaseEvidenceSlotKey,
  file: File,
): Promise<UploadedEvidence> {
  const uploaded = await uploadCaseEvidence({ caseId }, slot, file);
  await apiFetch(`/api/ops/service-cases/${caseId}/evidence`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(uploaded),
  });
  return uploaded;
}
