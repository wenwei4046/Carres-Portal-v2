/** Delivery-owned adapter for the Workspace panel.
 * It reads the current Delivery Order evidence and renders Delivery's one
 * review form. Workspace owns no review state and writes no Delivery truth.
 */
import { useEffect, useMemo, useState } from "react";
import { latestEvidenceAtOf } from "@carres/shared";
import { useDeliveryOrder } from "@/lib/queries";
import Modal from "@/components/kit/Modal";
import Button from "@/components/kit/Button";
import DeliveryProofReviewForm from "./DeliveryProofReviewForm";

export default function DeliveryProofReviewWork({ doNumber }: { doNumber: string }) {
  const detail = useDeliveryOrder(doNumber);
  const [readable, setReadable] = useState<Record<string, boolean>>({});
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
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
  const retryEvidence = () => {
    setReadable({});
    setRetryVersion((version) => version + 1);
  };
  const viewedPhoto = viewerIndex === null ? null : model.photos[viewerIndex] ?? null;
  const moveViewer = (step: -1 | 1) => {
    setViewerIndex((current) => {
      if (current === null) return null;
      return (current + step + model.photos.length) % model.photos.length;
    });
  };
  useEffect(() => {
    if (viewerIndex === null) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") moveViewer(-1);
      if (event.key === "ArrowRight") moveViewer(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewerIndex, model.photos.length]);

  return (
    <div className="flex flex-col gap-4" data-testid="delivery-proof-review-work">
      <div className="flex flex-wrap gap-2" aria-label="Delivery proof photos">
        {model.photos.map((photo, index) => photo.url ? (
          <button
            key={`${photo.path}-${retryVersion}`}
            type="button"
            aria-label={`View delivery proof photo ${index + 1}`}
            className="rounded-control border border-transparent text-left hover:border-kit-blue-7 active:border-kit-blue-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => setViewerIndex(index)}
          >
            <img
              src={photo.url}
              alt={`Delivery proof photo ${index + 1}`}
              className="h-24 w-24 rounded-control border border-kit-slate-5 object-cover"
              onLoad={() => setReadable((before) => ({ ...before, [photo.path]: true }))}
              onError={() => setReadable((before) => ({ ...before, [photo.path]: false }))}
            />
          </button>
        ) : (
          <div key={photo.path} className="flex h-24 w-24 items-center justify-center rounded-control border border-kit-slate-5 bg-kit-slate-2 p-2 text-center text-label text-kit-slate-11">
            Photo {index + 1} unavailable
          </div>
        ))}
      </div>
      <DeliveryProofReviewForm
        doNumber={doNumber}
        attemptId={model.attempt.id ?? null}
        sourceVersion={model.sourceVersion}
        allEvidenceReadable={allEvidenceReadable}
        onRetryEvidence={retryEvidence}
      />
      <Modal
        open={viewedPhoto !== null}
        onOpenChange={(open) => { if (!open) setViewerIndex(null); }}
        title={viewerIndex === null ? "Delivery proof" : `Photo ${viewerIndex + 1} of ${model.photos.length}`}
        width="viewer"
        footer={model.photos.length > 1 ? (
          <>
            <Button type="button" variant="neutral" icon="back" onClick={() => moveViewer(-1)}>Previous</Button>
            <Button type="button" variant="neutral" icon="forward" onClick={() => moveViewer(1)}>Next</Button>
          </>
        ) : undefined}
      >
        <div className="flex min-h-64 items-center justify-center bg-kit-slate-2">
          {viewedPhoto?.url ? (
            <img src={viewedPhoto.url} alt={viewerIndex === null ? "Delivery proof" : `Delivery proof photo ${viewerIndex + 1} enlarged`} className="max-h-96 w-auto max-w-full object-contain" />
          ) : (
            <p className="text-body text-kit-slate-11">Photo could not be loaded</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
