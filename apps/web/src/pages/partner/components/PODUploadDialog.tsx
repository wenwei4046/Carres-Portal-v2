import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useAttachPod, type PartnerToDeliverRow } from "@/lib/queries";
import { INPUT_CLS, Modal, ModalActions } from "../../operation/components/Modal";
import SignaturePad from "../../dealer/new-order/SignaturePad";
import { dataUrlToBlob } from "../../dealer/new-order/draft";

/**
 * PODUploadDialog — Phase 7 Sprint 2, redesigned 2026-05-11 (Loo).
 *
 * Two-stage flow + shared Carres Modal chrome + same 3-field set as the
 * operation DOAttachModal so an operator switching roles doesn't re-learn
 * the action surface:
 *
 *   1. Pick photo → upload to `proof-of-delivery` Storage bucket. NOTHING
 *      transitions yet — bytes land in Storage, path stored in state.
 *   2. User fills DO# + (optional) note + ticks "customer signed" → clicks
 *      "Mark delivered" → calls partner_attach_pod RPC (migration 0088
 *      5-arg signature) which sets pod_url + pod_do_number + pod_note +
 *      advances thread.operation_stage='delivered'.
 *
 * Field order matches DOAttachModal: DO# → Note → File → Signed checkbox.
 *
 * Cancel-after-upload orphans the blob in Storage — acceptable cost,
 * mirrors DOFileUploadField behavior; Phase 9 storage TTL sweep reaps.
 *
 * Storage RLS (0069) gates writes to threads where delivery_partner_id =
 * my partner_id, so the API endpoint signs with the USER JWT — same
 * Codex F11 pattern as the order-DO path.
 */
const ALLOWED_MIMES = ["image/jpeg", "image/png", "application/pdf"];
const MAX_SIZE = 10 * 1024 * 1024;

