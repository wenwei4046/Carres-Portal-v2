import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn(), adminClient: vi.fn() }));
import { userClient } from "../../lib/supabase";

const env = {
  SUPABASE_URL: "https://t.x",
  SUPABASE_ANON_KEY: "a",
  SUPABASE_SERVICE_ROLE_KEY: "s",
  SUPABASE_JWT_SECRET: "",
};
const KID = "k1";
let signKey: KeyLike;
let publicJwk: JWK;
const HOLDER = "00000000-0000-0000-0000-0000000000aa";
const COVER = "00000000-0000-0000-0000-0000000000bb";

async function makeJwt(role: string, sub = HOLDER) {
  return new SignJWT({ email: `${role}@x`, app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject(sub).setIssuedAt().setExpirationTime("5m").sign(signKey);
}

function req(method: string, jwt: string | null, body?: unknown) {
  return app.fetch(new Request("http://t/api/operation/po-duty", {
    method,
    headers: {
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), env);
}

function makeSb(options: {
  resolutions?: Record<string, string | null>;
  rpcError?: { code: string; message: string } | null;
} = {}) {
  const tableCalls: string[] = [];
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "workspace_assign_duty") {
      return { data: "assignment-id", error: options.rpcError ?? null };
    }
    const key = String(args.p_duty_key);
    return {
      data: { actor_user_id: options.resolutions?.[key] ?? null },
      error: options.rpcError ?? null,
    };
  });
  return {
    rpc,
    tableCalls,
    from(table: string) {
      tableCalls.push(table);
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "in"]) builder[method] = vi.fn(() => builder);
      builder.then = (resolve: (value: unknown) => unknown) => resolve({
        data: [
          { id: HOLDER, email: "yu@carres.co", name: "Yu Jun" },
          { id: COVER, email: "sha@carres.co", name: "Shasha" },
        ],
        error: null,
      });
      return builder;
    },
  };
}

beforeAll(async () => {
  const keys = await generateKeyPair("ES256", { extractable: true });
  signKey = keys.privateKey;
  publicJwk = await exportJWK(keys.publicKey);
  Object.assign(publicJwk, { kid: KID, alg: "ES256", use: "sig" });
});
beforeEach(() => {
  _setJwksForTesting(createLocalJWKSet({ keys: [publicJwk] }));
  vi.mocked(userClient).mockReset();
});
afterAll(() => _setJwksForTesting(null));

describe("legacy PO Duty adapter", () => {
  it("requires authentication and an operations role", async () => {
    expect((await req("GET", null)).status).toBe(401);
    expect((await req("GET", await makeJwt("dealer"))).status).toBe(403);
  });

  it("reads PO and GRN only through the shared resolver and returns active cover", async () => {
    const sb = makeSb({ resolutions: { po_duty: COVER, grn_duty: HOLDER } });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const response = await req("GET", await makeJwt("operation"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      holder: { userId: COVER, name: "Shasha" },
      grnHolder: { userId: HOLDER, name: "Yu Jun" },
    });
    expect(sb.rpc).toHaveBeenCalledWith("workspace_resolve_duty", expect.objectContaining({
      p_duty_key: "po_duty",
    }));
    expect(sb.rpc).toHaveBeenCalledWith("workspace_resolve_duty", expect.objectContaining({
      p_duty_key: "grn_duty",
    }));
    expect(sb.tableCalls).not.toContain("ops_po_duty");
    expect(sb.tableCalls).not.toContain("ops_po_duty_cover");
  });

  it("fails soft when the shared Duty layer is unavailable", async () => {
    const sb = makeSb({ rpcError: { code: "42P01", message: "missing" } });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const response = await req("GET", await makeJwt("operation"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ holder: null, grnHolder: null });
  });

  it("allows only Principal to write and delegates the write to the shared setter", async () => {
    expect((await req("PUT", await makeJwt("operation"), { userId: HOLDER })).status).toBe(403);
    const sb = makeSb();
    vi.mocked(userClient).mockReturnValue(sb as never);
    const response = await req("PUT", await makeJwt("principal"), {
      userId: HOLDER,
      month: "2026-10",
    });
    expect(response.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("workspace_assign_duty", {
      p_duty_key: "po_duty",
      p_holder_id: HOLDER,
      p_effective_from: "2026-10-01",
      p_effective_until: "2026-10-31",
      p_note: "Legacy PO Duty adapter",
    });
    expect(sb.tableCalls).not.toContain("ops_po_duty");
  });
});
