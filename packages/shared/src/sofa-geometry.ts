/**
 * Sofa plan-view GEOMETRY (Phase 3, sofa engine) — the PURE shape core.
 *
 * A faithful port of the 2990s plan-view geometry (`sofa-build.ts`), adapted to
 * Carres's `moduleCode` cell vocabulary so a geometry cell maps cleanly onto P2's
 * `SofaBuildCell` ({ moduleCode, x?, y?, rot? }) for pricing. NO DOM, NO React —
 * every function here is pure cm-space math and runs identically on the web
 * client and (Phase 4) in Hono.
 *
 * Ported 1:1 from (`C:\Users\wenwe\Projects\2990s\packages\shared\src\sofa-build.ts`):
 *   · Cell / Rot / Depth                 :19-35   → Rot / Depth / GeoCell
 *   · SOFA_MODULES footprint table       :161-204 → SOFA_MODULES (keyed by code)
 *   · MODULE_EDGES_BASE                   :825-861 → MODULE_EDGES_BASE
 *   · parseCompartmentStructure          :229-239 → parseCompartmentStructure
 *   · familyRepresentative                :243-261 → familyRepresentative
 *   · synthesizeModule / findModule       :265-279 → findModule
 *   · normalizeCompartmentCode            :316-325 → normalizeCompartmentCode
 *   · representativeArtCode               :288-294 → representativeArtCode
 *   · classifySofaCompartment             :339-352 → classifySofaCompartment
 *   · widthOffsetPerCushion               :903-906 → widthOffsetPerCushion
 *   · moduleFootprint                     :908-912 → moduleFootprint
 *   · cellBbox / cellsBbox                :916-954 → cellBbox / cellsBbox
 *   · centerCellsWithin                   :963-969 → centerCellsWithin
 *   · cellEdges / rotateEdges             :864-883 → cellEdges
 *   · lCapEdgeOf                          :892-897 → lCapEdgeOf
 *   · edgeContacts (CONTACT_TOL)          :977-1000 → edgeContacts
 *   · hasConnectingContact                :1010-1017 → hasConnectingContact
 *   · groupSofas                          :1020    → groupSofas
 *   · orderSofaCellsLeftToRight           :1073-1147 → orderSofaCellsLeftToRight
 *   · SNAP_CM / findSnap                  :1361-1413 → findSnap
 *   · hasArmConflict                      :1444-1459 → hasArmConflict
 *   · analyzeSofa                         :1466-1598 → analyzeSofa
 *
 * RECONCILED WITH P2:
 *   · `mirrorCode` already lives in `sofa-pricing.ts` (the Quick-Pick L↔R flip) —
 *     it is REUSED here, not re-declared.
 *   · A geometry cell uses `moduleCode` (P2's vocabulary), not 2990s's `moduleId`.
 *   · The Quick-Pick L↔R flip `mirrorCode` is NOT re-declared — the web builder's
 *     auto-mirror-on-drop imports it directly from `sofa-pricing` (via the barrel).
 *
 * CRASH-PROOFING (Phase 3 builder requirement):
 *   · `findModule` stays faithful to 2990s (undefined for a truly-unknown base).
 *   · `cellBbox` stays faithful (null for unknown — every consumer handles null).
 *   · `cellRenderBox` NEVER returns null: an unknown/unparseable code falls back
 *     to a DEFAULT_FOOTPRINT 95×95 box + a one-time console.warn, so the visual
 *     builder never crashes on bad/renamed catalog data.
 */

/* ─── Public types ─────────────────────────────────────────────────────── */

export type Rot = 0 | 90 | 180 | 270;

/** Seat depth in inches, as a string (e.g. '24', '28', '30', '32'). Display +
 *  plan-view width only — never a pricing dimension. */
export type Depth = string;

/**
 * One plan-view sofa cell. Aligned with P2's `SofaBuildCell` ({ moduleCode, x?,
 * y?, rot? }) — a `GeoCell` is the same shape with x/y/rot REQUIRED (a laid-out
 * cell always has coordinates) and an optional client-side id for grouping. The
 * `recliners?` field is carried forward-compat (recliner pricing is deferred).
 */
export interface GeoCell {
  /** Optional client-side cell id for grouping by reference. */
  id?: string;
  /** Compartment code (P2 vocabulary), e.g. '1A(LHF)', '2NA', 'CNR'. */
  moduleCode: string;
  x: number;
  y: number;
  rot: Rot;
  /** Per-seat recliner upgrades (forward-compat; unpriced in Phase 3). */
  recliners?: { seatIdx: number; open: boolean }[];
}

export interface SofaModuleSpec {
  /** Canonical compartment code (was 2990s `id`). */
  code: string;
  group: "1-seater" | "2-seater" | "3-seater" | "Corner" | "L-Shape" | "Accessory";
  label: string;
  /** Width along the cushion axis (cm), 24″ baseline. */
  w: number;
  /** Depth (cm). */
  d: number;
  cushions: number;
  accessory?: boolean;
}

/* ─── Module catalogue ─────────────────────────────────────────────────── */
// 24″ baseline. Depth widens the length (.w) axis by 2.5cm per inch per cushion.
// Codes use the PARENS form — the ONE canonical compartment vocabulary shared
// with the compartment pool (0178), per-model offered set, SKU suffixes and SO
// descriptions. Footprints ported verbatim from 2990s SOFA_MODULES (:161-204).

