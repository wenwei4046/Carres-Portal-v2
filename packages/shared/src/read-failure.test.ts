import { describe, expect, it } from "vitest";
import { readFailureWords } from "./read-failure";

/* ⭐ A READ FAILURE HAS THREE FACES, AND A PERMISSION REFUSAL NEVER OFFERS
   `Try again` — owner ruling 2026-09-26 (Orders MASTER). */
describe("readFailureWords", () => {
  it("403: the permission words, the way back, and NO retry", () => {
    expect(readFailureWords({ status: 403, message: "JWT role forbidden" }, "sales-order")).toEqual({
      face: "refused",
      title: "You cannot view this record",
      detail: "Ask an authorised operation user for access.",
      action: "back",
    });
  });

  it("403 on the Register has the Register's own title", () => {
    expect(readFailureWords({ status: 403 }, "sales-orders-register")).toMatchObject({
      face: "refused",
      title: "You cannot view sales orders",
      action: "back",
    });
  });

  it.each([404, 400, 422])("%s: the record is not found, with the way back", (status) => {
    expect(readFailureWords({ status, message: "invalid input syntax for type uuid" }, "order-route")).toEqual({
      face: "not-found",
      title: "Sales Order not found.",
      detail: null,
      action: "back",
    });
  });

  it.each([
    ["sales-order", "This sales order could not be opened"],
    ["revisions", "These revisions could not be opened"],
    ["history", "This history could not be opened"],
    ["order-route", "This order route could not be opened"],
    ["sales-orders-register", "Sales orders could not be loaded"],
  ] as const)("anything else on %s keeps the surface's own sentence and offers Try again", (surface, title) => {
    for (const error of [{ status: 500, message: "boom" }, new Error("Failed to fetch"), null, undefined, "x"]) {
      expect(readFailureWords(error, surface)).toEqual({ face: "failed", title, detail: null, action: "retry" });
    }
  });

  it("a transport message never reaches the screen", () => {
    for (const status of [403, 404, 500, undefined]) {
      const words = readFailureWords({ status, message: "PGRST301 secret detail" }, "sales-order");
      expect(JSON.stringify(words)).not.toContain("PGRST301");
    }
  });

  it("empty, failed and refused never share a sentence", () => {
    const titles = [403, 404, 500].map((status) => readFailureWords({ status }, "sales-order").title);
    expect(new Set(titles).size).toBe(3);
  });
});
