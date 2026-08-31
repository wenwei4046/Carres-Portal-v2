import { apiFetch } from "./api";
import { supabase } from "./supabase";

const BUCKET = "purchase-order-evidence";
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);

export async function uploadPurchaseOrderEvidence(poId: string, file: File): Promise<string> {
  if (!ALLOWED.has(file.type)) throw new Error("file_type_not_allowed");
  if (file.size <= 0 || file.size > 10 * 1024 * 1024) throw new Error("file_size_not_allowed");
  const sign = await apiFetch<{ token: string; path: string }>(
    `/api/operation/pos/${encodeURIComponent(poId)}/supplier-answer/sign-upload`,
    {
      method: "POST",
      body: JSON.stringify({ mimeType: file.type, sizeBytes: file.size }),
    },
  );
  const { error } = await supabase.storage
    .from(BUCKET)
    .uploadToSignedUrl(sign.path, sign.token, file, { contentType: file.type });
  if (error) throw new Error(`evidence_upload_failed: ${error.message}`);
  return sign.path;
}

export async function openPurchaseOrderEvidence(poId: string, path: string): Promise<void> {
  const data = await apiFetch<{ url: string }>(
    `/api/operation/pos/${encodeURIComponent(poId)}/supplier-answer/evidence?path=${encodeURIComponent(path)}`,
  );
  window.open(data.url, "_blank", "noopener,noreferrer");
}
