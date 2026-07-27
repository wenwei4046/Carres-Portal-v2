import { describe, expect, it } from "vitest";
import {
  addAdjustmentInput,
  blockingFailures,
  canClose,
  closeMonthInput,
  commissionReadiness,
  commissionRunCsv,
  isMonthLocked,
  runStatusTone,
  type ReadinessInput,
} from "./commission-runs";

/** A staff result shaped like the engine's, trimmed to what readiness reads. */
const seller = (basis: number, total: number) =>
  ({ basis, total }) as ReadinessInput["report"]["perStaff"][number];

/** July 2026 as it actually is: 2 sellers, RM 52,081, zero rates configured. */
const today = { year: 2026, month: 7 };
const base: ReadinessInput = {
  report: { perStaff: [seller(30480, 0), seller(21601, 0)] },
  runStatus: null,
  year: 2026,
  month: 7,
  today,
};

describe("the pre-flight", () => {
  it("blocks the close when nobody has a rate — the live case", () => {
    const checks = commissionReadiness(base);
    expect(canClose(checks)).toBe(false);
    const failed = blockingFailures(checks);
    expect(failed.map((c) => c.key)).toEqual(["rates"]);
    expect(failed[0]!.title).toBe("Nobody has a commission rate");
  });

  it("names the partial case rather than saying nobody", () => {
    const checks = commissionReadiness({
      ...base,
      report: { perStaff: [seller(30480, 914.4), seller(21601, 0)] },
    });
    expect(blockingFailures(checks)[0]!.title).toBe("1 of 2 people have no rate");
  });

  it("lets the month close once everyone computes to a figure", () => {
    const checks = commissionReadiness({
      ...base,
      report: { perStaff: [seller(30480, 914.4), seller(21601, 540.03)] },
    });
    expect(canClose(checks)).toBe(true);
  });

  it("ignores people with no sales — they are not missing a rate", () => {
    const checks = commissionReadiness({
      ...base,
      report: { perStaff: [seller(30480, 914.4), seller(0, 0)] },
    });
    expect(canClose(checks)).toBe(true);
  });

  // The old "blocks on an unattributed sale" case went with attribution
  // itself (Loo 2026-07-27). The gate that still matters lives in SQL:
  // commission_close_month RAISES unattributed_orders. This asserts the pure
  // function no longer claims a check it cannot offer a remedy for.
  it("no longer carries an attribution check", () => {
    const checks = commissionReadiness({ ...base });
    expect(checks.map((c) => c.key)).toEqual(["rates", "month_over", "no_run"]);
  });

  it("warns about an unfinished month WITHOUT blocking it", () => {
    const checks = commissionReadiness({
      ...base,
      report: { perStaff: [seller(30480, 914.4)] },
    });
    const m = checks.find((c) => c.key === "month_over")!;
    expect(m.passed).toBe(false);
    expect(m.blocking).toBe(false);
    expect(canClose(checks)).toBe(true); // closing early is allowed
  });

  it("stops passing the month check once the month is over", () => {
    const checks = commissionReadiness({
      ...base,
      report: { perStaff: [seller(30480, 914.4)] },
      today: { year: 2026, month: 8 },
    });
    expect(checks.find((c) => c.key === "month_over")!.passed).toBe(true);
  });

  it("blocks a second close, but not when the previous run was discarded", () => {
    const ok = { ...base, report: { perStaff: [seller(30480, 914.4)] } };
    expect(canClose(commissionReadiness({ ...ok, runStatus: "draft" }))).toBe(false);
    expect(canClose(commissionReadiness({ ...ok, runStatus: "approved" }))).toBe(false);
    expect(canClose(commissionReadiness({ ...ok, runStatus: "void" }))).toBe(true);
  });
});

describe("the lock", () => {
  it("holds from approved onwards and leaves draft fluid", () => {
    // risk register #1: the lock must not fight a workflow where corrections
    // happen whenever they are noticed
    expect(isMonthLocked("draft")).toBe(false);
    expect(isMonthLocked("approved")).toBe(true);
    expect(isMonthLocked("paid")).toBe(true);
    expect(isMonthLocked("void")).toBe(false);
    expect(isMonthLocked(null)).toBe(false);
  });

  it("tones a draft as in-progress, not as done", () => {
    expect(runStatusTone("draft")).toBe("waiting");
    expect(runStatusTone("approved")).toBe("ready");
    expect(runStatusTone(null)).toBe("neutral");
  });
});

describe("inputs", () => {
  it("defaults to the staff programme", () => {
    const r = closeMonthInput.parse({ year: 2026, month: 7 });
    expect(r.program).toBe("staff");
  });

  it("refuses a zero adjustment", () => {
    const bad = addAdjustmentInput.safeParse({
      year: 2026, month: 9, subjectId: "11111111-1111-4111-8111-111111111111",
      amount: 0, reason: "refund",
    });
    expect(bad.success).toBe(false);
  });

  it("carries the origin month so a clawback still points home", () => {
    const r = addAdjustmentInput.parse({
      year: 2026, month: 9, subjectId: "11111111-1111-4111-8111-111111111111",
      amount: -183, reason: "refund", originYear: 2026, originMonth: 7,
    });
    expect(r.originMonth).toBe(7);
    expect(r.amount).toBeLessThan(0);
  });
});

describe("the CSV contract", () => {
  const line = {
    subjectKind: "salesperson" as const,
    subjectId: "11111111-1111-4111-8111-111111111111",
    staffCode: "CR008",
    name: "Mayson",
    storeName: "Carres Kelana Jaya",
    orderCount: 5,
    basis: 30480,
    ratePct: 3,
    direct: 914.4,
    override: 0,
    perModel: 0,
    milestone: 0,
    kpiBonus: 0,
    adjustments: 0,
    total: 914.4,
  };

  it("writes a header plus one row per person", () => {
    const csv = commissionRunCsv({ year: 2026, month: 7, lines: [line] });
    const rows = csv.split("\r\n");
    expect(rows[0]).toBe(
      "staff_code,name,store,month,sales_basis,commission,kpi_bonus,adjustments,total",
    );
    expect(rows[1]).toBe("CR008,Mayson,Carres Kelana Jaya,2026-07,30480.00,914.40,0.00,0.00,914.40");
  });

  it("sums the four commission components into one payable column", () => {
    const csv = commissionRunCsv({
      year: 2026, month: 7,
      lines: [{ ...line, direct: 100, override: 20, perModel: 5, milestone: 50, total: 175 }],
    });
    expect(csv.split("\r\n")[1]).toContain(",175.00,");
  });

  it("quotes a name containing a comma instead of breaking the row", () => {
    const csv = commissionRunCsv({
      year: 2026, month: 7,
      lines: [{ ...line, name: 'Tan, Wei "WM"' }],
    });
    expect(csv.split("\r\n")[1]).toContain('"Tan, Wei ""WM"""');
    expect(csv.split("\r\n")).toHaveLength(2); // still exactly 2 rows
  });

  it("keeps a negative adjustment visible in its own column", () => {
    const csv = commissionRunCsv({
      year: 2026, month: 7,
      lines: [{ ...line, adjustments: -183, total: 731.4 }],
    });
    expect(csv.split("\r\n")[1]).toContain(",-183.00,731.40");
  });
});