export default function PODUploadDialog({
  row,
  onClose,
}: {
  row: PartnerToDeliverRow;
  onClose: () => void;
}) {
  // 2026-05-13 (Loo) — pre-fill from row.do_number (migration 0099 added it
  // to the partner_threads_to_deliver RPC). 0098's trigger guarantees it's
  // set the moment the order enters dispatched (= when the row becomes
  // visible to this dialog). Field stays editable for the rare manual
  // override case.
  const [doNumber, setDoNumber] = useState(row.do_number ?? "");
  const [doNote, setDoNote] = useState("");
  // 0151 (Loo 2026-05-31) — REQUIRED customer e-signature replaces the old
  // driver-ticked "customer signed" checkbox (which stored nothing). The
  // customer types their name + signs on the canvas; the PNG is uploaded to
  // the proof-of-delivery bucket at submit time.
  const [signerName, setSignerName] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [signatureUploading, setSignatureUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pickedName, setPickedName] = useState<string | null>(null);
  const [pickedType, setPickedType] = useState<string | null>(null);
  const [pickedSize, setPickedSize] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const attach = useAttachPod({
    onSuccess: () => {
      toast.success(`POD attached · ${row.po_id ?? row.order_id} marked delivered`);
      onClose();
    },
    onError: (err) => setError(err.message),
  });

  // Clean up the in-browser preview URL whenever it changes or the dialog
  // closes — otherwise the blob URL pins the file in memory.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_MIMES.includes(file.type)) {
      setError(`Unsupported file type: ${file.type || "unknown"}. Use JPG / PNG / PDF.`);
      return;
    }
    if (file.size === 0) {
      setError(
        `File appears to be empty (0 bytes). If it's a OneDrive cloud-only file, open it once locally first then try again.`,
      );
      return;
    }
    if (file.size > MAX_SIZE) {
      setError(`File too large (${Math.round(file.size / 1024 / 1024)} MB). Max 10 MB.`);
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setUploadedPath(null);
    setPickedName(file.name);
    setPickedType(file.type);
    setPickedSize(file.size);
    setPreviewUrl(URL.createObjectURL(file));
    setUploading(true);

    try {
      const sign = await apiFetch<{ token: string; path: string }>(
        "/api/partner/pod/sign-upload",
        {
          method: "POST",
          body: JSON.stringify({
            threadId:  row.thread_id,
            mimeType:  file.type,
            sizeBytes: file.size,
          }),
        },
      );

      const { error: uploadErr } = await supabase.storage
        .from("proof-of-delivery")
        .uploadToSignedUrl(sign.path, sign.token, file);
      if (uploadErr) throw uploadErr;

      setUploadedPath(sign.path);
    } catch (err) {
      const baseMsg = err instanceof Error ? err.message : "Upload failed";
      const body =
        err && typeof err === "object" && "body" in err
          ? (err as { body?: { field?: string } }).body
          : null;
      const field = body?.field;
      const diag = `(received ${file.size} bytes · ${file.type || "no mime"})`;
      setError(field ? `${baseMsg} · field=${field} ${diag}` : `${baseMsg} ${diag}`);
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit() {
    if (attach.isPending || signatureUploading) return;
    if (!uploadedPath || doNumber.trim().length < 3) return;
    if (!signatureDataUrl || signerName.trim().length < 2) return;
    setError(null);
    setSignatureUploading(true);
    try {
      // Upload the captured signature PNG to the proof-of-delivery bucket
      // (kind=signature → {thread}/{uuid}-signature.png), then mark delivered.
      const blob = dataUrlToBlob(signatureDataUrl);
      const sign = await apiFetch<{ token: string; path: string }>(
        "/api/partner/pod/sign-upload",
        {
          method: "POST",
          body: JSON.stringify({
            threadId:  row.thread_id,
            mimeType:  "image/png",
            sizeBytes: blob.size,
            kind:      "signature",
          }),
        },
      );
      const { error: upErr } = await supabase.storage
        .from("proof-of-delivery")
        .uploadToSignedUrl(sign.path, sign.token, blob);
      if (upErr) throw upErr;
      attach.mutate({
        threadId:      row.thread_id,
        podPath:       uploadedPath,
        doNumber:      doNumber.trim(),
        doNote:        doNote.trim() || undefined,
        signed:        true,
        signaturePath: sign.path,
        signerName:    signerName.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signature upload failed");
    } finally {
      setSignatureUploading(false);
    }
  }

  function handleRepick() {
    if (attach.isPending) return;
    fileInputRef.current?.click();
  }

  const canSubmit =
    !!uploadedPath &&
    !uploading &&
    !signatureUploading &&
    !attach.isPending &&
    !!signatureDataUrl &&
    signerName.trim().length >= 2 &&
    doNumber.trim().length >= 3;
  const isImage = pickedType === "image/jpeg" || pickedType === "image/png";
  const sizeMb = pickedSize ? (pickedSize / 1024 / 1024).toFixed(2) : null;
  // 2026-05-13 (Loo) — title surfaces the customer-facing DO# (the doc the
  // customer actually signs). Falls back to PO# / order id slice for rows
  // where do_number hasn't been issued yet (shouldn't happen post-0098 but
  // kept as a safety net).
  const titleRef = row.do_number ?? row.po_id ?? `Order ${row.order_id.slice(0, 8)}`;

  return (
    <Modal title={`Proof of Delivery · ${titleRef}`} onClose={onClose}>
      <div
        className="text-[12px] text-base-600 mb-3.5 font-body"
        data-testid="pod-upload-dialog"
      >
        Drop off at <strong>{row.customer_name}</strong>
        {row.customer_address && (
          <>
            {" · "}
            <span>{row.customer_address}</span>
          </>
        )}
        . Record the DO + capture the customer&rsquo;s signature — the thread
        flips straight to <strong>delivered</strong> when you submit.
      </div>

      <div className="grid gap-3 mb-4">
        <div>
          <label className="label mb-1.5 block" htmlFor="pod-do-number">
            DO number *
          </label>
          <input
            id="pod-do-number"
            value={doNumber}
            onChange={(e) => setDoNumber(e.target.value)}
            className={INPUT_CLS}
            data-testid="pod-do-number"
          />
        </div>

        <div>
          <label className="label mb-1.5 block" htmlFor="pod-do-note">
            Note (optional)
          </label>
          <textarea
            id="pod-do-note"
            rows={2}
            value={doNote}
            onChange={(e) => setDoNote(e.target.value)}
            placeholder="e.g. Delivered at lobby · customer signed"
            className={`${INPUT_CLS} resize-y`}
            data-testid="pod-do-note"
          />
        </div>

        <div className="px-3 py-2.5 border border-dashed border-base-300 rounded-[4px] bg-white">
          <div className="text-[11px] text-base-600 mb-2 font-body">
            Attach signed POD *{" "}
            <span className="text-base-400">(JPG/PNG/PDF · ≤10 MB)</span>
          </div>

          {!previewUrl ? (
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              onChange={handleChange}
              disabled={uploading || attach.isPending}
              aria-label="POD file"
              className="block w-full text-[12px]"
              data-testid="pod-file-input"
            />
          ) : (
            <div>
              {isImage ? (
                <img
                  src={previewUrl}
                  alt={pickedName ?? "POD preview"}
                  className="max-h-56 mx-auto rounded-sm object-contain"
                  data-testid="pod-preview-image"
                />
              ) : (
                <div className="flex items-center gap-3 py-3 px-1">
                  <div className="w-10 h-12 bg-base-100 border border-base-200 rounded-sm flex items-center justify-center font-mono text-[10px] text-base-700">
                    PDF
                  </div>
                  <div className="font-body text-[12.5px] text-base-800 truncate">
                    {pickedName}
                  </div>
                </div>
              )}
              <div className="flex justify-between items-center mt-2.5 pt-2.5 border-t border-base-100">
                <div className="font-mono text-[11px] text-base-600 truncate pr-2">
                  {pickedName}
                  {sizeMb && <span className="text-base-400"> · {sizeMb} MB</span>}
                </div>
                <div className="text-[11px] font-body">
                  {uploading ? (
                    <span className="text-base-500">Uploading…</span>
                  ) : uploadedPath ? (
                    <span className="text-success">✓ Uploaded</span>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={handleRepick}
                disabled={uploading || attach.isPending}
                className="mt-2 text-[11px] underline text-base-600 disabled:opacity-50"
                data-testid="pod-repick"
              >
                Choose a different file
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                onChange={handleChange}
                disabled={uploading || attach.isPending}
                aria-label="POD file"
                className="hidden"
                data-testid="pod-file-input"
              />
            </div>
          )}

          {error && (
            <p
              className="text-[11px] text-destructive mt-1.5"
              data-testid="pod-error"
            >
              {error}
            </p>
          )}
        </div>

        <div className="px-3 py-2.5 border border-dashed border-base-300 rounded-[4px] bg-white">
          <label className="label mb-1.5 block" htmlFor="pod-signer-name">
            Received &amp; signed by *
          </label>
          <input
            id="pod-signer-name"
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            placeholder="Customer name"
            className={INPUT_CLS}
            data-testid="pod-signer-name"
          />
          <div className="text-[11px] text-base-600 mt-2.5 mb-1.5 font-body">
            Customer signature *
          </div>
          <SignaturePad
            value={signatureDataUrl}
            onChange={setSignatureDataUrl}
            caption="By signing, the customer confirms receipt of this delivery."
          />
        </div>
      </div>

      <ModalActions
        onCancel={onClose}
        onPrimary={handleSubmit}
        primary="Mark delivered"
        primaryDisabled={!canSubmit}
        primaryPending={attach.isPending}
      />
    </Modal>
  );
}
