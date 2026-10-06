import { describe, it, expect } from "vitest";
import {
  DEFAULT_PAYMENT_METHODS,
  MY_BANKS,
  parseOrderEntryConfigRow,
  resolveFormTab,
  resolvePaymentMethods,
  type PaymentMethodConfig,
} from "./order-entry";

describe("resolvePaymentMethods (0219)", () => {
  it("empty/absent config → the 4 code defaults incl. cash, credit carries the bank follow-up", () => {
    for (const cfg of [null, undefined, { paymentMethods: [] }]) {
      const methods = resolvePaymentMethods(cfg);
      expect(methods.map((m) => m.key)).toEqual(["online", "credit", "installment", "cash"]);
      const credit = methods.find((m) => m.key === "credit")!;
      expect(credit.followUps[0]?.key).toBe("bank");
      expect(credit.followUps[0]?.options).toEqual([...MY_BANKS]);
      // KL Gateway 2026-09-18: a card sale names its bank.
      expect(credit.followUps[0]?.required).toBe(true);
      expect(methods.find((m) => m.key === "cash")!.approvalCodeRequired).toBe(false);
    }
  });

  it("a configured list REPLACES the defaults and filters inactive", () => {
    const configured: PaymentMethodConfig[] = [
      { key: "ewallet", label: "E-wallet", sublabel: "", active: true, approvalCodeRequired: true, followUps: [] },
      { key: "cash", label: "Cash", sublabel: "", active: false, approvalCodeRequired: false, followUps: [] },
    ];
    const methods = resolvePaymentMethods({ paymentMethods: configured });
    expect(methods.map((m) => m.key)).toEqual(["ewallet"]);
  });

  it("a saved config cannot make the card bank optional", () => {
    const methods = resolvePaymentMethods({ paymentMethods: [
      { key: "credit", label: "Credit / Debit", sublabel: "", active: true, approvalCodeRequired: true,
        followUps: [{ key: "bank", label: "Bank", options: ["Maybank"], required: false }] },
    ] });
    expect(methods[0].followUps[0].required).toBe(true);
  });

  it("a saved config cannot drop the approval code on credit or installment", () => {
    const methods = resolvePaymentMethods({ paymentMethods: [
      { key: "installment", label: "Installment", sublabel: "", active: true, approvalCodeRequired: false, followUps: [] },
      { key: "cash", label: "Cash", sublabel: "", active: true, approvalCodeRequired: false, followUps: [] },
    ] });
    expect(methods.map((m) => m.approvalCodeRequired)).toEqual([true, false]);
  });

  // 0551 — the form and `_customer_payment_post` must name the same methods.
  // A manager adding Cheque / Bank transfer / DuitNow QR in SO Maintenance
  // leaves the box unticked; the writer refuses a blank reference either way,
  // so the operator has to learn it from a database error instead of the form.
  it("a method the WRITER requires a reference for is required whatever the config says", () => {
    const off = (key: string, label: string): PaymentMethodConfig =>
      ({ key, label, sublabel: "", active: true, approvalCodeRequired: false, followUps: [] });
    const methods = resolvePaymentMethods({ paymentMethods: [
      off("cheque", "Cheque"), off("bank-transfer", "Bank transfer"), off("duitnow-qr", "DuitNow QR"),
    ] });
    expect(methods.map((m) => m.approvalCodeRequired)).toEqual([true, true, true]);
  });

  it("cash, online transfer and a manager's own method keep the flag they were saved with", () => {
    const methods = resolvePaymentMethods({ paymentMethods: [
      { key: "cash", label: "Cash", sublabel: "", active: true, approvalCodeRequired: false, followUps: [] },
      { key: "grab-pay", label: "GrabPay", sublabel: "", active: true, approvalCodeRequired: false, followUps: [] },
      { key: "online", label: "Online transfer", sublabel: "", active: true, approvalCodeRequired: true, followUps: [] },
    ] });
    expect(methods.map((m) => m.approvalCodeRequired)).toEqual([false, false, true]);
  });
});

describe("resolveFormTab (0219)", () => {
  it("no config → builtin defaults (email/race/gender/birthday enabled+required; emergency block required)", () => {
    const cust = resolveFormTab(null, "customer");
    expect(cust.builtins["race"]).toMatchObject({ enabled: true, required: true, locked: false });
    expect(cust.builtins["name"]).toMatchObject({ enabled: true, required: true, locked: true });
    expect(resolveFormTab(null, "emergency").builtins["emergency"]).toMatchObject({
      enabled: true,
      required: true,
    });
    expect(cust.custom).toEqual([]);
  });

  it("overrides apply to toggleable fields; LOCKED fields ignore overrides", () => {
    const cfg = {
      customer: {
        builtins: {
          race: { enabled: false },
          birthday: { required: false },
          name: { enabled: false, required: false }, // locked → ignored
        },
        custom: [],
      },
    };
    const cust = resolveFormTab(cfg, "customer");
    expect(cust.builtins["race"]!.enabled).toBe(false);
    expect(cust.builtins["race"]!.required).toBe(false); // disabled → never required
    expect(cust.builtins["birthday"]).toMatchObject({ enabled: true, required: false });
    expect(cust.builtins["name"]).toMatchObject({ enabled: true, required: true }); // locked wins
  });

  it("proceedDate + deliveryDate are LOCKED on the target tab (ops engine requires them)", () => {
    const cfg = { target: { builtins: { proceedDate: { enabled: false } }, custom: [] } };
    const t = resolveFormTab(cfg, "target");
    expect(t.builtins["proceedDate"]).toMatchObject({ enabled: true, required: true, locked: true });
    expect(t.builtins["deliveryDate"]!.locked).toBe(true);
  });
});

describe("parseOrderEntryConfigRow (lenient)", () => {
  it("garbage jsonb degrades to the empty config (defaults apply) instead of throwing", () => {
    expect(parseOrderEntryConfigRow(null)).toEqual({ paymentMethods: [], formFields: {} });
    expect(
      parseOrderEntryConfigRow({ payment_methods: "nope", form_fields: 42 }),
    ).toEqual({ paymentMethods: [], formFields: {} });
  });

  it("valid row round-trips", () => {
    const row = {
      payment_methods: DEFAULT_PAYMENT_METHODS,
      form_fields: { customer: { builtins: { race: { enabled: false } }, custom: [] } },
    };
    const parsed = parseOrderEntryConfigRow(row);
    expect(parsed.paymentMethods).toHaveLength(4);
    expect(parsed.formFields.customer?.builtins["race"]).toEqual({ enabled: false });
  });
});
