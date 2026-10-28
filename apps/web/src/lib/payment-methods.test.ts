import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { PaymentMethodRegistryRow } from "@carres/shared";
import { requiredPaymentReference } from "@carres/shared";
import {
  MERCHANT_STEP,
  activeManualMethods,
  machineWord,
  manualMethodSpec,
  methodSteps,
  useMethodChoice,
} from "./payment-methods";

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
  // 0660 — Merchant and each card machine are card payments.
  { key: "merchant",        want: "Approval code" },
  { key: "merchant_pbb",    want: "Approval code" },
  { key: "merchant_ahapay", want: "Approval code" },
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

  it("Chew's methods fall back with the same requirements when the registry read fails (0660)", () => {
    const fallback = activeManualMethods(undefined);
    expect(fallback.map((m) => [m.value, m.label, m.reference?.label ?? null, m.reference?.required ?? false]))
      .toEqual([
        ["bank", "Online transfer", "Reference number", true],
        ["cash", "Cash", null, false],
        ["cheque", "Cheque", "Cheque number", true],
        ["merchant_pbb", "Merchant · PBB", "Approval code", true],
        ["merchant_ghl", "Merchant · GHL", "Approval code", true],
        ["merchant_hlbb", "Merchant · HLBB", "Approval code", true],
        ["merchant_mbb", "Merchant · MBB", "Approval code", true],
        ["merchant_ahapay", "Merchant · AhaPay", "Approval code", true],
      ]);
  });

  it("a card machine asks for the card terminal receipt, even under a name a manager gave it", () => {
    expect(manualMethodSpec("merchant_ghl", [row("merchant_ghl", "GHL machine")]).evidence)
      .toBe("Card terminal receipt");
    expect(manualMethodSpec("probe_wallet", [row("probe_wallet", "Probe Wallet")]).evidence)
      .toBe("Payment proof");
  });
});

/** The registry as 0660 leaves it, in Chew's order. */
const RULED: PaymentMethodRegistryRow[] = [
  row("bank", "Online transfer"),
  row("cash", "Cash"),
  row("cheque", "Cheque"),
  row("merchant_pbb", "Merchant · PBB"),
  row("merchant_ghl", "Merchant · GHL"),
  row("merchant_ahapay", "Merchant · AhaPay"),
];

describe("two steps: the method, then the card machine (0660)", () => {
  it("offers Merchant once, in the place of the first machine, and the machines second", () => {
    const steps = methodSteps(activeManualMethods(RULED));
    expect(steps.first).toEqual([
      { value: "bank", label: "Online transfer" },
      { value: "cash", label: "Cash" },
      { value: "cheque", label: "Cheque" },
      { value: MERCHANT_STEP, label: "Merchant" },
    ]);
    expect(steps.machines.map((m) => [m.value, machineWord(m.label)])).toEqual([
      ["merchant_pbb", "PBB"], ["merchant_ghl", "GHL"], ["merchant_ahapay", "AhaPay"],
    ]);
  });

  it("with no Active machine there is no Merchant to choose", () => {
    const steps = methodSteps(activeManualMethods([row("bank", "Online transfer"), row("cash", "Cash")]));
    expect(steps.first.map((s) => s.value)).toEqual(["bank", "cash"]);
    expect(steps.machines).toEqual([]);
  });

  it("a machine's word drops only the Merchant start", () => {
    expect(machineWord("Merchant · HLBB")).toBe("HLBB");
    expect(machineWord("GHL machine")).toBe("GHL machine");
  });

  it("records the first step itself, or the chosen machine; Merchant alone records nothing", () => {
    const methods = activeManualMethods(RULED);
    const { result } = renderHook(() => useMethodChoice(methods));
    expect(result.current.method).toBe("bank");
    act(() => result.current.setFirst(MERCHANT_STEP));
    expect(result.current.first).toBe(MERCHANT_STEP);
    expect(result.current.method).toBeNull();
    act(() => result.current.setMachine("merchant_ghl"));
    expect(result.current.method).toBe("merchant_ghl");
    act(() => result.current.setFirst("cash"));
    expect(result.current.method).toBe("cash");
    // Back to Merchant: the machine chosen before is still chosen.
    act(() => result.current.setFirst(MERCHANT_STEP));
    expect(result.current.method).toBe("merchant_ghl");
  });

  it("a first step switched off since the form opened falls back to the first one offered", () => {
    const { result, rerender } = renderHook(({ rows }) => useMethodChoice(activeManualMethods(rows)),
      { initialProps: { rows: RULED } });
    act(() => result.current.setFirst("cheque"));
    rerender({ rows: RULED.filter((r) => r.method !== "cheque") });
    expect(result.current.first).toBe("bank");
    expect(result.current.method).toBe("bank");
  });
});
