/** Delivery-owned adapter for the Workspace panel.
 * It reads the current Delivery Order evidence and renders Delivery's one
 * review form. Workspace owns no review state and writes no Delivery truth.
 */
import { useMemo, useState } from "react";
import { latestEvidenceAtOf } from "@carres/shared";
import { useDeliveryOrder } from "@/lib/queries";
import DeliveryProofReviewForm from "./DeliveryProofReviewForm";

export default function DeliveryProofReviewWork({ doNumber }: { doNumber: string }) {
  const detail = useDeliveryOrder(doNumber);
  const [readable, setReadable] = useState<Record<string, boolean>>({});
  const data = detail.data;

  const model = useMemo(() => {
    if (!data) return null;
    const reached = [...data.attempts]
      .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
      .filter((attempt) => attempt.result === "delivered" || attempt.result === "partial");
    const attempt = reached.at(-1) ?? null;
    const evidence = data.attemptEvidence ?? [];
    const photos = attempt?.id
      ? evidence.filter((file) => file.attempt_id === attempt.id && file.kind === "photo")
      : [];
    const control = Array.isArray(data.deliveryOrder.orders.ops_order_control)
      ? data.deliveryOrder.orders.ops_order_control[0]
      : data.deliveryOrder.orders.ops_order_control;
    const sourceVersion = latestEvidenceAtOf({
      ledger: control?.delivery_photos,
      doNumber,
      attemptEvidence: evidence,
      signedDoUploadedAt: data.deliveryOrder.orders.do_uploaded_at,
    });
    return { attempt, photos, sourceVersion };
  }, [data, doNumber]);

  if (detail.isPending) return <p className="text-body text-kit-slate-11">Loading delivery proof…</p>;
  if (detail.isError || !model) {
    return <p className="text-body text-kit-red-11" role="alert">Delivery proof could not be loaded.</p>;
  }
  if (!model.attempt || !model.sourceVersion) {
    return <p className="text-body text-kit-slate-11">Open the Delivery Order to review its current evidence.</p>;
  }

  const allEvidenceReadable = model.photos.length > 0 && model.photos.every(
    (photo) => Boolean(photo.url) && readable[photo.path] === true,
  );

  return (
    <div className="flex flex-col gap-4" data-testid="delivery-proof-review-work">
      <div className="flex flex-wrap gap-2" aria-label="Delivery proof photos">
        {model.photos.map((photo, index) => photo.url ? (
          <a key={photo.path} href={photo.url} target="_blank" rel="noreferrer" className="block">
            <img
              src={photo.url}
              alt={`Delivery proof photo ${index + 1}`}
              className="h-24 w-24 rounded-control border border-kit-slate-5 object-cover"
              onLoad={() => setReadable((before) => ({ ...before, [photo.path]: true }))}
              onError={() => setReadable((before) => ({ ...before, [photo.path]: false }))}
            />
          </a>
        ) : null)}
      </div>
      <DeliveryProofReviewForm
        doNumber={doNumber}
        attemptId={model.attempt.id ?? null}
        sourceVersion={model.sourceVersion}
        allEvidenceReadable={allEvidenceReadable}
      />
    </div>
  );
}
