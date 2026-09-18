import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
import { userClient } from "../../lib/supabase";

const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
};
const LAYOUT = { order: ["po_date", "po", "supplier"], hidden: ["grn"], widths: { supplier: 160 }, sort: { key: "po", dir: "asc" } };

const jwt = () =>
  signTestJwt("11111111-1111-1111-1111-000000000001", { email: "op@carres.com", app_metadata: { role: "operation" } });

async function call(path: string, init: RequestInit = {}) {
  return app.fetch(
    new Request(`http://x/api/operation/register-layouts${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${await jwt()}`, "Content-Type": "application/json" },
    }),
    env,
  );
}

beforeEach(() => {
  useTestJwks();
  vi.mocked(userClient).mockReset();
});
afterAll(() => _setJwksForTesting(null));

describe("personal saved column layouts", () => {
  it("reads the caller's layouts for one listing, as the caller (RLS decides whose)", async () => {
    const order = vi.fn(() => Promise.resolve({ data: [{ id: "l1", name: "Chase", layout: LAYOUT, is_default: true }], error: null }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    vi.mocked(userClient).mockReturnValue({ from } as unknown as ReturnType<typeof userClient>);
    const res = await call("?listing=purchase_orders");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ layouts: [{ id: "l1", name: "Chase", layout: LAYOUT, is_default: true }], limit: 10 });
    expect(from).toHaveBeenCalledWith("register_personal_layouts");
    expect(eq).toHaveBeenCalledWith("listing", "purchase_orders");
    // The JWT is the caller's own: no service key, so RLS applies.
    expect(vi.mocked(userClient).mock.calls[0]?.[1]).toBeTruthy();
  });

  it("admits only the Purchase Orders pilot", async () => {
    const res = await call("?listing=sales_orders");
    expect(res.status).toBe(422);
    expect(userClient).not.toHaveBeenCalled();
  });

  it("saves order, widths, visibility and sort through the owner-only door", async () => {
    const rpc = vi.fn(() => Promise.resolve({ data: { id: "l2", name: "Chase" }, error: null }));
    vi.mocked(userClient).mockReturnValue({ rpc } as unknown as ReturnType<typeof userClient>);
    const res = await call("", { method: "POST", body: JSON.stringify({ listing: "purchase_orders", name: "  Chase  ", layout: LAYOUT }) });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("register_layout_save", { p_listing: "purchase_orders", p_name: "Chase", p_layout: LAYOUT });
  });

  it("never saves search, filters or group state — an extra key is refused before SQL", async () => {
    for (const extra of [{ search: "hooka" }, { filters: { supplier: "Hooka" } }, { collapsedGroups: ["completed"] }]) {
      const res = await call("", { method: "POST", body: JSON.stringify({ listing: "purchase_orders", name: "X", layout: { ...LAYOUT, ...extra } }) });
      expect(res.status).toBe(422);
    }
    expect(userClient).not.toHaveBeenCalled();
  });

  it("names the 10-layout limit as a rule, not a server fault", async () => {
    const rpc = vi.fn(() => Promise.resolve({ data: null, error: { code: "23514", message: "register_layout_limit" } }));
    vi.mocked(userClient).mockReturnValue({ rpc } as unknown as ReturnType<typeof userClient>);
    const res = await call("", { method: "POST", body: JSON.stringify({ listing: "purchase_orders", name: "Eleventh", layout: LAYOUT }) });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { code: string }).code).toBe("register_layout_limit");
  });

  it("sets MY default by id; someone else's id reads as not found", async () => {
    const rpc = vi.fn(() => Promise.resolve({ data: null, error: { code: "P0002", message: "register_layout_not_found" } }));
    vi.mocked(userClient).mockReturnValue({ rpc } as unknown as ReturnType<typeof userClient>);
    const id = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const res = await call(`/${id}/default`, { method: "POST" });
    expect(res.status).toBe(404);
    expect(rpc).toHaveBeenCalledWith("register_layout_set_default", { p_id: id });
  });
});
