import { describe, expect, it } from "vitest";
import type { PaymentMethodRegistryRow } from "@carres/shared";
import { requiredPaymentReference } from "@carres/shared";
import { activeManualMethods, manualMethodSpec } from "./payment-methods";

/**
 * 0551 — THE AGREEMENT TABLE. One row per method key the writer can be handed,
 * comparing what the FORM now asks for against what `_customer_payment_post`
 * refuses without. A row that disagrees is a payment the operator can only
 * fail at the very end, with a database sentence instead of a field.
 *
 * `want` is the database's own word, from the 0551 sentences:
 *   cheque                  → 'a cheque payment needs its cheque number'
 *   card / credit / etc.    → 'a card payment needs its approval code'
 *   bank / bank_transfer    → 'a bank transfer needs its reference number'
 *   duitnow_qr              → 'a DuitNow QR payment needs its reference number'
 *   cash / online / other / a method a manager adds → no branch exists
 */
const TABLE: { key: string; want: string | null }[] = [
  { key: "cash",          want: null },
  { key: "bank",          want: "Reference number" },
  { key: "card",          want: "Approval code" },
  { key: "cheque",        want: "Cheque number" },
  { key: "online",        want: null },
  { key: "other",         want: null },
  { key: "duitnow_qr",    want: "Reference number" },
  { key: "credit_card",   want: "Approval code" },
  { key: "debit_card",    want: "Approval code" },
  { key: "bank_transfer", want: "Reference number" },
  { key: "credit",        want: "Approval code" },
  { key: "installment",   want: "Approval code" },
  // A method a manager adds in Settings → Payment. The writer has no branch
  // for it, so the form must not invent one.
  { key: "probe_wallet",  want: null },
];

/** The registry as Settings → Payment would return it for one key. */
const row = (method: string, label: string): PaymentMethodRegistryRow => ({
  method, label, account_code: "1120", account_name: "Bank", active: true, sort: 1,
});

describe("form and database ask for the same reference (0551)", () => {
  it.each(TABLE)("$key", ({ key, want }) => {
    // The predicate the SQL guard mirrors.
    expect(requiredPaymentReference(key)).toBe(want);
    // …and the field the form actually renders for that key.
    const spec = manualMethodSpec(key, [row(key, key)]);
    if (want === null) {
      expect(spec.reference?.required ?? false).toBe(false);
    } else {
      expect(spec.reference).toEqual({ label: want, required: true });
    }
  });

  it("cash, online and other did NOT become required", () => {
    for (const key of ["cash", "online", "other"]) {
      expect(manualMethodSpec(key, undefined).reference?.required ?? false).toBe(false);
    }
    // Cash keeps no reference box at all — there is no number on a banknote.
    expect(manualMethodSpec("cash", undefined).reference).toBeNull();
  });

  it("a DuitNow QR payment now has somewhere to type its number", () => {
    // Before 0551 this was `null`: the field was not rendered, so the payment
    // was impossible to save through the screen.
    expect(manualMethodSpec("duitnow_qr", undefined).reference)
      .toEqual({ label: "Reference number", required: true });
  });

  it("the governed six fall back with the same requirements when the registry read fails", () => {
    const fallback = activeManualMethods(undefined);
    expect(fallback.map((m) => [m.value, m.reference?.label ?? null, m.reference?.required ?? false]))
      .toEqual([
        ["bank", "Reference number", true],
        ["duitnow_qr", "Reference number", true],
        ["cheque", "Cheque number", true],
        ["cash", null, false],
        ["credit_card", "Approval code", true],
        ["debit_card", "Approval code", true],
      ]);
  });
});
