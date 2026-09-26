import { useCallback } from "react";
import { apiFetch } from "../lib/api";
import EvidenceUploadField, { type EvidenceEntry } from "./EvidenceUploadField";

/**
 * SupplierAnswerEvidenceUploadField — the evidence of what the supplier
 * answered on a PO (Purchasing §5.7, owner 2026-09-25): WhatsApp screenshots,
 * photos, a short video or the supplier's PDF, several files per answer.
 *
 * A thin wrapper over the ONE shared multi-file evidence field: the signing
 * door stays `POST /api/storage/dos/sign-upload` with `kind: "answer"` (USER
 * JWT, Storage RLS is the boundary), the bucket stays `delivery-orders`, and
 * every object lands under the PO's own prefix — which is what the SQL
 * evidence checks require.
 */
const IMAGE_MIMES = ["image/jpeg", "image/png"] as const;
const VIDEO_MIMES = ["video/mp4", "video/quicktime", "video/webm"] as const;
const PDF_MIMES = ["application/pdf"] as const;
const MAX_SIZE = 10 * 1024 * 1024;

type Props = {
  poId: string;
  poVersion: number;
  entries: EvidenceEntry[];
  onChange: (entries: EvidenceEntry[]) => void;
  ariaLabel: string;
  maxFiles?: number;
  disabled?: boolean;
  testId?: string;
};

export default function SupplierAnswerEvidenceUploadField({
  poId,
  poVersion,
  entries,
  onChange,
  ariaLabel,
  maxFiles = 20,
  disabled,
  testId,
}: Props) {
  const sign = useCallback(
    (file: File) =>
      apiFetch<{ token: string; path: string }>("/api/storage/dos/sign-upload", {
        method: "POST",
        body: JSON.stringify({
          po_id: poId,
          do_number: `V${poVersion}-answer`,
          mime_type: file.type,
          size_bytes: file.size,
          kind: "answer",
        }),
      }),
    [poId, poVersion],
  );
  return (
    <EvidenceUploadField
      entries={entries}
      onChange={onChange}
      sign={sign}
      bucket="delivery-orders"
      imageMimes={IMAGE_MIMES}
      videoMimes={VIDEO_MIMES}
      pdfMimes={PDF_MIMES}
      imageMaxBytes={MAX_SIZE}
      videoMaxBytes={MAX_SIZE}
      maxFiles={maxFiles}
      ariaLabel={ariaLabel}
      disabled={disabled}
      testId={testId}
    />
  );
}
