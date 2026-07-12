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

describe("step4Valid — 0219 method rules", () => {
  function submittable(payment: Partial<WizardDraft["payment"]>): WizardDraft {
    const d = draftWith(payment);
    return {
      ...d,
      signature: "data:image/png;base64,x",
      termsAccepted: true,
      payment: {
        ...d.payment,
        slip: { mime: "image/png", dataUrl: "data:image/png;base64,y" },
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
