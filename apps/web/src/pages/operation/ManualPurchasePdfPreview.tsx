/**
 * The Manual Purchase create page's right half: the DRAFT Purchase Order
 * paper, rendered by the same template SO Batch's `Review Purchase Orders`
 * uses (owner instruction 2026-09-28, "it should pdf preview … it same with
 * so batch"). One paper per supplier. The facts come from
 * `manualPurchaseDraftPos`; this file only renders and shows them.
 *
 * The render waits for typing to settle (400 ms): a PDF redrawn on every
 * keystroke flickers and burns the tab. Every object URL is revoked when it is
 * replaced or the page closes.
 */
import { useEffect, useMemo, useState } from "react";
import { SO_BATCH_PURCHASE_WORDS as W, poIndexLabel } from "@carres/shared";
import Button from "@/components/kit/Button";
import PdfPreview from "@/components/kit/PdfPreview";
import { renderPoPdf } from "@/lib/pdf/render";
import type { ManualPurchaseDraftPo } from "./manual-purchase-draft-po";

type Painted = { key: string; url?: string; error?: string };

export default function ManualPurchasePdfPreview({ drafts }: { drafts: readonly ManualPurchaseDraftPo[] }) {
  /* One stable fingerprint of everything that prints — the effect re-renders
     only when the paper would actually change. */
  const fingerprint = useMemo(() => JSON.stringify(drafts.map((d) => d.data)), [drafts]);
  const [painted, setPainted] = useState<Painted[]>([]);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let dead = false;
    const urls: string[] = [];
    const timer = window.setTimeout(() => {
      void Promise.all(
        drafts.map(async (d): Promise<Painted> => {
          try {
            const blob = await renderPoPdf(d.data);
            const url = URL.createObjectURL(blob);
            urls.push(url);
            return { key: d.key, url };
          } catch {
            return { key: d.key, error: "Could not load the preview." };
          }
        }),
      ).then((next) => {
        if (dead) {
          urls.forEach((u) => URL.revokeObjectURL(u));
          return;
        }
        setPainted(next);
      });
    }, 400);
    return () => {
      dead = true;
      window.clearTimeout(timer);
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
    // `fingerprint` stands for `drafts`' printed content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, attempt]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3" data-testid="mp-create-pdf-preview">
      {/* NOT SENDABLE, AND IT SAYS SO — SO Batch's own sentence. */}
      <p className="shrink-0 text-meta text-kit-slate-11">{W.previewNotSendable}</p>
      {drafts.map((d, i) => {
        const shot = painted.find((p) => p.key === d.key);
        return (
          <section key={d.key} className="flex min-h-[640px] flex-1 flex-col gap-1" data-testid={`mp-draft-po-${i}`}>
            {drafts.length > 1 ? (
              <p className="shrink-0 text-meta font-semibold text-kit-slate-12">
                {poIndexLabel(i + 1, drafts.length)} · {d.supplierName}
              </p>
            ) : null}
            {shot?.url ? (
              <PdfPreview key={shot.url} src={shot.url} title="Draft purchase order preview" data-testid={`mp-draft-po-pdf-${i}`} />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-card border border-kit-slate-5 bg-white text-meta text-kit-slate-11" role="status">
                {shot?.error ? (
                  <>
                    <p>{shot.error}</p>
                    <Button size="sm" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
                  </>
                ) : (
                  "Rendering preview…"
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
