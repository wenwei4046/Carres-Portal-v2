/**
 * Delivery's one proof-review form. Delivery Order and Workspace render this
 * same component; both write through the same Delivery mutation.
 */
import { useEffect, useState } from "react";
import type { ProofDecisionKey } from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useReviewDeliveryProof } from "@/lib/queries";
import Button from "@/components/kit/Button";
import Textarea from "@/components/kit/Textarea";

const CHOICES: ReadonlyArray<{ key: ProofDecisionKey; label: string }> = [
  { key: "accepted", label: "Accept proof" },
  { key: "more_required", label: "Request more proof" },
  { key: "rejected", label: "Reject proof" },
];

function errorCopy(error: Error | null): string | null {
  if (!error) return null;
  if (error instanceof ApiError) {
    const code = error.body && typeof error.body === "object"
      ? (error.body as { code?: unknown }).code
      : null;
    if (error.status === 409 && code === "stale_proof_evidence") {
      return "Action changed · Review again";
    }
    if (error.status < 500) return error.message;
  }
  return "Not confirmed · Try again";
}

export default function DeliveryProofReviewForm({
  doNumber,
  attemptId,
  sourceVersion,
  allEvidenceReadable,
  onSaved,
}: {
  doNumber: string;
  attemptId: string | null;
  sourceVersion: string;
  allEvidenceReadable: boolean;
  onSaved?: () => void;
}) {
  const [decision, setDecision] = useState<ProofDecisionKey | null>(null);
  const [reason, setReason] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const review = useReviewDeliveryProof(doNumber, {
    onSuccess: () => {
      setDecision(null);
      setReason("");
      setIdempotencyKey(crypto.randomUUID());
      onSaved?.();
    },
  });

  useEffect(() => {
    setDecision(null);
    setReason("");
    setIdempotencyKey(crypto.randomUUID());
  }, [doNumber, sourceVersion]);

  const needsReason = decision === "more_required" || decision === "rejected";
  const canSave = decision !== null && (!needsReason || reason.trim().length > 0);
  const error = errorCopy(review.error);

  return (
    <form
      className="flex flex-col gap-3"
      data-testid="delivery-proof-review-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!decision || !canSave || review.isPending) return;
        review.mutate({
          decision,
          attemptId,
          sourceVersion,
          idempotencyKey,
          ...(needsReason ? { reason: reason.trim() } : {}),
        });
      }}
    >
      {!allEvidenceReadable ? (
        <p className="text-label text-kit-amber-11" role="alert">
          Photo could not be loaded · Try again
        </p>
      ) : null}

      <fieldset className="flex flex-col gap-2">
        <legend className="text-label font-medium text-kit-slate-12">Review result</legend>
        {CHOICES.map((choice) => {
          const disabled = review.isPending || (choice.key === "accepted" && !allEvidenceReadable);
          return (
            <label key={choice.key} className="flex min-h-8 items-center gap-2 text-body text-kit-slate-12">
              <input
                type="radio"
                name={`delivery-proof-review-${doNumber}`}
                value={choice.key}
                checked={decision === choice.key}
                disabled={disabled}
                onChange={() => setDecision(choice.key)}
                className="h-4 w-4 accent-kit-blue-9"
              />
              {choice.label}
            </label>
          );
        })}
      </fieldset>

      {needsReason ? (
        <Textarea
          id={`delivery-proof-review-reason-${doNumber}`}
          label="Reason"
          hint="Say what is missing, or why the proof is refused. The reason stays on record."
          required
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      ) : null}

      {error ? <p className="text-label text-kit-red-11" role="alert">{error}</p> : null}

      <div>
        <Button variant="primary" type="submit" disabled={!canSave} loading={review.isPending}>
          Save review
        </Button>
      </div>
    </form>
  );
}
