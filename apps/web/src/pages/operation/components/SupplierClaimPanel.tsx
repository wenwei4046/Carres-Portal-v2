// design-standard: not-a-list-page — the expanded row body of the Claims
// table (Purchasing → Claims). No shell of its own.
import { useMemo, useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  STOCK_HOLD_OUTCOMES,
  STOCK_HOLD_RESOLVE_PROBLEM_TEXT,
  SUPPLIER_CLAIM_RESPONSES,
  claimCloseProblems,
  heldUnitsLine,
  holdOutcomeNeedsNote,
  holdResolveProblems,
  requestedActionsFor,
  responseNeedsNote,
  supplierClaimRequestLabel,
  supplierClaimResponseLabel,
  supplierClaimTypeLabel,
  SUPPLIER_CLAIM_CLOSE_PROBLEM_TEXT,
} from "@carres/shared";
import {
  useOperationSupplierClaimPhotos,
  useSupplierClaimCloseMutation,
  useSupplierClaimHoldResolveMutation,
  useSupplierClaimRequestMutation,
  useSupplierClaimResponseMutation,
  type SupplierClaimListRow,
} from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";
import { buildSupplierClaimMessage } from "@/lib/wa-templates";

/**
 * SupplierClaimPanel — R3 of the receiving & claim queue
 * (docs/receiving-claim-execution-queue.md, Jess 2026-07-27).
 *
 * One claim, opened. Three things happen here and they happen in order, because
 * the order is the point of the card:
 *
 *   1. **What WE ask.** Picked from Jess's closed list, then sent to the
 *      supplier's WhatsApp group. Stamping it is what flips the next move from
 *      Carres to them.
 *   2. **What the SUPPLIER answered.** Their own list, deliberately NOT
 *      narrowed by what we asked — they may offer something else or refuse,
 *      and that mismatch is the thing R5 will count.
 *   3. **Close.** Refused (here and server-side) unless both sides are on file:
 *      "closed claims keep both sides" is the card's own done-when.
 *
 * A recorded side becomes READ-ONLY prose. Nothing on this panel can rewrite
 * history into agreement — the ask freezes the moment an answer lands, which is
 * exactly what makes "what we wanted vs what we got" worth reading later.
 *
 * R4 adds the GOODS, on the left under the evidence. The units this claim is
 * about are quarantined (`on_hold`) from the moment the receive raised it, and
 * this is where somebody says what happened to them. It is deliberately NOT
 * gated on the claim being closed: the goods and the paperwork move on
 * different days, and tying them would teach people to close a claim early just
 * to clear a shelf.
 */

