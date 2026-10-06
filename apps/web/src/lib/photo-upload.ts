import {
  DELIVERY_VIDEO_MAX_BYTES,
  PRODUCT_MODEL_PHOTOS_BUCKET,
  isDeliveryVideoMime,
  type OpsOrderControl,
  type ProductModelDto,
  type SofaCompartmentDto,
} from "@carres/shared";
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

/**
 * Sofa-compartment photo upload — same signed-upload flow against the
 * compartment routes (principal-only). The photo lands in
 * `sofa_compartments.icon_url`; CompartmentSilhouette prefers it over the SVG
 * everywhere (builder palette, POS configurator, maintenance list).
 */
export async function uploadCompartmentPhoto(
  compartmentId: string,
  file: Blob,
): Promise<SofaCompartmentDto> {
  const { blob } = await shrinkImage(file);

  const sign = await apiFetch<SignUploadResponse>(
    `/api/catalog/sofa-compartments/${compartmentId}/photo/sign-upload`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mimeType: "image/jpeg", sizeBytes: blob.size }),
    },
  );

  const { error } = await supabase.storage
    .from(PRODUCT_MODEL_PHOTOS_BUCKET)
    .uploadToSignedUrl(sign.path, sign.token, blob, { contentType: "image/jpeg" });
  if (error) {
    throw new Error(`Photo upload failed: ${error.message}`);
  }

  const res = await apiFetch<{ compartment: SofaCompartmentDto }>(
    `/api/catalog/sofa-compartments/${compartmentId}/photo`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: sign.path }),
    },
  );
  return res.compartment;
}

/**
 * T6 driver submission upload (migration 0280; videos + document binding by the
 * owner ruling 2026-09-11) — the same signed-upload flow against the operation
 * order-control routes. The server refuses unless the goods reached the
 * customer; the file lands in the private proof-of-delivery bucket under
 * `order/{order_id}/` and the attach route appends it to
 * `ops_order_control.delivery_photos` + writes the activity line.
 *
 * `doNumber` names the trip the file came back from. The SERVER verifies the
 * number is one of this order's own documents, so this argument can ask but
 * never assert. Omitted = the submission names no trip, which is the only
 * honest answer when the caller does not know one.
 *
 * A PHOTO is re-encoded to a <=2 MB JPEG. A VIDEO is uploaded as it is —
 * shrinking it would need a transcoder the browser does not have, so the size
 * ceiling is enforced here BEFORE any bytes move.
 */
export async function uploadDeliveryProof(
  orderId: string,
  file: Blob,
  opts?: { doNumber?: string | null },
): Promise<OpsOrderControl> {
  const isVideo = isDeliveryVideoMime(file.type);
  if (isVideo && file.size > DELIVERY_VIDEO_MAX_BYTES) {
    throw new Error(
      `Video too large (${Math.round(file.size / 1024 / 1024)} MB). Max ${Math.round(
        DELIVERY_VIDEO_MAX_BYTES / 1024 / 1024,
      )} MB.`,
    );
  }
  const blob = isVideo ? file : (await shrinkImage(file)).blob;
  const mimeType = isVideo ? file.type : "image/jpeg";

  const sign = await apiFetch<SignUploadResponse>(
    `/api/operation/orders/${orderId}/delivery-photo/sign-upload`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mimeType, sizeBytes: blob.size }),
    },
  );

  const { error } = await supabase.storage
    .from("proof-of-delivery")
    .uploadToSignedUrl(sign.path, sign.token, blob, { contentType: mimeType });
  if (error) {
    throw new Error(
      `${isVideo ? "Video" : "Photo"} upload failed: ${error.message}`,
    );
  }

  const res = await apiFetch<{ control: OpsOrderControl }>(
    `/api/operation/orders/${orderId}/delivery-photo/attach`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: sign.path,
        kind: isVideo ? "video" : "photo",
        ...(opts?.doNumber ? { doNumber: opts.doNumber } : {}),
      }),
    },
  );
  return res.control;
}