export const SOFA_MODULES: readonly SofaModuleSpec[] = [
  // 1-seaters (LHF/RHF = left/right hand facing — supplier convention)
  { code: "1A(LHF)", group: "1-seater", label: "1A · Left hand facing", w: 95, d: 95, cushions: 1 },
  { code: "1A(RHF)", group: "1-seater", label: "1A · Right hand facing", w: 95, d: 95, cushions: 1 },
  { code: "1B(LHF)", group: "1-seater", label: "1B · Left hand facing (wide arm)", w: 105, d: 95, cushions: 1 },
  { code: "1B(RHF)", group: "1-seater", label: "1B · Right hand facing (wide arm)", w: 105, d: 95, cushions: 1 },
  { code: "1NA", group: "1-seater", label: "1NA · No arms", w: 75, d: 95, cushions: 1 },
  // 2-seaters
  { code: "2A(LHF)", group: "2-seater", label: "2A · Left hand facing", w: 158, d: 95, cushions: 2 },
  { code: "2A(RHF)", group: "2-seater", label: "2A · Right hand facing", w: 158, d: 95, cushions: 2 },
  { code: "2B(LHF)", group: "2-seater", label: "2B · Left hand facing (wide arm)", w: 170, d: 95, cushions: 2 },
  { code: "2B(RHF)", group: "2-seater", label: "2B · Right hand facing (wide arm)", w: 170, d: 95, cushions: 2 },
  { code: "2NA", group: "2-seater", label: "2NA · No arms", w: 142, d: 95, cushions: 2 },
  // Corner — single SKU per supplier; canvas rotation orients NW/NE/SE/SW.
  { code: "CNR", group: "Corner", label: "Corner piece", w: 95, d: 95, cushions: 1 },
  // L-shape chaise
  { code: "L(LHF)", group: "L-Shape", label: "L · Left hand facing chaise", w: 95, d: 165, cushions: 1 },
  { code: "L(RHF)", group: "L-Shape", label: "L · Right hand facing chaise", w: 95, d: 165, cushions: 1 },
  // Accessory — 45cm wood console. Slots between sofa pieces; no closure/bundle weight.
  { code: "Console", group: "Accessory", label: "Wood console · 45cm", w: 45, d: 95, cushions: 0, accessory: true },
  // Ottoman / stool — 75×75 free-standing accessory.
  { code: "STOOL", group: "Accessory", label: "Ottoman / stool", w: 75, d: 75, cushions: 0, accessory: true },
  // Whole-unit presets — both end arms (self-closing).
  { code: "1S", group: "1-seater", label: "1-Seater (both arms)", w: 115, d: 95, cushions: 1 },
  { code: "2S", group: "2-seater", label: "2-Seater (both arms)", w: 174, d: 95, cushions: 2 },
  { code: "3S", group: "3-seater", label: "3-Seater (both arms)", w: 220, d: 95, cushions: 3 },
  // Functional 1-seater variants (P=power, R=recliner, L=power leg).
  { code: "1A(P)(LHF)", group: "1-seater", label: "1A · Power · Left hand facing", w: 95, d: 95, cushions: 1 },
  { code: "1A(P)(RHF)", group: "1-seater", label: "1A · Power · Right hand facing", w: 95, d: 95, cushions: 1 },
  { code: "1A(R)(LHF)", group: "1-seater", label: "1A · Recliner · Left hand facing", w: 95, d: 95, cushions: 1 },
  { code: "1A(R)(RHF)", group: "1-seater", label: "1A · Recliner · Right hand facing", w: 95, d: 95, cushions: 1 },
  { code: "1A(L)(LHF)", group: "1-seater", label: "1A · Power leg · Left hand facing", w: 95, d: 95, cushions: 1 },
  { code: "1A(L)(RHF)", group: "1-seater", label: "1A · Power leg · Right hand facing", w: 95, d: 95, cushions: 1 },
  { code: "1NA(P)", group: "1-seater", label: "1NA · Power · No arms", w: 75, d: 95, cushions: 1 },
  { code: "1NA(R)", group: "1-seater", label: "1NA · Recliner · No arms", w: 75, d: 95, cushions: 1 },
  { code: "1NA(L)", group: "1-seater", label: "1NA · Power leg · No arms", w: 75, d: 95, cushions: 1 },
  // 1S functional variants — 1S body + forward footrest.
  { code: "1S(P)", group: "1-seater", label: "1S · Power · Both arms", w: 115, d: 95, cushions: 1 },
  { code: "1S(R)", group: "1-seater", label: "1S · Recliner · Both arms", w: 115, d: 95, cushions: 1 },
  { code: "1S(L)", group: "1-seater", label: "1S · Power leg · Both arms", w: 115, d: 95, cushions: 1 },
];

const MODULE_BY_CODE = new Map<string, SofaModuleSpec>(SOFA_MODULES.map((m) => [m.code, m]));

/** Crash-proof default footprint for an unknown / unparseable code (Phase 3 —
 *  the builder must never crash on bad/renamed catalog data). */
export const DEFAULT_FOOTPRINT = { w: 95, d: 95, cushions: 0 } as const;

/* ─── Structural fallback (Maintenance-is-master) ──────────────────────── */

export interface CompartmentStructure {
  /** Upper-cased base family token, e.g. '1A', '2NA', 'CNR', 'CONSOLE'. */
  base: string;
  orientation: "LHF" | "RHF" | null;
  mechanism: "P" | "R" | "L" | null;
}

