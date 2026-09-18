import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AP_FILE_MAX_BYTES,
  AP_FILE_MIME,
  type AdvanceApplyInput,
  type ApAccountChoice,
  type ApBillOutstandingRow,
  type ApCreditor,
  type ApOutstandingRow,
  type GrnCandidateRow,
  type GrnLineRow,
  type MoneyBackInput,
  type OtherCreditorInput,
  type PaymentVoucherDocument,
  type PaymentVoucherDraftInput,
  type PaymentVoucherRegisterRow,
  type SupplierAdvanceRow,
  type SupplierBillDocument,
  type SupplierBillDraftInput,
  type SupplierBillRegisterRow,
} from "@carres/shared/schemas/finance-ap";
import { apiFetch, ApiError } from "./api";
import { withDepartment } from "@/pages/finance/department";
import { supabase } from "./supabase";

/**
 * Supplier bills and payment vouchers (migration 0477) — the web side of
 * /api/finance/payables.
 *
 * Keys live under ["finance", "payables", …] so a mutation that blasts
 * ["finance"] (the older finance hooks do) refreshes these too, and a bill or
 * voucher act refreshes every payables read at once: confirming a bill changes
 * the register, the supplier's unpaid figure and the voucher form's bill list
 * in one move.
 */
const BASE = "/api/finance/payables";

export const payablesKeys = {
  all: ["finance", "payables"] as const,
  suppliers: () => ["finance", "payables", "suppliers"] as const,
  accounts: () => ["finance", "payables", "accounts"] as const,
  outstanding: () => ["finance", "payables", "outstanding"] as const,
  billOutstanding: (supplierId: string | null) =>
    ["finance", "payables", "bill-outstanding", supplierId ?? "all"] as const,
  bills: () => ["finance", "payables", "bills"] as const,
  bill: (id: string) => ["finance", "payables", "bill", id] as const,
  grnCandidates: (supplierId: string | null) =>
    ["finance", "payables", "grn-candidates", supplierId ?? "all"] as const,
  grnLines: (receiptId: string) => ["finance", "payables", "grn-lines", receiptId] as const,
  vouchers: () => ["finance", "payables", "vouchers"] as const,
  voucher: (id: string) => ["finance", "payables", "voucher", id] as const,
  advances: (supplierId: string | null) =>
    ["finance", "payables", "advances", supplierId ?? "all"] as const,
};

type Rows<T> = { rows: T[] };

export function useApSuppliers() {
  return useQuery({
    queryKey: payablesKeys.suppliers(),
    queryFn: async () => (await apiFetch<Rows<ApCreditor>>(`${BASE}/suppliers`)).rows,
    staleTime: 60_000,
  });
}

export function useApAccounts() {
  return useQuery({
    queryKey: payablesKeys.accounts(),
    queryFn: async () => (await apiFetch<Rows<ApAccountChoice>>(`${BASE}/accounts`)).rows,
    staleTime: 5 * 60_000,
  });
}

export function useApOutstanding() {
  return useQuery({
    queryKey: payablesKeys.outstanding(),
    queryFn: async () => (await apiFetch<Rows<ApOutstandingRow>>(`${BASE}/outstanding`)).rows,
    staleTime: 15_000,
  });
}

export function useApBillOutstanding(supplierId: string | null, enabled = true) {
  return useQuery({
    queryKey: payablesKeys.billOutstanding(supplierId),
    queryFn: async () =>
      (await apiFetch<Rows<ApBillOutstandingRow>>(
        `${BASE}/bill-outstanding${supplierId ? `?supplierId=${encodeURIComponent(supplierId)}` : ""}`,
      )).rows,
    enabled,
    staleTime: 15_000,
  });
}

export function useSupplierBills(dept = "") {
  const d = withDepartment(payablesKeys.bills(), `${BASE}/bills`, dept);
  return useQuery({
    queryKey: d.queryKey,
    queryFn: async () => (await apiFetch<Rows<SupplierBillRegisterRow>>(d.url)).rows,
    staleTime: 15_000,
  });
}

