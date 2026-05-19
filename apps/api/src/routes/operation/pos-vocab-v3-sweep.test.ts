// =============================================================================
// pos-vocab-v3-sweep.test.ts -- Phase 4.5a T2
// =============================================================================
// Source spec: docs/superpowers/specs/2026-05-05-phase-4.5a-v3-wake-design.md
// Sprint:      Phase 4.5a Task 2 (v2 RPC vocabulary sweep)
//
// Why this test exists:
//   Migration 0038 CREATE OR REPLACEs five v2 RPCs to swap every
//   'awaiting_stock' literal write/guard with 'awaiting_operation_action'.
//   The five RPCs are:
//     _operation_create_po_inner (helper)
//     operation_create_po
//     operation_create_pos_batch
//     operation_issue_pos_for_order
//     operation_cancel_po
//
//   Of these, only `operation_issue_pos_for_order` actually has a stage
//   literal in its body -- the rest carry no stage-string writes (they touch
//   purchase_orders rather than orders.operation_stage). The 22023 wrong_stage
//   error message produced by `operation_issue_pos_for_order` is therefore the
//   single observable side-effect that proves the body has been swept.
//
//   This test mocks the Supabase RPC error path the route would surface when
//   a operation user clicks "Issue POs" on an order that is NOT in the
//   awaiting state. After 0038, the message text MUST mention
//   'awaiting_operation_action' (not 'awaiting_stock'). That asserts the
//   v3-vocabulary swap landed in the RPC body.
//
//   The other four RPCs are exercised structurally via existing tests
//   (pos.test.ts smoke + the 40001 concurrent_claim test from 0037) — those
//   keep passing post-0038 because the OR REPLACE preserves signatures and
//   thread-claim wiring verbatim.
// =============================================================================

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
  type KeyLike,
} from "jose";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({
  userClient: vi.fn(),
}));

import { userClient } from "../../lib/supabase";

const SUPABASE_URL = "https://test.supabase.co";
const KID = "test-kid-1";

const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
};