export const parseCompartmentStructure = (raw: string): CompartmentStructure | null => {
  const code = raw.trim();
  const m = code.match(/^([^()\s]+)\s*((?:\([^)]*\))*)$/);
  if (!m) return null;
  const base = (m[1] ?? "").toUpperCase();
  if (!base) return null;
  const tokens = Array.from((m[2] ?? "").matchAll(/\(([^)]*)\)/g)).map((t) =>
    (t[1] ?? "").toUpperCase(),
  );
  const orientation = tokens.find((t): t is "LHF" | "RHF" => t === "LHF" || t === "RHF") ?? null;
  const mechanism = tokens.find((t): t is "P" | "R" | "L" => t === "P" || t === "R" || t === "L") ?? null;
  return { base, orientation, mechanism };
};

/** Canonical representative code per structure — geometry + edges come from this
 *  code's SOFA_MODULES / MODULE_EDGES_BASE entry. */
export const familyRepresentative = (s: CompartmentStructure): string | undefined => {
  const o = s.orientation ?? "LHF";
  switch (s.base) {
    case "1A":
      return `1A(${o})`;
    case "1B":
      return `1B(${o})`;
    case "2A":
      return `2A(${o})`;
    case "2B":
      return `2B(${o})`;
    case "L":
      return `L(${o})`;
    case "1NA":
      return "1NA";
    case "2NA":
      return "2NA";
    case "1S":
      return "1S";
    case "2S":
      return "2S";
    case "3S":
      return "3S";
    case "CNR":
      return "CNR";
    case "CONSOLE":
      return "Console";
    case "STOOL":
      return "STOOL";
    default:
      return undefined;
  }
};

const SYNTH_CACHE = new Map<string, SofaModuleSpec | undefined>();

const synthesizeModule = (code: string): SofaModuleSpec | undefined => {
  if (SYNTH_CACHE.has(code)) return SYNTH_CACHE.get(code);
  let spec: SofaModuleSpec | undefined;
  const s = parseCompartmentStructure(code);
  const rep = s ? familyRepresentative(s) : undefined;
  const repSpec = rep ? MODULE_BY_CODE.get(rep) : undefined;
  if (repSpec && rep !== code) {
    spec = { ...repSpec, code, label: code };
  }
  SYNTH_CACHE.set(code, spec);
  return spec;
};

export const findModule = (code: string): SofaModuleSpec | undefined =>
  MODULE_BY_CODE.get(code) ?? synthesizeModule(code);

/* ─── Compartment code canonicalizer + classify ────────────────────────── */

export const normalizeCompartmentCode = (raw: string): string => {
  const dash = raw
    .trim()
    .replace(/\(([^)]*)\)/g, "-$1")
    .replace(/-+$/, "");
  const parts = dash.split("-").filter(Boolean);
  if (parts.length <= 1) return dash;
  return (parts[0] ?? "") + parts.slice(1).map((p) => `(${p})`).join("");
};

/**
 * The asset key whose silhouette a (possibly custom/one-shot) compartment code
 * should draw. Standard codes return themselves; synthesized codes fall back to
 * their base family representative so a one-shot variant reuses the base art.
 */
export const representativeArtCode = (code: string): string => {
  const norm = normalizeCompartmentCode(code);
  if (MODULE_BY_CODE.has(norm)) return norm;
  const s = parseCompartmentStructure(norm);
  const rep = s ? familyRepresentative(s) : undefined;
  return rep ?? norm;
};

export const isAccessoryModule = (code: string): boolean => findModule(code)?.accessory === true;

export type SofaCompartmentGroup =
  | "1-seater"
  | "2-seater"
  | "3-seater"
  | "Corner"
  | "L-Shape"
  | "Accessory"
  | "Other";

/** Best-effort classifier for a compartment code → palette group. Tries
 *  SOFA_MODULES first, falls back to a prefix heuristic. */
