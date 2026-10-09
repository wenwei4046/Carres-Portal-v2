import { afterEach, describe, expect, it } from "vitest";
import { VERIFIED_COMPANY_PROFILE } from "@carres/shared";
import { CARRES_COMPANY, setCompanyIdentity } from "./company-identity-store";

afterEach(() => setCompanyIdentity(null));

describe("the company identity every document prints", () => {
  it("prints the verified SSM number before the stored identity is read (never 20201055306)", () => {
    expect(CARRES_COMPANY.regNo).toBe("202401055306 (1601150-X)");
    expect(CARRES_COMPANY.legalName).toBe("CARRES SDN. BHD.");
  });
  it("prints three address lines with the postcode kept", () => {
    expect(CARRES_COMPANY.addressLines).toEqual([
      "E-28-02 & E-28-03, MENARA SUEZCAP 2",
      "KL GATEWAY, NO. 2, JALAN KERINCHI",
      "GERBANG KERINCHI LESTARI, 59200 KUALA LUMPUR",
    ]);
  });
  it("prints what Settings → Company stored", () => {
    setCompanyIdentity({ ...VERIFIED_COMPANY_PROFILE, legal_name: "CARRES TEST SDN. BHD.", address_line3: null });
    expect(CARRES_COMPANY.legalName).toBe("CARRES TEST SDN. BHD.");
    expect(CARRES_COMPANY.addressLines).toEqual([
      "E-28-02 & E-28-03, MENARA SUEZCAP 2",
      "KL GATEWAY, NO. 2, JALAN KERINCHI",
      "59200 KUALA LUMPUR",
    ]);
  });
  it("an identity without a legal name or SSM number never blanks the header", () => {
    setCompanyIdentity({ ...VERIFIED_COMPANY_PROFILE, registration_no: null });
    expect(CARRES_COMPANY.regNo).toBe("202401055306 (1601150-X)");
  });
});
