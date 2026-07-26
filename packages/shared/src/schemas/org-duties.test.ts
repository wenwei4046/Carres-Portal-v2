import { describe, it, expect } from "vitest";
import {
  DUTY_KEYS,
  isDutyKey,
  checkDuty,
  usedLegacyFallback,
  isOpsManager,
  isPoDutyEditor,
  isOpsManagerRow,
} from "./org-duties";

const JESS = "jess@carres.com";
const SHARED_OPS = "operation@carres.com";
const NOBODY = "liching@carres.com";

describe("DUTY_KEYS", () => {
  it("is the closed 5-key vocabulary", () => {
    expect([...DUTY_KEYS]).toEqual([
      "ops_manager",
      "po_duty_editor",
      "account_creator",
      "finance_approver",
      "roster_editor",
    ]);
  });

  it("isDutyKey rejects anything outside it", () => {
    expect(isDutyKey("ops_manager")).toBe(true);
    expect(isDutyKey("admin")).toBe(false);
    expect(isDutyKey(null)).toBe(false);
  });
});

describe("checkDuty — resolution order", () => {
  it("principal passes every key by ROLE, never needing a duty", () => {
    for (const key of DUTY_KEYS) {
      expect(checkDuty(key, "principal", null, [])).toEqual({ allowed: true, via: "role" });
    }
  });

  it("grants via DUTY when the caller's position carries the key", () => {
    expect(checkDuty("ops_manager", "operation", NOBODY, ["ops_manager"]))
      .toEqual({ allowed: true, via: "duty" });
  });

  it("prefers DUTY over the legacy list when both would pass", () => {
    // This is what makes "zero legacy hits this week" a meaningful signal.
    expect(checkDuty("ops_manager", "operation", JESS, ["ops_manager"]).via).toBe("duty");
  });

  it("falls back to the legacy email list when the duty is absent", () => {
    expect(checkDuty("ops_manager", "operation", JESS, []))
      .toEqual({ allowed: true, via: "legacy_email" });
    expect(usedLegacyFallback(checkDuty("ops_manager", "operation", JESS, []))).toBe(true);
  });

  it("is case-insensitive on the legacy email", () => {
    expect(checkDuty("ops_manager", "operation", "Jess@Carres.com", []).allowed).toBe(true);
  });

  it("denies when neither duty nor legacy email applies", () => {
    expect(checkDuty("ops_manager", "operation", NOBODY, []))
      .toEqual({ allowed: false, via: "none" });
  });
});

describe("checkDuty — fail-closed on missing data", () => {
  it("treats undefined duties (still loading) as empty — never grants", () => {
    expect(checkDuty("account_creator", "operation", NOBODY, undefined).allowed).toBe(false);
    expect(checkDuty("account_creator", "operation", NOBODY, null).allowed).toBe(false);
  });

  it("a null email cannot reach the legacy path", () => {
    expect(checkDuty("ops_manager", "operation", null, []).allowed).toBe(false);
  });

  it("keys introduced BY 0260 have no legacy path at all", () => {
    // account_creator / finance_approver / roster_editor never existed as an
    // email list, so even Jess must hold the duty to get them.
    for (const key of ["account_creator", "finance_approver", "roster_editor"] as const) {
      expect(checkDuty(key, "operation", JESS, []).allowed).toBe(false);
      expect(checkDuty(key, "operation", JESS, [key]).via).toBe("duty");
    }
  });
});

describe("isPoDutyEditor is STRICTER than isOpsManager", () => {
  it("the shared operation@ login manages but must not rewrite the rotation", () => {
    expect(isOpsManager("operation", SHARED_OPS)).toBe(true); // legacy fallback
    expect(isPoDutyEditor("operation", SHARED_OPS)).toBe(false);
  });

  it("Jess passes both", () => {
    expect(isOpsManager("operation", JESS)).toBe(true);
    expect(isPoDutyEditor("operation", JESS)).toBe(true);
  });

  it("and both still pass her via the DUTY once 0260's COO grant is loaded", () => {
    const cooDuties = ["account_creator", "finance_approver", "ops_manager", "po_duty_editor"];
    expect(checkDuty("ops_manager", "operation", JESS, cooDuties).via).toBe("duty");
    expect(checkDuty("po_duty_editor", "operation", JESS, cooDuties).via).toBe("duty");
  });
});

describe("isOpsManagerRow — the per-ROW question self-only cannot answer", () => {
  it("reads the LISTED person's duties", () => {
    expect(isOpsManagerRow(NOBODY, ["ops_manager", "po_duty_editor"])).toBe(true);
    expect(isOpsManagerRow(NOBODY, [])).toBe(false);
  });

  it("still honours the legacy email for a row with no duties yet", () => {
    expect(isOpsManagerRow(JESS, [])).toBe(true);
    expect(isOpsManagerRow(SHARED_OPS, [])).toBe(true);
  });

  it("never grants on missing duties", () => {
    expect(isOpsManagerRow(NOBODY, null)).toBe(false);
    expect(isOpsManagerRow(NOBODY, undefined)).toBe(false);
  });

  it("does NOT let a listed row inherit the VIEWER's principal role", () => {
    // The regression this guards: reusing isOpsManager(authRole, row.email)
    // for the pool filter made EVERY row look like a manager the moment the
    // Chairman opened the page — silently emptying the assignment pool.
    // isOpsManagerRow pins role=null so a row can only speak for itself.
    expect(isOpsManagerRow(NOBODY, [])).toBe(false);
    expect(isOpsManager("principal", NOBODY, [])).toBe(true); // the trap, shown
  });
});