export const classifySofaCompartment = (rawCode: string): SofaCompartmentGroup => {
  const norm = normalizeCompartmentCode(rawCode);
  const known = MODULE_BY_CODE.get(norm);
  if (known) return known.group;
  if (/^L[-(]/i.test(norm) || /^L$/i.test(norm)) return "L-Shape";
  if (/^CNR$/i.test(norm) || /^CORNER/i.test(norm)) return "Corner";
  if (/^STOOL|^Console|^WC-/i.test(norm)) return "Accessory";
  if (/^2/.test(norm)) return "2-seater";
  if (/^1/.test(norm)) return "1-seater";
  return "Other";
};

/* ─── Edge typing & rotation ───────────────────────────────────────────── */

export type EdgeType = "arm" | "open" | "back" | "front";
export type EdgeIdx = 0 | 1 | 2 | 3; // [W, N, E, S]
export const EDGE_W: EdgeIdx = 0;
export const EDGE_N: EdgeIdx = 1;
export const EDGE_E: EdgeIdx = 2;
export const EDGE_S: EdgeIdx = 3;

export const MODULE_EDGES_BASE: Record<string, [EdgeType, EdgeType, EdgeType, EdgeType]> = {
  "1A(LHF)": ["arm", "back", "open", "front"],
  "1A(RHF)": ["open", "back", "arm", "front"],
  "1B(LHF)": ["arm", "back", "open", "front"],
  "1B(RHF)": ["open", "back", "arm", "front"],
  "1NA": ["open", "back", "open", "front"],
  "2A(LHF)": ["arm", "back", "open", "front"],
  "2A(RHF)": ["open", "back", "arm", "front"],
  "2B(LHF)": ["arm", "back", "open", "front"],
  "2B(RHF)": ["open", "back", "arm", "front"],
  "2NA": ["open", "back", "open", "front"],
  // CNR base orientation = NW (arms on N+W). Other orientations come from rot.
  CNR: ["arm", "arm", "open", "open"],
  "L(LHF)": ["open", "back", "open", "front"],
  "L(RHF)": ["open", "back", "open", "front"],
  Console: ["open", "open", "open", "open"],
  STOOL: ["open", "open", "open", "open"],
  // Whole-unit presets — both end arms (self-closing).
  "1S": ["arm", "back", "arm", "front"],
  "2S": ["arm", "back", "arm", "front"],
  "3S": ["arm", "back", "arm", "front"],
  // Functional 1-seater variants mirror their base 1A arm side.
  "1A(P)(LHF)": ["arm", "back", "open", "front"],
  "1A(P)(RHF)": ["open", "back", "arm", "front"],
  "1A(R)(LHF)": ["arm", "back", "open", "front"],
  "1A(R)(RHF)": ["open", "back", "arm", "front"],
  "1A(L)(LHF)": ["arm", "back", "open", "front"],
  "1A(L)(RHF)": ["open", "back", "arm", "front"],
  "1NA(P)": ["open", "back", "open", "front"],
  "1NA(R)": ["open", "back", "open", "front"],
  "1NA(L)": ["open", "back", "open", "front"],
  "1S(P)": ["arm", "back", "arm", "front"],
  "1S(R)": ["arm", "back", "arm", "front"],
  "1S(L)": ["arm", "back", "arm", "front"],
};

/** Clockwise 90° shifts [W,N,E,S] → [S,W,N,E]. */
const rotateEdges = (edges: EdgeType[], rot: Rot): EdgeType[] => {
  const r = ((rot % 360) + 360) % 360;
  const turns = r / 90;
  const out = edges.slice();
  for (let i = 0; i < turns; i++) out.unshift(out.pop()!);
  return out;
};

export const cellEdges = (cell: GeoCell): EdgeType[] => {
  // Structural fallback: a renamed code that kept its family + orientation
  // tokens derives its arm sides from the family representative.
  let base: [EdgeType, EdgeType, EdgeType, EdgeType] | undefined =
    MODULE_EDGES_BASE[cell.moduleCode];
  if (!base) {
    const s = parseCompartmentStructure(cell.moduleCode);
    const rep = s ? familyRepresentative(s) : undefined;
    base = rep ? MODULE_EDGES_BASE[rep] : undefined;
  }
  if (!base) return ["open", "open", "open", "open"];
  return rotateEdges(base, cell.rot);
};

/** The OUTER cap edge of an L-Shape chaise — the short end AWAY from the main
 *  sofa where the standalone chaise art bakes in its arm. Returns -1 for any
 *  non-L module. CW rotation shifts the edge index +1 per 90°. */
export const lCapEdgeOf = (moduleCode: string, rot: Rot): EdgeIdx | -1 => {
  if (!moduleCode.startsWith("L(")) return -1;
  const baseCap: EdgeIdx = moduleCode === "L(RHF)" ? EDGE_E : EDGE_W;
  const steps = ((((rot % 360) + 360) % 360) / 90) as number;
  return ((baseCap + steps) % 4) as EdgeIdx;
};

/* ─── Footprint + bbox ─────────────────────────────────────────────────── */

// Plan-view length grows with seat depth: 2.5cm per inch per cushion, anchored
// on the 24″ baseline (24→0, 28→+10, 30→+15, 32→+20). Non-numeric/below-baseline → 0.
const widthOffsetPerCushion = (depth: Depth): number => {
  const inch = parseInt(depth, 10);
  return Number.isFinite(inch) ? Math.max(0, (inch - 24) * 2.5) : 0;
};

export const moduleFootprint = (
  m: { w: number; d: number; cushions: number },
  rot: Rot,
  depth: Depth,
): { w: number; h: number } => {
  const w = m.w + widthOffsetPerCushion(depth) * m.cushions;
  const h = m.d;
  return rot % 180 === 0 ? { w, h } : { w: h, h: w };
};

export interface Bbox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A cell's bbox, or null for a truly-unknown module (faithful to 2990s; every
 *  consumer here handles null by skipping). For a crash-proof render box use
 *  `cellRenderBox`. */
export const cellBbox = (cell: GeoCell, depth: Depth): Bbox | null => {
  const m = findModule(cell.moduleCode);
  if (!m) return null;
  const fp = moduleFootprint(m, cell.rot, depth);
  return { x: cell.x, y: cell.y, w: fp.w, h: fp.h };
};

let warnedUnknownBox = false;
/** A cell's bbox that NEVER returns null — an unknown/unparseable code falls back
 *  to the 95×95 DEFAULT_FOOTPRINT (+ a one-time console.warn). The visual builder
 *  uses this for placement/rendering so bad/renamed catalog data can't crash it. */
export const cellRenderBox = (cell: GeoCell, depth: Depth): Bbox => {
  const m = findModule(cell.moduleCode);
  if (!m) {
    if (!warnedUnknownBox) {
      // eslint-disable-next-line no-console
      console.warn(
        `[sofa-geometry] unknown compartment code "${cell.moduleCode}" — using a 95×95 default box.`,
      );
      warnedUnknownBox = true;
    }
    const fp = moduleFootprint(DEFAULT_FOOTPRINT, cell.rot, depth);
    return { x: cell.x, y: cell.y, w: fp.w, h: fp.h };
  }
  const fp = moduleFootprint(m, cell.rot, depth);
  return { x: cell.x, y: cell.y, w: fp.w, h: fp.h };
};

