import { describe, it, expect } from "vitest";
import app from "./index";

/**
 * POS/ERP domain split (2026-07-18) — the CORS allowlist replaced origin "*".
 * Preflights run before auth, so no env/JWT setup is needed.
 */
const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
  STAFF_SESSION_SECRET: "test-staff-secret",
};

function preflight(origin: string) {
  return app.fetch(
    new Request("http://t/api/catalog", {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization,x-staff-token",
      },
    }),
    env,
  );
}

describe("CORS allowlist", () => {
  it.each([
    "https://pos.carresofficial.com",
    "https://erp.carresofficial.com",
    "https://carres-portal.pages.dev",
    "https://carres-pos.pages.dev",
    "https://40724910.carres-portal.pages.dev",
    "https://abc123.carres-pos.pages.dev",
    "http://localhost:5173",
    "http://127.0.0.1:8788",
  ])("allows %s and echoes it back", async (origin) => {
    const res = await preflight(origin);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(origin);
  });

  it.each([
    "https://evil.com",
    "https://carresofficial.com",
    "https://xpos.carresofficial.com",
    "https://carres-portal.pages.dev.evil.com",
    "https://notcarres-portal.pages.dev.attacker.io",
  ])("blocks %s (no Access-Control-Allow-Origin)", async (origin) => {
    const res = await preflight(origin);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("preflight allows the X-Staff-Token header (0233 staff sessions)", async () => {
    const res = await preflight("https://pos.carresofficial.com");
    expect(res.headers.get("Access-Control-Allow-Headers") ?? "").toMatch(/x-staff-token/i);
  });
});
