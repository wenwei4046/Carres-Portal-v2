/**
 * Reads and writes for money in that is not a sale (migration 0478).
 *
 * Kept beside the pages instead of in `lib/queries.ts` so this slice adds a
 * file rather than editing a shared one. Every key sits under
 * `["finance", "other-money-in", …]`, and every write invalidates that one
 * root: an issued invoice changes the party's Outstanding, and a receipt
 * changes the invoice — refreshing the whole slice is simpler than tracking
 * which of the five lists a write touched.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  FinancePartyInput,
  FinancePartyUpdateInput,
  MoneyInAccountOption,
  OtherDebtorInvoiceDetail,
  OtherDebtorInvoiceInput,
  OtherDebtorInvoiceRow,
  OtherDebtorPartyRow,
  OtherReceiptDetail,
  OtherReceiptInput,
  OtherReceiptRow,
} from "@carres/shared/other-money-in";
import { apiFetch } from "@/lib/api";
import { withDepartment } from "../department";

const BASE = "/api/finance/other-money-in";
const ROOT = ["finance", "other-money-in"] as const;

export const moneyInKeys = {
  root: ROOT,
  me: () => [...ROOT, "me"] as const,
  accounts: () => [...ROOT, "accounts"] as const,
  parties: () => [...ROOT, "parties"] as const,
  invoices: () => [...ROOT, "invoices"] as const,
  invoice: (id: string) => [...ROOT, "invoice", id] as const,
  receipts: () => [...ROOT, "receipts"] as const,
  receipt: (id: string) => [...ROOT, "receipt", id] as const,
};

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });

/** Whether this person holds the finance approver duty — only they may
 *  cancel an issued invoice or a receipt. The server decides again on the
 *  press; this only keeps a button away from someone who cannot use it. */
export function useMoneyInMe() {
  return useQuery({
    queryKey: moneyInKeys.me(),
    queryFn: () => apiFetch<{ mayCancel: boolean }>(`${BASE}/me`),
  });
}

export function useMoneyInAccounts() {
  return useQuery({
    queryKey: moneyInKeys.accounts(),
    queryFn: () => apiFetch<MoneyInAccountOption[]>(`${BASE}/accounts`),
    staleTime: 5 * 60_000,
  });
}

export function useOtherDebtorParties() {
  return useQuery({
    queryKey: moneyInKeys.parties(),
    queryFn: () => apiFetch<OtherDebtorPartyRow[]>(`${BASE}/parties`),
  });
}

export function useOtherDebtorInvoices(dept = "") {
  const d = withDepartment(moneyInKeys.invoices(), `${BASE}/invoices`, dept);
  return useQuery({
    queryKey: d.queryKey,
    queryFn: () => apiFetch<OtherDebtorInvoiceRow[]>(d.url),
  });
}

export function useOtherDebtorInvoice(id: string | null) {
  return useQuery({
    queryKey: moneyInKeys.invoice(id ?? ""),
    queryFn: () => apiFetch<OtherDebtorInvoiceDetail>(`${BASE}/invoices/${id}`),
    enabled: !!id,
  });
}

export function useOtherReceipts(dept = "") {
  const d = withDepartment(moneyInKeys.receipts(), `${BASE}/receipts`, dept);
  return useQuery({
    queryKey: d.queryKey,
    queryFn: () => apiFetch<OtherReceiptRow[]>(d.url),
  });
}

export function useOtherReceipt(id: string | null) {
  return useQuery({
    queryKey: moneyInKeys.receipt(id ?? ""),
    queryFn: () => apiFetch<OtherReceiptDetail>(`${BASE}/receipts/${id}`),
    enabled: !!id,
  });
}

function useInvalidatingMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation<TResult, Error, TVars>({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ROOT }),
  });
}

export function useSaveParty() {
  return useInvalidatingMutation(
    (v: { id: null; input: FinancePartyInput } | { id: string; input: FinancePartyUpdateInput }) =>
      v.id === null
        ? apiFetch<{ id: string }>(`${BASE}/parties`, { method: "POST", ...json(v.input) })
        : apiFetch<{ id: string }>(`${BASE}/parties/${v.id}`, { method: "PATCH", ...json(v.input) }),
  );
}

/** Save a draft — or, with `issue: true`, save and issue in one act. A new
 *  invoice has `id: null`. A refused issue saves nothing. */
export function useSaveInvoice() {
  return useInvalidatingMutation((v: { id: string | null; input: OtherDebtorInvoiceInput }) =>
    v.id === null
      ? apiFetch<{ id: string }>(`${BASE}/invoices`, { method: "POST", ...json(v.input) })
      : apiFetch<{ id: string }>(`${BASE}/invoices/${v.id}`, { method: "PUT", ...json(v.input) }),
  );
}

export function useCancelInvoice() {
  return useInvalidatingMutation((v: { id: string; reason: string }) =>
    apiFetch<{ id: string }>(`${BASE}/invoices/${v.id}/cancel`, { method: "POST", ...json({ reason: v.reason }) }),
  );
}

export function useRecordReceipt() {
  return useInvalidatingMutation((input: OtherReceiptInput) =>
    apiFetch<{ id: string }>(`${BASE}/receipts`, { method: "POST", ...json(input) }),
  );
}

export function useCancelReceipt() {
  return useInvalidatingMutation((v: { id: string; reason: string }) =>
    apiFetch<{ id: string }>(`${BASE}/receipts/${v.id}/void`, { method: "POST", ...json({ reason: v.reason }) }),
  );
}
