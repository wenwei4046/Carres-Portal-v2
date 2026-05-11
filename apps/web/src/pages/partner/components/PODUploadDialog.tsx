import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useAttachPod, type PartnerToDeliverRow } from "@/lib/queries";
import { Modal, ModalActions } from "../../logistics/components/Modal";

/**
 * PODUploadDialog — Phase 7 Sprint 2, redesigned 2026-05-11 (Loo).
 *
 * Two-stage flow + shared Carres Modal chrome (matches DOAttachModal /
 * ReceivePOModal / PartnerReceiveAtWhModal):
 *
 *   1. Pick photo → upload to `proof-of-delivery` Storage bucket. State holds
 *      the resulting path + an in-browser preview URL. NOTHING transitions yet.
 *   2. User reviews preview → clicks "Mark delivered" → calls
 *      partner_attach_pod RPC which sets pod_url + advances
 *      thread.logistics_stage='delivered'.
 *
 * Pre-Loo-2026-05-11 the dialog used raw Tailwind chrome (its own backdrop,
 * its own header) AND auto-committed the moment a file was picked. Loo asked
 * partner POD to share visual language with the logistics DOAttachModal so an
 * operator switching roles doesn't re-learn the action surface.
 *
 * Bytes are uploaded immediately so the preview renders; if the user cancels
 * after upload, the blob is orphaned in Storage — acceptable cost, mirrors
 * DOFileUploadField behavior; Phase 9 storage TTL sweep will reap.
 *
 * Storage RLS (migration 0069) gates writes to threads where
 * delivery_partner_id = my partner_id, so the API endpoint signs with the
 * USER JWT (not service_role) — same Codex F11 pattern as the order-DO path.
 *
 * On Submit success, useAttachPod invalidates ["partner"] which removes the
 * row from the In Transit list (toDeliver) and bumps dashboard counts.
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
    if (file.size > MAX_SIZE) {
      setError(`File too large (${Math.round(file.size / 1024 / 1024)} MB). Max 10 MB.`);
      return;
    }

    // Reset prior state if user is re-picking.
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
      const msg = err instanceof Error ? err.message : "Upload failed";
      setError(msg);
    } finally {
      setUploading(false);
    }
  }

  function handleSubmit() {
    if (!uploadedPath || attach.isPending) return;
    attach.mutate({ threadId: row.thread_id, podPath: uploadedPath });
  }

  function handleRepick() {
    if (attach.isPending) return;
    fileInputRef.current?.click();
  }

  const canSubmit = !!uploadedPath && !uploading && !attach.isPending;
  const isImage = pickedType === "image/jpeg" || pickedType === "image/png";
  const sizeMb = pickedSize ? (pickedSize / 1024 / 1024).toFixed(2) : null;
  const titleRef = row.po_id ?? `Order ${row.order_id.slice(0, 8)}`;

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
        . Upload the signed POD photo — the thread flips straight to{" "}
        <strong>delivered</strong> when you submit.
      </div>

      <div className="grid gap-3 mb-4">
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