export function useSupplierBill(id: string | undefined) {
  return useQuery({
    queryKey: payablesKeys.bill(id ?? ""),
    queryFn: () => apiFetch<SupplierBillDocument>(`${BASE}/bills/${id}`),
    enabled: !!id,
  });
}

export function useGrnCandidates(supplierId: string | null, enabled = true) {
  return useQuery({
    queryKey: payablesKeys.grnCandidates(supplierId),
    queryFn: async () =>
      (await apiFetch<Rows<GrnCandidateRow>>(
        `${BASE}/bills/grn-candidates${supplierId ? `?supplierId=${encodeURIComponent(supplierId)}` : ""}`,
      )).rows,
    enabled,
  });
}

export function usePaymentVouchers(dept = "") {
  const d = withDepartment(payablesKeys.vouchers(), `${BASE}/vouchers`, dept);
  return useQuery({
    queryKey: d.queryKey,
    queryFn: async () => (await apiFetch<Rows<PaymentVoucherRegisterRow>>(d.url)).rows,
    staleTime: 15_000,
  });
}

export function usePaymentVoucher(id: string | undefined) {
  return useQuery({
    queryKey: payablesKeys.voucher(id ?? ""),
    queryFn: () => apiFetch<PaymentVoucherDocument>(`${BASE}/vouchers/${id}`),
    enabled: !!id,
  });
}

/** The lines of one GRN, fetched on demand when finance converts it. */
export function fetchGrnLines(receiptId: string) {
  return apiFetch<Rows<GrnLineRow>>(`${BASE}/bills/grn-lines/${receiptId}`).then((r) => r.rows);
}

function useInvalidatePayables() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: payablesKeys.all });
}

