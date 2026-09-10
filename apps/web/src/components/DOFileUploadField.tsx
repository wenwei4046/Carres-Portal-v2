import { useState } from "react";
import { apiFetch } from "../lib/api";
import { supabase } from "../lib/supabase";

/**
 * DOFileUploadField — Phase 4.5 Chunk 1 (Task 37).
 *
 * Lets a operation caller pick a Delivery Order file (PDF/JPG/PNG ≤ 10 MiB),
 * obtain a short-lived signed upload URL from
 * POST /api/storage/dos/sign-upload, and stream the bytes directly to the
 * `delivery-orders` Supabase Storage bucket via `uploadToSignedUrl`.
 *
 * Codex F11 — the API endpoint signs with USER JWT (not service_role), so
 * Storage RLS from migration 0042 enforces per-PO scoping. The browser only
 * ever holds a one-time token plus its own access JWT.
 *
 * Validation runs twice (client + server) so the UI can fail fast on
 * obvious rejections without burning a round-trip.
 *
 * On success, calls `onUploaded(filePath)` with the canonical Storage path
 * the API returned (e.g. `PO-100/abc-DO-1.pdf`). The parent persists this
 * path on the receive RPC; signed read URLs are minted later when the file
 * is viewed.
 */
const ALLOWED_MIMES = ["application/pdf", "image/jpeg", "image/png"];
const MAX_SIZE = 10 * 1024 * 1024;

type Props = {
  poId: string;
  arrivalSourceId?: string;
  imageOnly?: boolean;
  doNumber: string;
  onUploaded: (filePath: string) => void;
};

export default function DOFileUploadField({
  poId,
  doNumber,
  onUploaded,
  arrivalSourceId,
  imageOnly = false,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewName, setPreviewName] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (
      !ALLOWED_MIMES.includes(file.type) ||
      (imageOnly && file.type === "application/pdf")
    ) {
      setError(
        `Unsupported file type: ${file.type || "unknown"}. Use ${imageOnly ? "JPG or PNG" : "PDF, JPG, or PNG"}.`,
      );
      return;
    }
    if (file.size > MAX_SIZE) {
      setError(
        `File too large (${Math.round(file.size / 1024 / 1024)} MB). Max 10 MB.`,
      );
      return;
    }

    setBusy(true);
    try {
      const sign = await apiFetch<{ token: string; path: string }>(
        arrivalSourceId
          ? `/api/operation/arrival-sources/${arrivalSourceId}/proof`
          : "/api/storage/dos/sign-upload",
        {
          method: "POST",
          body: JSON.stringify(
            arrivalSourceId
              ? { mime_type: file.type, size_bytes: file.size }
              : {
                  po_id: poId,
                  do_number: doNumber,
                  mime_type: file.type,
                  size_bytes: file.size,
                },
          ),
        },
      );

      const { error: uploadErr } = await supabase.storage
        .from(arrivalSourceId ? "arrival-proofs" : "delivery-orders")
        .uploadToSignedUrl(sign.path, sign.token, file);

      if (uploadErr) throw uploadErr;

      setPreviewName(file.name);
      onUploaded(sign.path);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {/* ⛔ THE GUARD ITS OWN SIBLING ALREADY HAS (YH, 2026-09-02, defect 30).
          The upload names its files after the DO number, so attaching a photo
          before typing one is rejected by `/api/storage/dos/sign-upload` - and
          the rejection was printed VERBATIM under the file picker:
          "String must contain at least 3 character(s)". A programmer's message,
          naming nothing, sitting under the wrong control, and impossible to
          connect to the Save button's own "Save - add a DO number".
          Photo-first is the natural order when you are standing at the lorry
          holding the phone and the paper, so operators met this constantly.
          `ClaimPhotoUploadField` - the field directly beside this one - has
          disabled its input below three characters and explained why since it
          shipped. Two sibling fields, one guard, and only this one lacked it. */}
      <input
        type="file"
        accept={
          imageOnly ? "image/jpeg,image/png" : ".pdf,image/jpeg,image/png"
        }
        onChange={handleChange}
        disabled={busy || doNumber.trim().length < 3}
        aria-label={
          imageOnly
            ? "Doorstep photos"
            : arrivalSourceId
              ? "Handover proof"
              : "DO file"
        }
      />
      {doNumber.trim().length < 3 && (
        <p
          className="text-label text-base-500 mt-1 font-body"
          data-testid="do-file-needs-number"
        >
          {imageOnly
            ? "Enter the handover evidence reference first."
            : arrivalSourceId
              ? "Enter the handover document number first."
              : "Enter the supplier DO number first — the file is named after it."}
        </p>
      )}
      {previewName && (
        <p className="text-body text-base-600 mt-1">Uploaded: {previewName}</p>
      )}
      {error && <p className="text-red-600 text-body mt-1">{error}</p>}
    </div>
  );
}
