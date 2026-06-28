import { describe, expect, it } from "vitest";

import { phoneKey, phoneKeyMy } from "./phone";

// A pure JS re-implementation of the SQL twin `public.pwp_phone_key` (migration
// 0188) — byte-for-byte the same three regexp_replace steps in the same order:
//   regexp_replace(coalesce(p,''), '\D', '', 'g')  -- digits only
//   regexp_replace(_, '^60', '')                   -- drop a leading 60
//   regexp_replace(_, '^0+', '')                   -- drop leading 0s
// The migration's SQL `^60` removes ONLY the first occurrence (no 'g' flag) and
// `^0+` removes the leading zero-run. This local twin is the contract `phoneKeyMy`
// must satisfy; the assertion below proves `phoneKeyMy` agrees with it on every
// representative shape. If the SQL ever changes, change BOTH this twin and
// phoneKeyMy together (they are the same canonicalization on two sides).
const sqlPwpPhoneKey = (p: string | null | undefined): string => {
  let d = (p ?? "").replace(/\D/g, "");
  d = d.replace(/^60/, "");
  d = d.replace(/^0+/, "");
  return d;
};

describe("phoneKey (legacy digits-only)", () => {
  it("strips all non-digits", () => {
    expect(phoneKey("012-345 6789")).toBe("0123456789");
    expect(phoneKey("+60 12-345 6789")).toBe("60123456789");
  });

  it("treats null / undefined / empty as an empty key", () => {
    expect(phoneKey(null)).toBe("");
    expect(phoneKey(undefined)).toBe("");
    expect(phoneKey("")).toBe("");
    expect(phoneKey("   ")).toBe("");
  });

  it("does NOT strip a country code or trunk zero (that is phoneKeyMy's job)", () => {
    // The whole point of the legacy key: 012… and +6012… are DIFFERENT here.
    expect(phoneKey("0123456789")).not.toBe(phoneKey("+60123456789"));
  });
});

describe("phoneKeyMy (MY-aware canonical)", () => {
  it("canonicalizes the four common MY shapes of one number to the SAME key", () => {
    const variants = [
      "012-345 6789",
      "0123456789",
      "+60 12-345 6789",
      "60123456789",
    ];
    const keys = variants.map(phoneKeyMy);
    // all equal
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe("123456789");
  });

  it("a non-MY number (e.g. +65…) stays distinct from a MY core", () => {
    // +65 9123 4567 → digits 6591234567 → no leading 60, no leading 0 → 6591234567.
    expect(phoneKeyMy("+65 9123 4567")).toBe("6591234567");
    expect(phoneKeyMy("+65 9123 4567")).not.toBe(phoneKeyMy("0123456789"));
  });

  it("handles null / undefined / empty as an empty key", () => {
    expect(phoneKeyMy(null)).toBe("");
    expect(phoneKeyMy(undefined)).toBe("");
    expect(phoneKeyMy("")).toBe("");
  });

  it("strips a bare leading 60 then leading zeros in order", () => {
    expect(phoneKeyMy("60123456789")).toBe("123456789"); // drop 60
    expect(phoneKeyMy("00123456789")).toBe("123456789"); // 60 not present → drop all leading 0s
    expect(phoneKeyMy("0123456789")).toBe("123456789"); // drop the single trunk 0
  });
});

describe("phoneKeyMy (JS) === pwp_phone_key (SQL) — the cross-twin parity gate", () => {
  // Every shape mint or redeem might submit. The JS key MUST equal the SQL twin
  // so the cross-order binding (mint stamps via the carry-forward sweep using
  // phoneKeyMy; redeem matches via the RPC using pwp_phone_key) never mismatches.
  //
  // LIMITATION (CF pwp-phone-key-twin-not-db-verified): `sqlPwpPhoneKey` above is a
  // hand-written JS RE-IMPLEMENTATION of the Postgres `public.pwp_phone_key` body,
  // NOT the actual function executed against the DB. Because `phoneKeyMy` and
  // `sqlPwpPhoneKey` are byte-identical JS, this gate verifies the JS↔JS contract
  // ONLY — it CANNOT catch a real JS-vs-Postgres divergence (e.g. if migration
  // 0188's SQL regex were later edited to a different anchor or the `g` flag added
  // to `^60`). The two were verified equivalent at authoring time. If the migration's
  // SQL ever changes, edit `phoneKeyMy`, `sqlPwpPhoneKey`, AND the migration in
  // LOCKSTEP. A true JS↔Postgres guard needs an integration test running the real
  // `public.pwp_phone_key` over this case set (mirrors the §17.7 "mocked tests can't
  // catch DB-contract drift" lesson) — tracked, deferred (the feature is dormant).
  const cases: Array<string | null | undefined> = [
    "012-345 6789",
    "0123456789",
    "+60 12-345 6789",
    "60123456789",
    "+65 9123 4567", // non-MY
    "  ",
    "",
    null,
    undefined,
    "601098765432",
    "01098765432",
    "(012) 345-6789",
    "60-12 345 6789",
  ];

  it.each(cases.map((c) => [c] as const))("agrees on %j", (input) => {
    expect(phoneKeyMy(input)).toBe(sqlPwpPhoneKey(input));
  });
});
