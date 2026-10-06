import { describe, expect, it } from "vitest";
import { personInitials } from "./staff-avatar";

/** S2-A · the ONE initials rule every staff avatar uses (owner ruling 2026-09-17). */
describe("personInitials", () => {
  it.each([
    ["Shasha", "SH"],
    ["Yu Jun", "YJ"],
    ["Khor Yee", "KY"],
    ["  yu   jun ", "YJ"],
  ])("%s → %s", (name, initials) => {
    expect(personInitials(name, "")).toBe(initials);
  });

  it("falls back to the email local part", () => {
    expect(personInitials(null, "shasha@carres.com")).toBe("SH");
  });
});
