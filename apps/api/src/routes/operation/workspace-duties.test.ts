import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn(), adminClient: vi.fn() }));
import { adminClient, userClient } from "../../lib/supabase";

const env = {
  SUPABASE_URL: "https://t.x",
  SUPABASE_ANON_KEY: "a",
  SUPABASE_SERVICE_ROLE_KEY: "s",
  SUPABASE_JWT_SECRET: "",
};
const KID = "workspace-duty";
let signKey: KeyLike;
let publicJwk: JWK;

const SHASHA = "11111111-1111-4111-8111-111111111111";
const YU_JUN = "22222222-2222-4222-8222-222222222222";
const ASSIGNMENT = "33333333-3333-4333-8333-333333333333";

async function makeJwt(role: string, sub = SHASHA) {
  return new SignJWT({ email: `${role}@carres.com`, app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

function req(path: string, method: string, jwt: string, body?: unknown) {
  return app.fetch(
    new Request(`http://t${path}`, {
      method,
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env,
  );
}

function query(data: unknown) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const method of ["select", "eq", "in", "order", "lte", "gte"]) {
    builder[method] = vi.fn(chain);
  }
  builder.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data, error: null }).then(resolve);
  return builder;
}

beforeAll(async () => {
  const pair = await generateKeyPair("ES256", { extractable: true });
  signKey = pair.privateKey;
  publicJwk = await exportJWK(pair.publicKey);
  publicJwk.kid = KID;
  publicJwk.alg = "ES256";
  publicJwk.use = "sig";
});

beforeEach(() => {
  _setJwksForTesting(createLocalJWKSet({ keys: [publicJwk] }));
  vi.mocked(userClient).mockReset();
  vi.mocked(adminClient).mockReset();
});

afterAll(() => _setJwksForTesting(null));

describe("Workspace Staff & Duties API", () => {
  it("returns Duty, Primary, Buddy and covered resolution without email identity", async () => {
    vi.mocked(adminClient).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "workspace_owner_duties") {
          return query([{ duty_key: "purchasing.po", name: "PO Duty", description: "Issue POs" }]);
        }
        if (table === "workspace_duty_assignments") {
          return query([{ id: ASSIGNMENT, duty_key: "purchasing.po", primary_user_id: SHASHA, buddy_user_id: YU_JUN, starts_on: "2026-09-01", ends_on: null }]);
        }
        return query([
          { id: SHASHA, name: "Shasha", status: "active" },
          { id: YU_JUN, name: "Yu Jun", status: "active" },
        ]);
      }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    vi.mocked(userClient).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: {
          duty_key: "purchasing.po", on_date: "2026-09-04",
          normal_user_id: SHASHA, buddy_user_id: YU_JUN,
          active_cover_user_id: YU_JUN, acting_user_id: YU_JUN,
          state: "covered", assignment_id: ASSIGNMENT,
        },
        error: null,
      }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const response = await req(
      "/api/operation/workspace/duties?on=2026-09-04",
      "GET",
      await makeJwt("operation"),
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { duties: Array<Record<string, unknown>>; staff: unknown[] };
    expect(body.duties[0]).toMatchObject({
      key: "purchasing.po",
      resolution: {
        state: "covered",
        normalOwner: { name: "Shasha" },
        activeCover: { name: "Yu Jun" },
      },
    });
    expect(JSON.stringify(body)).not.toContain("@carres.com");
  });

  it("refuses external accounts", async () => {
    const response = await req(
      "/api/operation/workspace/duties?on=2026-09-04",
      "GET",
      await makeJwt("dealer"),
    );
    expect(response.status).toBe(403);
  });

  it("lets a principal set Primary/Buddy through the audited RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: ASSIGNMENT, error: null });
    vi.mocked(userClient).mockReturnValue({ rpc } as never);
    const response = await req(
      "/api/operation/workspace/duties/purchasing.po/assignment",
      "POST",
      await makeJwt("principal"),
      { primaryUserId: SHASHA, buddyUserId: YU_JUN, startsOn: "2026-09-04", endsOn: null },
    );
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("workspace_set_duty_assignment", {
      p_duty_key: "purchasing.po",
      p_primary_user_id: SHASHA,
      p_buddy_user_id: YU_JUN,
      p_starts_on: "2026-09-04",
      p_ends_on: null,
    });
  });

  it("refuses an ordinary user assignment write", async () => {
    const response = await req(
      "/api/operation/workspace/duties/purchasing.po/assignment",
      "POST",
      await makeJwt("operation"),
      { primaryUserId: SHASHA, startsOn: "2026-09-04" },
    );
    expect(response.status).toBe(403);
  });

  it("lets HR record People-owned unavailability", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: ASSIGNMENT, error: null });
    vi.mocked(userClient).mockReturnValue({ rpc } as never);
    const response = await req(
      `/api/hr/team/${SHASHA}/unavailability`,
      "POST",
      await makeJwt("hr"),
      { startsOn: "2026-09-04", endsOn: "2026-09-05", reason: "Leave" },
    );
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("hr_set_staff_unavailability", {
      p_user_id: SHASHA,
      p_starts_on: "2026-09-04",
      p_ends_on: "2026-09-05",
      p_reason: "Leave",
    });
  });
});
