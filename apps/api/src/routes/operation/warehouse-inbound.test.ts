import { Hono } from "hono";
import { describe, it, expect, vi } from "vitest";
import type { AppEnv } from "../../types";
import warehouse from "./warehouse";
vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
import { userClient } from "../../lib/supabase";
function app(role = "operation") {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => {
    c.set("auth", { role, jwt: "test" } as never);
    await next();
  });
  a.route("/", warehouse);
  return a;
}
function db(fail = false) {
  vi.mocked(userClient).mockReturnValue({
    from: () => {
      const q: any = {
        select: () => q,
        order: () => q,
        range: async () => ({
          data: [],
          error: fail ? { code: "42501", message: "permission denied" } : null,
        }),
      };
      return q;
    },
  } as never);
}
describe("GET warehouse/inbound", () => {
  it("opens an empty real read projection with governed sites", async () => {
    db();
    const r = await app().request("/inbound");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      arrivals: [],
      sites: [],
      unresolvedSources: [],
    });
  });
  it("reports a failed authority read instead of an empty success", async () => {
    db(true);
    expect((await app().request("/inbound")).status).toBe(403);
  });
  it("rejects non-operation access and exposes no receipt writer", async () => {
    db();
    expect((await app("dealer").request("/inbound")).status).toBe(403);
    expect((await app().request("/inbound", { method: "POST" })).status).toBe(
      404,
    );
  });
});
