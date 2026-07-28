import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * C7 — "an operator never types a DO again" is the card's own DONE WHEN, and it
 * is the one half of this card that lives outside the action engine.
 *
 * A SOURCE SCAN, for the same reason the drawer's guard is one: what is being
 * guarded here is that a branch does NOT exist — no editable field, no random
 * suggestion — and a render test can only prove things about the branches its
 * fixture happens to reach.
 */
const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "DOAttachModal.tsx"),
  "utf8",
);

describe("DOAttachModal — the delivery order number is not typed (C7)", () => {
  it("has no editable DO-number input at all", () => {
    // The old field was `<input id="do-number-input" … onChange={setDoNumber}>`.
    expect(SRC).not.toContain("do-number-input");
    expect(SRC).not.toContain("setDoNumber");
  });

  it("no longer invents a RANDOM number for a human to accept", () => {
    // `"DO-" + (9800 + Math.floor(Math.random() * 200))` — a number that cannot
    // be reproduced on a reprint, over a paper the customer signs.
    expect(SRC).not.toContain("Math.random");
    expect(SRC).not.toContain("suggestDoNumber");
  });

  it("uses the number already on the order, else the LOCKED scheme with a stable seed", () => {
    expect(SRC).toMatch(/order\.do_number/);
    expect(SRC).toMatch(/docNumber\(/);
    expect(SRC).toMatch(/seed:\s*order\.id/);
  });

  it("stops gating the submit on a typed number's length", () => {
    // `doNumber.trim().length >= 3` was a validation of the operator's typing.
    expect(SRC).not.toMatch(/doNumber\.trim\(\)\.length/);
  });
});
