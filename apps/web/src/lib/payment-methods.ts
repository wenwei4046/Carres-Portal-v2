import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PaymentMethodRegistryRow, PaymentMoneyAccount } from "@carres/shared";
import { apiFetch } from "@/lib/api";

/**
 * 0476 — a payment method is a setting. Settings → Payment → Payment methods
 * is the ONE list (`payment_method_registry()`): key, name, money account,
 * Active. Every form that records customer money offers the Active rows from
 * here, so a method a manager adds appears everywhere at once and a method
 * switched off disappears everywhere at once.
 *
 * The six governed §16 methods stand in while the list loads or if the read
 * fails: a settings hiccup must never stop money from being recorded. The SQL
 * writer is the guard either way — it refuses a method with no money account.
 */

export const PAYMENT_METHODS_QUERY_KEY = ["finance", "payment-methods"] as const;

export interface PaymentMethodsPayload {
  methods: PaymentMethodRegistryRow[];
  money_accounts: PaymentMoneyAccount[];
}

export function usePaymentMethodRegistry() {
  return useQuery<PaymentMethodsPayload>({
    queryKey: PAYMENT_METHODS_QUERY_KEY,
    queryFn: () => apiFetch("/api/finance/payment-settings/methods"),
    staleTime: 60_000,
  });
}

/** What a method asks for as proof, and whether its reference is required. */
export interface ManualMethodSpec {
  value: string;
  label: string;
  evidence: string;
  reference: { label: string; required: boolean } | null;
}

/** The §16 evidence words for the six governed methods. A method a manager
 *  adds asks for `Payment proof` and an optional Reference. */
const GOVERNED: ManualMethodSpec[] = [
  { value: "bank", label: "Bank transfer", evidence: "Transfer slip",
    reference: { label: "Reference", required: false } },
  { value: "duitnow_qr", label: "DuitNow QR", evidence: "Payment screenshot",
    reference: null },
  { value: "cheque", label: "Cheque", evidence: "Cheque photo",
    reference: { label: "Cheque number", required: true } },
  { value: "cash", label: "Cash", evidence: "Cash collection proof",
    reference: null },
  { value: "credit_card", label: "Credit card", evidence: "Card terminal receipt",
    reference: { label: "Approval code", required: true } },
  { value: "debit_card", label: "Debit card", evidence: "Card terminal receipt",
    reference: { label: "Approval code", required: true } },
];
const GOVERNED_BY_KEY = new Map(GOVERNED.map((m) => [m.value, m]));

export const GOVERNED_MANUAL_METHODS: readonly ManualMethodSpec[] = GOVERNED;

/** Names of the words the system records itself — never a manual choice, but
 *  they appear on receipts, so a receipt row can still be read. */
const SYSTEM_WORD: Record<string, string> = {
  card: "Card",
  online: "Online payment",
  other: "Other",
};

function specFor(row: PaymentMethodRegistryRow): ManualMethodSpec {
  const governed = GOVERNED_BY_KEY.get(row.method);
  return governed
    ? { ...governed, label: row.label }
    : { value: row.method, label: row.label, evidence: "Payment proof",
        reference: { label: "Reference", required: false } };
}

/** The Active methods a form may offer, in the manager's order. Falls back to
 *  the governed six while loading, on a failed read, or if every row is off. */
export function activeManualMethods(rows: PaymentMethodRegistryRow[] | undefined): ManualMethodSpec[] {
  const active = (rows ?? []).filter((r) => r.active).map(specFor);
  return active.length ? active : GOVERNED;
}

/** The spec for a key, whether or not it is Active today. */
export function manualMethodSpec(
  key: string,
  rows: PaymentMethodRegistryRow[] | undefined,
): ManualMethodSpec {
  const row = (rows ?? []).find((r) => r.method === key);
  if (row) return specFor(row);
  return GOVERNED_BY_KEY.get(key)
    ?? { value: key, label: methodLabel(key, rows), evidence: "Payment proof",
         reference: { label: "Reference", required: false } };
}

/** The name a stored method key reads as: the registry's name, else the
 *  governed name, else the system word — never the raw key. */
export function methodLabel(key: string | null | undefined, rows?: PaymentMethodRegistryRow[]): string {
  if (!key) return "Not recorded";
  const row = (rows ?? []).find((r) => r.method === key);
  if (row) return row.label;
  const governed = GOVERNED_BY_KEY.get(key);
  if (governed) return governed.label;
  if (SYSTEM_WORD[key]) return SYSTEM_WORD[key];
  if (key === "bank_transfer") return "Bank transfer";
  return key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** The Active methods as options, plus the name lookup — one hook per form. */
export function useManualMethods() {
  const query = usePaymentMethodRegistry();
  const rows = query.data?.methods;
  const methods = useMemo(() => activeManualMethods(rows), [rows]);
  return {
    methods,
    rows,
    spec: (key: string) => manualMethodSpec(key, rows),
    label: (key: string | null | undefined) => methodLabel(key, rows),
  };
}
