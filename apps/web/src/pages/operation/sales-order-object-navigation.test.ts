import { describe, expect, it } from "vitest";
import { objectViewParams } from "./sales-order-object-navigation";

describe("Sales Order object navigation", () => {
  it("removes the active Edit state when another object view opens", () => {
    const current = new URLSearchParams("edit=1");

    expect(objectViewParams(current, "History", true).toString()).toBe("");
  });

  it("keeps Order Route as a durable object view without carrying Edit", () => {
    const current = new URLSearchParams("edit=1");

    expect(objectViewParams(current, "Order Route", true).toString()).toBe("route=1");
  });

  it("preserves unrelated object context while switching views", () => {
    const current = new URLSearchParams("revision=3&route=1");

    expect(objectViewParams(current, "Revisions", false).toString()).toBe("revision=3");
  });
});
