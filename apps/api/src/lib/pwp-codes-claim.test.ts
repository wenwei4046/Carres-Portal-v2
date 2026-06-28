import { describe, it, expect, vi, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { claimPwpCodesForLines } from "./pwp-codes-claim";
import type { RecomputableLine } from "./sofa-recompute";

const AUTH = { id: "00000000-0000-0000-0000-0000000staff1" };
const GROUP = "11111111-1111-1111-1111-111111111111";

/* ─── rpc mock — stubs the claim + release RPCs ───────────────────────────────
 * `claimResponses` is consumed IN ORDER per claim call (same-cart pwp_claim_code OR
 * cross-order pwp_claim_available_code): a `row` (the claimed pwp_codes row) →
 * success, `null` → not-claimable (NULL: wrong rule / already used / phone mismatch
 * / expired), or an `error` → server_error. Every rpc call is recorded so a test
 * can assert the (mode-split) release rollback fired with the right codes. */
interface MockOpts {
  claimResponses?: Array<{ row?: Record<string, unknown> | null; error?: { message: string } }>;
}

function mockSb(opts: MockOpts = {}): {
  sb: SupabaseClient;
  calls: Array<{ name: string; args: Record<string, unknown> }>;
} {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const claimQueue = [...(opts.claimResponses ?? [])];
  const sb = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "pwp_claim_code" || name === "pwp_claim_available_code") {
        const next = claimQueue.shift() ?? { row: { code: String(args.p_code) } };
        if (next.error) return { data: null, error: next.error };
        return { data: next.row ?? null, error: null };
      }
      if (name === "pwp_release_codes" || name === "pwp_release_available_code") {
        return { data: 0, error: null };
      }
      return { data: null, error: null };
    },
  } as unknown as SupabaseClient;
  return { sb, calls };
}

const line = (over: Partial<RecomputableLine> = {}): RecomputableLine => ({
  sku: "BED-1",
  qty: 1,
  attrs: null,
  unitPrice: 300,
  ...over,
});

/** A reward line carrying a P8c/P8d voucher claim on attrs.pwp. `crossOrder` true
 *  marks an AVAILABLE carry-forward voucher claim (routes to
 *  pwp_claim_available_code). */
const codedLine = (over: {
  sku?: string;
  code: string;
  ruleId?: string;
  claimGroup?: string;
  unitPrice?: number;
  crossOrder?: boolean;
}) =>
  line({
    sku: over.sku ?? "BED-1",
    unitPrice: over.unitPrice ?? 300,
    attrs: {
      pwp: {
        ruleId: over.ruleId ?? "rule-1",
        type: "pwp",
        code: over.code,
        claimGroup: over.claimGroup ?? GROUP,
        ...(over.crossOrder ? { crossOrder: true } : {}),
      },
    },
  });

afterEach(() => vi.restoreAllMocks());

