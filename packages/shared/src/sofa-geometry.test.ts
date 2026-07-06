/**
 * Sofa plan-view GEOMETRY — TDD battery (Phase 3, sofa engine).
 *
 * The exact-match core (same rigor as P2's `computeSofaPrice`). Mirrors the
 * relevant geometry cases of the 2990s `sofa-build.test.ts`, ported to Carres's
 * `moduleCode` cell shape (aligned with P2's `SofaBuildCell`). Pure cm-space —
 * no DOM, no React.
 */

import { describe, it, expect } from "vitest";
import {
  SOFA_MODULES,
  MODULE_EDGES_BASE,
  parseCompartmentStructure,
  familyRepresentative,
  findModule,
  normalizeCompartmentCode,
  representativeArtCode,
  isAccessoryModule,
  classifySofaCompartment,
  moduleFootprint,
  cellBbox,
  cellRenderBox,
  cellsBbox,
  centerCellsWithin,
  centerCellsInRoom,
  DEFAULT_FOOTPRINT,
  cellEdges,
  lCapEdgeOf,
  edgeContacts,
  groupSofas,
  hasArmConflict,
  analyzeSofa,
  findSnap,
  orderSofaCellsLeftToRight,
  reflowCellsForDepth,
  SNAP_CM,
  CONTACT_TOL,
  EDGE_W,
  EDGE_E,
  EDGE_S,
  type GeoCell,
} from "./sofa-geometry";

/* ─── Footprint table presence ─────────────────────────────────────────── */

describe("SOFA_MODULES + MODULE_EDGES_BASE constants", () => {
  it("carries the canonical footprint for the base families", () => {
    const byCode = new Map(SOFA_MODULES.map((m) => [m.code, m]));
    expect(byCode.get("1A(LHF)")).toMatchObject({ w: 95, d: 95, cushions: 1 });
    expect(byCode.get("2A(LHF)")).toMatchObject({ w: 158, d: 95, cushions: 2 });
    expect(byCode.get("1NA")).toMatchObject({ w: 75, d: 95, cushions: 1 });
    expect(byCode.get("CNR")).toMatchObject({ w: 95, d: 95, cushions: 1 });
    expect(byCode.get("L(LHF)")).toMatchObject({ w: 95, d: 165, cushions: 1 });
    expect(byCode.get("Console")).toMatchObject({ w: 45, accessory: true });
  });

  it("carries arm/back/front/open edge sets keyed by code", () => {
    expect(MODULE_EDGES_BASE["1A(LHF)"]).toEqual(["arm", "back", "open", "front"]);
    expect(MODULE_EDGES_BASE["1A(RHF)"]).toEqual(["open", "back", "arm", "front"]);
    expect(MODULE_EDGES_BASE["1NA"]).toEqual(["open", "back", "open", "front"]);
    expect(MODULE_EDGES_BASE["CNR"]).toEqual(["arm", "arm", "open", "open"]);
  });
});

/* ─── parseCompartmentStructure ────────────────────────────────────────── */

describe("parseCompartmentStructure", () => {
  it("parses base + orientation + mechanism from the parens form", () => {
    expect(parseCompartmentStructure("1A(P)(LHF)")).toEqual({
      base: "1A",
      orientation: "LHF",
      mechanism: "P",
    });
  });
  it("parses an orientation-only code", () => {
    expect(parseCompartmentStructure("2A(RHF)")).toEqual({
      base: "2A",
      orientation: "RHF",
      mechanism: null,
    });
  });
  it("parses a bare base code", () => {
    expect(parseCompartmentStructure("1NA")).toEqual({
      base: "1NA",
      orientation: null,
      mechanism: null,
    });
  });
  it("upper-cases the base + tolerates re-casing", () => {
    expect(parseCompartmentStructure("1a(lhf)")).toEqual({
      base: "1A",
      orientation: "LHF",
      mechanism: null,
    });
  });
  it("returns null on unparseable input", () => {
    expect(parseCompartmentStructure("")).toBeNull();
  });
});

/* ─── familyRepresentative + findModule (synthesis) ────────────────────── */

