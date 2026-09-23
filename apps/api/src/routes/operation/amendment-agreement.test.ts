/**
 * ⭐ CUSTOMER AGREEMENT EVIDENCE AT THE DOOR — owner ruling 2026-09-22,
 * APPROVED / LOCKED (`docs/orders/MASTER.md` § "Customer agreement evidence";
 * enforced in the database by migration `0564`).
 *
 *   "A signed document or a reference to the relevant customer confirmation
 *    (for example, WhatsApp) is acceptable... A manager's statement or checkbox
 *    saying the customer agreed is not sufficient by itself and cannot
 *    substitute for the evidence."
 *
 * The RPC enforces the gate — approve is refused without a covering basis, and
 * `0564`'s own replay evidence proves that. What only THIS layer can assert is
 * what the door will and will not forward:
 *
 *   · a kind outside the three governed ones never reaches the database,
 *   · a kind with no reference never reaches it either — which is the "manager
 *     ticked a box" case, refused before anything is written,
 *   · recording the basis is SALES's door, not the approver's: "Sales records
 *     the confirmation basis; the authorised approver checks that it covers the
 *     proposed change",
 *   · and the door calls the recording function and nothing else. A payload
 *     spread that also reached `sales_order_decide_amendment` would turn
 *     recording the evidence into approving the change.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
import { userClient } from "../../lib/supabase";

const env = {
  SUPABASE_URL: "https://t.x",
  SUPABASE_ANON_KEY: "a",
  SUPABASE_SERVICE_ROLE_KEY: "s",
  SUPABASE_JWT_SECRET: "",
};

type RpcCall = { name: string; args: Record<string, unknown> };

function makeSb(result: { data: unknown; error: unknown }, calls: RpcCall[]) {
  return {
    from: vi.fn(() => {
      throw new Error("the agreement door must not touch a table directly");
    }),
    rpc: vi.fn((name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return Promise.resolve(result);
    }),
  };
}

beforeEach(() => {
  useTestJwks();
  vi.mocked(userClient).mockReset();
});
afterAll(() => _setJwksForTesting(null));

const AMENDMENT_ID = "00000000-0000-0000-0000-0000000000a1";
const BASE = "http://t/api/operation/orders";

async function record(
  role: string,
  body: unknown,
  rpcResult: { data: unknown; error: unknown } = { data: { id: AMENDMENT_ID }, error: null },
) {
  const calls: RpcCall[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(userClient).mockReturnValue(makeSb(rpcResult, calls) as any);
  const jwt = await signTestJwt("u1", { email: `${role}@x`, app_metadata: { role } });
  const res = await app.fetch(
    new Request(`${BASE}/amendment/${AMENDMENT_ID}/agreement`, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
  );
  return { res, calls };
}

const WHATSAPP = {
  kind: "customer_confirmation",
  reference: "WhatsApp 2026-09-22 19:40 +60100000000",
  detail: "Customer agreed to the third piece",
};

describe("recording how the customer agreed", () => {
  it("forwards the three governed kinds, and calls only the recording function", async () => {
    for (const kind of ["signed_document", "customer_confirmation", "original_agreement"]) {
      const { res, calls } = await record("operation", { ...WHATSAPP, kind });
      expect(res.status).toBe(201);
      expect(calls.map((c) => c.name)).toEqual(["sales_order_record_amendment_agreement"]);
      expect(calls[0].args).toMatchObject({
        p_amendment_id: AMENDMENT_ID,
        p_kind: kind,
        p_reference: WHATSAPP.reference,
      });
      /* Recording the evidence is not deciding the amendment. */
      expect(calls.map((c) => c.name)).not.toContain("sales_order_decide_amendment");
    }
  });

  /* ⭐ THE RULING'S OWN NEGATIVE CASE. There is no kind that means "the manager
     says so", and a kind with no reference IS that case — so it dies here,
     before the database is asked. */
  it("refuses a bare assertion — a kind with no reference", async () => {
    const { res, calls } = await record("operation", {
      kind: "customer_confirmation",
      reference: "   ",
    });
    expect(res.status).toBe(422);
    expect(calls).toHaveLength(0);
  });

  it("refuses a kind nobody governed", async () => {
    const { res, calls } = await record("operation", {
      kind: "manager_confirms",
      reference: "I asked him myself",
    });
    expect(res.status).toBe(422);
    expect(calls).toHaveLength(0);
  });

  it("refuses an empty body", async () => {
    const { res, calls } = await record("operation", {});
    expect(res.status).toBe(422);
    expect(calls).toHaveLength(0);
  });

  /* Sales records the basis; the approver checks it. The principal keeps the
     door because the principal is every internal role's superset, not because
     approving grants it. */
  it("is Sales's door — a dealer never reaches it", async () => {
    const { res, calls } = await record("dealer", WHATSAPP);
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it("admits operation and principal", async () => {
    for (const role of ["operation", "principal"]) {
      const { res } = await record(role, WHATSAPP);
      expect(res.status).toBe(201);
    }
  });

  /* The database owns the business refusals (already decided, a Staff
     correction naming a revision that does not exist, a basis that no longer
     covers the terms). The door must pass them through as refusals, not as a
     500 that hides which rule fired. */
  it("passes a database refusal through with its sentence", async () => {
    const { res } = await record("operation", WHATSAPP, {
      data: null,
      error: {
        code: "22023",
        message: "Amendment is already rejected",
        details: "already_decided",
      },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});
