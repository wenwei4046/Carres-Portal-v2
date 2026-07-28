import { useState } from "react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import {
  useAttachDoMutation,
  type operationOrderDetailOrder,
  type operationOrderDetailWarehouse,
  type operationOrderDetailLine,
} from "@/lib/queries";
import { docNumber } from "@carres/shared";
import { INPUT_CLS, Modal, ModalActions } from "./Modal";
import SignaturePad from "../../dealer/new-order/SignaturePad";
import { dataUrlToBlob } from "../../dealer/new-order/draft";

/**
 * DOAttachModal — attaches a Delivery Order (number + signed file) and flips
 * the order to delivered. Decrements stock from the source warehouse on
 * success.
 *
 * 2026-05-11 (Loo): added required DO file upload. Finance + customer
 * dispute resolution need the actual signed artefact, not just a typed-in
 * number. Backed by migration 0087 (orders.do_file_path column + RPC
 * signature change to require p_do_file_path). Upload goes through the new
 * /api/storage/dos/sign-order-upload route into the `delivery-orders`
 * Supabase Storage bucket under `order-<order_id>/...`.
 *
 * Field set:
 *   - Required DO# input (auto-suggested "DO-{9800-9999}" — random)
 *   - Optional DO note textarea (2 rows)
 *   - Required signed DO file upload (PDF/JPG/PNG ≤ 10 MB)
 *   - Required "Customer signed the DO on receipt" checkbox (bordered, dashed)
 *   - Primary: "Mark delivered" — disabled until DO# >= 3 chars AND file
 *     uploaded AND signed
 *
 * The original proto's DOAttachDialog had no file upload (proto-fidelity
 * called the shot at the time). Production discovery 2026-05-11 made the
 * artefact non-negotiable; deviating from proto here is Loo's call.
 */
const ALLOWED_MIMES = ["application/pdf", "image/jpeg", "image/png"];
const MAX_SIZE = 10 * 1024 * 1024;
interface Props {
  order: operationOrderDetailOrder;
  warehouse: operationOrderDetailWarehouse | null;
  lines: operationOrderDetailLine[];
  onClose: () => void;
}

function totalItems(lines: operationOrderDetailLine[]): number {
  return lines.reduce((s, l) => s + Number(l.qty || 0), 0);
}

/**
 * C7 (Jess 2026-07-27) — **an operator never types a delivery order number
 * again.** This used to hand them a RANDOM `DO-98xx` to edit, which is the
 * opposite of the `Issue` verb ("the SYSTEM produces a formal document"): a
 * hand-typed number cannot be reproduced on a reprint, and the paper the
 * customer signed must be.
 *
 * The number is whatever the order already carries — the one minted when the
 * delivery order was ISSUED. An order that reaches delivery without ever having
 * been issued (a walk-in dispatched outside the booking flow) still needs one,
 * so it falls back to the same locked scheme with the same stable seed: the
 * same order always yields the same number.
 */
function deliveryOrderNumber(order: operationOrderDetailOrder): string {
  const existing = (order.do_number ?? "").trim();
  if (existing) return existing;
  return docNumber({
    prefix: "DO",
    date: new Date().toISOString().slice(0, 10),
    seed: order.id,
    digits: 4,
  });
}