describe("familyRepresentative + findModule", () => {
  it("maps a structure to its canonical representative", () => {
    expect(familyRepresentative({ base: "1A", orientation: "LHF", mechanism: "P" })).toBe(
      "1A(LHF)",
    );
    expect(familyRepresentative({ base: "1NA", orientation: null, mechanism: null })).toBe(
      "1NA",
    );
    expect(familyRepresentative({ base: "CONSOLE", orientation: null, mechanism: null })).toBe(
      "Console",
    );
    expect(familyRepresentative({ base: "ZZZ", orientation: null, mechanism: null })).toBeUndefined();
  });

  it("findModule resolves a known code directly", () => {
    expect(findModule("2A(LHF)")).toMatchObject({ code: "2A(LHF)", w: 158 });
  });

  it("findModule synthesizes a renamed/one-shot code from its family rep", () => {
    // A principal-renamed code that keeps the structure tokens still resolves
    // geometry from the family representative (1A(LHF)).
    const m = findModule("1A(LHF)(28)");
    expect(m).toBeTruthy();
    expect(m!.w).toBe(95);
    expect(m!.d).toBe(95);
    expect(m!.cushions).toBe(1);
  });

  it("findModule returns undefined for a truly-unknown base (no synthesis)", () => {
    expect(findModule("FOO(BAR)")).toBeUndefined();
  });
});

/* ─── normalizeCompartmentCode + representativeArtCode + classify ──────── */

describe("normalizeCompartmentCode", () => {
  it("canonicalizes dash form to parens form", () => {
    expect(normalizeCompartmentCode("1A-LHF")).toBe("1A(LHF)");
    expect(normalizeCompartmentCode("1A(P)-LHF")).toBe("1A(P)(LHF)");
  });
  it("passes through structureless codes", () => {
    expect(normalizeCompartmentCode("1NA")).toBe("1NA");
    expect(normalizeCompartmentCode("Console")).toBe("Console");
  });
});

describe("representativeArtCode", () => {
  it("returns the code itself for a known code", () => {
    expect(representativeArtCode("1A(LHF)")).toBe("1A(LHF)");
  });
  it("falls back to the base family for a synthesized one-shot", () => {
    expect(representativeArtCode("1A(LHF)(SEAT)(EXTEND)")).toBe("1A(LHF)");
  });
});

describe("isAccessoryModule + classifySofaCompartment", () => {
  it("flags accessories", () => {
    expect(isAccessoryModule("Console")).toBe(true);
    expect(isAccessoryModule("STOOL")).toBe(true);
    expect(isAccessoryModule("1A(LHF)")).toBe(false);
  });
  it("classifies codes into palette groups", () => {
    expect(classifySofaCompartment("1A(LHF)")).toBe("1-seater");
    expect(classifySofaCompartment("2A(RHF)")).toBe("2-seater");
    expect(classifySofaCompartment("CNR")).toBe("Corner");
    expect(classifySofaCompartment("L(LHF)")).toBe("L-Shape");
    expect(classifySofaCompartment("Console")).toBe("Accessory");
  });
});

/* ─── moduleFootprint depth scaling + rotation swap ────────────────────── */

describe("moduleFootprint depth scaling", () => {
  it("widens 2.5cm per inch per cushion (24 base, 28 +10, 30 +15, 32 +20)", () => {
    const m = findModule("2A(LHF)")!; // w 158cm, 2 cushions
    expect(moduleFootprint(m, 0, "24").w).toBe(158);
    expect(moduleFootprint(m, 0, "28").w).toBe(178); // +20cm length on a 2-cushion at 28"
    expect(moduleFootprint(m, 0, "30").w).toBe(188);
    expect(moduleFootprint(m, 0, "32").w).toBe(198);
  });

  it("rot 90/270 swaps w <-> h", () => {
    const m = findModule("2A(LHF)")!; // 158 x 95
    expect(moduleFootprint(m, 0, "24")).toEqual({ w: 158, h: 95 });
    expect(moduleFootprint(m, 180, "24")).toEqual({ w: 158, h: 95 });
    expect(moduleFootprint(m, 90, "24")).toEqual({ w: 95, h: 158 });
    expect(moduleFootprint(m, 270, "24")).toEqual({ w: 95, h: 158 });
  });
});

/* ─── cellBbox + cellsBbox + centering ─────────────────────────────────── */

