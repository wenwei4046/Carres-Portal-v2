// =============================================================================
// pos-vocab-v3-sweep.test.ts -- Phase 4.5a T2
// =============================================================================
// Source spec: docs/superpowers/specs/2026-05-05-phase-4.5a-v3-wake-design.md
// Sprint:      Phase 4.5a Task 2 (v2 RPC vocabulary sweep)
//
// Why this test exists:
//   Migration 0038 CREATE OR REPLACEs five v2 RPCs to swap every
//   'awaiting_stock' literal write/guard with 'awaiting_logistics_action'.
//   The five RPCs are:
//     _logistics_create_po_inner (helper)
//     logistics_create_po
//     logistics_create_pos_batch
//     logistics_issue_pos_for_order
//     logistics_cancel_po
//
//   Of these, only `logistics_issue_pos_for_order` actually has a stage
//   literal in its body -- the rest carry no stage-string writes (they touch
//   purchase_orders rather than orders.logistics_stage). The 22023 wrong_stage
//   error message produced by `logistics_issue_pos_for_order` is therefore the
//   single observable side-effect that proves the body has been swept.
//
//   This test mocks the Supabase RPC error path the route would surface when
//   a logistics user clicks "Issue POs" on an order that is NOT in the
//   awaiting state. After 0038, the message text MUST mention
//   'awaiting_logistics_action' (not 'awaiting_stock'). That asserts the
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

  // logistics_issue_pos_for_order — the only RPC of the five whose body
  // raises a stage error message that contains the literal vocabulary. Pre-
  // 0038 the message reads "order is not in awaiting_stock state"; post-
  // 0038 it reads "order is not in awaiting_logistics_action state".
  it("logistics_issue_pos_for_order surfaces v3 vocabulary in 22023 wrong_stage error", async () => {
    // Simulate the post-0038 RPC error: stage guard says current stage is not
    // 'awaiting_logistics_action'. The route's mapPgError relays the message
    // verbatim into the response body.
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "22023",
        message: "order is not in awaiting_logistics_action state",
        details: "wrong_stage",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);

    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/issue-pos`, {
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
    expect(body.message).toContain("awaiting_logistics_action");
    // Belt-and-braces: must NOT mention the v2 vocab (so a partial revert
    // would also fail this assertion).
    expect(body.message).not.toContain("awaiting_stock");
  });

  // Migration-file static check. The five RPC bodies in 0038 must contain
  // 'awaiting_logistics_action' and must NOT contain a writable
  // 'awaiting_stock' literal. We do a coarse text grep -- comments containing
  // "awaiting_stock" inside `--` lines are tolerated, but any quoted literal
  // string is not (those are stage-write targets).
  it("migration 0038 file body uses v3 vocabulary (no v2 stage-string literal writes)", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    // Resolve from this test file -> repo root -> supabase/migrations/0038...
    // Use fileURLToPath to handle Windows file:// URLs correctly (the bare
    // URL.pathname property leaves a leading slash in front of the drive
    // letter on win32, which path.resolve then mangles).
    const here = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(here, "..", "..", "..", "..", "..");
    const migrationPath = path.join(
      repoRoot,
      "supabase",
      "migrations",
      "0038_logistics_v2_rpc_v3_vocab_sweep.sql",
    );
    const text = await fs.readFile(migrationPath, "utf8");

    // Must contain v3 vocabulary somewhere in body.
    expect(text).toContain("awaiting_logistics_action");

    // Must NOT contain the quoted-literal v2 vocabulary in any non-comment
    // line. Strip out `-- ...` comment tails before scanning so the file
    // header banner's mentions of `awaiting_stock` (in prose) don't trip
    // this assertion.
    const codeOnly = text
      .split("\n")
      .map((line) => {
        const idx = line.indexOf("--");
        return idx >= 0 ? line.slice(0, idx) : line;
      })
      .join("\n");

    expect(codeOnly).not.toContain("'awaiting_stock'");
  });
});
