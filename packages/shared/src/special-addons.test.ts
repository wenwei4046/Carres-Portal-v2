import { describe, expect, it } from "vitest";

import {
  resolveSpecialAddonSurcharge,
  resolveSpecialsTotal,
  specialPickComplete,
  type SpecialAddonDef,
} from "./special-addons";

function def(over: Partial<SpecialAddonDef> = {}): SpecialAddonDef {
  return {
    code: "right-drawer",
    label: "Right Drawer",
    soDescription: "Right pull-out drawer",
    categories: ["bedframe"],
    sellingPrice: 50,
    cost: null,
    optionGroups: [],
    active: true,
    sortOrder: 0,
    ...over,
  };
}

const thicknessGroup = {
  label: "Thickness",
  required: true,
  choices: [
    { label: '10"', extra: 0 },
    { label: '8"', extra: -10 },
    { label: '12"', extra: 15 },
  ],
};

describe("resolveSpecialAddonSurcharge", () => {
  it("returns the base when there are no option groups", () => {
    expect(resolveSpecialAddonSurcharge(def(), [])).toBe(50);
  });

  it("adds the chosen choice's extra (incl. negative)", () => {
    const d = def({ optionGroups: [thicknessGroup] });
    expect(resolveSpecialAddonSurcharge(d, ['10"'])).toBe(50);
    expect(resolveSpecialAddonSurcharge(d, ['8"'])).toBe(40); // 50 + (-10)
    expect(resolveSpecialAddonSurcharge(d, ['12"'])).toBe(65);
  });

  it("supports a negative base surcharge (a deduction)", () => {
    expect(resolveSpecialAddonSurcharge(def({ sellingPrice: -40, optionGroups: [] }), [])).toBe(-40);
  });

  it("treats an empty/unknown choice as +0", () => {
    const d = def({ optionGroups: [thicknessGroup] });
    expect(resolveSpecialAddonSurcharge(d, [""])).toBe(50);
    expect(resolveSpecialAddonSurcharge(d, ["nope"])).toBe(50);
    expect(resolveSpecialAddonSurcharge(d, [])).toBe(50);
  });

  it("sums extras across multiple groups", () => {
    const d = def({
      sellingPrice: 100,
      optionGroups: [
        thicknessGroup,
        { label: "Finish", required: false, choices: [{ label: "Matte", extra: 20 }] },
      ],
    });
    expect(resolveSpecialAddonSurcharge(d, ['8"', "Matte"])).toBe(110); // 100 -10 +20
  });

  it("rounds to 2 decimals", () => {
    const d = def({ sellingPrice: 10.005, optionGroups: [] });
    expect(resolveSpecialAddonSurcharge(d, [])).toBe(10.01);
  });
});

describe("specialPickComplete", () => {
  it("is true when there are no required groups", () => {
    expect(specialPickComplete(def({ optionGroups: [] }), [])).toBe(true);
    expect(specialPickComplete(def({ optionGroups: [{ ...thicknessGroup, required: false }] }), [])).toBe(true);
  });
  it("requires a valid chosen choice for each required group", () => {
    const d = def({ optionGroups: [thicknessGroup] });
    expect(specialPickComplete(d, [])).toBe(false);
    expect(specialPickComplete(d, [""])).toBe(false);
    expect(specialPickComplete(d, ["bogus"])).toBe(false);
    expect(specialPickComplete(d, ['10"'])).toBe(true);
  });
});

describe("resolveSpecialsTotal", () => {
  const drawer = def({ code: "right-drawer", sellingPrice: 50, optionGroups: [thicknessGroup] });
  const noPanel = def({ code: "no-side-panel", sellingPrice: -40, optionGroups: [] });
  const byCode = new Map([
    [drawer.code, drawer],
    [noPanel.code, noPanel],
  ]);

  it("sums picks and returns per-line detail", () => {
    const r = resolveSpecialsTotal(
      [
        { code: "right-drawer", choiceLabels: ['8"'] },
        { code: "no-side-panel", choiceLabels: [] },
      ],
      byCode,
    );
    expect(r.total).toBe(0); // (50-10) + (-40)
    expect(r.unknownCodes).toEqual([]);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toMatchObject({ code: "right-drawer", surcharge: 40, soDescription: "Right pull-out drawer" });
  });

  it("reports unknown codes (a drift-reject signal) and skips them", () => {
    const r = resolveSpecialsTotal([{ code: "ghost", choiceLabels: [] }], byCode);
    expect(r.unknownCodes).toEqual(["ghost"]);
    expect(r.total).toBe(0);
    expect(r.lines).toHaveLength(0);
  });

  it("tolerates a missing choiceLabels array", () => {
    const r = resolveSpecialsTotal([{ code: "right-drawer" } as never], byCode);
    expect(r.total).toBe(50);
  });
});
