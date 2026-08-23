import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  groupSelectionsIntoDocuments,
  soBatchPurchaseResponseSchema,
  type SoBatchPurchaseResponse,
  type SoBatchSelection,
} from "@carres/shared";
import { apiFetch } from "@/lib/api";
import SoBatchRegister from "./so-batch/SoBatchRegister";
import SoBatchIssueWorkspace from "./so-batch/SoBatchIssueWorkspace";

/**
 * SO BATCH PURCHASE — the orchestrator, and nothing else
 * (CARD-2026-08-22-purchasing-02; `docs/purchasing/MASTER.md` §9.1).
 *
 * ── WHAT THIS FILE USED TO BE ───────────────────────────────────────────────
 *
 * 2,829 lines of PO Schedule, category walk, Excel workspace, manual demand
 * picker, recent-ordered receipts and an issue modal. Every one of those asked
 * the operator to know something the system already knew — which calendar day a
 * buy snaps to, which category they were part-way through, which document
 * sequence came next — and none of them said what was WRONG with a row.
 *
 * The rail now names facts (`Supplier not assigned`), the Register prints the
 * server's own numbers, and the issue journey is a full 50/50 surface. This
 * file owns the DATA and the MODE, and hands both to one of two components.
 * It does not grow back: each new file owns one component or one pure contract.
 *
 * ── WHY THE REGISTER IS NOT TOLD TO REFETCH AFTER AN ISSUE ──────────────────
 *
 * It is. But the reason matters: a purchase order that now covers a demand
 * REMOVES it from this page, and that removal is the server's recomputation
 * speaking, not a local list edit. Invalidating the query is the only correct
 * way to say so — anything else would be this browser deciding what is bought.
 */
const QUERY_KEY = ["so-batch-purchase"] as const;

export default function OperationToOrder() {
  const queryClient = useQueryClient();
  const [selections, setSelections] = useState<SoBatchSelection[] | null>(null);

  /**
   * THE PAYLOAD IS PARSED, NOT TRUSTED.
   *
   * The shared schema already states what an SO Batch read is, so the page uses
   * it. A response that is not one becomes the ERROR state — not an empty
   * Register. `Nothing needs buying.` is a business answer, and printing it
   * because a read went wrong would be the page telling an operator a lie it
   * cannot support.
   */
  const q = useQuery<SoBatchPurchaseResponse>({
    queryKey: QUERY_KEY,
    queryFn: async () =>
      soBatchPurchaseResponseSchema.parse(
        await apiFetch<unknown>("/api/operation/purchase/demands"),
      ) as SoBatchPurchaseResponse,
  });

  const data = q.data;

  const documents = useMemo(() => {
    if (!selections || !data) return [];
    return groupSelectionsIntoDocuments(
      selections,
      new Map(data.rows.map((r) => [r.id, r])),
    );
  }, [selections, data]);

  const backToBuying = useCallback(() => setSelections(null), []);
  const finish = useCallback(() => {
    setSelections(null);
    void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }, [queryClient]);

  if (q.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-kit-canvas">
        <p className="text-body text-kit-slate-12">The buying list could not be loaded</p>
        {(q.error as Error | undefined)?.message ? (
          <p className="text-meta text-kit-slate-11">{(q.error as Error).message}</p>
        ) : null}
        <button
          type="button"
          className="rounded-control border border-kit-slate-6 bg-white px-3 py-1.5 text-meta font-medium text-kit-slate-12 hover:bg-kit-slate-3"
          onClick={() => void q.refetch()}
        >
          Try again
        </button>
      </div>
    );
  }

  const empty: SoBatchPurchaseResponse = {
    today: "",
    rows: [],
    destinations: [],
    defaultDestinationId: null,
    currentPoDuty: null,
    mayIssue: false,
    procurementPartners: [],
  };

  if (selections && documents.length > 0 && data) {
    return (
      <SoBatchIssueWorkspace
        documents={documents}
        destinations={data.destinations}
        procurementPartners={data.procurementPartners}
        onBack={backToBuying}
        onDone={finish}
      />
    );
  }

  return (
    <SoBatchRegister
      data={data ?? empty}
      isLoading={q.isLoading}
      onIssue={setSelections}
    />
  );
}
