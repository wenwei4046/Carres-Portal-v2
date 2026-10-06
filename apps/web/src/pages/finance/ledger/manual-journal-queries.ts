/**
 * The manual journal's one write — POST /api/finance/manual-journals.
 *
 * Its own file so the ledger's read hooks (`ledger-queries.ts`) stay
 * read-only. A recorded entry changes every ledger read — the Journal, the
 * Trial Balance, the Self-check — so success refreshes them all.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  ManualJournalInput,
  ManualJournalRecorded,
} from "@carres/shared/schemas/finance-manual-journal";
import { apiFetch } from "@/lib/api";
import { ledgerKeys } from "./ledger-queries";

export function useRecordManualJournal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ManualJournalInput) =>
      apiFetch<ManualJournalRecorded>("/api/finance/manual-journals", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ledgerKeys.all() }),
  });
}