describe("cellBbox / cellsBbox / centerCellsWithin", () => {
  it("computes a cell's bbox at a rotation", () => {
    const c: GeoCell = { moduleCode: "2A(LHF)", x: 10, y: 20, rot: 90 };
    expect(cellBbox(c, "24")).toEqual({ x: 10, y: 20, w: 95, h: 158 });
  });
  it("returns null for an unknown module", () => {
    expect(cellBbox({ moduleCode: "FOO(BAR)", x: 0, y: 0, rot: 0 }, "24")).toBeNull();
  });
  it("computes the union bbox of multiple cells", () => {
    const cells: GeoCell[] = [
      { moduleCode: "1A(LHF)", x: 0, y: 0, rot: 0 },
      { moduleCode: "1A(RHF)", x: 95, y: 0, rot: 0 },
    ];
    expect(cellsBbox(cells, "24")).toEqual({ x: 0, y: 0, w: 190, h: 95 });
  });
  it("centers a layout within a room", () => {
    const cells: GeoCell[] = [{ moduleCode: "1A(LHF)", x: 0, y: 0, rot: 0 }];
    const out = centerCellsWithin(cells, "24", 600, 480);
    // 95-wide cell centred in 600 → x = (600-95)/2 = 252.5; y = (480-95)/2 = 192.5
    expect(out[0]!.x).toBeCloseTo(252.5);
    expect(out[0]!.y).toBeCloseTo(192.5);
  });
  it("centerCellsInRoom centers at the 600x480 room default", () => {
    const cells: GeoCell[] = [{ moduleCode: "1A(LHF)", x: 0, y: 0, rot: 0 }];
    const out = centerCellsInRoom(cells, "24");
    expect(out[0]!.x).toBeCloseTo(252.5);
    expect(out[0]!.y).toBeCloseTo(192.5);
  });
});

/* ─── cellEdges + lCapEdgeOf ────────────────────────────────────────────── */

describe("cellEdges rotation", () => {
  it("rotates the base edge set clockwise", () => {
    // 1A(LHF) base [arm, back, open, front]; rot 90 CW → [front, arm, back, open]
    expect(cellEdges({ moduleCode: "1A(LHF)", x: 0, y: 0, rot: 90 })).toEqual([
      "front",
      "arm",
      "back",
      "open",
    ]);
  });
  it("derives edges for a synthesized code via the family rep", () => {
    // '1A(LHF)(28)' keeps the 1A(LHF) arm on W at rot 0.
    expect(cellEdges({ moduleCode: "1A(LHF)(28)", x: 0, y: 0, rot: 0 })[EDGE_W]).toBe("arm");
  });
  it("falls back to all-open for an unknown code", () => {
    expect(cellEdges({ moduleCode: "FOO(BAR)", x: 0, y: 0, rot: 0 })).toEqual([
      "open",
      "open",
      "open",
      "open",
    ]);
  });
});

describe("lCapEdgeOf", () => {
  it("returns the L-chaise cap edge, rotation aware", () => {
    expect(lCapEdgeOf("L(RHF)", 0)).toBe(EDGE_E);
    expect(lCapEdgeOf("L(LHF)", 0)).toBe(EDGE_W);
    expect(lCapEdgeOf("L(RHF)", 90)).toBe(EDGE_S);
    expect(lCapEdgeOf("1A(LHF)", 0)).toBe(-1); // non-L
  });
});

/* ─── edgeContacts + groupSofas (connected-component detection) ─────────── */

