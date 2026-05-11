import { useState } from "react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import {
  useAttachDoMutation,
  type LogisticsOrderDetailOrder,
  type LogisticsOrderDetailWarehouse,
  type LogisticsOrderDetailLine,
} from "@/lib/queries";
import { INPUT_CLS, Modal, ModalActions } from "./Modal";

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
  order: LogisticsOrderDetailOrder;
  warehouse: LogisticsOrderDetailWarehouse | null;
  lines: LogisticsOrderDetailLine[];
  onClose: () => void;
}

function totalItems(lines: LogisticsOrderDetailLine[]): number {
  return lines.reduce((s, l) => s + Number(l.qty || 0), 0);
}

function suggestDoNumber(): string {
  return "DO-" + (9800 + Math.floor(Math.random() * 200));
}

export default function DOAttachModal({ order, warehouse, lines, onClose }: Props) {
  const [doNumber, setDoNumber] = useState(suggestDoNumber);
  const [doNote, setDoNote] = useState("");
  const [signed, setSigned] = useState(false);
  const [doFilePath, setDoFilePath] = useState<string | null>(null);
  const [uploadName, setUploadName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const attach = useAttachDoMutation(order.id);
  const itemCount = totalItems(lines);
  const valid =
    doNumber.trim().length >= 3 &&
    signed &&
    !!doFilePath &&
    !uploading &&
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
    if (!valid || !doFilePath) return;
    try {
      await attach.mutateAsync({
        doNumber: doNumber.trim(),
        doNote: doNote.trim() || undefined,
        signed: true,
        doFilePath,
      });
      toast.success(`#${order.dl} delivered · stock deducted`);
      onClose();
    } catch (e: unknown) {
      if (e instanceof ApiError) toast.error(e.message || "Mark delivered failed");
      else toast.error(e instanceof Error ? e.message : "Mark delivered failed");
    }
  }

  return (
    <Modal title={`Attach Delivery Order · #${order.dl}`} onClose={onClose}>
      <div className="text-[12px] text-base-600 mb-3.5 font-body">
        Once attached, the order moves to <strong>Delivered</strong> and{" "}
        {itemCount} item{itemCount === 1 ? "" : "s"} will be deducted from{" "}
        <strong>{warehouse?.name ?? "the source warehouse"}</strong>.
      </div>

      <div className="grid gap-3 mb-4">
        <div>
          <label className="label mb-1.5 block" htmlFor="do-number-input">
            DO number *
          </label>
          <input
            id="do-number-input"
            value={doNumber}
            onChange={(e) => setDoNumber(e.target.value)}
            className={INPUT_CLS}
          />
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
        <label className="flex gap-2 items-center px-3 py-2.5 border border-dashed border-base-300 rounded-[4px] cursor-pointer">
          <input
            type="checkbox"
            checked={signed}
            onChange={(e) => setSigned(e.target.checked)}
            className="accent-primary"
          />
          <span className="text-[12px] font-body">
            Customer signed the DO on receipt
          </span>
        </label>
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
