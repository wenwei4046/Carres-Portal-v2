import { describe, expect, it } from "vitest";
import { loginState, readReturnTo, returnTo } from "./return-to";

describe("returnTo — what a guard remembers before sending someone to login", () => {
  it("keeps path, query and hash together", () => {
    expect(returnTo({ pathname: "/finance/ar", search: "?invoice=INV-123", hash: "#tab=aging" }))
      .toBe("/finance/ar?invoice=INV-123#tab=aging");
  });

  it("is just the path when there is no query or hash", () => {
    expect(returnTo({ pathname: "/finance/ar", search: "", hash: "" })).toBe("/finance/ar");
  });

  it("forgets /login and / — neither is somewhere to come back to", () => {
    expect(returnTo({ pathname: "/login", search: "?x=1", hash: "" })).toBeNull();
    expect(returnTo({ pathname: "/", search: "", hash: "" })).toBeNull();
    expect(loginState({ pathname: "/", search: "", hash: "" })).toBeUndefined();
  });

  it("loginState wraps the target in the shape Login reads", () => {
    expect(loginState({ pathname: "/finance/recon", search: "?q=8821", hash: "" }))
      .toEqual({ from: "/finance/recon?q=8821" });
  });
});

describe("readReturnTo — what Login honours", () => {
  it("round-trips what a guard wrote", () => {
    const state = loginState({ pathname: "/finance/ar", search: "?invoice=INV-123", hash: "#tab=aging" });
    expect(readReturnTo(state)).toBe("/finance/ar?invoice=INV-123#tab=aging");
  });

  it("ignores empty, foreign or malformed state", () => {
    expect(readReturnTo(null)).toBeNull();
    expect(readReturnTo(undefined)).toBeNull();
    expect(readReturnTo({})).toBeNull();
    expect(readReturnTo({ from: 42 })).toBeNull();
    expect(readReturnTo({ from: "https://evil.example/x" })).toBeNull();
    expect(readReturnTo({ from: "//evil.example/x" })).toBeNull();
    expect(readReturnTo({ from: "finance/ar" })).toBeNull();
  });

  it("refuses to bounce back to /login even when the query differs", () => {
    expect(readReturnTo({ from: "/login?next=1" })).toBeNull();
    expect(readReturnTo({ from: "/" })).toBeNull();
  });
});
