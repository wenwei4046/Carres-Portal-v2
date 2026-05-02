import { useEffect, useMemo, useState } from "react";
import { useCatalog, useOutlets, useSalespersons } from "@/lib/queries";
import {
  type WizardDraft,
  clearDraft,
  emptyDraft,
  loadDraft,
  saveDraft,
  step1Valid,
  step2Valid,
} from "./draft";
import Step1Customer from "./Step1Customer";
import Step2Products from "./Step2Products";

interface Props {
  /** Modal is mounted globally; this prop drives visibility from `?new=1`. */
  open: boolean;
  /** Strips `?new=1` from URL. Modal decides whether to clear the draft based on
   *  which close path the user took (soft via X/backdrop/ESC, hard via Cancel). */
  onClose: () => void;
}

const STEP_LABELS: Record<number, string> = {
  1: "Customer & delivery",
  2: "Products & add-ons",
  3: "Confirm and sign",
};

/**
 * Wizard shell — modal renders 3-step stepper + Step 1 form. Steps 2 + 3 are
 * placeholders until 2B.3 ships product picker + signature + create RPC.
 *
 * sessionStorage draft persistence (D4): typing in any field auto-saves the
 * full draft; refresh / accidental close / sidebar nav restores on next open.
 * Cancel and X explicitly discard via `clearDraft()`.
 */
export default function DealerNewOrder({ open, onClose }: Props) {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<WizardDraft>(() => loadDraft() ?? emptyDraft());

  const outletsQ = useOutlets({ enabled: open });
  const salespersonsQ = useSalespersons(undefined, { enabled: open });
  // Catalog needed for Step 2; only fetched when wizard is open. D5 rationale:
  // staleTime is 5min globally, but we explicitly refetch on Step 2 entry so
  // the dealer's locked unit_price is always fresh against principal updates.
  const catalogQ = useCatalog({ enabled: open });
  useEffect(() => {
    if (open && step === 2) catalogQ.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);

  // Restore draft each time the modal re-opens. If the dealer closed via X /
  // Cancel previously, sessionStorage was cleared and we get a fresh draft.
  useEffect(() => {
    if (open) {
      setDraft(loadDraft() ?? emptyDraft());
      setStep(1);
    }
  }, [open]);

  // Auto-save on every change. Only when modal is open — closed-state writes
  // would clobber the cleared-on-close invariant.
  useEffect(() => {
    if (!open) return;
    saveDraft(draft);
  }, [open, draft]);

  // ESC = soft close (preserves draft). Only the footer Cancel button discards.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") softClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** Soft close — backdrop click, X header button, ESC. Draft stays in
   *  sessionStorage so reopening the wizard restores everything. */
  function softClose() {
    onClose();
  }

  /** Hard close — explicit Cancel footer button. Discards the draft. */
  function cancelAndClose() {
    clearDraft();
    onClose();
  }

  const canStep1 = useMemo(() => step1Valid(draft), [draft]);
  const canStep2 = useMemo(() => step2Valid(draft), [draft]);
  // Step 3 gate (signature + payment + min-deposit + T&C) lands in 2B.3.c.
  const canAdvance = step === 1 ? canStep1 : step === 2 ? canStep2 : false;

  if (!open) return null;

  return (
    <div
      onClick={softClose}
      className="fixed inset-0 bg-foreground/40 grid place-items-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="New order"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[880px] max-h-[90vh] flex flex-col bg-card text-card-foreground rounded-lg shadow-xl border border-border"
      >
        {/* Header */}
        <header className="px-7 py-5 border-b border-border flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
              New order · step {step} of 3
            </p>
            <h2 className="font-display text-xl mt-0.5 tracking-tight leading-tight">
              {STEP_LABELS[step]}
            </h2>
          </div>
          <button
            onClick={softClose}
            aria-label="Close"
            title="Close — your draft will be saved"
            className="text-2xl leading-none px-2 text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        </header>

        {/* Stepper */}
        <div className="flex px-7 pt-3.5 pb-1 gap-1.5">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className={`flex-1 h-[3px] rounded-sm ${n <= step ? "bg-primary" : "bg-secondary"}`}
            />
          ))}
        </div>

        {/* Body — scrollable */}
        <div className="px-7 py-6 overflow-auto flex-1">
          {step === 1 && (
            <>
              {(outletsQ.isPending || salespersonsQ.isPending) && (
                <p className="text-sm text-muted-foreground">Loading outlets + salespersons…</p>
              )}
              {outletsQ.data && salespersonsQ.data && (
                <Step1Customer
                  draft={draft}
                  onChange={setDraft}
                  outlets={outletsQ.data.outlets}
                  salespersons={salespersonsQ.data.salespersons}
                />
              )}
              {(outletsQ.error || salespersonsQ.error) && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  Couldn't load outlets/salespersons:{" "}
                  {(outletsQ.error ?? salespersonsQ.error)?.message}
                </p>
              )}
            </>
          )}
          {step === 2 && (
            <>
              {catalogQ.isPending && (
                <p className="text-sm text-muted-foreground">Loading catalog…</p>
              )}
              {catalogQ.error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  Couldn't load catalog: {(catalogQ.error as Error).message}
                </p>
              )}
              {catalogQ.data && (
                <Step2Products draft={draft} onChange={setDraft} catalog={catalogQ.data} />
              )}
            </>
          )}
          {step === 3 && <StepPlaceholder n={3} />}
        </div>

        {/* Footer */}
        <footer className="px-7 py-3.5 border-t border-border flex justify-between items-center bg-secondary/30">
          <button
            onClick={() => (step === 1 ? cancelAndClose() : setStep(step - 1))}
            title={step === 1 ? "Cancel — discards your draft" : "Back to previous step"}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {step === 1 ? "Cancel" : "← Back"}
          </button>
          <div className="flex items-center gap-4">
            {step < 3 ? (
              <button
                onClick={() => canAdvance && setStep(step + 1)}
                disabled={!canAdvance}
                className={`px-4 py-2 rounded-md text-sm font-semibold ${
                  canAdvance
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-secondary text-muted-foreground cursor-not-allowed"
                }`}
              >
                Continue →
              </button>
            ) : (
              <button
                disabled
                className="px-4 py-2 rounded-md text-sm font-semibold bg-secondary text-muted-foreground cursor-not-allowed"
                title="Submit ships in Phase 2B.3"
              >
                Submit (2B.3)
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

function StepPlaceholder({ n }: { n: number }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-secondary/20 p-9 text-center">
      <p className="text-sm font-semibold mb-1">Step {n} ships in Phase 2B.3</p>
      <p className="text-xs text-muted-foreground">
        {n === 2
          ? "Product picker + 3 configurators (mattress / bedframe / sofa) + add-ons + floor surcharge."
          : "Signature pad + payment slip uploader + 3 payment methods + min-deposit gate + Submit."}
      </p>
    </div>
  );
}
