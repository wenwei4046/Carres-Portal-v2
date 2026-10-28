import type { SoBatchDocument } from "@carres/shared";
import type { PoTemplateData } from "@/lib/pdf/types";
/** The owning lane supplies proven physical identity. Missing identity keeps
 * source rows distinct; display text alone never proves configuration equality. */
export function poReviewDraftLines(document: SoBatchDocument): PoTemplateData["lines"] {
  const result: PoTemplateData["lines"] = [];
  const byPhysical = new Map<string, number>();
  for (const line of document.lines) for (const part of line.parts) {
    const key = line.previewPhysicalKey == null ? null : JSON.stringify([line.previewPhysicalKey,part.sku]);
    const index = key == null ? undefined : byPhysical.get(key);
    if (index != null) {
      result[index].qty += part.qty;
      result[index].sources = [...(result[index].sources ?? []), { so: line.so, qty: part.qty }];
    } else {
      if (key != null) byPhysical.set(key,result.length);
      result.push({ sku: part.sku, description: [line.item,line.variant].filter(Boolean).join(" · "), qty: part.qty, unit: "unit", sources: [{ so: line.so, qty: part.qty }] });
    }
  }
  return result;
}
