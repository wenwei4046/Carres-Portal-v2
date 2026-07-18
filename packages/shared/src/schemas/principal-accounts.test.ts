import { describe, expect, it } from "vitest";
import { CREATABLE_APP_ROLES, createAccountInput } from "./principal-accounts";

function base(over: Record<string, unknown> = {}) {
  return {
    name: "Lily Ong",
    email: "lily@store.com",
    role: "dealer",
    companyName: "BedHouse KL Sdn Bhd",
    address: "12 Jalan Contoh, 50000 KL",
    ssmCode: "201801234567",
    contactName: "Lily Ong",
    contactPhone: "0123344556",
    tempPassword: "changeme123",
    ...over,
  };
}

describe("createAccountInput (2026-07-18 staff-at-creation)", () => {
  it("salesperson is no longer a creatable role", () => {
    expect(CREATABLE_APP_ROLES).not.toContain("salesperson");
    expect(createAccountInput.safeParse(base({ role: "salesperson" })).success).toBe(false);
  });

  it("dealer + initialStaff (Dealer Principal, 6-digit PIN) parses", () => {
    const r = createAccountInput.safeParse(
      base({ initialStaff: { name: "Lily Ong", staffRole: "principal", pin: "224466" } }),
    );
    expect(r.success).toBe(true);
  });

  it("PIN format is enforced — 5 digits rejected", () => {
    const r = createAccountInput.safeParse(
      base({ initialStaff: { name: "Lily", staffRole: "manager", pin: "12345" } }),
    );
    expect(r.success).toBe(false);
  });

  it("showroom initialStaff caps at manager — principal rejected", () => {
    const r = createAccountInput.safeParse(
      base({
        role: "showroom",
        companyName: "Carres KL Showroom",
        initialStaff: { name: "Aina", staffRole: "principal", pin: "224466" },
      }),
    );
    expect(r.success).toBe(false);
  });

  it("showroom initialStaff manager (Sales Manager) parses", () => {
    const r = createAccountInput.safeParse(
      base({
        role: "showroom",
        companyName: "Carres KL Showroom",
        initialStaff: { name: "Aina", staffRole: "manager", pin: "224466" },
      }),
    );
    expect(r.success).toBe(true);
  });

  it("initialStaff on a non-store role is rejected", () => {
    const r = createAccountInput.safeParse({
      name: "Ops",
      email: "ops@carres.com",
      role: "operation",
      tempPassword: "changeme123",
      initialStaff: { name: "X", staffRole: "manager", pin: "224466" },
    });
    expect(r.success).toBe(false);
  });
});