export const cellsBbox = (cells: GeoCell[], depth: Depth): Bbox | null => {
  if (cells.length === 0) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const c of cells) {
    const b = cellBbox(c, depth);
    if (!b) continue;
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.w > maxX) maxX = b.x + b.w;
    if (b.y + b.h > maxY) maxY = b.y + b.h;
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
};

/** Translate a layout so its bbox is centered within a `w`×`h` area. Pure
 *  translation — relative geometry / grouping / pricing / order all unchanged.
 *  Returns the cells unchanged when there's no measurable footprint. */
export const centerCellsWithin = (cells: GeoCell[], depth: Depth, w: number, h: number): GeoCell[] => {
  const bb = cellsBbox(cells, depth);
  if (!bb) return cells;
  const dx = w / 2 - bb.w / 2 - bb.x;
  const dy = h / 2 - bb.h / 2 - bb.y;
  return cells.map((c) => ({ ...c, x: c.x + dx, y: c.y + dy }));
};

/** The plan-view room is 600×480cm (matches the 2990s CustomBuilder stage). */
export const ROOM_W = 600;
export const ROOM_H = 480;

/** Center a layout in the default 600×480 room. */
export const centerCellsInRoom = (cells: GeoCell[], depth: Depth): GeoCell[] =>
  centerCellsWithin(cells, depth, ROOM_W, ROOM_H);

/* ─── Adjacency + grouping ─────────────────────────────────────────────── */

export const CONTACT_TOL = 2; // cm — anything closer than this counts as touching.

interface EdgePair {
  edgeA: EdgeIdx;
  edgeB: EdgeIdx;
}

export const edgeContacts = (a: GeoCell, b: GeoCell, depth: Depth): EdgePair[] => {
  const ba = cellBbox(a, depth);
  const bb = cellBbox(b, depth);
  if (!ba || !bb) return [];
  const out: EdgePair[] = [];
  // a's right edge ↔ b's left edge
  if (Math.abs(ba.x + ba.w - bb.x) <= CONTACT_TOL) {
    const yOv = Math.min(ba.y + ba.h, bb.y + bb.h) - Math.max(ba.y, bb.y);
    if (yOv > CONTACT_TOL) out.push({ edgeA: EDGE_E, edgeB: EDGE_W });
  }
  if (Math.abs(ba.x - (bb.x + bb.w)) <= CONTACT_TOL) {
    const yOv = Math.min(ba.y + ba.h, bb.y + bb.h) - Math.max(ba.y, bb.y);
    if (yOv > CONTACT_TOL) out.push({ edgeA: EDGE_W, edgeB: EDGE_E });
  }
  if (Math.abs(ba.y + ba.h - bb.y) <= CONTACT_TOL) {
    const xOv = Math.min(ba.x + ba.w, bb.x + bb.w) - Math.max(ba.x, bb.x);
    if (xOv > CONTACT_TOL) out.push({ edgeA: EDGE_S, edgeB: EDGE_N });
  }
  if (Math.abs(ba.y - (bb.y + bb.h)) <= CONTACT_TOL) {
    const xOv = Math.min(ba.x + ba.w, bb.x + bb.w) - Math.max(ba.x, bb.x);
    if (xOv > CONTACT_TOL) out.push({ edgeA: EDGE_N, edgeB: EDGE_S });
  }
  return out;
};

/** Two cells form ONE sofa only when they share a contact along a *connectable*
 *  edge — a SIDE ('arm' or 'open'). FRONT (seating) and BACK (backrest) faces
 *  have no panel to attach to, so front-to-anything / back-to-back pairs are
 *  separate sofas. */
const hasConnectingContact = (a: GeoCell, b: GeoCell, depth: Depth): boolean => {
  const contacts = edgeContacts(a, b, depth);
  if (contacts.length === 0) return false;
  const ea = cellEdges(a);
  const eb = cellEdges(b);
  const connectable = (t: EdgeType | undefined): boolean => t === "arm" || t === "open";
  return contacts.some(({ edgeA, edgeB }) => connectable(ea[edgeA]) && connectable(eb[edgeB]));
};

/** Union-find by edge contact. Returns an array of cell groups (each its own sofa). */
export const groupSofas = (cells: GeoCell[], depth: Depth): GeoCell[][] => {
  if (cells.length === 0) return [];
  const parent: number[] = cells.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a),
      rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const ci = cells[i],
        cj = cells[j];
      if (!ci || !cj) continue;
      if (hasConnectingContact(ci, cj, depth)) union(i, j);
    }
  }
  const groups = new Map<number, GeoCell[]>();
  cells.forEach((c, idx) => {
    const root = find(idx);
    const arr = groups.get(root) ?? [];
    arr.push(c);
    groups.set(root, arr);
  });
  return Array.from(groups.values());
};

/* ─── Left-to-right cell order (explode order) ─────────────────────────── */

/**
 * Canonical LEFT-TO-RIGHT order of a build's cells — they read like the customer
 * facing the sofa (leftmost arm → rightmost arm). An L/U build is WALKED along
 * its connected chain. Degraded inputs (branch/cycle, free-standing, unknown
 * module) fall back to a stable (x, y) reading order — never invents an order.
 */
