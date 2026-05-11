import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useAttachPod, type PartnerToDeliverRow } from "@/lib/queries";

/**
 * PODUploadDialog — Phase 7 Sprint 2, redesigned 2026-05-11 (Loo).
 *
 * Two-stage flow:
 *   1. Pick photo → upload to `proof-of-delivery` Storage bucket. State holds
 *      the resulting path + an in-browser preview URL. NOTHING transitions yet.
 *   2. User reviews preview → clicks "Mark delivered" → calls
 *      partner_attach_pod RPC which sets pod_url + advances
 *      thread.logistics_stage='delivered'.
 *
 * Previous version (pre-2026-05-11) auto-committed the moment the file picker
 * resolved — Loo couldn't verify what was uploaded before it flipped the row
 * to delivered. New flow makes the upload visible + reviewable + reversible
 * (re-pick) up until Submit is pressed.
 *
 * Bytes are uploaded immediately so the user sees a thumbnail/filename
 * confirmation. If the user cancels after upload, the blob is orphaned in
 * Storage — acceptable cost, mirrors DOFileUploadField behavior; Phase 9
 * storage TTL sweep will reap.
 *
 * Storage RLS (migration 0069) gates writes to threads where
 * delivery_partner_id = my partner_id, so the API endpoint signs with the
 * USER JWT (not service_role) — same Codex F11 pattern as DO upload.
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

      // Path stored — user can now review and Submit.
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

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={attach.isPending || uploading ? undefined : onClose}
    >
      <div
        className="w-[520px] max-w-full bg-card rounded-md shadow-xl p-6"
        onClick={(e) => e.stopPropagation()}
        data-testid="pod-upload-dialog"
      >
        <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-2">
          Proof of Delivery
        </div>
        <h2 className="font-display text-[20px] mb-4">
          {row.po_id ?? `Order ${row.order_id.slice(0, 8)}`}
        </h2>
        <div className="text-[12.5px] text-muted-foreground mb-4">
          Customer: <span className="text-foreground">{row.customer_name}</span>
          {row.customer_address && (
            <>
              <br />
              Address: <span className="text-foreground">{row.customer_address}</span>
            </>
          )}
        </div>

        {!previewUrl ? (
          <label className="block mb-3">
            <span className="text-[12px] font-medium text-foreground block mb-1.5">
              Upload POD photo (JPG / PNG / PDF, ≤ 10 MB)
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              onChange={handleChange}
              disabled={uploading || attach.isPending}
              aria-label="POD file"
              className="block w-full text-sm"
              data-testid="pod-file-input"
            />
          </label>
        ) : (
          <div className="mb-3">
            <span className="text-[12px] font-medium text-foreground block mb-1.5">
              Review before submitting
            </span>
            <div className="border border-dashed border-base-300 rounded-md p-3 bg-white">
              {isImage ? (
                <img
                  src={previewUrl}
                  alt={pickedName ?? "POD preview"}
                  className="max-h-64 mx-auto rounded-sm object-contain"
                  data-testid="pod-preview-image"
                />
              ) : (
                <div className="flex items-center gap-3 py-4 px-2">
                  <div className="w-10 h-12 bg-base-100 border border-base-200 rounded-sm flex items-center justify-center font-mono text-[10px] text-base-700">
                    PDF
                  </div>
                  <div className="font-body text-[12.5px] text-base-800">
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
                className="mt-2.5 text-[11px] underline text-base-600 disabled:opacity-50"
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
          </div>
        )}

        {error && (
          <p className="text-[12px] text-destructive mt-2" data-testid="pod-error">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            disabled={uploading || attach.isPending}
            className="px-3 py-2 text-[12px] border border-border rounded-md disabled:opacity-50"
            data-testid="pod-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-3 py-2 text-[12px] bg-primary text-primary-foreground rounded-md font-semibold disabled:opacity-50"
            data-testid="pod-submit"
          >
            {attach.isPending ? "Marking…" : "Mark delivered"}
          </button>
        </div>
      </div>
    </div>
  );
}
