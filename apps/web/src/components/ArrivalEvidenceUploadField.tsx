import { useCallback } from "react";
import { apiFetch } from "../lib/api";
import type { ReceivingArrivalEvidence } from "@carres/shared";
import EvidenceUploadField from "./EvidenceUploadField";

/**
 * ArrivalEvidenceUploadField — the Receiving Session's arrival evidence
 * (owner instruction 2026-09-04 §5C: "Arrival evidence supports both photo
 * and video"; unified Inbound/Outbound card §9, 2026-09-07: several files,
 * previewable, per-file retry, append-not-replace).
 *
 * A thin wrapper over the ONE shared multi-file evidence field: the signing
 * door stays `POST /api/storage/dos/sign-upload` with `kind: "arrival"`
 * (USER JWT, Storage RLS is the boundary), the bucket stays
 * `delivery-orders`, and the 10 MB per-file limit matches what that door
 * enforces for photos AND videos alike.
 */
const IMAGE_MIMES = ["image/jpeg", "image/png"] as const;
const VIDEO_MIMES = ["video/mp4", "video/quicktime", "video/webm"] as const;
const MAX_SIZE = 10 * 1024 * 1024;

type Props = {
  poId: string;
  doNumber: string;
  entries: ReceivingArrivalEvidence[];
  onChange: (entries: ReceivingArrivalEvidence[]) => void;
  testId?: string;
};

export default function ArrivalEvidenceUploadField({
  poId,
  doNumber,
  entries,
  onChange,
  testId,
}: Props) {
  const sign = useCallback(
    (file: File) =>
      apiFetch<{ token: string; path: string }>("/api/storage/dos/sign-upload", {
        method: "POST",
        body: JSON.stringify({
          po_id: poId,
          do_number: doNumber,
          mime_type: file.type,
          size_bytes: file.size,
          kind: "arrival",
        }),
      }),
    [poId, doNumber],
  );
  const notReady = doNumber.trim().length < 3;
  return (
    <div data-testid={testId}>
      <EvidenceUploadField
        entries={entries}
        onChange={onChange}
        sign={sign}
        bucket="delivery-orders"
        imageMimes={IMAGE_MIMES}
        videoMimes={VIDEO_MIMES}
        imageMaxBytes={MAX_SIZE}
        videoMaxBytes={MAX_SIZE}
        maxFiles={20}
        ariaLabel="Arrival evidence"
        disabled={notReady}
        testId={testId ? `${testId}-field` : undefined}
      />
      {notReady && (
        <p className="text-label text-base-500 mt-1 font-body">
          Enter the supplier DO number first — the files are named after it.
        </p>
      )}
    </div>
  );
}
