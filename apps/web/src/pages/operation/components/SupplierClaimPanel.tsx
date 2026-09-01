// design-standard: not-a-list-page — the expanded row body of the Claims
// table (Purchasing → Claims). No shell of its own.
import { useMemo, useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  CARRES_EXECUTIONS,
  CUSTOMER_RESOLUTIONS,
  STOCK_HOLD_OUTCOMES,
  STOCK_HOLD_RESOLVE_PROBLEM_TEXT,
  SUPPLIER_CLAIM_RESPONSES,
  carresExecutionLabel,
  carresExecutionMeaning,
  claimCloseProblems,
  customerResolutionLabel,
  customerResolutionMeaning,
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
  useSupplierClaimCarresExecutionMutation,
  useSupplierClaimCloseMutation,
  useSupplierClaimCustomerResolutionMutation,
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
 *
 * ── Layer ③ · Customer Resolution (Loo, 2026-08-05 · migration 0324) ────────
 *
 * The panel answered three questions and never the one the CUSTOMER is waiting
 * on. **`Customer Resolution` is a SECOND decision beside `Item Outcome`, never
 * a replacement for it**, and Loo's test is what makes that structural: *can
 * both be true at the same time?* The customer cancelled AND the mattress is
 * destroyed. Under one list the operator must choose which truth to record —
 * must LIE. So there are two pickers, side by side, and neither narrows the
 * other.
 *
 * `Item Outcome` is the same picker R4 shipped, under the name Loo ruled for it
 * — `The goods` was the only heading on this panel that did not say what the
 * control decides, and with a second decision beside it the two must be
 * readable apart at a glance.
 *
 * **THREE THINGS THIS SECTION DELIBERATELY DOES NOT DO**, each one a rule
 * rather than an omission:
 *
 *   1. **No consequence is shown.** Consequences are `f(Resolution, Execution)`
 *      and until 2026-09-01 the second argument did not exist, so a Stock /
 *      Finance / Demand line computed from the resolution alone would have been
 *      wrong by Loo's own law 5. The line under each option is a DEFINITION —
 *      what the option means for the customer — and it stops there. **Layer ④
 *      below now supplies that argument and the line still stops there**: the
 *      pair is computable, the function is not ruled, and a screen may only
 *      show what is true right now.
 *   2. **It is not gated on the supplier's answer.** A customer who cancels
 *      does not wait for the factory to reply. Same reasoning R4 used for the
 *      goods: tying two things that move on different days teaches people to
 *      record a false step to unlock a real one.
 *   3. **It does not gate the close.** `Close claim` still asks for both sides
 *      and nothing more — a third condition would be a new business rule, and
 *      this card was ruled to build layer ③, not to re-rule the close.
 *
 * Unlike the ask, the resolution stays EDITABLE while the claim is open. The
 * ask freezes when the answer lands because the two-field design exists to
 * preserve a disagreement; a resolution has no counterpart to disagree with,
 * and Loo's business law 2 explicitly contemplates Carres changing it — a
 * repair becomes a replacement the moment we decide the customer cannot wait.
 * Every change is written to `po_history` and the audit log by the RPC.
 *
 * ── Layer ④ · Carres Execution (Loo, 2026-08-05 · migration 0409) ───────────
 *
 * The last layer, ruled the same day as layer ③ and left frozen for four weeks.
 * It answers *in what ORDER do the goods move?* and it is a THIRD independent
 * axis, not a narrowing of the resolution: `Replace` is a promise, and
 * `Replace First` and `Collect First` are two ways of keeping it. They differ
 * in nothing the customer sees and in something Carres cannot ignore — under
 * `Replace First` two units are committed to one customer until the collection
 * happens.
 *
 * It sits directly under the resolution because that is the order Loo froze:
 * what the customer GETS, then how the goods GET there. `Item Outcome` stays
 * below both — it is a fact about the unit, not one of the four layers.
 *
 * **`Return to Supplier` is deliberately on this list AND on `Item Outcome`.**
 * Not a duplicate, and settled by the same law COPY-STANDARD used for `Repair`
 * appearing on two lists: the Item Outcome is where the unit physically ended
 * up, this is the choreography — specifically, that there is no customer leg at
 * all, which is what makes it the fifth option rather than four. They are
 * allowed to disagree.
 *
 * **It is not cross-validated against layer ③, on purpose.** `Replace First`
 * with `No Replacement Required` is incoherent and the database still admits
 * it. Refusing the pair would collapse two layers the model keeps apart, and it
 * would refuse a legitimate order of work: an operator records the choreography
 * the warehouse is already running before the customer's resolution is final.
 * The coherence question is real and belongs to whoever rules the consequences.
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
  const resolutionM = useSupplierClaimCustomerResolutionMutation();
  const executionM = useSupplierClaimCarresExecutionMutation();

  const asks = useMemo(() => requestedActionsFor(claim.claim_type), [claim.claim_type]);
  const [ask, setAsk] = useState<string>("");
  const [answer, setAnswer] = useState<string>("");
  const [answerNote, setAnswerNote] = useState("");
  const [closeNote, setCloseNote] = useState("");
  const [outcome, setOutcome] = useState<string>("");
  const [outcomeNote, setOutcomeNote] = useState("");
  // Layer ③ — seeded from what is already on file, because the resolution stays
  // editable while the claim is open. The panel is keyed by claim id, so a
  // different claim mounts a fresh copy of this state rather than inheriting it.
  const [resolution, setResolution] = useState<string>(
    claim.customer_resolution ?? "",
  );
  const [resolutionNote, setResolutionNote] = useState(
    claim.customer_resolution_note ?? "",
  );
  // Layer ④ — seeded the same way and for the same reason: the plan changes
  // when the customer cannot wait, so it stays editable while the claim is open.
  const [execution, setExecution] = useState<string>(claim.carres_execution ?? "");
  const [executionNote, setExecutionNote] = useState(
    claim.carres_execution_note ?? "",
  );

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

  // Layer ③ — nothing to save until something actually changed. A button that
  // re-writes the same answer teaches people to press it for reassurance.
  const resolutionChanged =
    resolution !== "" &&
    (resolution !== (claim.customer_resolution ?? "") ||
      resolutionNote.trim() !== (claim.customer_resolution_note ?? ""));

  const executionChanged =
    execution !== "" &&
    (execution !== (claim.carres_execution ?? "") ||
      executionNote.trim() !== (claim.carres_execution_note ?? ""));

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

        {/* ③ · what we are doing for the CUSTOMER — a SECOND decision, above
            the item's outcome because that is the order Loo froze, and beside
            it because both can be true at once. */}
        <div className="mt-5" data-testid="claim-customer-resolution">
          <SectionTitle>Customer Resolution</SectionTitle>

          {claim.status === "closed" ? (
            <div className="text-body text-base-800">
              {claim.customer_resolution ? (
                <>
                  <span className="font-semibold">
                    {customerResolutionLabel(claim.customer_resolution)}
                  </span>
                  {claim.customer_resolution_at && (
                    <span className="text-label text-base-500 ml-2">
                      {fmtDate(claim.customer_resolution_at)}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-meta text-base-500">
                  {/* A fact, not a shrug: the claim is finished and this was
                      never answered. There is nothing left to do about it. */}
                  Nothing recorded — this claim closed without one.
                </span>
              )}
              {claim.customer_resolution_note && (
                <div className="text-meta text-base-600 mt-1">
                  {claim.customer_resolution_note}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-meta text-base-500">
                What are we doing for the customer?
              </div>

              {/* A NAMED group, because the panel now legitimately holds two
                  buttons reading `Replace` and two reading `Repair` — the
                  supplier saying it and Carres deciding it are different
                  facts. The heading disambiguates them on screen; the group's
                  accessible name does the same for a screen reader. */}
              <div
                className="flex flex-wrap gap-1.5"
                role="group"
                aria-label="Customer Resolution"
                data-testid="customer-resolution-options"
              >
                {CUSTOMER_RESOLUTIONS.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setResolution(r.key)}
                    aria-pressed={resolution === r.key}
                    className={`text-meta px-2.5 py-1 rounded border ${
                      resolution === r.key
                        ? "bg-base-900 text-white border-base-900 font-semibold"
                        : "bg-white text-base-700 border-base-200 hover:border-base-400"
                    }`}
                    data-testid={`customer-resolution-${r.key}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              {/* What the option MEANS, never what follows from it: with Carres
                  Execution unbuilt, no stock, money or demand consequence is
                  known yet, and a screen may only show what is true now. */}
              {resolution && (
                <div
                  className="text-meta text-base-700"
                  data-testid="customer-resolution-meaning"
                >
                  {customerResolutionMeaning(resolution)}
                </div>
              )}

              {resolution && (
                <input
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  maxLength={500}
                  placeholder="Anything worth keeping (optional)"
                  className="w-full text-meta rounded border border-base-200 px-2 py-1.5 focus:outline-none focus:border-base-400"
                  data-testid="customer-resolution-note"
                />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!resolutionChanged || resolutionM.isPending}
                  onClick={() =>
                    void resolutionM.mutateAsync({
                      claimId: claim.id,
                      customer_resolution: resolution,
                      note: resolutionNote.trim() || undefined,
                    })
                  }
                  className="btn-primary text-meta py-1.5 px-3 disabled:opacity-40"
                  data-testid="customer-resolution-save"
                >
                  {resolutionM.isPending ? "Saving…" : "Save what we are doing"}
                </button>
                {claim.customer_resolution_at && (
                  <span
                    className="text-label text-base-500"
                    data-testid="customer-resolution-recorded"
                  >
                    Recorded {fmtDate(claim.customer_resolution_at)}
                  </span>
                )}
              </div>
              {resolutionM.isError && (
                <div className="text-label text-danger">
                  {resolutionM.error?.message ?? "Couldn't save."}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ④ · in what ORDER the goods move — the last of Loo's four layers,
            directly under the resolution because that is the order he froze:
            what the customer GETS, then how the goods GET there. The item's own
            outcome sits below both; it is a fact about the unit, not a layer. */}
        <div className="mt-5" data-testid="claim-carres-execution">
          <SectionTitle>Carres Execution</SectionTitle>

          {claim.status === "closed" ? (
            <div className="text-body text-base-800">
              {claim.carres_execution ? (
                <>
                  <span className="font-semibold">
                    {carresExecutionLabel(claim.carres_execution)}
                  </span>
                  {claim.carres_execution_at && (
                    <span className="text-label text-base-500 ml-2">
                      {fmtDate(claim.carres_execution_at)}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-meta text-base-500">
                  Nothing recorded — this claim closed without one.
                </span>
              )}
              {claim.carres_execution_note && (
                <div className="text-meta text-base-600 mt-1">
                  {claim.carres_execution_note}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-meta text-base-500">
                In what order do the goods move?
              </div>

              {/* NAMED, like the two groups above it — this panel now holds a
                  third button reading `Return to Supplier`, and the other is an
                  Item Outcome. One is the choreography, the other is where the
                  unit ended up, and a screen reader needs the heading too. */}
              <div
                className="flex flex-wrap gap-1.5"
                role="group"
                aria-label="Carres Execution"
                data-testid="carres-execution-options"
              >
                {CARRES_EXECUTIONS.map((e) => (
                  <button
                    key={e.key}
                    type="button"
                    onClick={() => setExecution(e.key)}
                    aria-pressed={execution === e.key}
                    className={`text-meta px-2.5 py-1 rounded border ${
                      execution === e.key
                        ? "bg-base-900 text-white border-base-900 font-semibold"
                        : "bg-white text-base-700 border-base-200 hover:border-base-400"
                    }`}
                    data-testid={`carres-execution-${e.key}`}
                  >
                    {e.label}
                  </button>
                ))}
              </div>

              {/* Which goods move and in what order — never what follows from
                  it. Both arguments of f(Resolution, Execution) exist now, but
                  the function itself is unruled, so a stock, money or demand
                  line here would be a guess wearing a screen's authority. */}
              {execution && (
                <div
                  className="text-meta text-base-700"
                  data-testid="carres-execution-meaning"
                >
                  {carresExecutionMeaning(execution)}
                </div>
              )}

              {execution && (
                <input
                  value={executionNote}
                  onChange={(e) => setExecutionNote(e.target.value)}
                  maxLength={500}
                  placeholder="Anything worth keeping (optional)"
                  className="w-full text-meta rounded border border-base-200 px-2 py-1.5 focus:outline-none focus:border-base-400"
                  data-testid="carres-execution-note"
                />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!executionChanged || executionM.isPending}
                  onClick={() =>
                    void executionM.mutateAsync({
                      claimId: claim.id,
                      carres_execution: execution,
                      note: executionNote.trim() || undefined,
                    })
                  }
                  className="btn-primary text-meta py-1.5 px-3 disabled:opacity-40"
                  data-testid="carres-execution-save"
                >
                  {executionM.isPending ? "Saving…" : "Save how the goods move"}
                </button>
                {claim.carres_execution_at && (
                  <span
                    className="text-label text-base-500"
                    data-testid="carres-execution-recorded"
                  >
                    Recorded {fmtDate(claim.carres_execution_at)}
                  </span>
                )}
              </div>
              {executionM.isError && (
                <div className="text-label text-danger">
                  {executionM.error?.message ?? "Couldn't save."}
                </div>
              )}
            </div>
          )}
        </div>

        {/* R4 · the item itself — the SECOND of the two decisions, under the
            name Loo ruled for it (2026-08-05). `The goods` named the noun; the
            heading has to name what the picker DECIDES now that a second
            decision sits above it. */}
        <div className="mt-5" data-testid="claim-held-stock">
          <SectionTitle>Item Outcome</SectionTitle>
          <div className="text-meta text-base-800">
            {heldUnitsLine(claim.held_units, claim.hold_reason)}
          </div>

          {claim.held_units > 0 && (
            <div className="space-y-2 mt-2">
              {/* The twin of the question above it. Two decisions, two
                  questions, and a reader who can tell them apart without
                  being told which is which. */}
              <div className="text-meta text-base-500">
                What happened to this item?
              </div>
              <div
                className="flex flex-wrap gap-1.5"
                role="group"
                aria-label="Item Outcome"
                data-testid="item-outcome-options"
              >
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
              {/* Named for the same reason as the resolution group above. */}
              <div
                className="flex flex-wrap gap-1.5"
                role="group"
                aria-label="What we asked"
                data-testid="claim-ask-options"
              >
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
              <div
                className="flex flex-wrap gap-1.5"
                role="group"
                aria-label={`What ${supplier} answered`}
                data-testid="claim-answer-options"
              >
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
