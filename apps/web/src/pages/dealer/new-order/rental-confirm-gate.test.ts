import { describe, it, expect } from "vitest";
import { emptyDraft, step4Valid, step4ValidRental, type WizardDraft } from "./draft";

/**
 * The rental CONFIRM gate (0276).
 *
 * Why this test exists: the POS rental category shipped (PR #347) with a lane
 * that could never be finished. `step4Valid` demands a payment slip or a Stripe
 * amount — correct for a sale, impossible for a rental, which collects nothing
 * until finance approves the credit. The Complete button simply stayed disabled
 * with no visible reason, which is the worst kind of dead end.
 *
 * So the bar here is both directions: a rental must be completable WITHOUT a
 * payment, and it must still be impossible without the signature and terms —
 * because those two ARE the rental agreement ("no signature, no order").
 */

function signedDraft(): WizardDraft {
  return {
    ...emptyDraft(),
    signature: "data:image/png;base64,AAAA",
    termsAccepted: true,
  };
}

describe("step4ValidRental", () => {
  it("accepts a signed rental with NO payment at all — the bug that blocked the lane", () => {
    const d = signedDraft();
    expect(d.payment.slip).toBeFalsy();
    // the ordinary gate refuses it (no slip) …
    expect(step4Valid(d)).toBe(false);
    // … and that refusal is exactly what made the rental lane un-finishable
    expect(step4ValidRental(d)).toBe(true);
  });

  it("still refuses a rental with no signature", () => {
    expect(step4ValidRental({ ...signedDraft(), signature: "" })).toBe(false);
  });

  it("refuses a signature that is not an image data URL", () => {
    // a stray string must not pass for a signature on a credit contract
    expect(step4ValidRental({ ...signedDraft(), signature: "scribbled" })).toBe(false);
    expect(step4ValidRental({ ...signedDraft(), signature: "data:text/plain;base64,AA" })).toBe(
      false,
    );
  });

  it("still refuses a rental whose terms were not accepted", () => {
    expect(step4ValidRental({ ...signedDraft(), termsAccepted: false })).toBe(false);
  });

  it("does not care about the payment method or amount", () => {
    const d = signedDraft();
    expect(step4ValidRental({ ...d, paid: 0 })).toBe(true);
    expect(step4ValidRental({ ...d, paid: 9999 })).toBe(true);
  });

  it("leaves the ordinary sale gate completely alone", () => {
    // a normal cart with signature + terms but no payment is STILL invalid —
    // the rental gate must not have loosened anything for real sales.
    expect(step4Valid(signedDraft())).toBe(false);
  });
});