export default function DOAttachModal({ order, warehouse, lines, onClose }: Props) {
  // Not state: there is nothing for a human to change here.
  const doNumber = deliveryOrderNumber(order);
  const [doNote, setDoNote] = useState("");
  // 0151 (Loo 2026-05-31) — REQUIRED customer e-signature replaces the old
  // operator-ticked "customer signed" checkbox. The customer types their name
  // + signs on the canvas; the PNG uploads to delivery-orders at submit time.
  const [signerName, setSignerName] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [signatureUploading, setSignatureUploading] = useState(false);
  const [doFilePath, setDoFilePath] = useState<string | null>(null);
  const [uploadName, setUploadName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const attach = useAttachDoMutation(order.id);
  const itemCount = totalItems(lines);
  const valid =
    !!signatureDataUrl &&
    signerName.trim().length >= 2 &&
    !!doFilePath &&
    !uploading &&
    !signatureUploading &&
    !attach.isPending;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_MIMES.includes(file.type)) {
      setUploadError(`Unsupported file type: ${file.type || "unknown"}. Use PDF, JPG, or PNG.`);
      return;
    }
    if (file.size === 0) {
      setUploadError(
        `File appears to be empty (0 bytes). If it's a OneDrive cloud-only file, open it once locally first then try again.`,
      );
      return;
    }
    if (file.size > MAX_SIZE) {
      setUploadError(`File too large (${Math.round(file.size / 1024 / 1024)} MB). Max 10 MB.`);
      return;
    }

    setUploading(true);
    setUploadName(file.name);
    setDoFilePath(null);
    try {
      const sign = await apiFetch<{ token: string; path: string }>(
        "/api/storage/dos/sign-order-upload",
        {
          method: "POST",
          body: JSON.stringify({
            order_id:   order.id,
            do_number:  doNumber.trim() || "DO-PENDING",
            mime_type:  file.type,
            size_bytes: file.size,
          }),
        },
      );

      const { error: uploadErr } = await supabase.storage
        .from("delivery-orders")
        .uploadToSignedUrl(sign.path, sign.token, file);
      if (uploadErr) throw uploadErr;

      setDoFilePath(sign.path);
    } catch (err) {
      const baseMsg = err instanceof Error ? err.message : "Upload failed";
      const body =
        err && typeof err === "object" && "body" in err
          ? (err as { body?: { field?: string } }).body
          : null;
      const field = body?.field;
      const diag = `(received ${file.size} bytes · ${file.type || "no mime"})`;
      setUploadError(field ? `${baseMsg} · field=${field} ${diag}` : `${baseMsg} ${diag}`);
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (!valid || !doFilePath || !signatureDataUrl) return;
    setSignatureUploading(true);
    try {
      // Upload the captured signature PNG to the delivery-orders bucket
      // (kind=signature → order-<id>/<uuid>-signature.png), then mark delivered.
      const blob = dataUrlToBlob(signatureDataUrl);
      const sign = await apiFetch<{ token: string; path: string }>(
        "/api/storage/dos/sign-order-upload",
        {
          method: "POST",
          body: JSON.stringify({
            order_id:   order.id,
            do_number:  doNumber.trim() || "DO-PENDING",
            mime_type:  "image/png",
            size_bytes: blob.size,
            kind:       "signature",
          }),
        },
      );
      const { error: upErr } = await supabase.storage
        .from("delivery-orders")
        .uploadToSignedUrl(sign.path, sign.token, blob);
      if (upErr) throw upErr;
      await attach.mutateAsync({
        doNumber: doNumber.trim(),
        doNote: doNote.trim() || undefined,
        signed: true,
        doFilePath,
        signaturePath: sign.path,
        signerName: signerName.trim(),
      });
      toast.success(`#${order.so} delivered · stock deducted`);
      onClose();
    } catch (e: unknown) {
      if (e instanceof ApiError) toast.error(e.message || "Mark delivered failed");
      else toast.error(e instanceof Error ? e.message : "Mark delivered failed");
    } finally {
      setSignatureUploading(false);
    }
  }

  return (
    <Modal title={`Attach Delivery Order · #${order.so}`} onClose={onClose}>
      <div className="text-[12px] text-base-600 mb-3.5 font-body">
        Once attached, the order moves to <strong>Delivered</strong> and{" "}
        {itemCount} item{itemCount === 1 ? "" : "s"} will be deducted from{" "}
        <strong>{warehouse?.name ?? "the source warehouse"}</strong>.
      </div>

      <div className="grid gap-3 mb-4">
        <div>
          <span className="label mb-1.5 block">DO number</span>
          <div className="font-mono text-[13px] font-semibold text-base-900">
            {doNumber}
          </div>
        </div>
        <div>
          <label className="label mb-1.5 block" htmlFor="do-note-input">
            Note (optional)
          </label>
          <textarea
            id="do-note-input"
            rows={2}
            value={doNote}
            onChange={(e) => setDoNote(e.target.value)}
            placeholder="e.g. Delivered at lobby · customer signed"
            className={`${INPUT_CLS} resize-y`}
          />
        </div>
        <div className="px-3 py-2.5 border border-dashed border-base-300 rounded-[4px] bg-white">
          <div className="text-[11px] text-base-600 mb-2 font-body">
            Attach signed DO file *{" "}
            <span className="text-base-400">(PDF/JPG/PNG · ≤10 MB)</span>
          </div>
          <input
            type="file"
            accept=".pdf,image/jpeg,image/png"
            onChange={handleFileChange}
            disabled={uploading || attach.isPending}
            aria-label="DO file"
            className="block w-full text-[12px]"
            data-testid="do-file-input"
          />
          {uploadName && (
            <p
              className="text-[11px] text-base-600 mt-1.5 font-body"
              data-testid="do-file-status"
            >
              {uploading
                ? `Uploading… ${uploadName}`
                : doFilePath
                  ? `✓ Uploaded: ${uploadName}`
                  : `${uploadName} (not uploaded)`}
            </p>
          )}
          {uploadError && (
            <p
              className="text-[11px] text-destructive mt-1.5"
              data-testid="do-file-error"
            >
              {uploadError}
            </p>
          )}
        </div>
        <div className="px-3 py-2.5 border border-dashed border-base-300 rounded-[4px] bg-white">
          <label className="label mb-1.5 block" htmlFor="do-signer-name">
            Received &amp; signed by *
          </label>
          <input
            id="do-signer-name"
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            placeholder="Customer name"
            className={INPUT_CLS}
            data-testid="do-signer-name"
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
        onPrimary={submit}
        primary="Mark delivered"
        primaryDisabled={!valid}
        primaryPending={attach.isPending}
      />
    </Modal>
  );
}