describe("groupSofas connected-component detection", () => {
  it("joins two arm/open edges touching within 2cm as ONE sofa", () => {
    const cells: GeoCell[] = [
      { id: "a", moduleCode: "2A(LHF)", x: 0, y: 0, rot: 0 },
      { id: "b", moduleCode: "2A(RHF)", x: 158, y: 0, rot: 0 },
    ];
    expect(groupSofas(cells, "24")).toHaveLength(1);
  });

  it("joins cells touching within the 2cm tolerance", () => {
    const cells: GeoCell[] = [
      { id: "a", moduleCode: "2A(LHF)", x: 0, y: 0, rot: 0 },
      { id: "b", moduleCode: "2A(RHF)", x: 159, y: 0, rot: 0 }, // 1cm gap
    ];
    expect(groupSofas(cells, "24")).toHaveLength(1);
  });

  it("does NOT join cells separated by more than 2cm (own groups)", () => {
    const cells: GeoCell[] = [
      { id: "a", moduleCode: "2A(LHF)", x: 0, y: 0, rot: 0 },
      { id: "b", moduleCode: "2A(RHF)", x: 165, y: 0, rot: 0 }, // 7cm gap
    ];
    expect(groupSofas(cells, "24")).toHaveLength(2);
  });

  it("puts two distant sofas in separate groups", () => {
    const cells: GeoCell[] = [
      { id: "a", moduleCode: "2A(LHF)", x: 0, y: 0, rot: 0 },
      { id: "b", moduleCode: "2A(RHF)", x: 158, y: 0, rot: 0 },
      { id: "c", moduleCode: "1A(LHF)", x: 1000, y: 0, rot: 0 },
      { id: "d", moduleCode: "1A(RHF)", x: 1095, y: 0, rot: 0 },
    ];
    expect(groupSofas(cells, "24")).toHaveLength(2);
  });

  it("does NOT join cells that only touch FRONT-to-anything", () => {
    const cells: GeoCell[] = [
      { id: "a", moduleCode: "1A(LHF)", x: 0, y: 0, rot: 0 },
      { id: "b", moduleCode: "1A(LHF)", x: 95, y: 0, rot: 90 },
    ];
    expect(groupSofas(cells, "24")).toHaveLength(2);
  });

  it("does NOT join cells that only touch BACK-to-BACK", () => {
    const cells: GeoCell[] = [
      { id: "a", moduleCode: "1A(LHF)", x: 0, y: 95, rot: 0 },
      { id: "b", moduleCode: "1A(LHF)", x: 0, y: 0, rot: 180 },
    ];
    expect(groupSofas(cells, "24")).toHaveLength(2);
  });
});

describe("edgeContacts + CONTACT_TOL", () => {
  it("CONTACT_TOL is 2", () => {
    expect(CONTACT_TOL).toBe(2);
  });
  it("reports a right-to-left edge contact", () => {
    const a: GeoCell = { moduleCode: "2A(LHF)", x: 0, y: 0, rot: 0 };
    const b: GeoCell = { moduleCode: "2A(RHF)", x: 158, y: 0, rot: 0 };
    expect(edgeContacts(a, b, "24")).toEqual([{ edgeA: EDGE_E, edgeB: EDGE_W }]);
  });
});

/* ─── hasArmConflict ───────────────────────────────────────────────────── */

describe("hasArmConflict", () => {
  it("returns true when arm meets arm", () => {
    const a: GeoCell = { id: "a", moduleCode: "1A(RHF)", x: 0, y: 0, rot: 0 };
    const b: GeoCell = { id: "b", moduleCode: "1A(LHF)", x: 95, y: 0, rot: 0 };
    expect(hasArmConflict(a, [a, b], "24")).toBe(true);
  });
  it("returns false when only opens touch", () => {
    const a: GeoCell = { id: "a", moduleCode: "1A(LHF)", x: 0, y: 0, rot: 0 };
    const b: GeoCell = { id: "b", moduleCode: "1A(RHF)", x: 95, y: 0, rot: 0 };
    expect(hasArmConflict(a, [a, b], "24")).toBe(false);
  });
});

/* ─── analyzeSofa closure ──────────────────────────────────────────────── */

