/**
 * The A4 PURCHASE RETURN, assembled in the browser (the family pipeline,
 * `render.ts`). An issued return reads its money-free payload from the API;
 * while issuing, the preview is built from the form's own facts (`pr_no` null →
 * the DRAFT face) so the paper and the form can never disagree.
 */
import { useEffect, useState } from "react";
import type { PurchaseReturnPrintData } from "@carres/shared";
import { apiFetch } from "@/lib/api";
import { renderPurchaseReturnPdf } from "./render";

export function purchaseReturnPrintData(id: string): Promise<PurchaseReturnPrintData> {
  return apiFetch<PurchaseReturnPrintData>(`/api/operation/purchase-returns/${encodeURIComponent(id)}/print-data`);
}

/** The paper as a blob URL, repainted when `key` changes; null `data` = off. */
export function usePurchaseReturnPdfUrl(key: string | null, load: () => Promise<PurchaseReturnPrintData>) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    let made: string | null = null;
    setFailed(false);
    const timer = setTimeout(async () => {
      try {
        const blob = await renderPurchaseReturnPdf(await load());
        made = URL.createObjectURL(blob);
        if (!cancelled) setUrl(made);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (made) URL.revokeObjectURL(made);
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return { url, failed };
}