describe("claimPwpCodesForLines", () => {
  it("DORMANT — no line carries attrs.pwp.code → ok with empty ledger + NO DB call", async () => {
    const { sb, calls } = mockSb();
    const lines = [line({ sku: "MATT-1", unitPrice: 1500 }), line({ sku: "BED-1", attrs: { pwp: { ruleId: "r" } } })];
    const r = await claimPwpCodesForLines(sb, AUTH, lines);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.claimed).toEqual([]);
    expect(r.claimGroup).toBeNull();
    expect(r.lines).toBe(lines); // passthrough, same ref
    expect(calls).toHaveLength(0); // no DB read on the dormant path
  });

  it("does NOT change price — the lines pass through untouched (P8b owns price)", async () => {
    const { sb } = mockSb({ claimResponses: [{ row: { code: "PWP-1111AAAA" } }] });
    const lines = [codedLine({ code: "PWP-1111AAAA", unitPrice: 300 })];
    const r = await claimPwpCodesForLines(sb, AUTH, lines);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.lines).toBe(lines); // same reference — Stage B never rewrites lines
    expect(r.lines[0]!.unitPrice).toBe(300); // price as P8b forced it
  });

  it("a valid claim → stamps USED via pwp_claim_code (rule + claimGroup asserted) + returns the ledger", async () => {
    const { sb, calls } = mockSb({ claimResponses: [{ row: { code: "PWP-1111AAAA" } }] });
    const lines = [codedLine({ code: "PWP-1111AAAA", ruleId: "rule-9" })];
    const r = await claimPwpCodesForLines(sb, AUTH, lines);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.claimed).toEqual([{ code: "PWP-1111AAAA", crossOrder: false }]);
    expect(r.claimGroup).toBe(GROUP);
    const claim = calls.find((c) => c.name === "pwp_claim_code");
    expect(claim?.args).toEqual({
      p_code: "PWP-1111AAAA",
      p_rule_id: "rule-9", // bound to the PRICING rule
      p_claim_group: GROUP,
      p_redeemed_sku: "BED-1",
    });
  });

  it("a NULL from pwp_claim_code (not reservable / wrong rule / already used) → 409 + releases partials", async () => {
    // first code claims OK, second returns NULL → the first must be released.
    const { sb, calls } = mockSb({
      claimResponses: [{ row: { code: "PWP-1111AAAA" } }, { row: null }],
    });
    const lines = [
      codedLine({ sku: "BED-1", code: "PWP-1111AAAA" }),
      codedLine({ sku: "BED-2", code: "PWP-2222BBBB" }),
    ];
    const r = await claimPwpCodesForLines(sb, AUTH, lines);
    expect(r.status).toBe("bad_request");
    if (r.status !== "bad_request") return;
    expect(r.code).toBe("pwp_code_rejected");
    // the partial claim was released atomically.
    const release = calls.find((c) => c.name === "pwp_release_codes");
    expect(release?.args).toEqual({ p_codes: ["PWP-1111AAAA"] });
  });

  it("a pwp_claim_code RPC error → server_error + releases partials (fail-closed)", async () => {
    const { sb, calls } = mockSb({
      claimResponses: [{ row: { code: "PWP-1111AAAA" } }, { error: { message: "db down" } }],
    });
    const lines = [
      codedLine({ sku: "BED-1", code: "PWP-1111AAAA" }),
      codedLine({ sku: "BED-2", code: "PWP-2222BBBB" }),
    ];
    const r = await claimPwpCodesForLines(sb, AUTH, lines);
    expect(r.status).toBe("server_error");
    const release = calls.find((c) => c.name === "pwp_release_codes");
    expect(release?.args).toEqual({ p_codes: ["PWP-1111AAAA"] });
  });

  it("a duplicated code across two lines → 409 (double-spend guard) before any claim", async () => {
    const { sb, calls } = mockSb();
    const lines = [
      codedLine({ sku: "BED-1", code: "PWP-SAME0000" }),
      codedLine({ sku: "BED-2", code: "PWP-SAME0000" }),
    ];
    const r = await claimPwpCodesForLines(sb, AUTH, lines);
    expect(r.status).toBe("bad_request");
    if (r.status !== "bad_request") return;
    expect(r.code).toBe("pwp_code_rejected");
    expect(calls.filter((c) => c.name === "pwp_claim_code")).toHaveLength(0);
  });

  it("coded lines disagreeing on claimGroup → 409 (one claimGroup per submit)", async () => {
    const { sb } = mockSb();
    const lines = [
      codedLine({ sku: "BED-1", code: "PWP-1111AAAA", claimGroup: GROUP }),
      codedLine({ sku: "BED-2", code: "PWP-2222BBBB", claimGroup: "22222222-2222-2222-2222-222222222222" }),
    ];
    const r = await claimPwpCodesForLines(sb, AUTH, lines);
    expect(r.status).toBe("bad_request");
    if (r.status !== "bad_request") return;
    expect(r.code).toBe("pwp_code_rejected");
  });

  it("a coded line missing claimGroup → 409", async () => {
    const { sb } = mockSb();
    const lines = [line({ attrs: { pwp: { ruleId: "rule-1", code: "PWP-1111AAAA" } } })];
    const r = await claimPwpCodesForLines(sb, AUTH, lines);
    expect(r.status).toBe("bad_request");
    if (r.status !== "bad_request") return;
    expect(r.code).toBe("pwp_code_rejected");
  });

  it("a coded line missing ruleId → 409", async () => {
    const { sb } = mockSb();
    const lines = [line({ attrs: { pwp: { code: "PWP-1111AAAA", claimGroup: GROUP } } })];
    const r = await claimPwpCodesForLines(sb, AUTH, lines);
    expect(r.status).toBe("bad_request");
    if (r.status !== "bad_request") return;
    expect(r.code).toBe("pwp_code_rejected");
  });

  // ─── P8d (0188 §4.2 / §8.4) cross-order claim ──────────────────────────────
  describe("cross-order claim (attrs.pwp.crossOrder=true)", () => {
    it("a cross-order claim routes to pwp_claim_available_code WITH the customer phone", async () => {
      const { sb, calls } = mockSb({ claimResponses: [{ row: { code: "PWP-9999ZZZZ" } }] });
      const lines = [codedLine({ code: "PWP-9999ZZZZ", ruleId: "rule-9", crossOrder: true })];
      const r = await claimPwpCodesForLines(sb, AUTH, lines, "+60 12-345 6789");
      expect(r.status).toBe("ok");
      if (r.status !== "ok") return;
      // The ledger records the cross-order mode (so rollback restores to AVAILABLE).
      expect(r.claimed).toEqual([{ code: "PWP-9999ZZZZ", crossOrder: true }]);
      // It used the cross-order RPC, NOT the same-cart one, with the raw phone.
      expect(calls.find((c) => c.name === "pwp_claim_code")).toBeUndefined();
      const claim = calls.find((c) => c.name === "pwp_claim_available_code");
      expect(claim?.args).toEqual({
        p_code: "PWP-9999ZZZZ",
        p_rule_id: "rule-9",
        p_claim_group: GROUP,
        p_redeemed_sku: "BED-1",
        p_customer_phone: "+60 12-345 6789",
      });
    });

    it("a cross-order NULL (phone mismatch / expired / used) → 409 + releases via pwp_release_available_code", async () => {
      // first cross claims OK, second NULL → the first must be released to AVAILABLE.
      const { sb, calls } = mockSb({ claimResponses: [{ row: { code: "PWP-AAAA0000" } }, { row: null }] });
      const lines = [
        codedLine({ sku: "BED-1", code: "PWP-AAAA0000", crossOrder: true }),
        codedLine({ sku: "BED-2", code: "PWP-BBBB1111", crossOrder: true }),
      ];
      const r = await claimPwpCodesForLines(sb, AUTH, lines, "0123456789");
      expect(r.status).toBe("bad_request");
      if (r.status !== "bad_request") return;
      expect(r.code).toBe("pwp_code_rejected");
      // the partial cross-order claim is released to AVAILABLE (NOT pwp_release_codes).
      expect(calls.find((c) => c.name === "pwp_release_codes")).toBeUndefined();
      const release = calls.find((c) => c.name === "pwp_release_available_code");
      expect(release?.args).toEqual({ p_codes: ["PWP-AAAA0000"], p_claim_group: GROUP });
    });

    it("a mixed batch (same-cart + cross-order) releases each by its mode on a downstream NULL", async () => {
      // line 1 same-cart claims OK, line 2 cross-order claims OK, line 3 NULL.
      const { sb, calls } = mockSb({
        claimResponses: [{ row: { code: "PWP-OWN00000" } }, { row: { code: "PWP-XORD0000" } }, { row: null }],
      });
      const lines = [
        codedLine({ sku: "BED-1", code: "PWP-OWN00000" }), // same-cart
        codedLine({ sku: "BED-2", code: "PWP-XORD0000", crossOrder: true }), // cross-order
        codedLine({ sku: "BED-3", code: "PWP-FAIL0000", crossOrder: true }), // → NULL
      ];
      const r = await claimPwpCodesForLines(sb, AUTH, lines, "0123456789");
      expect(r.status).toBe("bad_request");
      // same-cart code → pwp_release_codes; cross-order code → pwp_release_available_code.
      const ownRelease = calls.find((c) => c.name === "pwp_release_codes");
      expect(ownRelease?.args).toEqual({ p_codes: ["PWP-OWN00000"] });
      const crossRelease = calls.find((c) => c.name === "pwp_release_available_code");
      expect(crossRelease?.args).toEqual({ p_codes: ["PWP-XORD0000"], p_claim_group: GROUP });
    });
  });
});
