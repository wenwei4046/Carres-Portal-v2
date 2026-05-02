import { describe, it, expect } from "vitest";
import { loginSchema, meResponseSchema } from "./auth";

describe("loginSchema", () => {
  it("accepts a valid email + 1-char password (server is the password authority)", () => {
    const result = loginSchema.safeParse({ email: "dealer@carres.com", password: "1" });
    expect(result.success).toBe(true);
  });

  it("rejects empty password", () => {
    const result = loginSchema.safeParse({ email: "dealer@carres.com", password: "" });
    expect(result.success).toBe(false);
  });

  it("rejects malformed email", () => {
    const result = loginSchema.safeParse({ email: "not-an-email", password: "111" });
    expect(result.success).toBe(false);
  });
});

describe("meResponseSchema", () => {
  it("accepts a dealer with dealerId set + others null", () => {
    const result = meResponseSchema.safeParse({
      id: "11111111-1111-1111-1111-000000000002",
      email: "dealer@carres.com",
      role: "dealer",
      dealerId: "00000000-0000-0000-0000-000000000d01",
      supplierId: null,
      partnerId: null,
      outletId: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown role", () => {
    const result = meResponseSchema.safeParse({
      id: "11111111-1111-1111-1111-000000000099",
      email: "ceo@carres.com",
      role: "ceo",
      dealerId: null,
      supplierId: null,
      partnerId: null,
      outletId: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-uuid id", () => {
    const result = meResponseSchema.safeParse({
      id: "not-uuid",
      email: "dealer@carres.com",
      role: "dealer",
      dealerId: null,
      supplierId: null,
      partnerId: null,
      outletId: null,
    });
    expect(result.success).toBe(false);
  });
});
