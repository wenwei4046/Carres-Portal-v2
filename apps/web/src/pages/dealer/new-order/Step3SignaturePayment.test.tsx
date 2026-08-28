import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { CatalogResponse } from "@carres/shared";
import { emptyDraft, step4Valid, type WizardDraft } from "./draft";
import Step3SignaturePayment from "./Step3SignaturePayment";

afterEach(cleanup);

/** 0219 — the payment step renders methods from catalog.orderEntryConfig
 *  (absent → code defaults incl. CASH; credit carries the Bank follow-up). */

function catalog(overrides: Partial<CatalogResponse> = {}): CatalogResponse {
  return {
    models: [],
    skus: [],
    sofaFabrics: [],
    addons: [],
    floorConfig: { id: 1, freeUpToFloor: 1, perFloorPerItem: 50 },
    ...overrides,
  } as unknown as CatalogResponse;
}

function draftWith(payment: Partial<WizardDraft["payment"]>): WizardDraft {
  const d = emptyDraft();
  return { ...d, payment: { ...d.payment, ...payment } };
}

function renderStep(draft: WizardDraft, cat = catalog()) {
  const changes: WizardDraft[] = [];
  render(
    <Step3SignaturePayment
      draft={draft}
      onChange={(next) => changes.push(next)}
      catalog={cat}
    />,
  );
  return changes;
}

function handoffReadyDraft(): WizardDraft {
  const d = emptyDraft();
  return {
    ...d,
    customer: {
      ...d.customer,
      name: "Nur Aina",
      phone: "0123456789",
      addressLine1: "12 Jalan Damai",
      addressState: "Selangor",
      addressCity: "Petaling Jaya",
      addressPostcode: "47301",
    },
    delivery: { ...d.delivery, date: "2026-09-30" },
    lines: [
      {
        localId: "L1",
        sku: "MATT-A",
        qty: 1,
        attrs: null,
        unitPrice: 1_200,
        label: "Matt A · Queen",
      },
    ],
    paid: 600,
    payment: {
      ...d.payment,
      method: "cash",
      slip: {
        name: "receipt.png",
        mime: "image/png",
        size: 4,
        dataUrl: "data:image/png;base64,eA==",
      },
    },
    signature: "data:image/png;base64,eA==",
    termsAccepted: true,
  };
}

describe("Step3SignaturePayment — 0219 config-driven methods", () => {
  it("default config shows the 4 methods incl. CASH", () => {
    renderStep(draftWith({}));
    for (const key of ["online", "credit", "installment", "cash"]) {
      expect(screen.getByTestId(`pay-method-${key}`)).toBeTruthy();
    }
  });

  it("credit shows the Bank follow-up dropdown; picking a bank lands in payment.followUps", () => {
    const changes = renderStep(draftWith({ method: "credit" }));
    const bank = screen.getByTestId("pay-followup-bank") as HTMLSelectElement;
    expect(bank).toBeTruthy();
    fireEvent.change(bank, { target: { value: "Maybank" } });
    expect(changes.at(-1)?.payment.followUps).toEqual({ bank: "Maybank" });
  });

  it("cash needs NO approval code field; online does", () => {
    renderStep(draftWith({ method: "cash" }));
    expect(screen.queryByText(/Bank reference number|Approval code|Reference code/)).toBeNull();
    cleanup();
    renderStep(draftWith({ method: "online" }));
    expect(screen.getByText(/Bank reference number/)).toBeTruthy();
  });

  it("switching methods clears the follow-up answers", () => {
    const changes = renderStep(
      draftWith({ method: "credit", followUps: { bank: "Maybank" } }),
    );
    fireEvent.click(screen.getByTestId("pay-method-cash"));
    expect(changes.at(-1)?.payment.method).toBe("cash");
    expect(changes.at(-1)?.payment.followUps).toEqual({});
  });

  it("a CONFIGURED method list replaces the defaults entirely", () => {
    const cat = catalog({
      orderEntryConfig: {
        paymentMethods: [
          {
            key: "ewallet",
            label: "E-wallet",
            sublabel: "TNG / GrabPay",
            active: true,
            approvalCodeRequired: true,
            followUps: [],
          },
          {
            key: "online",
            label: "Online transfer",
            sublabel: "FPX",
            active: false, // deactivated → hidden
            approvalCodeRequired: true,
            followUps: [],
          },
        ],
        formFields: {},
      },
    });
    renderStep(draftWith({ method: "ewallet" }), cat);
    expect(screen.getByTestId("pay-method-ewallet")).toBeTruthy();
    expect(screen.queryByTestId("pay-method-online")).toBeNull();
    expect(screen.queryByTestId("pay-method-cash")).toBeNull();
    // Generic approval copy for an operator-created method.
    expect(screen.getByText(/Reference code \*/)).toBeTruthy();
  });
});

