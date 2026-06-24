import { describe, it, expect } from "vitest";
import { resolveActingDealer } from "./DealerPos";

/**
 * Locks the principal-on-behalf-of-dealer invariant (2026-06-25): the dealer
 * path stays byte-identical (no body dealerId → API uses the JWT), and only a
 * principal acting for a picked dealer sends a body dealerId.
 */
describe("resolveActingDealer", () => {
  it("dealer path: no acting id → effective = JWT dealer, body OMITS dealerId", () => {
    const r = resolveActingDealer(undefined, "JWT-DEALER");
    expect(r.effectiveDealerId).toBe("JWT-DEALER");
    expect(r.bodyDealerId).toBeUndefined();
  });

  it("principal path: acting id + no JWT dealer → effective = acting, body = acting", () => {
    const r = resolveActingDealer("PICKED-D", null);
    expect(r.effectiveDealerId).toBe("PICKED-D");
    expect(r.bodyDealerId).toBe("PICKED-D");
  });

  it("blocked: no acting id + no JWT dealer → effective null (submit disabled)", () => {
    const r = resolveActingDealer(undefined, null);
    expect(r.effectiveDealerId).toBeNull();
    expect(r.bodyDealerId).toBeUndefined();
  });
});