export const orderSofaCellsLeftToRight = (cells: GeoCell[], depth: Depth): GeoCell[] => {
  if (cells.length <= 1) return cells.slice();
  const boxes = new Map<GeoCell, Bbox>();
  for (const c of cells) {
    if (typeof c.moduleCode !== "string" || !Number.isFinite(c.x) || !Number.isFinite(c.y)) {
      return cells.slice();
    }
    const b = cellBbox(c, depth);
    if (!b) return cells.slice(); // unknown module — keep the stored order
    boxes.set(c, b);
  }
  const inputIdx = new Map<GeoCell, number>(cells.map((c, i) => [c, i]));
  const centreX = (c: GeoCell): number => {
    const b = boxes.get(c)!;
    return b.x + b.w / 2;
  };
  const centreY = (c: GeoCell): number => {
    const b = boxes.get(c)!;
    return b.y + b.h / 2;
  };

  const readingSort = (group: GeoCell[]): GeoCell[] =>
    [...group].sort(
      (a, b) =>
        boxes.get(a)!.x - boxes.get(b)!.x ||
        boxes.get(a)!.y - boxes.get(b)!.y ||
        inputIdx.get(a)! - inputIdx.get(b)!,
    );

  const orderGroup = (group: GeoCell[]): GeoCell[] => {
    if (group.length <= 1) return group;
    const adj: number[][] = group.map(() => []);
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (hasConnectingContact(group[i]!, group[j]!, depth)) {
          adj[i]!.push(j);
          adj[j]!.push(i);
        }
      }
    }
    const ends = adj.flatMap((n, i) => (n.length <= 1 ? [i] : []));
    const isChain = adj.every((n) => n.length <= 2) && ends.length === 2;
    if (!isChain) return readingSort(group);
    const [a, b] = ends as [number, number];
    const handOf = (i: number): "LHF" | "RHF" | null =>
      parseCompartmentStructure(group[i]!.moduleCode)?.orientation ?? null;
    const handA = handOf(a);
    const handB = handOf(b);
    const X_TIE = 1; // cm — same column ⇒ decide by code hand, then height
    const dx = centreX(group[a]!) - centreX(group[b]!);
    let start: number;
    if (handA === "LHF" && handB === "RHF") start = a;
    else if (handB === "LHF" && handA === "RHF") start = b;
    else if (Math.abs(dx) > X_TIE) start = dx < 0 ? a : b;
    else if (handA === "LHF" && handB !== "LHF") start = a;
    else if (handB === "LHF" && handA !== "LHF") start = b;
    else start = centreY(group[a]!) <= centreY(group[b]!) ? a : b;
    const out: GeoCell[] = [];
    const seen = new Set<number>();
    let cur: number | undefined = start;
    while (cur !== undefined) {
      seen.add(cur);
      out.push(group[cur]!);
      cur = adj[cur]!.find((n) => !seen.has(n));
    }
    return out.length === group.length ? out : readingSort(group);
  };

  return groupSofas(cells, depth)
    .map((g) => ({ g, b: cellsBbox(g, depth)! }))
    .sort(
      (A, B) =>
        A.b.x - B.b.x || A.b.y - B.b.y || inputIdx.get(A.g[0]!)! - inputIdx.get(B.g[0]!)!,
    )
    .flatMap(({ g }) => orderGroup(g));
};

/* ─── Snap math (drag UI) ──────────────────────────────────────────────── */

/** Threshold in cm — drag releases snap to a neighbour edge if within this. */
export const SNAP_CM = 20;

export interface SnapDelta {
  dx: number;
  dy: number;
}

/**
 * Best-effort drag snap: given a candidate bbox (where the dragged cell would
 * land raw) and the rest of the cells, compute a (dx, dy) shift that aligns the
 * dragged cell's edges to the nearest neighbour within `SNAP_CM`. Returns {0,0}
 * when nothing is close enough. The X-axis snap only fires when the cells
 * overlap on Y (snapping a horizontal seam, not past a remote piece); mirrored
 * on Y. Four edge-alignment candidates per axis (abut + flush).
 *
 * Magnet-parallel pass (Loo 2026-07-06; v2 extension over the 2990s port):
 * once the snapped drop ABUTS a neighbour on a side, the pieces must sit
 * FLUSH — the perpendicular axis aligns to the neighbour's nearest edge even
 * beyond SNAP_CM. Side-by-side modules bolt parallel; a stepped seam is never
 * a valid assembly. The correction is bounded by the pieces' overlap, so it
 * nudges into alignment — never flings the module.
 */
