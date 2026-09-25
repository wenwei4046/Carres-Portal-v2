import { describe, it, expect, beforeEach, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import app from "../../index";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
import { userClient } from "../../lib/supabase";

const env = { SUPABASE_URL: "https://t.x", SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s", SUPABASE_JWT_SECRET: "" };

async function makeJwt(role: string) {
  return signTestJwt("11111111-1111-1111-1111-000000000001", { email: `${role}@x`, app_metadata: { role } });
}

beforeEach(() => {
  useTestJwks();
  vi.mocked(userClient).mockReset();
});

const ORDER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const YUJUN = "aac9edf9-63ad-4d0a-ba91-e495a25f9896";

/** The formal handover door (0489) — the route carries the caller's three
 *  facts to the ONE SQL door and nothing else; previous owner, changed by
 *  and changed on are the door's to write. */
describe("/api/finance/collection-owner", () => {
  it("GET answers the order's normal owner · today's cover · history from the one context read", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ order_id: ORDER, normal_user_id: "u1", normal_user_name: "Shasha", is_cover: true, cover_user_id: YUJUN, cover_user_name: "Yu Jun", acting_user_id: YUJUN, acting_user_name: "Yu Jun", history: [] }], error: null });
    vi.mocked(userClient).mockReturnValue({ rpc } as never);
    const res = await app.fetch(new Request(`http://t/api/finance/collection-owner?orderId=${ORDER}`, { headers: { Authorization: `Bearer ${await makeJwt("operation")}` } }), env);
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("payment_collection_owner_context", { p_order_ids: [ORDER], p_on: null });
    const body = await res.json() as { owner: { normal_user_name: string; cover_user_name: string } };
    expect(body.owner.normal_user_name).toBe("Shasha");
    expect(body.owner.cover_user_name).toBe("Yu Jun");
  });

  it("POST /handover forwards new owner · reason · effective from to the SQL door", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: "h1", source: "handover" }, error: null });
    vi.mocked(userClient).mockReturnValue({ rpc } as never);
    const res = await app.fetch(new Request("http://t/api/finance/collection-owner/handover", {
      method: "POST",
      headers: { Authorization: `Bearer ${await makeJwt("principal")}`, "content-type": "application/json" },
      body: JSON.stringify({ order_id: ORDER, new_owner_user_id: YUJUN, reason: "Shasha moves to the showroom", effective_from: "2026-09-15" }),
    }), env);
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("payment_collection_owner_handover", {
      p_order_id: ORDER, p_new_owner_user_id: YUJUN, p_reason: "Shasha moves to the showroom", p_effective_from: "2026-09-15",
    });
  });

  it("a handover without a reason is refused before the door is called", async () => {
    const rpc = vi.fn();
    vi.mocked(userClient).mockReturnValue({ rpc } as never);
    const res = await app.fetch(new Request("http://t/api/finance/collection-owner/handover", {
      method: "POST",
      headers: { Authorization: `Bearer ${await makeJwt("principal")}`, "content-type": "application/json" },
      body: JSON.stringify({ order_id: ORDER, new_owner_user_id: YUJUN, reason: "" }),
    }), env);
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("the SQL gate's refusal reaches the caller as a 403, never a silent success", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "42501", message: "forbidden", details: "duty assignments are set by the manager" } });
    vi.mocked(userClient).mockReturnValue({ rpc } as never);
    const res = await app.fetch(new Request("http://t/api/finance/collection-owner/handover", {
      method: "POST",
      headers: { Authorization: `Bearer ${await makeJwt("operation")}`, "content-type": "application/json" },
      body: JSON.stringify({ order_id: ORDER, new_owner_user_id: YUJUN, reason: "Shasha moves to the showroom" }),
    }), env);
    expect(res.status).toBe(403);
  });

  it("finance may not hand over collection", async () => {
    const res = await app.fetch(new Request("http://t/api/finance/collection-owner/handover", {
      method: "POST",
      headers: { Authorization: `Bearer ${await makeJwt("finance")}`, "content-type": "application/json" },
      body: JSON.stringify({ order_id: ORDER, new_owner_user_id: YUJUN, reason: "x y z" }),
    }), env);
    expect(res.status).toBe(403);
    expect(userClient).not.toHaveBeenCalled();
  });
});
