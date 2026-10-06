import { describe, expect, it } from "vitest";
import {
  recommendedTemplatePurpose,
  renderPaymentTemplate,
} from "./payment-templates";

describe("renderPaymentTemplate", () => {
  it("substitutes structured facts into protected fields", () => {
    expect(renderPaymentTemplate("Hi {customer}, RM {outstanding}.", {
      customer: "LIM KUAN YANG", outstanding: "2,200",
    })).toBe("Hi LIM KUAN YANG, RM 2,200.");
  });
  it("a field with no fact stays visible — never silently dropped", () => {
    expect(renderPaymentTemplate("REF: {ref}", { ref: null })).toBe("REF: {ref}");
    expect(renderPaymentTemplate("X {unknown_thing} Y", {})).toBe("X {unknown_thing} Y");
  });
});

describe("recommendedTemplatePurpose", () => {
  it("the shared clock's answer decides the recommendation", () => {
    expect(recommendedTemplatePurpose("due")).toBe("gentle_reminder");
    expect(recommendedTemplatePurpose("late")).toBe("should_have_been_received");
  });
});