export const findSnap = (
  draggedBbox: Bbox,
  otherCells: GeoCell[],
  ignoreId: string | undefined,
  depth: Depth,
): SnapDelta => {
  let bestDx = 0,
    bestDy = 0;
  let bestX = SNAP_CM,
    bestY = SNAP_CM;
  const ax1 = draggedBbox.x,
    ax2 = draggedBbox.x + draggedBbox.w;
  const ay1 = draggedBbox.y,
    ay2 = draggedBbox.y + draggedBbox.h;

  for (const c of otherCells) {
    if (ignoreId !== undefined && c.id === ignoreId) continue;
    const b = cellBbox(c, depth);
    if (!b) continue;
    const bx1 = b.x,
      bx2 = b.x + b.w;
    const by1 = b.y,
      by2 = b.y + b.h;

    const yOverlap = Math.min(ay2, by2) - Math.max(ay1, by1);
    if (yOverlap > -SNAP_CM) {
      let d = bx1 - ax2;
      if (Math.abs(d) < bestX) {
        bestX = Math.abs(d);
        bestDx = d;
      }
      d = bx2 - ax1;
      if (Math.abs(d) < bestX) {
        bestX = Math.abs(d);
        bestDx = d;
      }
      d = bx1 - ax1;
      if (Math.abs(d) < bestX) {
        bestX = Math.abs(d);
        bestDx = d;
      }
      d = bx2 - ax2;
      if (Math.abs(d) < bestX) {
        bestX = Math.abs(d);
        bestDx = d;
      }
    }

    const xOverlap = Math.min(ax2, bx2) - Math.max(ax1, bx1);
    if (xOverlap > -SNAP_CM) {
      let d = by1 - ay2;
      if (Math.abs(d) < bestY) {
        bestY = Math.abs(d);
        bestDy = d;
      }
      d = by2 - ay1;
      if (Math.abs(d) < bestY) {
        bestY = Math.abs(d);
        bestDy = d;
      }
      d = by1 - ay1;
      if (Math.abs(d) < bestY) {
        bestY = Math.abs(d);
        bestDy = d;
      }
      d = by2 - ay2;
      if (Math.abs(d) < bestY) {
        bestY = Math.abs(d);
        bestDy = d;
      }
    }
  }

  let dx = bestX < SNAP_CM ? bestDx : 0;
  let dy = bestY < SNAP_CM ? bestDy : 0;

  // Magnet-parallel: at the SNAPPED position, find side-abutting neighbours
  // and align the perpendicular axis to the nearest edge (tops/bottoms for an
  // E/W seam, lefts/rights for an N/S seam). Smallest correction wins per axis.
  const nx1 = ax1 + dx,
    nx2 = ax2 + dx;
  const ny1 = ay1 + dy,
    ny2 = ay2 + dy;
  let alignX: number | null = null;
  let alignY: number | null = null;
  for (const c of otherCells) {
    if (ignoreId !== undefined && c.id === ignoreId) continue;
    const b = cellBbox(c, depth);
    if (!b) continue;
    const bx1 = b.x,
      bx2 = b.x + b.w;
    const by1 = b.y,
      by2 = b.y + b.h;
    const yOv = Math.min(ny2, by2) - Math.max(ny1, by1);
    if (
      (Math.abs(nx2 - bx1) <= CONTACT_TOL || Math.abs(nx1 - bx2) <= CONTACT_TOL) &&
      yOv > CONTACT_TOL
    ) {
      const dTop = by1 - ny1;
      const dBot = by2 - ny2;
      const fix = Math.abs(dTop) <= Math.abs(dBot) ? dTop : dBot;
      if (alignY === null || Math.abs(fix) < Math.abs(alignY)) alignY = fix;
    }
    const xOv = Math.min(nx2, bx2) - Math.max(nx1, bx1);
    if (
      (Math.abs(ny2 - by1) <= CONTACT_TOL || Math.abs(ny1 - by2) <= CONTACT_TOL) &&
      xOv > CONTACT_TOL
    ) {
      const dLeft = bx1 - nx1;
      const dRight = bx2 - nx2;
      const fix = Math.abs(dLeft) <= Math.abs(dRight) ? dLeft : dRight;
      if (alignX === null || Math.abs(fix) < Math.abs(alignX)) alignX = fix;
    }
  }
  if (alignY !== null) dy += alignY;
  if (alignX !== null) dx += alignX;

  return { dx, dy };
};

/* ─── Sofa analysis (closure / arm violations) ─────────────────────────── */

export type ViolationReason = "Arm-to-arm" | "Arm blocked by module";
export interface ArmViolation {
  aId: string;
  bId: string;
  reason: ViolationReason;
}

export type ClosureFailure =
  | "Arms colliding"
  | "No arms on either end"
  | "Left end has no arm"
  | "Right end has no arm"
  | "Top end has no arm"
  | "Bottom end has no arm"
  | "Console needs a sofa next to it";

export interface SofaAnalysis {
  violations: ArmViolation[];
  closed: boolean;
  reason: ClosureFailure | null;
  leftArm: boolean;
  rightArm: boolean;
  /** Cell ids (or synthetic keys) that participate in a violation — for the
   *  builder's red highlight. */
  violationCellIds: string[];
}

const cellKey = (c: GeoCell, idx: number): string => c.id ?? `__cell_${idx}`;

/**
 * Cheap pre-check used by the drop-to-mirror UI: would `cell` have any arm-
 * touching-anything contact with the rest of `allCells`?
 */
export const hasArmConflict = (cell: GeoCell, allCells: GeoCell[], depth: Depth): boolean => {
  const myEdges = cellEdges(cell);
  for (const other of allCells) {
    if (other === cell) continue;
    if (cell.id !== undefined && other.id === cell.id) continue;
    const cs = edgeContacts(cell, other, depth);
    if (!cs.length) continue;
    const oEdges = cellEdges(other);
    for (const { edgeA, edgeB } of cs) {
      const tA = myEdges[edgeA];
      const tB = oEdges[edgeB];
      if (tA === "arm" || tB === "arm") return true;
    }
  }
  return false;
};