describe("analyzeSofa closure", () => {
  it("treats 1A(LHF) + 1NA + 1A(RHF) (arm both ends) as closed", () => {
    const group: GeoCell[] = [
      { id: "a", moduleCode: "1A(LHF)", x: 0, y: 0, rot: 0 },
      { id: "b", moduleCode: "1NA", x: 95, y: 0, rot: 0 },
      { id: "c", moduleCode: "1A(RHF)", x: 170, y: 0, rot: 0 },
    ];
    const r = analyzeSofa(group, "24");
    expect(r.violations).toEqual([]);
    expect(r.closed).toBe(true);
    expect(r.reason).toBeNull();
    expect(r.leftArm).toBe(true);
    expect(r.rightArm).toBe(true);
  });

  it("treats 2A(LHF) + L(RHF) as a closed 2+L (L outer cap acts as arm)", () => {
    const group: GeoCell[] = [
      { id: "a", moduleCode: "2A(LHF)", x: 0, y: 0, rot: 0 },
      { id: "b", moduleCode: "L(RHF)", x: 158, y: 0, rot: 0 },
    ];
    const r = analyzeSofa(group, "24");
    expect(r.closed).toBe(true);
    expect(r.reason).toBeNull();
  });

  it("rejects a lone 1NA with No arms on either end", () => {
    const r = analyzeSofa([{ id: "a", moduleCode: "1NA", x: 0, y: 0, rot: 0 }], "24");
    expect(r.closed).toBe(false);
    expect(r.reason).toBe("No arms on either end");
  });

  it("flags arm-to-arm collision (arms colliding)", () => {
    const group: GeoCell[] = [
      { id: "a", moduleCode: "1A(RHF)", x: 0, y: 0, rot: 0 },
      { id: "b", moduleCode: "1A(LHF)", x: 95, y: 0, rot: 0 },
    ];
    const r = analyzeSofa(group, "24");
    expect(r.violations.some((v) => v.reason === "Arm-to-arm")).toBe(true);
    expect(r.closed).toBe(false);
    expect(r.reason).toBe("Arms colliding");
  });

  it("flags arm-blocked-by-module when arm meets a non-arm with no end arm", () => {
    const group: GeoCell[] = [
      { id: "a", moduleCode: "1A(RHF)", x: 0, y: 0, rot: 0 },
      { id: "b", moduleCode: "1NA", x: 95, y: 0, rot: 0 },
    ];
    const r = analyzeSofa(group, "24");
    expect(r.violations.some((v) => v.reason === "Arm blocked by module")).toBe(true);
    expect(r.closed).toBe(false);
  });

  it("reports the console rule for a console-alone group", () => {
    const r = analyzeSofa([{ id: "a", moduleCode: "Console", x: 0, y: 0, rot: 0 }], "24");
    expect(r.closed).toBe(false);
    expect(r.reason).toBe("Console needs a sofa next to it");
  });

  it("a free-standing STOOL is closed on its own", () => {
    const r = analyzeSofa([{ id: "a", moduleCode: "STOOL", x: 0, y: 0, rot: 0 }], "24");
    expect(r.closed).toBe(true);
    expect(r.reason).toBeNull();
  });

  it("accepts a horizontal L whose chaise FOOT is open (Loo 2026-07-07: open-foot chaises are a real product)", () => {
    // Long top run (CNR + 2A) armed at BOTH main ends (CNR west arm + 2A east
    // arm); a short chaise leg (1NA) drops below the corner with an OPEN foot.
    // The foot is off the main (horizontal) axis → must NOT fail closure.
    const group: GeoCell[] = [
      { id: "cnr", moduleCode: "CNR", x: 0, y: 0, rot: 0 },
      { id: "top", moduleCode: "2A(RHF)", x: 95, y: 0, rot: 0 },
      { id: "foot", moduleCode: "1NA", x: 0, y: 95, rot: 270 },
    ];
    const r = analyzeSofa(group, "24");
    expect(r.closed).toBe(true);
    expect(r.reason).toBeNull();
  });

  it("an off-axis open end is fine when both MAIN-axis ends are armed", () => {
    // Vertical-dominant L: the main (vertical) run CNR→2A is armed at both ends;
    // the horizontal 2NA's far end is open but off the main axis → still closed.
    const group: GeoCell[] = [
      { id: "cnr", moduleCode: "CNR", x: 0, y: 0, rot: 0 },
      { id: "2na", moduleCode: "2NA", x: 95, y: 0, rot: 0 },
      { id: "2a", moduleCode: "2A(LHF)", x: 0, y: 95, rot: 270 },
    ];
    const r = analyzeSofa(group, "24");
    expect(r.closed).toBe(true);
  });

  it("a MAIN-axis end with no arm still fails (the off-axis exemption never rescues a main end)", () => {
    // Two armless 1NAs in a row → both main (W/E) ends open + armless → not a sofa.
    const group: GeoCell[] = [
      { id: "a", moduleCode: "1NA", x: 0, y: 0, rot: 0 },
      { id: "b", moduleCode: "1NA", x: 75, y: 0, rot: 0 },
    ];
    const r = analyzeSofa(group, "24");
    expect(r.closed).toBe(false);
  });

  it("accessory open edges do NOT fail closure", () => {
    const group: GeoCell[] = [
      { id: "a", moduleCode: "1A(LHF)", x: 0, y: 0, rot: 0 },
      { id: "w", moduleCode: "Console", x: 95, y: 0, rot: 0 },
      { id: "b", moduleCode: "1A(RHF)", x: 140, y: 0, rot: 0 },
    ];
    const r = analyzeSofa(group, "24");
    expect(r.closed).toBe(true);
    expect(r.reason).toBeNull();
  });
});

/* ─── findSnap ─────────────────────────────────────────────────────────── */

