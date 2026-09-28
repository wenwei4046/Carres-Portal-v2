import { describe, expect, it } from "vitest";
import { describeRevisionChanges } from "./sales-order-revisions";

/* ⭐ A `—` on either side of a change arrow is a dash pretending to be a value
   (owner ruling 2026-09-26). Measured: `Address not given yet: — → No`. */
describe("a change arrow never carries a dash", () => {
  const snap = (header: Record<string, unknown>) => ({ header, lines: [], addons: [] }) as never;

  it("a boolean's missing before-value prints `Not recorded`", () => {
    expect(describeRevisionChanges(snap({}), snap({ customer_address_unknown: false }))).toContain(
      "Address not given yet: Not recorded → No",
    );
    expect(describeRevisionChanges(snap({}), snap({ customer_billing_same: true }))).toContain(
      "Billing address same as delivery: Not recorded → Yes",
    );
  });

  it("any other missing value prints `No {field word}`, on either side", () => {
    const added = describeRevisionChanges(snap({}), snap({ customer_phone: "012-3456789" }));
    expect(added).toContain("Phone: No phone → 012-3456789");
    const removed = describeRevisionChanges(snap({ customer_email: "a@b.my" }), snap({ customer_email: null }));
    expect(removed).toContain("Email: a@b.my → No email");
  });

  it("no sentence it writes prints a dash as a value", () => {
    const lines = describeRevisionChanges(
      snap({ customer_phone: null, delivery_date: null, customer_address_unknown: null }),
      snap({ customer_phone: "012", delivery_date: "2026-10-05", customer_address_unknown: true }),
    );
    for (const line of lines) expect(line).not.toMatch(/(: |→ )[—–-]( |$)/);
  });
});
