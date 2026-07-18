import { describe, expect, it } from "vitest";
import { detectPortal, portalForRole, roleAllowedOnPortal, PORTAL_URLS } from "./portal";

describe("detectPortal", () => {
  it("maps the two custom domains", () => {
    expect(detectPortal("pos.carresofficial.com")).toBe("pos");
    expect(detectPortal("erp.carresofficial.com")).toBe("erp");
    expect(detectPortal("POS.CARRESOFFICIAL.COM")).toBe("pos");
  });
  it("leaves pages.dev + localhost ungated (legacy/preview/dev doors)", () => {
    expect(detectPortal("carres-portal.pages.dev")).toBe("all");
    expect(detectPortal("40724910.carres-portal.pages.dev")).toBe("all");
    expect(detectPortal("carres-pos.pages.dev")).toBe("all");
    expect(detectPortal("localhost")).toBe("all");
  });
});

describe("portalForRole", () => {
  it("retail family → pos; internal family → erp", () => {
    expect(portalForRole("dealer")).toBe("pos");
    expect(portalForRole("showroom")).toBe("pos");
    expect(portalForRole("salesperson")).toBe("pos");
    expect(portalForRole("bd")).toBe("pos");
    expect(portalForRole("principal")).toBe("erp");
    expect(portalForRole("operation")).toBe("erp");
    expect(portalForRole("finance")).toBe("erp");
    expect(portalForRole("supplier")).toBe("erp");
    expect(portalForRole("partner")).toBe("erp");
  });
});

describe("roleAllowedOnPortal", () => {
  it("gates by domain, never on 'all'", () => {
    expect(roleAllowedOnPortal("dealer", "pos")).toBe(true);
    expect(roleAllowedOnPortal("dealer", "erp")).toBe(false);
    expect(roleAllowedOnPortal("principal", "erp")).toBe(true);
    expect(roleAllowedOnPortal("principal", "pos")).toBe(false);
    expect(roleAllowedOnPortal("bd", "pos")).toBe(true);
    expect(roleAllowedOnPortal("bd", "erp")).toBe(false);
    expect(roleAllowedOnPortal("operation", "all")).toBe(true);
    expect(roleAllowedOnPortal("dealer", "all")).toBe(true);
  });
});

describe("PORTAL_URLS", () => {
  it("points each side at its own door", () => {
    expect(PORTAL_URLS.pos).toBe("https://pos.carresofficial.com");
    expect(PORTAL_URLS.erp).toBe("https://erp.carresofficial.com");
  });
});
