import { useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useAttachPod, type PartnerToDeliverRow } from "@/lib/queries";

/**
 * PODUploadDialog — Phase 7 Sprint 2.
 *
 * Two-step upload flow mirroring DOFileUploadField (Chunk 1 Task 37):
 *   1. Pick photo → POST /api/partner/pod/sign-upload to obtain a short-lived
 *      signed upload URL on the proof-of-delivery bucket.
 *   2. Stream the bytes directly to Supabase Storage via uploadToSignedUrl.
 *   3. POST /api/partner/pod/:threadId/attach with the resulting path.
 *      partner_attach_pod RPC (migration 0070) sets pod_url + advances
 *      thread.logistics_stage='delivered'.
 *
 * Storage RLS (migration 0069) gates writes to threads where
 * delivery_partner_id = my partner_id, so the API endpoint signs with the
 * USER JWT (not service_role) — same Codex F11 pattern as DO upload.
 *
 * On success, useAttachPod invalidates ["partner"] which removes the row
 * from the In Transit list (toDeliver) and bumps dashboard counts.
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
  const [busy, setBusy] = useState(false);
  const [pickedName, setPickedName] = useState<string | null>(null);

  const attach = useAttachPod({
    onSuccess: () => {
      toast.success(`POD uploaded · ${row.po_id ?? row.order_id} marked delivered`);
      onClose();
    },
    onError: (err) => {
      setError(err.message);
      setBusy(false);
    },
  });

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

    setBusy(true);
    setPickedName(file.name);
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

      // Storage upload succeeded; now write pod_url + advance state.
      attach.mutate({ threadId: row.thread_id, podPath: sign.path });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setError(msg);
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="w-[480px] max-w-full bg-card rounded-md shadow-xl p-6"
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

        <label className="block mb-3">
          <span className="text-[12px] font-medium text-foreground block mb-1.5">
            Upload POD photo (JPG / PNG / PDF, ≤ 10 MB)
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            onChange={handleChange}
            disabled={busy}
            aria-label="POD file"
            className="block w-full text-sm"
            data-testid="pod-file-input"
          />
        </label>

        {pickedName && (
          <p className="text-[12px] text-muted-foreground mt-1">
            {busy ? "Uploading…" : "Uploaded"}: {pickedName}
          </p>
        )}
        {error && (
          <p className="text-[12px] text-destructive mt-2">{error}</p>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-3 py-2 text-[12px] border border-border rounded-md disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