/**
 * Validate one sofa group: collect arm-arm / arm-blocked-by-module violations,
 * decide closure (an arm at each end of the dominant axis, treating an L-module's
 * outer edge as a self-closing cap, and no exposed off-axis open cushion edge).
 */
export const analyzeSofa = (group: GeoCell[], depth: Depth): SofaAnalysis => {
  const violations: ArmViolation[] = [];
  const ids = group.map(cellKey);
  const contactsByCell: Record<
    string,
    { otherId: string; myEdge: EdgeIdx; myType: EdgeType; otherType: EdgeType }[]
  > = {};
  ids.forEach((id) => {
    contactsByCell[id] = [];
  });

  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const a = group[i]!;
      const b = group[j]!;
      const cs = edgeContacts(a, b, depth);
      if (!cs.length) continue;
      const aEdges = cellEdges(a);
      const bEdges = cellEdges(b);
      const aId = ids[i]!;
      const bId = ids[j]!;
      cs.forEach(({ edgeA, edgeB }) => {
        const tA = aEdges[edgeA]!;
        const tB = bEdges[edgeB]!;
        contactsByCell[aId]!.push({ otherId: bId, myEdge: edgeA, myType: tA, otherType: tB });
        contactsByCell[bId]!.push({ otherId: aId, myEdge: edgeB, myType: tB, otherType: tA });
        if (tA === "arm" && tB === "arm") {
          violations.push({ aId, bId, reason: "Arm-to-arm" });
        } else if (tA === "arm" || tB === "arm") {
          violations.push({ aId, bId, reason: "Arm blocked by module" });
        }
      });
    }
  }

  const outwardArms: { edge: EdgeIdx; lCap?: boolean }[] = [];
  const unclosedByDir: Record<EdgeIdx, boolean> = {
    [EDGE_W]: false,
    [EDGE_N]: false,
    [EDGE_E]: false,
    [EDGE_S]: false,
  };
  group.forEach((c, i) => {
    const id = ids[i]!;
    const edges = cellEdges(c);
    const myContacts = contactsByCell[id]!;
    const isL = c.moduleCode.startsWith("L(");
    const isAcc = isAccessoryModule(c.moduleCode);
    const lCapEdge = lCapEdgeOf(c.moduleCode, c.rot);

    ([EDGE_W, EDGE_N, EDGE_E, EDGE_S] as EdgeIdx[]).forEach((e) => {
      const hasNeighbour = myContacts.some((co) => co.myEdge === e);
      if (hasNeighbour) return;
      if (isL && e === lCapEdge) {
        outwardArms.push({ edge: e, lCap: true });
        return;
      }
      const t = edges[e];
      if (t === "arm") {
        outwardArms.push({ edge: e });
      } else if (t === "open" && !isAcc) {
        unclosedByDir[e] = true;
      }
    });
  });

  // Bounding box → dominant axis.
  let bbW = 0,
    bbH = 0;
  if (group.length > 0) {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const c of group) {
      const b = cellBbox(c, depth);
      if (!b) continue;
      if (b.x < minX) minX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.x + b.w > maxX) maxX = b.x + b.w;
      if (b.y + b.h > maxY) maxY = b.y + b.h;
    }
    if (Number.isFinite(minX)) {
      bbW = maxX - minX;
      bbH = maxY - minY;
    }
  }

  let headArm = false;
  let tailArm = false;
  if (group.length > 0) {
    const horizontalDominant = bbW >= bbH;
    if (horizontalDominant) {
      headArm = outwardArms.some((a) => a.edge === EDGE_W);
      tailArm = outwardArms.some((a) => a.edge === EDGE_E);
    } else {
      headArm = outwardArms.some((a) => a.edge === EDGE_N);
      tailArm = outwardArms.some((a) => a.edge === EDGE_S);
    }
  }

  const ends = headArm && tailArm;
  const hasUnclosedOpen =
    unclosedByDir[EDGE_W] || unclosedByDir[EDGE_N] || unclosedByDir[EDGE_E] || unclosedByDir[EDGE_S];
  let closed = violations.length === 0 && ends && !hasUnclosedOpen;
  let reason: ClosureFailure | null = null;
  if (violations.length > 0) reason = "Arms colliding";
  else if (!headArm && !tailArm) reason = "No arms on either end";
  else if (!headArm) reason = bbW >= bbH ? "Left end has no arm" : "Top end has no arm";
  else if (!tailArm) reason = bbW >= bbH ? "Right end has no arm" : "Bottom end has no arm";
  else if (hasUnclosedOpen) {
    if (unclosedByDir[EDGE_W]) reason = "Left end has no arm";
    else if (unclosedByDir[EDGE_E]) reason = "Right end has no arm";
    else if (unclosedByDir[EDGE_N]) reason = "Top end has no arm";
    else if (unclosedByDir[EDGE_S]) reason = "Bottom end has no arm";
  }

  const allAccessories = group.length > 0 && group.every((c) => isAccessoryModule(c.moduleCode));
  if (allAccessories) {
    // A stool / ottoman is free-standing; a Console must slot beside a sofa.
    const everyPieceStandsAlone = group.every((c) => c.moduleCode === "STOOL");
    closed = everyPieceStandsAlone;
    reason = everyPieceStandsAlone ? null : "Console needs a sofa next to it";
  }

  const violationCellIds = Array.from(new Set(violations.flatMap((v) => [v.aId, v.bId])));

  return { violations, closed, reason, leftArm: headArm, rightArm: tailArm, violationCellIds };
};
