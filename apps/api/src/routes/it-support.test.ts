import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../test/jwt";
import app from "../index";
import { _setJwksForTesting } from "../middleware/auth";

const USER = "11111111-1111-1111-1111-000000000999";
const baseEnv = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
  STAFF_SESSION_SECRET: "test-staff-secret-0240-abcdef",
};
const hubEnv = { ...baseEnv, IT_HUB_URL: "https://hub.test/", IT_HUB_API_KEY: "hub_carres_secret" };

const jwt = () => signTestJwt(USER, { email: "ops@carres.com", app_metadata: { role: "operation" } });

async function post(env: object, body: unknown) {
  return app.fetch(
    new Request("http://t/api/it-support/tickets", {
      method: "POST",
      headers: { Authorization: `Bearer ${await jwt()}`, "Content-Type": "application/json", "User-Agent": "UA/1" },
      body: JSON.stringify(body),
    }),
    env,
  );
}

beforeEach(() => useTestJwks());
afterEach(() => vi.restoreAllMocks());
afterAll(() => _setJwksForTesting(null));

describe("POST /api/it-support/tickets", () => {
  it("401 without a session", async () => {
    const res = await app.fetch(new Request("http://t/api/it-support/tickets", { method: "POST" }), hubEnv);
    expect(res.status).toBe(401);
  });

  it("501 when the hub address or key is not set", async () => {
    const res = await post(baseEnv, { title: "Printer broken" });
    expect(res.status).toBe(501);
  });

  it("400 without a title", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const res = await post(hubEnv, { title: "  " });
    expect(res.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it("forwards with the key and the SESSION's id, never a body-supplied one", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ code: "CARRES-0001", status: "open" }), { status: 201 }));
    const res = await post(hubEnv, {
      title: "Cannot issue invoice",
      description: "Button greyed out",
      priority: "high",
      page_url: "https://erp.carresofficial.com/operation/orders",
      app_version: "abc12345",
      reporter_id: "someone-else",
    });
    expect(res.status).toBe(201);
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://hub.test/api/v1/sys/tickets");
    const h = new Headers(init.headers);
    expect(h.get("Authorization")).toBe("Bearer hub_carres_secret");
    expect(h.get("X-Reporter-Id")).toBe(USER);
    const form = init.body as FormData;
    expect(form.get("title")).toBe("Cannot issue invoice");
    expect(form.get("app_version")).toBe("abc12345");
    expect(form.get("reporter_email")).toBe("ops@carres.com");
    expect(form.get("reporter_department")).toBe("operation");
    expect(form.get("reporter_id")).toBeNull();
    // the key must not leak back to the browser
    expect(await res.text()).not.toContain("hub_carres_secret");
  });

  it("502 when the hub is down, and when it rejects our key (never 401)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("boom"));
    expect((await post(hubEnv, { title: "x" })).status).toBe(502);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response('{"error":"Invalid API key"}', { status: 401 }));
    expect((await post(hubEnv, { title: "x" })).status).toBe(502);
  });

  it("400 for a page address that is not http(s), and the hub is not called", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    for (const page_url of ["javascript:alert(1)", "not a url"]) {
      expect((await post(hubEnv, { title: "x", page_url })).status).toBe(400);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("201 when the hub took the request but its reply is unreadable (no duplicate re-send)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html>ok</html>", { status: 201 }));
    const res = await post(hubEnv, { title: "x", page_url: "http://localhost:5173/operation" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({});
  });
});
