import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import type { GuaranteeEntitlementDto } from "@carres/shared";

/**
 * Claim confirmation (0261-0263, Loo ruling #3: a claim is ONE-SHOT).
 *
 * The warning is not decoration — after this click the guarantee is spent. The
 * customer gets a new mattress and no further cover unless they buy another
 * guarantee, so the operator has to see that before confirming, not after.
 *
 * `replacementSku` is optional but strongly wanted: it is the only record of
 * what we actually handed over, and COGS follow-up reads it later.
 */
export default function ClaimGuaranteeModal({
  guarantee,
  summary,
  busy,
  onCancel,
  onConfirm,
}: {
  guarantee: GuaranteeEntitlementDto;
  /** One-line human summary of the cover (guaranteeCoverageLine). */
  summary: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (replacementSku: string | null, notes: string | null) => void;
}) {
  const [replacementSku, setReplacementSku] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-base-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Claim this guarantee"
    >
      <div className="w-full max-w-lg rounded-lg bg-card shadow-xl border border-base-200">
        <div className="p-5 border-b border-base-200">
          <h2 className="t-h4 text-base-900">Claim this guarantee</h2>
          <p className="t-small text-base-600 mt-1">{summary}</p>
          <p className="t-small text-base-600 mt-1">
            {guarantee.customerName}
            {guarantee.so != null ? ` · SO-${guarantee.so}` : ""}
          </p>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div className="flex gap-3 rounded border border-warning/40 bg-warning-soft p-3">
            <AlertTriangle size={17} strokeWidth={1.75} className="text-warning shrink-0 mt-0.5" />
            <p className="t-small text-base-700">
              This uses the guarantee up. We replace the item one-for-one; the replacement carries
              no cover unless the customer buys a new guarantee.
            </p>
          </div>

          <label className="flex flex-col gap-1">
            <span className="t-small font-medium text-base-700">
              Replacement SKU <span className="text-base-500">(what we handed over)</span>
            </span>
            <input
              type="text"
              value={replacementSku}
              onChange={(e) => setReplacementSku(e.target.value)}
              placeholder={guarantee.coversSku ?? "e.g. B1201S-K"}
              className="rounded border border-base-300 px-3 py-2 t-body focus:border-base-500 outline-none"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="t-small font-medium text-base-700">What happened</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Foam collapsed on the left side; swapped at Klang."
              className="rounded border border-base-300 px-3 py-2 t-body focus:border-base-500 outline-none resize-y"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 p-5 pt-0">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() => onConfirm(replacementSku.trim() || null, notes.trim() || null)}
          >
            {busy ? "Claiming…" : "Claim and swap"}
          </button>
        </div>
      </div>
    </div>
  );
}