describe("findSnap threshold", () => {
  it("SNAP_CM is 20", () => {
    expect(SNAP_CM).toBe(20);
  });

  it("snaps when the gap is within SNAP_CM", () => {
    const neighbour: GeoCell = { id: "n", moduleCode: "1A(LHF)", x: 110, y: 0, rot: 0 };
    const dragged = cellBbox({ moduleCode: "1A(LHF)", x: 0, y: 0, rot: 0 }, "24")!;
    const s = findSnap(dragged, [neighbour], "me", "24");
    expect(s.dx).toBe(15); // 110 - 95
    expect(s.dy).toBe(0);
  });

  it("does NOT snap when the gap exceeds SNAP_CM", () => {
    const farNeighbour: GeoCell = { id: "n", moduleCode: "1A(LHF)", x: 130, y: 0, rot: 0 };
    const dragged = cellBbox({ moduleCode: "1A(LHF)", x: 0, y: 0, rot: 0 }, "24")!;
    const s = findSnap(dragged, [farNeighbour], "me", "24");
    expect(s).toEqual({ dx: 0, dy: 0 });
  });

  it("ignores the dragged cell's own id", () => {
    const self: GeoCell = { id: "me", moduleCode: "1A(LHF)", x: 110, y: 0, rot: 0 };
    const dragged = cellBbox({ moduleCode: "1A(LHF)", x: 0, y: 0, rot: 0 }, "24")!;
    const s = findSnap(dragged, [self], "me", "24");
    expect(s).toEqual({ dx: 0, dy: 0 });
  });

  it("snaps to flush left-edge alignment (the 4 edge candidates)", () => {
    // Two cells already vertically adjacent (touching in Y), slightly offset in X.
    const dragged = cellBbox({ moduleCode: "1A(LHF)", x: 3, y: 95, rot: 0 }, "24")!;
    const above: GeoCell = { id: "n", moduleCode: "1A(LHF)", x: 0, y: 0, rot: 0 };
    const s = findSnap(dragged, [above], "me", "24");
    // X overlap present (boxes overlap), so left-flush dx = 0 - 3 = -3 fires.
    expect(s.dx).toBe(-3);
  });

  // Magnet-parallel (Loo 2026-07-06): a side seam pulls the pieces FLUSH even
  // when the perpendicular offset exceeds SNAP_CM — linked modules never step.
  it("magnet-parallel: an abutting E/W seam aligns tops beyond SNAP_CM", () => {
    // Dragged sits 29cm LOWER than the neighbour (beyond the 20cm snap radius)
    // and 15cm short of abutting. X snaps the seam shut; the magnet then pulls
    // the tops level.
    const neighbour: GeoCell = { id: "n", moduleCode: "1A(LHF)", x: 110, y: 0, rot: 0 };
    const dragged = cellBbox({ moduleCode: "1A(LHF)", x: 0, y: 29, rot: 0 }, "24")!;
    const s = findSnap(dragged, [neighbour], "me", "24");
    expect(s.dx).toBe(15); // abut: 110 - 95
    expect(s.dy).toBe(-29); // magnet: tops level
  });

  it("magnet-parallel does NOT fire without a side contact", () => {
    const farNeighbour: GeoCell = { id: "n", moduleCode: "1A(LHF)", x: 150, y: 0, rot: 0 };
    const dragged = cellBbox({ moduleCode: "1A(LHF)", x: 0, y: 29, rot: 0 }, "24")!;
    expect(findSnap(dragged, [farNeighbour], "me", "24")).toEqual({ dx: 0, dy: 0 });
  });

  it("magnet-parallel mirrors on an N/S seam (aligns lefts)", () => {
    // Neighbour below; dragged 29cm to the right, 15cm above abutting.
    const below: GeoCell = { id: "n", moduleCode: "1A(LHF)", x: 0, y: 110, rot: 0 };
    const dragged = cellBbox({ moduleCode: "1A(LHF)", x: 29, y: 0, rot: 0 }, "24")!;
    const s = findSnap(dragged, [below], "me", "24");
    expect(s.dy).toBe(15); // abut: 110 - 95
    expect(s.dx).toBe(-29); // magnet: lefts level
  });
});

/* ─── reflowCellsForDepth ──────────────────────────────────────────────── */