describe("Step3SignaturePayment — Order recap free-gift parity", () => {
  it("lists the default free gift as a FREE row (same items as the OrderSummaryRail)", () => {
    const MATT = "22222222-2222-2222-2222-222222222222";
    const ACC = "44444444-4444-4444-4444-444444444444";
    const cat = catalog({
      models: [
        { id: MATT, category: "mattress", modelKey: "matt-x", name: "Matt X", blurb: null, colors: null, gaps: null, sofaMode: null },
        { id: ACC, category: "accessory", modelKey: "acc-x", name: "Acc X", blurb: null, colors: null, gaps: null, sofaMode: null },
      ],
      skus: [
        { id: "id-1", sku: "MATT-A", modelId: MATT, variant: "Queen", variantKind: "size", price: 1200, cost: null, supplierId: null, posActive: true, description: "Matt A" },
        { id: "id-2", sku: "PILLOW", modelId: ACC, variant: "Queen", variantKind: "size", price: 100, cost: null, supplierId: null, posActive: true, description: "Memory Pillow" },
      ],
      modelDefaultFreeGifts: [{ modelId: MATT, gifts: [{ giftSku: "PILLOW", qty: 2 }] }],
    } as unknown as Partial<CatalogResponse>);
    const d = emptyDraft();
    renderStep(
      { ...d, lines: [{ localId: "L1", sku: "MATT-A", qty: 1, attrs: null, unitPrice: 1200, label: "Matt X · Queen" }] },
      cat,
    );
    const gift = screen.getByTestId("step3-gift-PILLOW");
    expect(gift.textContent).toContain("Acc X");
    expect(gift.textContent).toContain("×2 · GWP");
    expect(gift.textContent).toContain("FREE");
  });

  it("DORMANT: no gift configured → no gift row", () => {
    const d = emptyDraft();
    renderStep(
      { ...d, lines: [{ localId: "L1", sku: "MATT-A", qty: 1, attrs: null, unitPrice: 1200, label: "Matt X · Queen" }] },
      catalog(),
    );
    expect(screen.queryByTestId("step3-gift-PILLOW")).toBeNull();
  });
});

describe("Step3SignaturePayment — final-submit handoff message", () => {
  it("says Operations receives the order only when every governed fact exists", () => {
    renderStep(handoffReadyDraft());

    expect(screen.getByText("✓ This order is complete.")).toBeTruthy();
    expect(
      screen.getByText("Operations receives this order automatically when you submit."),
    ).toBeTruthy();
  });

  it.each([
    ["no goods or price", (d: WizardDraft) => ({ ...d, lines: [] }), "goods and a price"],
    [
      "no customer name",
      (d: WizardDraft) => ({ ...d, customer: { ...d.customer, name: "" } }),
      "customer name is entered",
    ],
    ["no signature", (d: WizardDraft) => ({ ...d, signature: null }), "customer signs"],
    [
      "terms not accepted",
      (d: WizardDraft) => ({ ...d, termsAccepted: false }),
      "terms are accepted",
    ],
  ])("never calls an incomplete order complete: %s", (_label, change, missingFact) => {
    renderStep(change(handoffReadyDraft()));

    expect(screen.queryByText("✓ This order is complete.")).toBeNull();
    expect(screen.getByText("⚠ This order is not ready.")).toBeTruthy();
    expect(screen.getByText(new RegExp(missingFact))).toBeTruthy();
  });
});

describe("step4Valid — 0219 method rules", () => {
  function submittable(payment: Partial<WizardDraft["payment"]>): WizardDraft {
    const d = draftWith(payment);
    return {
      ...d,
      signature: "data:image/png;base64,x",
      termsAccepted: true,
      payment: {
        ...d.payment,
        slip: { name: "slip.png", mime: "image/png", size: 4, dataUrl: "data:image/png;base64,y" },
        ...payment,
      },
    };
  }

  it("cash: valid WITHOUT an approval code", () => {
    expect(step4Valid(submittable({ method: "cash", approvalCode: "" }))).toBe(true);
  });

  it("online: still requires the ≥3-char reference (Loo 2026-05-10)", () => {
    expect(step4Valid(submittable({ method: "online", approvalCode: "" }))).toBe(false);
    expect(step4Valid(submittable({ method: "online", approvalCode: "FT26X" }))).toBe(true);
  });

  it("an unknown method key never validates", () => {
    expect(step4Valid(submittable({ method: "bitcoin", approvalCode: "XYZ123" }))).toBe(false);
  });

  it("a config-required follow-up gates until answered", () => {
    const methods = [
      {
        key: "credit",
        label: "Credit / Debit",
        sublabel: "",
        active: true,
        approvalCodeRequired: true,
        followUps: [
          { key: "bank", label: "Bank", options: ["Maybank"], required: true },
        ],
      },
    ];
    const base = submittable({ method: "credit", approvalCode: "472019" });
    expect(step4Valid(base, methods)).toBe(false);
    expect(
      step4Valid(
        { ...base, payment: { ...base.payment, followUps: { bank: "Maybank" } } },
        methods,
      ),
    ).toBe(true);
  });
});
