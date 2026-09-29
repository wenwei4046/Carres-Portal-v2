/**
 * The A4 REPAIR ORDER, assembled in the browser (the family pipeline,
 * `render.ts`): the API answers the money-free payload with each Unit's own
 * photographs signed on open; the browser draws each photograph into an image
 * the PDF renderer can embed (it reads JPEG and PNG only, and a phone photo may
 * be WebP), then renders the paper.
 *
 * A photograph that cannot be read FAILS the render rather than disappearing:
 * a paper that silently dropped it would say `No damage photos recorded`
 * about a Unit that has them.
 */
import type { RepairOrderPrintData } from "@carres/shared";
import { apiFetch } from "@/lib/api";
import { renderRepairOrderPdf } from "./render";

/** Long side of an embedded photograph, px — sharp at 90mm, small enough to send. */
const MAX_SIDE = 1600;

async function toPdfImage(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("A damage photo could not be loaded.");
  const bitmap = await createImageBitmap(await res.blob());
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("A damage photo could not be drawn.");
  // Paper is white: a transparent PNG must not print black.
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", 0.85);
}

export async function repairOrderPrintData(roId: string): Promise<RepairOrderPrintData> {
  const data = await apiFetch<RepairOrderPrintData>(`/api/operation/repair-orders/${encodeURIComponent(roId)}/print-data`);
  const units = await Promise.all(
    data.units.map(async (u) => ({ ...u, photos: await Promise.all(u.photos.map(toPdfImage)) })),
  );
  return { ...data, units };
}

export async function renderRepairOrderPdfFor(roId: string): Promise<Blob> {
  return renderRepairOrderPdf(await repairOrderPrintData(roId));
}