export default function SupplierClaimPanel({
  claim,
  supplierGroupUrl,
}: {
  claim: SupplierClaimListRow;
  /** The supplier's WhatsApp group invite (0239). Half the suppliers on file
   *  have none — the panel says so and still lets the ask be recorded. */
  supplierGroupUrl: string | null;
}) {
  const photosQ = useOperationSupplierClaimPhotos(
    claim.photo_count > 0 ? claim.id : null,
  );
  const requestM = useSupplierClaimRequestMutation();
  const responseM = useSupplierClaimResponseMutation();
  const closeM = useSupplierClaimCloseMutation();
  const holdM = useSupplierClaimHoldResolveMutation();

  const asks = useMemo(() => requestedActionsFor(claim.claim_type), [claim.claim_type]);
  const [ask, setAsk] = useState<string>("");
  const [answer, setAnswer] = useState<string>("");
  const [answerNote, setAnswerNote] = useState("");
  const [closeNote, setCloseNote] = useState("");
  const [outcome, setOutcome] = useState<string>("");
  const [outcomeNote, setOutcomeNote] = useState("");

  const supplier = claim.supplier_name ?? "supplier";
  const closeProblems = claimCloseProblems(claim);
  const canClose = closeProblems.length === 0;

  const message = useMemo(
    () =>
      buildSupplierClaimMessage({
        supplierName: supplier,
        claimNo: claim.claim_no,
        doNumber: claim.do_number,
        poId: claim.po_id,
        sku: claim.sku,
        qty: claim.qty,
        problemLabel: supplierClaimTypeLabel(claim.claim_type),
        requestLabel: supplierClaimRequestLabel(ask || claim.requested_action),
      }),
    [supplier, claim, ask],
  );

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      return true;
    } catch {
      toast.error("Couldn't copy — select the text and copy manually");
      return false;
    }
  }

  /** Stamp the ask, copy the message, open the group. ONE button because that
   *  is one real-world act: the operator tells the supplier what we want. */
  async function sendAsk() {
    if (!ask) return;
    await requestM.mutateAsync({ claimId: claim.id, requested_action: ask });
    const copied = await copyMessage();
    if (copied) toast.success(`Message copied — ${supplier}`);
    if (supplierGroupUrl) window.open(supplierGroupUrl, "_blank", "noopener,noreferrer");
  }

  const answerNoteRequired = responseNeedsNote(answer);
  const answerReady =
    !!answer && (!answerNoteRequired || answerNote.trim().length > 0);

  // R4 — the goods. `held_units` comes off the register, so 0 is a real answer
  // (nothing quarantined: a late claim, a partner warehouse, or already
  // resolved) and not a loading state.
  const holdProblems = holdResolveProblems({
    heldUnits: claim.held_units,
    outcome: outcome || null,
    note: outcomeNote,
  });
  const outcomeNoteRequired = holdOutcomeNeedsNote(outcome);

  return (
    <div className="grid gap-5 md:grid-cols-2" data-testid={`claim-panel-${claim.claim_no}`}>
      {/* ── left: the evidence ───────────────────────────────────────────── */}
      <div>
        <SectionTitle>Evidence</SectionTitle>
        {claim.photo_count === 0 && (
          <div className="text-meta text-base-500">
            {/* Late claims carry no photo by design — nothing arrived. */}
            No photo — a late delivery has nothing to photograph.
          </div>
        )}
        {photosQ.isLoading && (
          <div className="text-meta text-base-500">Loading photos…</div>
        )}
        {photosQ.isError && (
          <div className="text-meta text-danger">Couldn&rsquo;t load the photos.</div>
        )}
        <div className="flex gap-3 flex-wrap">
          {(photosQ.data?.photos ?? []).map((p) =>
            p.url ? (
              <a key={p.path} href={p.url} target="_blank" rel="noreferrer" className="block">
                <img
                  src={p.url}
                  alt={`Claim evidence ${p.path}`}
                  className="h-28 w-auto rounded border border-base-200"
                />
              </a>
            ) : (
              <span key={p.path} className="text-label text-base-500">
                {p.path} (unavailable)
              </span>
            ),
          )}
        </div>

        {/* R4 · the goods themselves */}
        <div className="mt-5" data-testid="claim-held-stock">
          <SectionTitle>The goods</SectionTitle>
          <div className="text-meta text-base-800">
            {heldUnitsLine(claim.held_units, claim.hold_reason)}
          </div>

          {claim.held_units > 0 && (
            <div className="space-y-2 mt-2">
              <div className="flex flex-wrap gap-1.5">
                {STOCK_HOLD_OUTCOMES.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => setOutcome(o.key)}
                    aria-pressed={outcome === o.key}
                    className={`text-meta px-2.5 py-1 rounded border ${
                      outcome === o.key
                        ? "bg-base-900 text-white border-base-900 font-semibold"
                        : "bg-white text-base-700 border-base-200 hover:border-base-400"
                    }`}
                    data-testid={`hold-outcome-${o.key}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              {outcome && (
                <input
                  value={outcomeNote}
                  onChange={(e) => setOutcomeNote(e.target.value)}
                  maxLength={500}
                  placeholder={
                    outcomeNoteRequired
                      ? "Say why the units were written off"
                      : "Anything worth keeping (optional)"
                  }
                  className="w-full text-meta rounded border border-base-200 px-2 py-1.5 focus:outline-none focus:border-base-400"
                  data-testid="hold-outcome-note"
                />
              )}

              <button
                type="button"
                disabled={holdProblems.length > 0 || holdM.isPending}
                onClick={() =>
                  void holdM
                    .mutateAsync({
                      claimId: claim.id,
                      outcome,
                      note: outcomeNote.trim() || undefined,
                    })
                    .then(() => {
                      setOutcome("");
                      setOutcomeNote("");
                    })
                }
                className="btn-primary text-meta py-1.5 px-3 disabled:opacity-40"
                data-testid="hold-resolve"
              >
                {holdM.isPending ? "Saving…" : "Save what happened"}
              </button>

              {holdProblems.length > 0 && outcome && (
                <div className="text-label text-base-600">
                  {holdProblems
                    .map((p) => STOCK_HOLD_RESOLVE_PROBLEM_TEXT[p])
                    .join(" ")}
                </div>
              )}
              {holdM.isError && (
                <div className="text-label text-danger">
                  {holdM.error?.message ?? "Couldn't save."}
                </div>
              )}
            </div>
          )}
        </div>

        {claim.status === "closed" && (
          <div className="mt-5">
            <SectionTitle>Closed</SectionTitle>
            <div className="text-body text-base-800">
              {claim.closed_at ? fmtDate(claim.closed_at) : "—"}
            </div>
            {claim.close_note && (
              <div className="text-meta text-base-600 mt-1">{claim.close_note}</div>
            )}
          </div>
        )}
      </div>

      {/* ── right: the two sides ─────────────────────────────────────────── */}
      <div className="space-y-5">
        {/* 1 · what WE ask */}
        <div>
          <SectionTitle>What we asked</SectionTitle>

          {claim.requested_action ? (
            <div className="text-body text-base-800" data-testid="claim-request-recorded">
              <span className="font-semibold">
                {supplierClaimRequestLabel(claim.requested_action)}
              </span>
              {claim.requested_at && (
                <span className="text-label text-base-500 ml-2">
                  {fmtDate(claim.requested_at)}
                </span>
              )}
              {asks.length === 0 && (
                <div className="text-label text-base-500 mt-1">
                  {/* Why there was nothing to pick — see 0291's design note. */}
                  Set by the system: a late delivery can only be asked to deliver
                  the rest.
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {asks.map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => setAsk(a.key)}
                    aria-pressed={ask === a.key}
                    className={`text-meta px-2.5 py-1 rounded border ${
                      ask === a.key
                        ? "bg-base-900 text-white border-base-900 font-semibold"
                        : "bg-white text-base-700 border-base-200 hover:border-base-400"
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>

              {ask && (
                <div className="rounded border border-base-200 bg-base-50 p-2.5 text-meta text-base-700 whitespace-pre-wrap leading-relaxed">
                  {message}
                </div>
              )}

              {!supplierGroupUrl && (
                <div className="text-label text-base-600">
                  {/* Error pattern: what is missing · how to fix · who to ask. */}
                  {supplier}&rsquo;s WhatsApp group is not saved. Ask a manager to
                  add it in Suppliers, then send it by hand this time.
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!ask || requestM.isPending}
                  onClick={() => void sendAsk()}
                  className="btn-primary text-meta py-1.5 px-3 inline-flex items-center gap-1.5 disabled:opacity-40"
                  title={
                    supplierGroupUrl
                      ? `Saves what we asked, copies the message and opens ${supplier}'s WhatsApp group.`
                      : `Saves what we asked and copies the message — ${supplier} has no group link on file.`
                  }
                  data-testid="claim-send-ask"
                >
                  {requestM.isPending
                    ? "Saving…"
                    : supplierGroupUrl
                      ? `Send to ${supplier}`
                      : "Save what we asked"}
                  {supplierGroupUrl && <ExternalLink size={13} strokeWidth={2} />}
                </button>
                {ask && (
                  <button
                    type="button"
                    onClick={() => void copyMessage().then((ok) => ok && toast.success("Message copied"))}
                    className="btn-ghost text-meta py-1.5 px-2 inline-flex items-center gap-1"
                  >
                    <Copy size={13} strokeWidth={2} /> Copy
                  </button>
                )}
              </div>
              {requestM.isError && (
                <div className="text-label text-danger">
                  {requestM.error?.message ?? "Couldn't save."}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 2 · what the SUPPLIER answered */}
        <div>
          <SectionTitle>What {supplier} answered</SectionTitle>

          {claim.supplier_response ? (
            <div className="text-body text-base-800" data-testid="claim-response-recorded">
              <span className="font-semibold">
                {supplierClaimResponseLabel(claim.supplier_response)}
              </span>
              {claim.responded_at && (
                <span className="text-label text-base-500 ml-2">
                  {fmtDate(claim.responded_at)}
                </span>
              )}
              {claim.supplier_response_note && (
                <div className="text-meta text-base-600 mt-1">
                  {claim.supplier_response_note}
                </div>
              )}
            </div>
          ) : !claim.requested_action ? (
            <div className="text-meta text-base-500">
              Ask {supplier} first — an answer needs a question.
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {SUPPLIER_CLAIM_RESPONSES.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setAnswer(r.key)}
                    aria-pressed={answer === r.key}
                    className={`text-meta px-2.5 py-1 rounded border ${
                      answer === r.key
                        ? "bg-base-900 text-white border-base-900 font-semibold"
                        : "bg-white text-base-700 border-base-200 hover:border-base-400"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              {answer && (
                <textarea
                  value={answerNote}
                  onChange={(e) => setAnswerNote(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder={
                    answerNoteRequired
                      ? "Say what was agreed, or why they refused"
                      : "Anything else worth keeping (optional)"
                  }
                  className="w-full text-meta rounded border border-base-200 px-2 py-1.5 focus:outline-none focus:border-base-400"
                  data-testid="claim-answer-note"
                />
              )}

              <button
                type="button"
                disabled={!answerReady || responseM.isPending}
                onClick={() =>
                  void responseM.mutateAsync({
                    claimId: claim.id,
                    supplier_response: answer,
                    note: answerNote.trim() || undefined,
                  })
                }
                className="btn-primary text-meta py-1.5 px-3 disabled:opacity-40"
                data-testid="claim-save-answer"
              >
                {responseM.isPending ? "Saving…" : `Save ${supplier}'s answer`}
              </button>
              {answer && answerNoteRequired && answerNote.trim().length === 0 && (
                <div className="text-label text-base-600">
                  A &ldquo;{supplierClaimResponseLabel(answer)}&rdquo; answer must say
                  what was agreed, or why.
                </div>
              )}
              {responseM.isError && (
                <div className="text-label text-danger">
                  {responseM.error?.message ?? "Couldn't save."}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3 · close */}
        {claim.status !== "closed" && (
          <div>
            <SectionTitle>Settle it</SectionTitle>
            {!canClose ? (
              <div className="text-meta text-base-500" data-testid="claim-close-blocked">
                {closeProblems.map((p) => SUPPLIER_CLAIM_CLOSE_PROBLEM_TEXT[p]).join(" ")}
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  value={closeNote}
                  onChange={(e) => setCloseNote(e.target.value)}
                  maxLength={500}
                  placeholder="What finally happened (optional)"
                  className="w-full text-meta rounded border border-base-200 px-2 py-1.5 focus:outline-none focus:border-base-400"
                />
                <button
                  type="button"
                  disabled={closeM.isPending}
                  onClick={() =>
                    void closeM.mutateAsync({
                      claimId: claim.id,
                      note: closeNote.trim() || undefined,
                    })
                  }
                  className="btn-secondary text-meta py-1.5 px-3 disabled:opacity-40"
                  data-testid="claim-close"
                >
                  {closeM.isPending ? "Closing…" : "Close claim"}
                </button>
                {closeM.isError && (
                  <div className="text-label text-danger">
                    {closeM.error?.message ?? "Couldn't close."}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-label font-semibold uppercase tracking-[0.02em] text-base-500 mb-1.5">
      {children}
    </div>
  );
}
