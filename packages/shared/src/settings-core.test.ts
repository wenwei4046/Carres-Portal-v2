import { describe, expect, it } from "vitest";
import {
  VERIFIED_COMPANY_PROFILE,
  companyAddressLines,
  officeCalendarValuesSchema,
  officeHolidaysSaveInput,
} from "./settings-core";

const OFFICE = {
  work_days: [1, 2, 3, 4, 5], start_time: "09:00", end_time: "18:00", flexi_minutes: 60,
  lunch_start: "13:00", lunch_end: "14:00", lunch_shift_minutes: 60, holiday_region: "Kuala Lumpur",
};

describe("Settings → Company and Office shapes", () => {
  it("the verified identity carries the owner's SSM number, not the old one", () => {
    expect(VERIFIED_COMPANY_PROFILE.registration_no).toBe("202401055306 (1601150-X)");
    expect(VERIFIED_COMPANY_PROFILE.support_phone).toBe("011-6133 8862");
  });
  it("the printed address keeps postcode and city together and drops blanks", () => {
    expect(companyAddressLines(VERIFIED_COMPANY_PROFILE)).toEqual([
      "E-28-02 & E-28-03, MENARA SUEZCAP 2",
      "KL GATEWAY, NO. 2, JALAN KERINCHI",
      "GERBANG KERINCHI LESTARI",
      "59200 KUALA LUMPUR",
    ]);
  });
  it("the owner defaults are a valid Office calendar", () => {
    expect(officeCalendarValuesSchema.safeParse(OFFICE).success).toBe(true);
  });
  it("closing before opening, and lunch outside hours, are refused", () => {
    expect(officeCalendarValuesSchema.safeParse({ ...OFFICE, end_time: "08:00" }).success).toBe(false);
    expect(officeCalendarValuesSchema.safeParse({ ...OFFICE, lunch_start: "08:30" }).success).toBe(false);
    expect(officeCalendarValuesSchema.safeParse({ ...OFFICE, work_days: [] }).success).toBe(false);
  });
  it("a year's holidays must all fall in that year, once each", () => {
    expect(officeHolidaysSaveInput.safeParse({ year: 2027, holidays: [{ date: "2027-01-01", name: "New Year's Day" }] }).success).toBe(true);
    expect(officeHolidaysSaveInput.safeParse({ year: 2027, holidays: [{ date: "2026-12-25", name: "Christmas Day" }] }).success).toBe(false);
    expect(officeHolidaysSaveInput.safeParse({
      year: 2027,
      holidays: [{ date: "2027-01-01", name: "A" }, { date: "2027-01-01", name: "B" }],
    }).success).toBe(false);
  });
});
