import { PRODUCT_MODEL_PHOTOS_BUCKET, type ProductModelDto } from "@carres/shared";
import { apiFetch } from "./api";
import { supabase } from "./supabase";
import { shrinkImage } from "./image-shrink";

/**
 * Product-model photo upload — the repo's signed-upload-URL pattern (mirrors
 * `storage/dos.ts` + `partner/pod.ts`): the image bytes go browser → Supabase
 * directly and never pass through the Worker.
 *
 *   1. shrink the file to a <=2 MB / <=1600px JPEG (image-shrink.ts),
 *   2. POST /models/:id/photo/sign-upload → { token, path } (server-signed),
 *   3. uploadToSignedUrl(path, token, blob) via the auth-only supabase client,
 *   4. PATCH /models/:id/photo { path } → server stores the public URL.
 *
 * Returns the refreshed model row (with its new `photoUrl`).
 */
interface SignUploadResponse {
  token: string;
  path: string;
}

export async function uploadModelPhoto(modelId: string, file: Blob): Promise<ProductModelDto> {
  const { blob } = await shrinkImage(file);

  const sign = await apiFetch<SignUploadResponse>(
    `/api/catalog/models/${modelId}/photo/sign-upload`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // We always re-encode to JPEG, so the server picks the .jpg extension.
      body: JSON.stringify({ mimeType: "image/jpeg", sizeBytes: blob.size }),
    },
  );

  const { error } = await supabase.storage
    .from(PRODUCT_MODEL_PHOTOS_BUCKET)
    .uploadToSignedUrl(sign.path, sign.token, blob, { contentType: "image/jpeg" });
  if (error) {
    throw new Error(`Photo upload failed: ${error.message}`);
  }

  const res = await apiFetch<{ model: ProductModelDto }>(
    `/api/catalog/models/${modelId}/photo`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: sign.path }),
    },
  );
  return res.model;
}
