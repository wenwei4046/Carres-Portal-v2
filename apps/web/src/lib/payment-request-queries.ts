import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AP_FILE_MAX_BYTES, AP_FILE_MIME } from "@carres/shared/schemas/finance-ap";
import type {
  PaymentRequestDocument,
  PaymentRequestInput,
  PaymentRequestMe,
  PaymentRequestRow,
  RequestGrantRow,
} from "@carres/shared/payment-requests";
import { apiFetch, ApiError } from "./api";
import { supabase } from "./supabase";

/**
 * Payment requests (migration 0645; Chew 2026-10-03) — the web side of
 * /api/finance/payment-requests.
 *
 * Keys live under ["finance", "payables", …]: a voucher or bill act already
 * refreshes every payables read, and a request's stage is read from its
 * voucher or bill, so approving a voucher moves the request on screen too.
 */
const BASE = "/api/finance/payment-requests";

export const requestKeys = {
  all: ["finance", "payables", "payment-requests"] as const,
  me: () => ["finance", "payables", "payment-requests", "me"] as const,
  list: (all: boolean) => ["finance", "payables", "payment-requests", "list", all] as const,
  one: (id: string) => ["finance", "payables", "payment-requests", "one", id] as const,
  grants: () => ["finance", "payables", "payment-requests", "grants"] as const,
};

/** May this person ask, and are they Finance or the boss? */
export function useRequestMe(enabled = true) {
  return useQuery({
    queryKey: requestKeys.me(),
    queryFn: () => apiFetch<PaymentRequestMe>(`${BASE}/me`),
    enabled,
    staleTime: 60_000,
  });
}

export function usePaymentRequests(all: boolean) {
  return useQuery({
    queryKey: requestKeys.list(all),
    queryFn: async () => (await apiFetch<{ rows: PaymentRequestRow[] }>(`${BASE}${all ? "?all=1" : ""}`)).rows,
  });
}

export function usePaymentRequest(id: string | null | undefined) {
  return useQuery({
    queryKey: requestKeys.one(id ?? ""),
    queryFn: () => apiFetch<PaymentRequestDocument>(`${BASE}/${id}`),
    enabled: Boolean(id),
  });
}

function useRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["finance", "payables"] });
}

export function useSavePaymentRequest() {
  const refresh = useRefresh();
  return useMutation<{ id: string }, ApiError, { id?: string; input: PaymentRequestInput }>({
    mutationFn: ({ id, input }) =>
      apiFetch<{ id: string }>(id ? `${BASE}/${id}` : BASE, { method: id ? "PUT" : "POST", body: JSON.stringify(input) }),
    onSuccess: () => { void refresh(); },
  });
}

export function useRequestAct() {
  const refresh = useRefresh();
  return useMutation<{ id: string }, ApiError, { id: string; act: "withdraw" } | { id: string; act: "return"; note: string }>({
    mutationFn: (a) =>
      apiFetch<{ id: string }>(`${BASE}/${a.id}/${a.act}`, {
        method: "POST",
        body: a.act === "return" ? JSON.stringify({ note: a.note }) : undefined,
      }),
    onSuccess: () => { void refresh(); },
  });
}

/** Finance links the voucher or bill it made for the request. */
export async function answerPaymentRequest(id: string, answer: { voucherId: string } | { billId: string }): Promise<void> {
  await apiFetch(`${BASE}/${id}/answer`, { method: "POST", body: JSON.stringify(answer) });
}

/** Attach one file to a request: the Worker names the path, the bytes go to
 *  the request bucket directly, then the database records the file. */
export async function uploadRequestFile(id: string, file: File): Promise<void> {
  const mime = file.type as (typeof AP_FILE_MIME)[number];
  if (!(AP_FILE_MIME as readonly string[]).includes(mime)) {
    throw new Error("Attach a PDF or a photo (JPEG, PNG or WebP).");
  }
  if (file.size > AP_FILE_MAX_BYTES) {
    throw new Error(`That file is too big (${Math.round(file.size / 1024 / 1024)} MB). 20 MB at most.`);
  }
  const sign = await apiFetch<{ bucket: string; token: string; path: string }>(
    `${BASE}/${id}/files/sign`,
    { method: "POST", body: JSON.stringify({ mimeType: mime, sizeBytes: file.size }) },
  );
  const { error } = await supabase.storage.from(sign.bucket).uploadToSignedUrl(sign.path, sign.token, file, { contentType: mime });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  await apiFetch(`${BASE}/${id}/files`, {
    method: "POST",
    body: JSON.stringify({ path: sign.path, fileName: file.name.slice(-200), mimeType: mime, sizeBytes: file.size }),
  });
}

export function useUploadRequestFile(id: string) {
  const refresh = useRefresh();
  return useMutation<void, Error, File>({
    mutationFn: (file) => uploadRequestFile(id, file),
    onSuccess: () => { void refresh(); },
  });
}

export async function openRequestFile(path: string): Promise<void> {
  const { url } = await apiFetch<{ url: string }>(`${BASE}/files/url?path=${encodeURIComponent(path)}`);
  window.open(url, "_blank", "noopener");
}

export function useRequestGrants(enabled = true) {
  return useQuery({
    queryKey: requestKeys.grants(),
    queryFn: async () => (await apiFetch<{ rows: RequestGrantRow[] }>(`${BASE}/grants`)).rows,
    enabled,
  });
}

export function useSetRequestGrant() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, ApiError, { userId: string; allowed: boolean }>({
    mutationFn: ({ userId, allowed }) =>
      apiFetch<{ ok: true }>(`${BASE}/grants/${userId}`, { method: "PUT", body: JSON.stringify({ allowed }) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: requestKeys.all }); },
  });
}