export function useSaveBill() {
  const refresh = useInvalidatePayables();
  return useMutation<{ id: string }, ApiError, { id?: string; input: SupplierBillDraftInput }>({
    mutationFn: ({ id, input }) =>
      apiFetch<{ id: string }>(id ? `${BASE}/bills/${id}` : `${BASE}/bills`, {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => { void refresh(); },
  });
}

export type BillAct = "confirm" | "cancel";

export function useBillAct() {
  const refresh = useInvalidatePayables();
  return useMutation<{ id: string }, ApiError, { id: string; act: BillAct; reason?: string }>({
    mutationFn: ({ id, act, reason }) =>
      apiFetch<{ id: string }>(`${BASE}/bills/${id}/${act}`, {
        method: "POST",
        body: act === "cancel" ? JSON.stringify({ reason }) : undefined,
      }),
    onSuccess: () => { void refresh(); },
  });
}

export function useCreateOtherCreditor() {
  const refresh = useInvalidatePayables();
  return useMutation<{ id: string }, ApiError, OtherCreditorInput>({
    mutationFn: (input) =>
      apiFetch<{ id: string }>(`${BASE}/other-creditors`, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => { void refresh(); },
  });
}

export function useSaveVoucher() {
  const refresh = useInvalidatePayables();
  return useMutation<{ id: string }, ApiError, { id?: string; input: PaymentVoucherDraftInput }>({
    mutationFn: ({ id, input }) =>
      apiFetch<{ id: string }>(id ? `${BASE}/vouchers/${id}` : `${BASE}/vouchers`, {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => { void refresh(); },
  });
}

export type VoucherAct = "prepare" | "check" | "approve" | "reject" | "cancel";

export function useVoucherAct() {
  const refresh = useInvalidatePayables();
  return useMutation<{ id: string }, ApiError, { id: string; act: VoucherAct; reason?: string }>({
    mutationFn: ({ id, act, reason }) =>
      apiFetch<{ id: string }>(`${BASE}/vouchers/${id}/${act}`, {
        method: "POST",
        body: act === "reject" || act === "cancel" ? JSON.stringify({ reason }) : undefined,
      }),
    onSuccess: () => { void refresh(); },
  });
}

// ── supplier advances (migrations 0484–0485) ─────────────────────────────────

/** Approved advances with money left, for one supplier or all. */
export function useSupplierAdvances(supplierId: string | null, enabled = true) {
  return useQuery({
    queryKey: payablesKeys.advances(supplierId),
    queryFn: async () =>
      (await apiFetch<Rows<SupplierAdvanceRow>>(
        `${BASE}/advances${supplierId ? `?supplierId=${encodeURIComponent(supplierId)}` : ""}`,
      )).rows,
    enabled,
    staleTime: 15_000,
  });
}

/** Knock part of an advance off a bill. Posts nothing; the ledger already has it. */
export function useApplyAdvance() {
  const refresh = useInvalidatePayables();
  return useMutation<{ id: string }, ApiError, { voucherId: string; input: AdvanceApplyInput }>({
    mutationFn: ({ voucherId, input }) =>
      apiFetch<{ id: string }>(`${BASE}/vouchers/${voucherId}/advance-applications`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => { void refresh(); },
  });
}

export function useTakeAdvanceOff() {
  const refresh = useInvalidatePayables();
  return useMutation<{ id: string }, ApiError, { applicationId: string; reason: string }>({
    mutationFn: ({ applicationId, reason }) =>
      apiFetch<{ id: string }>(`${BASE}/advance-applications/${applicationId}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => { void refresh(); },
  });
}

export function useRecordMoneyBack() {
  const refresh = useInvalidatePayables();
  return useMutation<{ id: string }, ApiError, { voucherId: string; input: MoneyBackInput }>({
    mutationFn: ({ voucherId, input }) =>
      apiFetch<{ id: string }>(`${BASE}/vouchers/${voucherId}/money-back`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => { void refresh(); },
  });
}

export function useCancelMoneyBack() {
  const refresh = useInvalidatePayables();
  return useMutation<{ id: string }, ApiError, { moneyBackId: string; reason: string }>({
    mutationFn: ({ moneyBackId, reason }) =>
      apiFetch<{ id: string }>(`${BASE}/money-back/${moneyBackId}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => { void refresh(); },
  });
}

export type ApDocKind = "bills" | "vouchers";

/**
 * Attach one file to a bill or a voucher — the repo's signed-upload pattern:
 * the Worker names the path (so a browser can neither pick nor overwrite
 * one), the bytes go browser → Supabase directly, then the database records
 * the file after checking the object is really there.
 */
export async function uploadApFile(kind: ApDocKind, id: string, file: File): Promise<void> {
  const mime = file.type as (typeof AP_FILE_MIME)[number];
  if (!(AP_FILE_MIME as readonly string[]).includes(mime)) {
    throw new Error("Attach a PDF or a photo (JPEG, PNG or WebP).");
  }
  if (file.size > AP_FILE_MAX_BYTES) {
    throw new Error(`That file is too big (${Math.round(file.size / 1024 / 1024)} MB). 20 MB at most.`);
  }
  const sign = await apiFetch<{ bucket: string; token: string; path: string }>(
    `${BASE}/${kind}/${id}/files/sign`,
    { method: "POST", body: JSON.stringify({ mimeType: mime, sizeBytes: file.size }) },
  );
  const { error } = await supabase.storage
    .from(sign.bucket)
    .uploadToSignedUrl(sign.path, sign.token, file, { contentType: mime });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  await apiFetch(`${BASE}/${kind}/${id}/files`, {
    method: "POST",
    body: JSON.stringify({ path: sign.path, fileName: file.name.slice(-200), mimeType: mime, sizeBytes: file.size }),
  });
}

export function useUploadApFile(kind: ApDocKind, id: string) {
  const refresh = useInvalidatePayables();
  return useMutation<void, Error, File>({
    mutationFn: (file) => uploadApFile(kind, id, file),
    onSuccess: () => { void refresh(); },
  });
}

/** A short-lived link to read one stored file, signed with the user's token. */
export async function openApFile(path: string): Promise<void> {
  const { url } = await apiFetch<{ url: string }>(`${BASE}/files/url?path=${encodeURIComponent(path)}`);
  window.open(url, "_blank", "noopener");
}