describe("reflowCellsForDepth (size change keeps sofas linked)", () => {
  it("re-abuts a flush pair when the size grows — the sofa grows as one piece", () => {
    const cells: GeoCell[] = [
      { id: "a", moduleCode: "1B(LHF)", x: 0, y: 0, rot: 0 }, // 24″: 105 wide
      { id: "b", moduleCode: "1B(RHF)", x: 105, y: 0, rot: 0 },
    ];
    const out = reflowCellsForDepth(cells, "24", "28"); // 28″: 115 wide
    expect(out.find((c) => c.id === "a")).toMatchObject({ x: 0, y: 0 });
    expect(out.find((c) => c.id === "b")).toMatchObject({ x: 115, y: 0 });
  });

  it("keeps a corner L linked across a size change (still ONE closed sofa)", () => {
    // seedCornerL LHF shape at 24″: chaise under the corner, 2A east of it.
    const cells: GeoCell[] = [
      { id: "one", moduleCode: "1B(LHF)", x: 0, y: 95, rot: 270 },
      { id: "cnr", moduleCode: "CNR", x: 0, y: 0, rot: 0 },
      { id: "two", moduleCode: "2A(RHF)", x: 95, y: 0, rot: 0 },
    ];
    const out = reflowCellsForDepth(cells, "24", "28");
    expect(out.find((c) => c.id === "one")).toMatchObject({ x: 0, y: 95 }); // anchor
    expect(out.find((c) => c.id === "cnr")).toMatchObject({ x: 0, y: 0 });
    expect(out.find((c) => c.id === "two")).toMatchObject({ x: 105, y: 0 }); // corner now 105 wide
    const groups = groupSofas(out, "28");
    expect(groups).toHaveLength(1); // still one connected sofa at the NEW size
    expect(analyzeSofa(groups[0]!, "28").closed).toBe(true);
  });

  it("free-standing pieces keep their anchor; same depth is a no-op", () => {
    const cells: GeoCell[] = [
      { id: "solo", moduleCode: "1S", x: 300, y: 300, rot: 0 },
    ];
    expect(reflowCellsForDepth(cells, "24", "28")).toEqual(cells);
    expect(reflowCellsForDepth(cells, "24", "24")).toBe(cells);
  });
});

/* ─── orderSofaCellsLeftToRight ────────────────────────────────────────── */

describe("orderSofaCellsLeftToRight", () => {
  it("walks a chain from the LHF end to the RHF end", () => {
    const cells: GeoCell[] = [
      { id: "b", moduleCode: "2A(RHF)", x: 95, y: 0, rot: 0 },
      { id: "a", moduleCode: "1A(LHF)", x: 0, y: 0, rot: 0 },
    ];
    expect(orderSofaCellsLeftToRight(cells, "24").map((c) => c.id)).toEqual(["a", "b"]);
  });
  it("keeps a single cell as-is", () => {
    const cells: GeoCell[] = [{ id: "a", moduleCode: "1A(LHF)", x: 0, y: 0, rot: 0 }];
    expect(orderSofaCellsLeftToRight(cells, "24")).toHaveLength(1);
  });
});

/* ─── Unknown-code fallback — never throws ─────────────────────────────── */

describe("unknown-code fallback (no throw, default box)", () => {
  const unknown = "TOTALLY-UNKNOWN-99";

  it("findModule returns undefined and cellBbox returns null (faithful to 2990s)", () => {
    expect(findModule(unknown)).toBeUndefined();
    expect(cellBbox({ moduleCode: unknown, x: 0, y: 0, rot: 0 }, "24")).toBeNull();
  });

  it("cellRenderBox NEVER returns null — falls back to the 95x95 default box", () => {
    expect(DEFAULT_FOOTPRINT).toEqual({ w: 95, d: 95, cushions: 0 });
    const box = cellRenderBox({ moduleCode: unknown, x: 10, y: 20, rot: 0 }, "24");
    expect(box).toEqual({ x: 10, y: 20, w: 95, h: 95 });
  });

  it("the geometry path does not crash on bad data", () => {
    const cells: GeoCell[] = [{ id: "x", moduleCode: unknown, x: 0, y: 0, rot: 0 }];
    expect(() => cellsBbox(cells, "24")).not.toThrow();
    expect(() => groupSofas(cells, "24")).not.toThrow();
    expect(() => analyzeSofa(cells, "24")).not.toThrow();
    expect(() => orderSofaCellsLeftToRight(cells, "24")).not.toThrow();
  });
});
