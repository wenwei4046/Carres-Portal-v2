import { describe, expect, it } from "vitest";
import {
  STAFF_COLORS,
  STAFF_TOKEN_HEADER,
  createStaffInputSchema,
  staffColorSchema,
  staffDtoSchema,
  staffListResponseSchema,
  staffPinSchema,
  staffTokenPayloadSchema,
  updateStaffInputSchema,
  verifyPinInputSchema,
} from "./staff";

const UUID = "11111111-1111-4111-8111-111111111111";

describe("staffPinSchema", () => {
  it("accepts exactly 6 digits", () => {
    expect(staffPinSchema.safeParse("012345").success).toBe(true);
  });
  it.each(["12345", "1234567", "12a456", "12 456", ""])(
    "rejects %j",
    (bad) => {
      expect(staffPinSchema.safeParse(bad).success).toBe(false);
    },
  );
});

describe("staffTokenPayloadSchema", () => {
  it("parses a PIN session payload", () => {
    const p = staffTokenPayloadSchema.parse({
      sid: UUID,
      did: UUID,
      oid: null,
      tier: "manager",
    });
    expect(p.tier).toBe("manager");
  });
  it("allows sid null (owner-mode reauth session)", () => {
    expect(
      staffTokenPayloadSchema.safeParse({
        sid: null,
        did: UUID,
        oid: null,
        tier: "principal",
      }).success,
    ).toBe(true);
  });
  it("rejects unknown tiers", () => {
    expect(
      staffTokenPayloadSchema.safeParse({
        sid: null,
        did: UUID,
        oid: null,
        tier: "boss",
      }).success,
    ).toBe(false);
  });
});

describe("staffDtoSchema", () => {
  it("defaults tier/active/hasPin for pre-0233 payloads", () => {
    const dto = staffDtoSchema.parse({
      id: UUID,
      dealerId: UUID,
      outletId: null,
      name: "James",
      phone: null,
      userId: null,
    });
    expect(dto.staffRole).toBe("salesperson");
    expect(dto.active).toBe(true);
    expect(dto.hasPin).toBe(false);
    expect(dto.color).toBeNull();
  });
});

describe("staffListResponseSchema", () => {
  it("parses a full response", () => {
    const r = staffListResponseSchema.parse({
      staff: [],
      activated: false,
      selfStaffId: null,
      storeKind: "showroom",
    });
    expect(r.storeKind).toBe("showroom");
  });
});

describe("createStaffInputSchema / updateStaffInputSchema", () => {
  it("accepts a manager with an initial PIN and palette color", () => {
    const v = createStaffInputSchema.parse({
      name: "Aina",
      staffRole: "manager",
      outletId: UUID,
      color: "ocean",
      pin: "246810",
    });
    expect(v.color).toBe("ocean");
  });
  it("rejects off-palette colors", () => {
    expect(staffColorSchema.safeParse("magenta").success).toBe(false);
  });
  it("rejects an empty patch", () => {
    expect(updateStaffInputSchema.safeParse({}).success).toBe(false);
  });
  it("accepts a deactivate-only patch", () => {
    expect(updateStaffInputSchema.safeParse({ active: false }).success).toBe(true);
  });
});

describe("constants", () => {
  it("palette has 10 colors and flame is the brand hex", () => {
    expect(Object.keys(STAFF_COLORS)).toHaveLength(10);
    expect(STAFF_COLORS.flame).toBe("#C44D2B");
  });
  it("header name is stable", () => {
    expect(STAFF_TOKEN_HEADER).toBe("X-Staff-Token");
  });
  it("verify input demands uuid + pin", () => {
    expect(
      verifyPinInputSchema.safeParse({ salespersonId: UUID, pin: "123456" }).success,
    ).toBe(true);
    expect(
      verifyPinInputSchema.safeParse({ salespersonId: "x", pin: "123456" }).success,
    ).toBe(false);
  });
});
