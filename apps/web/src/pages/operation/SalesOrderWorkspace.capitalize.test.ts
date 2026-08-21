import { describe, expect, it } from "vitest";
import { autoCapitalize } from "./SalesOrderWorkspace";

/**
 * AUTO-CAPITALIZE (Jess, meeting 1) — customer name and address get their
 * first letters up at the PAYLOAD, so what lands on documents reads properly
 * regardless of how it was typed.
 *
 * Only the FIRST letter of each word moves. Lowercasing the remainder would
 * mangle exactly the tokens Malaysian addresses are full of.
 */
describe("autoCapitalize", () => {
  it("lifts the first letter of every word", () => {
    expect(autoCapitalize("ms chong")).toBe("Ms Chong");
    expect(autoCapitalize("jalan ketumbar, taman cheras utama")).toBe(
      "Jalan Ketumbar, Taman Cheras Utama",
    );
  });

  it("never touches what is already capitalised or mixed", () => {
    expect(autoCapitalize("SS2")).toBe("SS2");
    expect(autoCapitalize("Blok D-1-15 Cheras Ria")).toBe("Blok D-1-15 Cheras Ria");
    expect(autoCapitalize("McKenzie")).toBe("McKenzie");
  });

  it("capitalises after separators an address actually uses", () => {
    expect(autoCapitalize("12-3a, jalan telawi 5/lorong b")).toBe(
      "12-3a, Jalan Telawi 5/Lorong B",
    );
    expect(autoCapitalize("blok d-1-15")).toBe("Blok D-1-15");
  });

  it("leaves the empty string alone", () => {
    expect(autoCapitalize("")).toBe("");
  });
});