let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string) {
  return new SignJWT({
    email: `${role}@carres.com`,
    app_metadata: { role },
  })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000999")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

beforeAll(async () => {
  const kp = await generateKeyPair("ES256", { extractable: true });
  signKey = kp.privateKey;
  publicJwk = await exportJWK(kp.publicKey);
  publicJwk.kid = KID;
  publicJwk.alg = "ES256";
  publicJwk.use = "sig";
});

beforeEach(() => {
  _setJwksForTesting(createLocalJWKSet({ keys: [publicJwk] }));
  vi.mocked(userClient).mockReset();
});

afterAll(() => _setJwksForTesting(null));

describe("Phase 4.5a T2 — v2 RPC v3-vocabulary sweep (migration 0038)", () => {
  const ORDER_ID = "00000000-0000-0000-0000-000000000a01";

  // operation_issue_pos_for_order — the only RPC of the five whose body
  // raises a stage error message that contains the literal vocabulary. Pre-
  // 0038 the message reads "order is not in awaiting_stock state"; post-
  // 0038 it reads "order is not in awaiting_operation_action state".
  it("operation_issue_pos_for_order surfaces v3 vocabulary in 22023 wrong_stage error", async () => {
    // Simulate the post-0038 RPC error: stage guard says current stage is not
    // 'awaiting_operation_action'. The route's mapPgError relays the message
    // verbatim into the response body.
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "22023",
        message: "order is not in awaiting_operation_action state",
        details: "wrong_stage",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);

    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/issue-pos`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      }),
      env,
    );

    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    // mapPgError surfaces 22023 as code='invalid_param' (doesn't passthrough
    // detail like mapPipelineV2Error). The vocabulary proof lives in the
    // RPC-emitted `message` text, which the route relays verbatim.
    expect(body.code).toBe("invalid_param");
    // The proof of the sweep: the message body must mention v3 vocabulary.
    expect(body.message).toContain("awaiting_operation_action");
    // Belt-and-braces: must NOT mention the v2 vocab (so a partial revert
    // would also fail this assertion).
    expect(body.message).not.toContain("awaiting_stock");
  });

  // Migration-file static check. The RPC bodies in 0038 + 0038b must contain
  // 'awaiting_operation_action' and must NOT contain a writable
  // 'awaiting_stock' enum literal. We do a coarse text grep -- comments
  // containing "awaiting_stock" inside `--` lines are tolerated, but any
  // quoted literal in code position is not (those are stage-write targets).
  //
  // 0038b ADDITIONAL TOLERANCE: the body of operation_dashboard_summary
  // intentionally retained the JSON KEY 'awaiting_stock' inside a
  // jsonb_build_object call -- that was a payload key the FE consumers
  // depended on, scheduled for rename in T5 alongside the matching FE update.
  // Migration 0039b (Phase 4.5a T5) re-emits operation_dashboard_summary with
  // the JSON key renamed to 'awaiting_operation_action'. CLAUDE.md §14 #6
  // forbids editing committed migration history (so 0038b still contains the
  // old key); the allowlist stays in place so the static-grep assertion
  // against the immutable 0038b file body still passes after T5.
  function readMigration(filename: string): Promise<string> {
    return (async () => {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const { fileURLToPath } = await import("node:url");
      // Resolve from this test file -> repo root -> supabase/migrations/...
      // Use fileURLToPath to handle Windows file:// URLs correctly (the bare
      // URL.pathname property leaves a leading slash in front of the drive
      // letter on win32, which path.resolve then mangles).
      const here = path.dirname(fileURLToPath(import.meta.url));
      const repoRoot = path.resolve(here, "..", "..", "..", "..", "..");
      const migrationPath = path.join(
        repoRoot,
        "supabase",
        "migrations",
        filename,
      );
      return fs.readFile(migrationPath, "utf8");
    })();
  }

  function stripCommentsAndAllowlistedJsonKey(text: string): string {
    return text
      .split("\n")
      .map((line) => {
        // Strip `-- ...` comment tails so the file's prose mentions of
        // 'awaiting_stock' don't trip the assertion.
        const commentIdx = line.indexOf("--");
        const codeLine = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
        // Allowlist: jsonb_build_object KEY position. Match `<ws>'awaiting_stock',`
        // exactly. T5 will rename DB+FE in lockstep; until then the JSON key
        // must remain to keep FE consumers working.
        if (/^\s*'awaiting_stock',\s*$/.test(codeLine)) return "";
        return codeLine;
      })
      .join("\n");
  }

  it("migration 0038 file body uses v3 vocabulary (no v2 stage-string literal writes)", async () => {
    const text = await readMigration("0038_logistics_v2_rpc_v3_vocab_sweep.sql");

    // Must contain v3 vocabulary somewhere in body.
    // Historical migration files are frozen (§14 #6); they still contain the
    // pre-rename `awaiting_logistics_action` literal even after migration 0121
    // renamed the live enum value to `awaiting_operation_action`.
    expect(text).toContain("awaiting_logistics_action");

    // Must NOT contain the quoted-literal v2 vocabulary in any non-comment
    // line. (0038 has no JSON-key occurrence, so the allowlist is moot here
    // but kept for symmetry with the 0038b assertion.)
    const codeOnly = stripCommentsAndAllowlistedJsonKey(text);
    expect(codeOnly).not.toContain("'awaiting_stock'");
  });

  it("migration 0038b file body uses v3 vocabulary (no v2 stage-string enum literals; JSON key allowlisted)", async () => {
    const text = await readMigration("0038b_logistics_v2_residual_rpc_sweep.sql");

    // Must contain v3 vocabulary somewhere in body.
    // Historical migration files are frozen (§14 #6); they still contain the
    // pre-rename `awaiting_logistics_action` literal even after migration 0121
    // renamed the live enum value to `awaiting_operation_action`.
    expect(text).toContain("awaiting_logistics_action");

    // Must NOT contain the quoted-literal v2 enum vocabulary in any non-
    // comment, non-JSON-key line. The single legitimate occurrence (the
    // jsonb_build_object KEY in operation_dashboard_summary) is allowlisted
    // by stripCommentsAndAllowlistedJsonKey so it does not trip this scan.
    const codeOnly = stripCommentsAndAllowlistedJsonKey(text);
    expect(codeOnly).not.toContain("'awaiting_stock'");
  });

  // Phase 4.5a T5: 0039b re-emits operation_dashboard_summary with the JSON
  // KEY renamed to 'awaiting_operation_action' (lockstep with the FE rename).
  // The full file body — even WITHOUT the JSON-key allowlist — must contain
  // ZERO quoted-literal 'awaiting_stock' occurrences in non-comment lines.
  it("migration 0039b file body uses v3 vocabulary throughout (JSON key renamed; no allowlist needed)", async () => {
    const text = await readMigration(
      "0039b_logistics_dashboard_summary_v3_key_rename.sql",
    );

    // Must contain v3 vocabulary somewhere in body (both as enum literal and
    // as the renamed JSON key).
    // Historical migration files are frozen (§14 #6); they still contain the
    // pre-rename `awaiting_logistics_action` literal even after migration 0121
    // renamed the live enum value to `awaiting_operation_action`.
    expect(text).toContain("awaiting_logistics_action");

    // T5 scope: the JSON key has been renamed in lockstep with the FE. Strip
    // comments only (NOT the allowlist) and assert ZERO surviving
    // 'awaiting_stock' literals.
    const stripCommentsOnly = (raw: string): string =>
      raw
        .split("\n")
        .map((line) => {
          const idx = line.indexOf("--");
          return idx >= 0 ? line.slice(0, idx) : line;
        })
        .join("\n");
    const codeOnly = stripCommentsOnly(text);
    expect(codeOnly).not.toContain("'awaiting_stock'");
  });
});
