/**
 * The dev server may not point at production — held as a test.
 *
 * The measurement that produced this file: 18 of 19 worktrees on one machine
 * had `.env.local` pointing `vite dev` at the production Worker. `.env.local`
 * is gitignored, so no test can assert what any machine has set — what CAN be
 * asserted is that the code REFUSES the combination.
 */
import { describe, expect, it } from "vitest";
import { ApiBaseMisconfigured, isLocalApiBase, resolveApiBase } from "./api-base";

const DEV = { DEV: true, MODE: "development" };
const PROD_WORKER = "https://carres-portal-v2-api.wwch.workers.dev";

describe("a dev build refuses a remote API base", () => {
  it("throws on the production Worker, naming the file to fix", () => {
    expect(() => resolveApiBase({ ...DEV, VITE_API_BASE_URL: PROD_WORKER })).toThrow(
      ApiBaseMisconfigured,
    );
    /* The message has to be actionable — "misconfigured" would send the reader
     * hunting through a gitignored file they may not know exists. */
    try {
      resolveApiBase({ ...DEV, VITE_API_BASE_URL: PROD_WORKER });
    } catch (e) {
      const m = (e as Error).message;
      expect(m).toMatch(/LIVE business/);
      expect(m).toMatch(/apps\/web\/\.env\.local/);
      expect(m).toMatch(/VITE_ALLOW_REMOTE_API=1/);
    }
  });

  it("throws on ANY host that is not this machine, not just that one URL", () => {
    for (const base of [
      "https://api.carres.com.my",
      "https://staging.example.com",
      "http://192.168.1.20:8888",
    ]) {
      expect(() => resolveApiBase({ ...DEV, VITE_API_BASE_URL: base })).toThrow(
        ApiBaseMisconfigured,
      );
    }
  });

  it("throws when it is unset — an empty base 404s against the Vite server", () => {
    expect(() => resolveApiBase({ ...DEV })).toThrow(ApiBaseMisconfigured);
    expect(() => resolveApiBase({ ...DEV, VITE_API_BASE_URL: "   " })).toThrow(
      ApiBaseMisconfigured,
    );
  });
});

describe("what it must NOT break", () => {
  it("allows every local spelling", () => {
    for (const base of [
      "http://127.0.0.1:8888",
      "http://localhost:8888",
      "http://127.0.0.1:8891",
      "http://localhost:5173",
    ]) {
      expect(resolveApiBase({ ...DEV, VITE_API_BASE_URL: base })).toBe(base);
      expect(isLocalApiBase(base)).toBe(true);
    }
  });

  it("leaves PRODUCTION builds alone — that is where remote is correct", () => {
    expect(
      resolveApiBase({ DEV: false, MODE: "production", VITE_API_BASE_URL: PROD_WORKER }),
    ).toBe(PROD_WORKER);
  });

  it("lets a deliberate opt-in through", () => {
    expect(
      resolveApiBase({ ...DEV, VITE_API_BASE_URL: PROD_WORKER, VITE_ALLOW_REMOTE_API: "1" }),
    ).toBe(PROD_WORKER);
  });

  it("never fires under vitest — 2700 tests run with no .env at all", () => {
    expect(resolveApiBase({ DEV: true, MODE: "test" })).toBe("");
    expect(resolveApiBase({ DEV: true, MODE: "test", VITE_API_BASE_URL: PROD_WORKER })).toBe(
      PROD_WORKER,
    );
  });
});
