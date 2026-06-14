// Client-side image shrink for product-model photos. The Storage bucket caps
// objects at 2 MB (migration 0173) and a model thumbnail never needs more than
// ~1600px on its longest edge, so we downscale + re-encode to JPEG in the
// browser BEFORE upload. This keeps the bytes off the Worker entirely (the
// upload goes browser → Supabase via a signed URL) and keeps uploads fast on
// the showroom's mobile data.

const MAX_EDGE = 1600;
const TARGET_BYTES = 2 * 1024 * 1024;
const START_QUALITY = 0.85;
const MIN_QUALITY = 0.5;

export interface ShrunkImage {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Downscales `file` so its longest edge is <= 1600px and re-encodes it as a
 * JPEG at quality 0.85, stepping quality down (never below 0.5) until the
 * result fits under the 2 MB bucket cap. Throws if it still can't fit — the
 * caller surfaces that as a "try a smaller photo" toast.
 *
 * Browser-only: relies on the canvas 2D context + `toBlob`. Not exercised in
 * jsdom unit tests (no canvas there); covered by the Playwright photo smoke.
 */
export async function shrinkImage(file: Blob): Promise<ShrunkImage> {
  const bitmap = await loadBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_EDGE);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, width, height);
  // Free the decoded bitmap promptly (ImageBitmap holds GPU/heap memory).
  if (isImageBitmap(bitmap)) bitmap.close();

  let quality = START_QUALITY;
  let blob = await encodeJpeg(canvas, quality);
  while (blob.size > TARGET_BYTES && quality > MIN_QUALITY) {
    quality = Math.max(MIN_QUALITY, Math.round((quality - 0.1) * 100) / 100);
    blob = await encodeJpeg(canvas, quality);
  }
  if (blob.size > TARGET_BYTES) {
    throw new Error(
      "Image is still over 2 MB after compression — please try a smaller photo.",
    );
  }
  return { blob, width, height };
}

/** Computes the target dimensions that fit `maxEdge` while preserving aspect. */
function fitWithin(w: number, h: number, maxEdge: number): { width: number; height: number } {
  if (w <= maxEdge && h <= maxEdge) return { width: w, height: h };
  const scale = maxEdge / Math.max(w, h);
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

function isImageBitmap(x: unknown): x is ImageBitmap {
  return typeof ImageBitmap !== "undefined" && x instanceof ImageBitmap;
}

/**
 * Decodes the file to something drawable. Prefers `createImageBitmap`
 * (off-main-thread decode + EXIF orientation honoured) and falls back to an
 * `<img>` element for the rare browser that lacks it.
 */
async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // fall through to the <img> path
    }
  }
  return await loadImageElement(file);
}

function loadImageElement(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image file."));
    };
    img.src = url;
  });
}

function encodeJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Image encode failed"))),
      "image/jpeg",
      quality,
    );
  });
}
