import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { X, RotateCw, Trash2, Ungroup, Maximize2, Minimize2 } from "lucide-react";
import type {
  ProductModelDto,
  ProductSkuDto,
  SofaCompartmentDto,
  ModelSofaCompartmentDto,
  SofaComboDto,
  SofaFabricDto,
  FabricTierConfigDto,
  ModelFabricTierOverrideDto,
  GeoCell,
  Rot,
  FabricTierValue,
} from "@carres/shared";
import {
  SOFA_HEIGHTS,
  findModule,
  moduleFootprint,
  cellRenderBox,
  cellsBbox,
  groupSofas,
  analyzeSofa,
  findSnap,
  hasArmConflict,
  mirrorCode,
  reflowCellsForDepth,
  classifySofaCompartment,
  computeSofaPrice,
  resolveFabricDelta,
  ROOM_W,
  ROOM_H,
  type SofaBuild,
  type SofaPricingSnapshot,
} from "@carres/shared";
import CompartmentSilhouette from "./CompartmentSilhouette";
import ModulePaletteItem from "./ModulePaletteItem";
import { sellingFabricsFor, type SellingFabric } from "./selling-fabrics";
import { useSeriesFabric, FABRIC_KIV } from "./use-series-fabric";

/**
 * <SofaBuildCanvas> — the full-screen drag plan-view sofa builder (Phase 3,
 * sofa engine). A faithful rebuild of the 2990s `CustomBuilder` 3-pane shell
 * (left module palette · center room canvas · bottom price bar) in Tailwind +
 * shadcn primitives + v17 tokens, with ALL geometry/price math delegated to the
 * pure T1 (`@carres/shared` sofa-geometry) + P2 (`computeSofaPrice`) functions.
 *
 * The component stays THIN: state + native pointer wiring + render. Every
 * snap / clamp / group / closure / price decision is a pure-function call.
 *
 * Controlled overlay — Task 4 mounts it (portal/full-screen) and turns the
 * `onAddBuild` payload into a DraftLine. Recliner is out of scope (the geometry
 * cell keeps `recliners?` for forward-compat; no seat-toggle UI here).
 */

/** The payload emitted on "Add to cart" — Task 4 maps it to a DraftLine. */
export interface SofaBuildAddPayload {
  cells: { moduleCode: string; x: number; y: number; rot: Rot }[];
  height: string;
  fabricTier: FabricTierValue;
  fabricId: string | null;
  /** 0202-wiring — the master fabric code when the pick came from the Fabrics
   *  tab list (null for legacy per-model sofa_fabrics picks). */
  fabricCode: string | null;
  fabricName: string | null;
  /** 0202 series of the chosen master fabric (null for legacy / no pick). */
  fabricSeries: string | null;
  fabricSurcharge: number;
  /** True when the salesperson deferred fabric choice (KIV — customer to confirm). */
  fabricDeferred: boolean;
  /** 0201-wiring — the chosen sofa_leg_height pool value + its SERVER-shaped
   *  surcharge (computeSofaPrice legDelta; already inside `total`). */
  legHeight: string | null;
  legSurcharge: number;
  total: number;
  priceBasis: "combo" | "a_la_carte";
}


interface DragState {
  /** The primary cell id under the pointer. */
  id: string;
  pid: number;
  sx: number;
  sy: number;
  moved: boolean;
  /** Every cell id moving with this drag (solo = [id]). */
  group: { id: string; x: number; y: number }[];
}

let cellSeq = 0;
const nextCellId = (): string => `sc_${Date.now().toString(36)}_${(cellSeq++).toString(36)}`;

function fmtRM(n: number): string {
  return n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Palette group order — match the silhouette classifier's groups. */
const GROUP_ORDER = ["1-seater", "2-seater", "3-seater", "Corner", "L-Shape", "Accessory", "Other"];

export default function SofaBuildCanvas({
  model,
  // `skus` is part of the controlled contract (Task 4's representative-sku map)
  // but the canvas itself doesn't read them — left undestructured on purpose.
  compartmentPool,
  modelCompartments,
  sofaCombos,
  fabricTierConfig,
  fabricTierOverride,
  sofaFabrics,
  sellingFabrics,
  legHeightOptions,
  heights,
  heightValue,
  onHeightChange,
  onAddBuild,
  onLiveTotal,
  onCreateCombo,
  onCreateQuickPick,
  onClose,
  embedded = false,
  initialCells,
}: {
  model: ProductModelDto;
  /** The model's SKUs — reserved for Task 4's representative-sku DraftLine map
   *  (the canvas itself doesn't read them; kept in the controlled contract). */
  skus: ProductSkuDto[];
  /** The global compartment pool (0178). */
  compartmentPool: SofaCompartmentDto[];
  /** This model's offered compartments (already filtered to model.id). */
  modelCompartments: ModelSofaCompartmentDto[];
  /** Sofa combos in play (0179) — re-filtered to model.id inside. */
  sofaCombos: SofaComboDto[];
  /** Global fabric-tier delta config (0176). */
  fabricTierConfig?: FabricTierConfigDto | null;
  /** This model's fabric-tier delta override (0176). */
  fabricTierOverride?: ModelFabricTierOverrideDto | null;
  /** This model's fabrics (drives the fabric picker / tier). */
  sofaFabrics: SofaFabricDto[];
  /** 0202-wiring — the unified selling-fabric list (legacy per-model rows +
   *  the model's opted-in master fabrics). When absent, derived from
   *  `sofaFabrics` alone (legacy callers stay byte-identical). */
  sellingFabrics?: SellingFabric[];
  /** 0201-wiring — the sofa_leg_height pool rows this model offers (surcharge
   *  joins the drift-gated total via computeSofaPrice). Absent → no leg picker. */
  legHeightOptions?: Array<{ id: string; value: string; surcharge: number | null; active: boolean }>;
  /** 0201-wiring + 0204 — the ACTIVE Maintenance sofa sizes: the size picker's
   *  options AND the per-size à-la-carte price axis (prices_by_size keys off
   *  these exact values). Absent → the canonical SOFA_HEIGHTS fallback. */
  heights?: readonly string[];
  /** Optional CONTROLLED size (with `onHeightChange`) — lets the host page
   *  render its own size chips in the header driving the same state as the
   *  bottom-bar picker. Absent → the canvas keeps its internal size state. */
  heightValue?: string;
  onHeightChange?: (h: string) => void;
  onAddBuild: (payload: SofaBuildAddPayload) => void;
  /** Live engine-total feed (Loo 2026-07-10) — fires whenever the build
   *  reprices (cells / size / fabric / leg), `null` while the canvas is empty.
   *  Lets a host page mirror the canvas price in its own chrome. */
  onLiveTotal?: (total: number | null) => void;
  /** Principal-only: capture the CURRENT arrangement as a sofa combo. When
   *  provided, a "Create combo" button appears beside Add to cart (enabled once
   *  the build is a valid connected sofa). Absent → no button (dealer flow). */
  onCreateCombo?: (moduleCodes: string[]) => void;
  /** Principal-only (Loo 2026-07-07) — save the current build as a Quick Pick
   *  layout PRESET (no price; prices live when loaded). Renders a "Create quick
   *  pick" button beside "Create combo". Absent → no button (dealer flow). */
  onCreateQuickPick?: (moduleCodes: string[]) => void;
  onClose: () => void;
  /** POS-parity (sofa configure page) — render as a FILL panel inside a parent
   *  page (no fixed overlay, no own header; the page owns the chrome). The
   *  default portal-overlay mode is byte-identical to before. */
  embedded?: boolean;
  /** Pre-placed modules (a Quick Pick loaded onto the canvas). Read ONCE at
   *  mount — the parent remounts (key) to load a different pick. Ids are
   *  minted here so callers pass pure geometry. */
  initialCells?: Array<{ moduleCode: string; x: number; y: number; rot: Rot }>;
}) {
  /* ─── Catalog lookups ────────────────────────────────────────────── */

  const poolById = useMemo(
    () => new Map(compartmentPool.map((c) => [c.id, c])),
    [compartmentPool],
  );

  /** code → uploaded icon art (0178 icon_url) for the canvas cells. */
  const iconByCode = useMemo(
    () => new Map(compartmentPool.map((c) => [c.code, c.iconUrl ?? null])),
    [compartmentPool],
  );

  /** This model's OFFERED compartments (pool row + offered row), palette-grouped
   *  and price-resolved. Only offered compartments can be placed. */
  const palette = useMemo(() => {
    const rows = modelCompartments
      .map((mc) => {
        const pool = poolById.get(mc.compartmentId);
        if (!pool || !pool.active) return null;
        return { pool, offered: mc };
      })
      .filter((r): r is { pool: SofaCompartmentDto; offered: ModelSofaCompartmentDto } => r !== null)
      .sort((a, b) => a.offered.sortOrder - b.offered.sortOrder || a.pool.code.localeCompare(b.pool.code));
    const byGroup = new Map<string, typeof rows>();
    for (const r of rows) {
      const g = classifySofaCompartment(r.pool.code);
      const arr = byGroup.get(g) ?? [];
      arr.push(r);
      byGroup.set(g, arr);
    }
    return GROUP_ORDER.filter((g) => byGroup.has(g)).map((g) => ({ group: g, rows: byGroup.get(g)! }));
  }, [modelCompartments, poolById]);

  /* ─── Build state ────────────────────────────────────────────────── */

  const [cells, setCells] = useState<GeoCell[]>(() =>
    (initialCells ?? []).map((c) => ({ ...c, id: nextCellId() })),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Complete-sofa item selection (Loo 2026-07-06): clicking a CLOSED sofa
  // selects the WHOLE group (anchored by the clicked cell's id) and shows a
  // group toolbar — rotate-whole · Edit modules · delete-whole. "Edit modules"
  // opts the group's cells into per-module editing (select / rotate / delete /
  // drag one piece out) until the next empty-canvas click re-locks everything.
  const [groupAnchorId, setGroupAnchorId] = useState<string | null>(null);
  const [editModeIds, setEditModeIds] = useState<Set<string>>(new Set());
  // 0201-wiring + 0204 — the size axis follows the ACTIVE Maintenance sofa
  // sizes when the caller passes them (per-size prices key off those exact
  // values); legacy callers keep the full canonical axis.
  const heightChoices = useMemo<readonly string[]>(
    () => (heights && heights.length > 0 ? heights : SOFA_HEIGHTS),
    [heights],
  );
  // Size is optionally CONTROLLED (heightValue + onHeightChange) so the host
  // page can render its own size chips in the header (Loo 2026-07-06) — the
  // bottom-bar picker and the header chips then drive the same state.
  const [heightState, setHeightState] = useState<string>(
    heightChoices.includes("24") ? "24" : heightChoices[0]!,
  );
  const height = heightValue ?? heightState;
  const setHeight = (h: string) => {
    setHeightState(h);
    onHeightChange?.(h);
  };
  // 0202-wiring — one unified selling-fabric list (legacy per-model rows +
  // opted-in master fabrics); callers that don't pass it keep legacy rows only.
  const fabricChoices = useMemo<SellingFabric[]>(
    () => sellingFabrics ?? sellingFabricsFor(model, sofaFabrics, null),
    [sellingFabrics, model, sofaFabrics],
  );
  // Fabric Series → Colour with two-level KIV — the SAME hook the POS quick-pick
  // rail uses, so the two fabric pickers are identical (Loo 2026-07-06).
  const fab = useSeriesFabric(fabricChoices);
  // 0201-wiring — leg height ('' = confirm later / none).
  const [legHeight, setLegHeight] = useState<string>("");
  const legOpts = legHeightOptions ?? [];

  const depth = height; // seat-depth axis == the chosen height key (cm widening)

  // Seat-size change reflow (Loo 2026-07-06): modules widen/narrow with the
  // size, so a linked sofa's cells re-abut automatically — the complete sofa
  // grows as ONE piece instead of overlapping and breaking apart.
  const prevDepthRef = useRef(depth);
  useEffect(() => {
    const prev = prevDepthRef.current;
    if (prev === depth) return;
    prevDepthRef.current = depth;
    setCells((cs) => reflowCellsForDepth(cs, prev, depth));
  }, [depth]);
  // KIV (series or colour) → no concrete fabric → base tier; the sofa still adds
  // to cart, flagged for the customer to confirm the colour.
  const fabric = fab.fabric;
  const fabricDeferred = fab.deferred;
  const fabricTier: FabricTierValue = fabric?.tier ?? "PRICE_1";

  // Live drag override — carries the in-flight translation for the dragging
  // cell(s); `cells` state is untouched mid-drag (committed on pointer-up).
  const [draftDelta, setDraftDelta] = useState<{ ids: string[]; dx: number; dy: number } | null>(null);
  const dragRef = useRef<DragState | null>(null);

  /* ─── Room scale (fit the stage into the viewport) ───────────────── */

  // Expand room (2990s CustomBuilder parity, Loo 2026-07-06): 1× = the single-
  // sofa 600×480 room; 1.5× = 900×720 (2.25× the area) for laying out three
  // to four sofa sets. Same ratio, more floor — the fit-to-viewport transform
  // below re-fits automatically.
  const [roomScale, setRoomScale] = useState(1);
  const roomW = ROOM_W * roomScale;
  const roomH = ROOM_H * roomScale;

  const stageRef = useRef<HTMLDivElement | null>(null);
  const [visualScale, setVisualScale] = useState(1);
  const visualScaleRef = useRef(1);

  useEffect(() => {
    const el = stageRef.current?.parentElement;
    if (!el || typeof ResizeObserver === "undefined") return;
    const apply = (width: number, vpH: number) => {
      const s = Math.min(width / roomW, vpH / roomH, 1.4);
      const safe = Number.isFinite(s) && s > 0 ? s : 1;
      visualScaleRef.current = safe;
      setVisualScale(safe);
    };
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) apply(r.width, r.height);
    });
    ro.observe(el);
    apply(el.clientWidth, el.clientHeight);
    return () => ro.disconnect();
  }, [roomW, roomH]);

  /** Toggle 1× ↔ 1.5×; shrinking clamps any cell back inside the small room. */
  const toggleRoom = () => {
    setRoomScale((s) => {
      const next = s === 1 ? 1.5 : 1;
      if (next === 1) {
        setCells((prev) =>
          prev.map((c) => {
            const fp = moduleFootprint(
              findModule(c.moduleCode) ?? { w: 95, d: 95, cushions: 0 },
              c.rot,
              depth,
            );
            return {
              ...c,
              x: Math.max(0, Math.min(c.x, ROOM_W - fp.w)),
              y: Math.max(0, Math.min(c.y, ROOM_H - fp.h)),
            };
          }),
        );
      }
      return next;
    });
  };

  /* ─── Place / rotate / delete ────────────────────────────────────── */

  const addCell = useCallback(
    (code: string) => {
      const m = findModule(code);
      const fp = moduleFootprint(m ?? { w: 95, d: 95, cushions: 0 }, 0, depth);
      const id = nextCellId();
      setCells((prev) => [
        ...prev,
        { id, moduleCode: code, x: roomW / 2 - fp.w / 2, y: roomH / 2 - fp.h / 2, rot: 0 },
      ]);
      setSelectedId(id);
    },
    [depth, roomW, roomH],
  );

  const rotateCell = (id: string) => {
    setCells((prev) =>
      prev.map((c) => (c.id === id ? { ...c, rot: (((c.rot + 90) % 360) as Rot) } : c)),
    );
  };

  const removeCell = (id: string) => {
    setCells((prev) => prev.filter((c) => c.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  /** Rotate a whole CLOSED sofa 90° CW about its bbox centre — every cell
   *  turns and orbits together, then the group shifts back inside the room. */
  const rotateGroup = (group: GeoCell[]) => {
    const bb = cellsBbox(group, depth);
    if (!bb) return;
    const cx = bb.x + bb.w / 2;
    const cy = bb.y + bb.h / 2;
    // Rotated group bbox = w/h swapped about the same centre; clamp into room.
    const nbb = { x: cx - bb.h / 2, y: cy - bb.w / 2, w: bb.h, h: bb.w };
    const shiftX = nbb.x < 0 ? -nbb.x : nbb.x + nbb.w > roomW ? roomW - nbb.x - nbb.w : 0;
    const shiftY = nbb.y < 0 ? -nbb.y : nbb.y + nbb.h > roomH ? roomH - nbb.y - nbb.h : 0;
    const ids = new Set(group.map((g) => g.id));
    setCells((prev) =>
      prev.map((c) => {
        if (c.id == null || !ids.has(c.id)) return c;
        const fp = moduleFootprint(
          findModule(c.moduleCode) ?? { w: 95, d: 95, cushions: 0 },
          c.rot,
          depth,
        );
        const dx = c.x + fp.w / 2 - cx;
        const dy = c.y + fp.h / 2 - cy;
        // 90° CW about the centre: (dx, dy) → (-dy, dx); footprint w/h swap.
        return {
          ...c,
          rot: ((c.rot + 90) % 360) as Rot,
          x: cx - dy - fp.h / 2 + shiftX,
          y: cy + dx - fp.w / 2 + shiftY,
        };
      }),
    );
  };

  const removeGroup = (group: GeoCell[]) => {
    const ids = new Set(group.map((g) => g.id));
    setCells((prev) => prev.filter((c) => c.id == null || !ids.has(c.id)));
    setGroupAnchorId(null);
  };

  /* ─── Drag (native pointer-capture) ──────────────────────────────── */

  const onCellPointerDown = (id: string, e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-cell-tool]")) return; // let tool buttons work
    const cell = cells.find((c) => c.id === id);
    if (!cell) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* jsdom / unsupported — drag still works via move/up on the same element */
    }
    // Complete-sofa lock (2990s parity, Loo 2026-07-06): a CLOSED sofa is ONE
    // item — grabbing any cell selects + drags the WHOLE group, unless the
    // user opened it via "Edit modules" (then cells select/drag individually).
    const analysis = analyses.find((a) => a.group.some((g) => g.id === id));
    const wholeItem =
      !!analysis && analysis.closed && analysis.group.length > 1 && !editModeIds.has(id);
    if (wholeItem) {
      setSelectedId(null);
      setGroupAnchorId(id);
    } else {
      setSelectedId(id);
      setGroupAnchorId(null);
    }
    const group = wholeItem
      ? analysis.group
          .filter((g): g is GeoCell & { id: string } => g.id != null)
          .map((g) => ({ id: g.id, x: g.x, y: g.y }))
      : [{ id, x: cell.x, y: cell.y }];
    dragRef.current = {
      id,
      pid: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      moved: false,
      group,
    };
  };

  const onCellPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = dragRef.current;
    if (!s) return;
    const vs = visualScaleRef.current || 1;
    const dx = (e.clientX - s.sx) / vs;
    const dy = (e.clientY - s.sy) / vs;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) s.moved = true;
    setDraftDelta({ ids: s.group.map((g) => g.id), dx, dy });
  };

  const onCellPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = dragRef.current;
    if (!s) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(s.pid);
    } catch {
      /* swallow */
    }
    const delta = draftDelta;
    setDraftDelta(null);
    if (!delta || !s.moved) return;

    // Whole-sofa drag (closed group): snap + clamp by the group's collective
    // bbox, then translate every member by the same delta. No auto-mirror —
    // that's a single-piece placement affordance.
    if (s.group.length > 1) {
      const ids = new Set(s.group.map((g) => g.id));
      const members = cells.filter((c) => c.id != null && ids.has(c.id));
      const bb = cellsBbox(members, depth);
      if (!bb) return;
      const others = cells.filter((c) => c.id == null || !ids.has(c.id));
      const snap = findSnap(
        { x: bb.x + delta.dx, y: bb.y + delta.dy, w: bb.w, h: bb.h },
        others,
        undefined,
        depth,
      );
      let fdx = delta.dx + snap.dx;
      let fdy = delta.dy + snap.dy;
      fdx = Math.max(-bb.x, Math.min(fdx, roomW - bb.w - bb.x));
      fdy = Math.max(-bb.y, Math.min(fdy, roomH - bb.h - bb.y));
      setCells((prev) =>
        prev.map((c) =>
          c.id != null && ids.has(c.id) ? { ...c, x: c.x + fdx, y: c.y + fdy } : c,
        ),
      );
      return;
    }

    const primary = s.group[0]!;
    const cell = cells.find((c) => c.id === primary.id);
    if (!cell) return;
    const fp = moduleFootprint(
      findModule(cell.moduleCode) ?? { w: 95, d: 95, cushions: 0 },
      cell.rot,
      depth,
    );
    const draftX = primary.x + delta.dx;
    const draftY = primary.y + delta.dy;
    const snap = findSnap({ x: draftX, y: draftY, w: fp.w, h: fp.h }, cells, primary.id, depth);
    let finalX = draftX + snap.dx;
    let finalY = draftY + snap.dy;
    finalX = Math.max(0, Math.min(finalX, roomW - fp.w));
    finalY = Math.max(0, Math.min(finalY, roomH - fp.h));

    // Auto-mirror on arm-conflict: if the placed cell has an arm touching a
    // neighbour but its mirror code resolves the conflict, swap LHF↔RHF.
    let flippedCode: string | null = null;
    const mirrored = mirrorCode(cell.moduleCode);
    if (mirrored !== cell.moduleCode) {
      const placed = cells.map((c) =>
        c.id === primary.id ? { ...c, x: finalX, y: finalY } : c,
      );
      const cur = placed.find((c) => c.id === primary.id)!;
      if (
        hasArmConflict(cur, placed, depth) &&
        !hasArmConflict({ ...cur, moduleCode: mirrored }, placed, depth)
      ) {
        flippedCode = mirrored;
      }
    }

    setCells((prev) =>
      prev.map((c) =>
        c.id === primary.id
          ? { ...c, x: finalX, y: finalY, ...(flippedCode ? { moduleCode: flippedCode } : null) }
          : c,
      ),
    );
  };

  /* ─── Display cells (apply the live drag override) ───────────────── */

  const displayCells = useMemo(() => {
    if (!draftDelta) return cells;
    const ids = new Set(draftDelta.ids);
    return cells.map((c) =>
      c.id != null && ids.has(c.id) ? { ...c, x: c.x + draftDelta.dx, y: c.y + draftDelta.dy } : c,
    );
  }, [cells, draftDelta]);

  /* ─── Grouping + closure analysis (track the live drag) ──────────── */

  const groups = useMemo(() => groupSofas(displayCells, depth), [displayCells, depth]);
  const analyses = useMemo(
    () => groups.map((g) => ({ group: g, ...analyzeSofa(g, depth) })),
    [groups, depth],
  );
  const violationIds = useMemo(() => {
    const set = new Set<string>();
    analyses.forEach((a) => a.violationCellIds.forEach((id) => set.add(id)));
    return set;
  }, [analyses]);

  /* ─── Live price (computeSofaPrice — pure P2) ────────────────────── */

  const snapshot: SofaPricingSnapshot = useMemo(
    () => ({
      compartmentPool,
      modelCompartments,
      sofaCombos: sofaCombos.filter((c) => c.modelId === model.id),
      fabricTierOverride: fabricTierOverride ?? null,
      fabricTierConfig: fabricTierConfig ?? null,
      // 0201-wiring — the leg surcharge joins the engine total (drift-safe).
      legHeightPool: legOpts.map((o) => ({
        value: o.value,
        surcharge: o.surcharge,
        active: o.active,
      })),
    }),
    [compartmentPool, modelCompartments, sofaCombos, model.id, fabricTierOverride, fabricTierConfig, legOpts],
  );

  const priceResult = useMemo(() => {
    const build: SofaBuild = {
      modelId: model.id,
      cells: cells.map((c) => ({ moduleCode: c.moduleCode, x: c.x, y: c.y, rot: c.rot })),
      fabricTier,
      height,
      legHeight: legHeight || null,
    };
    return computeSofaPrice(build, snapshot);
  }, [cells, model.id, fabricTier, height, legHeight, snapshot]);

  // Mirror the live total up to the host (POS header) — null while the canvas
  // is empty so the host shows a placeholder instead of RM 0.
  useEffect(() => {
    onLiveTotal?.(cells.length > 0 ? priceResult.total : null);
  }, [onLiveTotal, cells.length, priceResult.total]);

  // Cell indices the winning combo consumed → flame badge on those cells.
  const matchedCellIds = useMemo(() => {
    if (priceResult.basis !== "combo" || !priceResult.matchedCellIndices) return new Set<string>();
    const set = new Set<string>();
    priceResult.matchedCellIndices.forEach((i) => {
      const c = cells[i];
      if (c?.id) set.add(c.id);
    });
    return set;
  }, [priceResult, cells]);

  /* ─── Add-to-cart gate ───────────────────────────────────────────── */

  const blocker: string | null = useMemo(() => {
    if (cells.length === 0) return "Add modules to start";
    const open = analyses.find((a) => !a.closed);
    if (open) return `Resolve · ${open.reason ?? "not closed"}`;
    return null;
  }, [cells.length, analyses]);

  const canAdd = blocker === null;

  const handleAdd = () => {
    if (!canAdd) return;
    onAddBuild({
      cells: cells.map((c) => ({ moduleCode: c.moduleCode, x: c.x, y: c.y, rot: c.rot })),
      height,
      fabricTier,
      fabricId: fabric?.id ?? null,
      fabricCode: fabric?.code ?? null,
      fabricName: fabric?.name ?? null,
      // The series is recorded even when the colour is still KIV.
      fabricSeries: fab.fabricSeries,
      fabricSurcharge: priceResult.fabricDelta,
      fabricDeferred,
      legHeight: legHeight || null,
      legSurcharge: priceResult.legDelta,
      total: priceResult.total,
      priceBasis: priceResult.basis,
    });
  };

  const comboSavings =
    priceResult.basis === "combo" &&
    priceResult.comboSubsetSum != null &&
    priceResult.comboPrice != null
      ? Math.max(0, priceResult.comboSubsetSum - priceResult.comboPrice)
      : 0;

  /* ─── Render ─────────────────────────────────────────────────────── */

  return (
    <div
      className={
        // pos-proto on the standalone overlay so the design tokens resolve
        // when the builder mounts outside the POS shell (drawer path).
        embedded
          ? "relative flex h-full min-h-0 flex-col"
          : "pos-proto fixed inset-0 z-50 flex flex-col"
      }
      style={{ background: "var(--pos-bg, #F5F3F0)" }}
      data-testid="sofa-build-canvas"
      role={embedded ? undefined : "dialog"}
      aria-label={`Build a sofa — ${model.name}`}
    >
      {/* Header — the embedding page owns the chrome, so skip it there. */}
      {!embedded && (
        <header className="flex shrink-0 items-center justify-between border-b border-base-200 bg-white px-5 py-3">
          <div className="min-w-0">
            <div className="t-micro text-base-400">Build your sofa</div>
            <h2 className="t-h3 truncate text-base-900">{model.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost flex h-9 w-9 items-center justify-center"
            aria-label="Close builder"
            data-testid="sofa-build-close"
          >
            <X size={18} />
          </button>
        </header>
      )}

      {/* Body: palette | room */}
      <div className="flex min-h-0 flex-1">
        {/* Left palette */}
        <aside
          className="hidden w-64 shrink-0 flex-col overflow-y-auto p-3 md:flex"
          style={{ borderRight: "1px solid var(--line)", background: "var(--pos-panel, #fff)" }}
          data-testid="sofa-build-palette"
        >
          {palette.length === 0 && (
            <p className="t-small text-base-500">This model has no offered compartments.</p>
          )}
          {palette.map(({ group, rows }) => (
            <div key={group} className="mb-4">
              <div className="pos-eyebrow mb-1.5" style={{ fontSize: 10 }}>{group}</div>
              <div className="flex flex-col gap-2">
                {rows.map(({ pool, offered }) => (
                  <ModulePaletteItem
                    key={pool.id}
                    compartment={pool}
                    offered={offered}
                    size={height}
                    onAdd={addCell}
                  />
                ))}
              </div>
            </div>
          ))}
        </aside>

        {/* Center room */}
        <main
          className="relative flex min-w-0 flex-1 items-center justify-center overflow-hidden p-4"
          onPointerDown={(e) => {
            // 2990s parity (CustomBuilder stage onPointerDown): a click on
            // EMPTY canvas — the room itself or the space around it —
            // deselects, dismissing the floating rotate/delete tools (Loo
            // 2026-07-06 — they blocked the view). Clicks on cells/tools
            // target their own elements, so this never fires for them; the
            // grid overlay is pointer-events:none, so empty-room clicks
            // target the room div itself.
            if (e.target === e.currentTarget || e.target === stageRef.current) {
              setSelectedId(null);
              setGroupAnchorId(null);
              setEditModeIds(new Set()); // re-lock any "Edit modules" groups
            }
          }}
        >
          {/* Expand room — 2990s parity: 1× single-sofa ↔ 1.5× multi-sofa floor */}
          <button
            type="button"
            onClick={toggleRoom}
            className="absolute right-4 top-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-base-300 bg-white px-3 py-1.5 t-tiny font-medium text-base-600 shadow-sm hover:text-base-900"
            title={
              roomScale === 1
                ? "Expand room (lay out multiple sofas)"
                : "Reset to single-sofa room"
            }
            data-testid="sofa-room-expand"
          >
            {roomScale === 1 ? (
              <>
                <Maximize2 size={13} strokeWidth={1.75} /> Expand room
              </>
            ) : (
              <>
                <Minimize2 size={13} strokeWidth={1.75} /> Reset room
              </>
            )}
          </button>
          <div
            ref={stageRef}
            className="sof-cv__room"
            style={{
              width: roomW,
              height: roomH,
              transform: `scale(${visualScale})`,
              transformOrigin: "center center",
              overflow: "visible",
              border: "1px solid var(--line-strong)",
              borderRadius: 6,
            }}
            data-testid="sofa-build-room"
          >
            {/* 50×50 cm design grid + its corner legend */}
            <div className="sof-cv__grid" style={{ backgroundSize: "50px 50px" }} />
            <div className="sof-cv__gridLegend" style={{ pointerEvents: "none" }}>
              <div
                className="sof-cv__gridLegendSwatch"
                style={{ width: 18, height: 18 }}
              />
              <div className="sof-cv__gridLegendText">
                <span className="sof-cv__gridLegendLabel">Grid</span>
                <span className="sof-cv__gridLegendValue">50 × 50 cm</span>
              </div>
            </div>
            {/* connected-sofa outlines + dimension callouts. 2990s parity
                (CustomBuilder :1338 + Loo 2026-07-06 screenshot): only a
                CLOSED sofa earns a group outline — unjoined/incomplete pieces
                render clean (dims only), no red ring and no per-group caption.
                The closure reason lives in ONE place: the Add button's
                "Resolve · …" label. Arm collisions still paint the cell red
                via CompartmentSilhouette's violation prop. */}
            {analyses.map((a, gi) => {
              const bb = cellsBbox(a.group, depth);
              if (!bb) return null;
              const isSelectedGroup =
                groupAnchorId != null &&
                a.closed &&
                a.group.length > 1 &&
                a.group.some((g) => g.id === groupAnchorId);
              return (
                <div key={`g${gi}`}>
                  {a.closed && (
                    <div
                      className="pointer-events-none absolute rounded-[6px] border-2 border-primary/40"
                      style={{ left: bb.x - 6, top: bb.y - 6, width: bb.w + 12, height: bb.h + 12 }}
                      data-testid="sofa-group-outline"
                    />
                  )}
                  {/* Complete-sofa toolbar — the whole item rotates / unlocks /
                      deletes; "Edit modules" opens per-module editing. */}
                  {isSelectedGroup && (
                    <div
                      className="sof-cv__tools"
                      style={{ left: bb.x + bb.w / 2, top: bb.y - 44 }}
                      onPointerDown={(e) => e.stopPropagation()}
                      data-cell-tool
                      data-testid="sofa-group-tools"
                    >
                      <button
                        type="button"
                        data-cell-tool
                        onClick={() => rotateGroup(a.group)}
                        className="sof-cv__btn"
                        aria-label="Rotate sofa"
                        title="Rotate the whole sofa 90° CW"
                        data-testid="sofa-group-rotate"
                      >
                        <RotateCw size={13} />
                      </button>
                      <button
                        type="button"
                        data-cell-tool
                        onClick={() => {
                          setEditModeIds((prev) => {
                            const next = new Set(prev);
                            a.group.forEach((g) => {
                              if (g.id != null) next.add(g.id);
                            });
                            return next;
                          });
                          setGroupAnchorId(null);
                        }}
                        className="sof-cv__btn"
                        style={{ width: "auto", padding: "0 10px", gap: 5 }}
                        aria-label="Edit modules"
                        title="Unlock — select / move / rotate the modules individually"
                        data-testid="sofa-group-edit"
                      >
                        <Ungroup size={13} />
                        <span className="t-tiny font-medium">Edit modules</span>
                      </button>
                      <button
                        type="button"
                        data-cell-tool
                        onClick={() => removeGroup(a.group)}
                        className="sof-cv__btn sof-cv__btn--del"
                        aria-label="Delete sofa"
                        title="Remove the whole sofa"
                        data-testid="sofa-group-delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                  {/* width callout (top) — design tick · line · boxed label */}
                  <div
                    className="sof-cv__dim sof-cv__dim--top"
                    style={{ left: bb.x, top: bb.y - 26, width: bb.w }}
                  >
                    <span className="sof-cv__dim__tick sof-cv__dim__tick--l" />
                    <span className="sof-cv__dim__line" />
                    <span className="sof-cv__dim__label" style={{ left: "50%" }}>
                      {Math.round(bb.w)}
                      <span className="sof-cv__dim__unit">cm</span>
                    </span>
                    <span className="sof-cv__dim__tick sof-cv__dim__tick--r" />
                  </div>
                  {/* depth callout (right) */}
                  <div
                    className="sof-cv__dim sof-cv__dim--right"
                    style={{ left: bb.x + bb.w + 8, top: bb.y, height: bb.h }}
                  >
                    <span className="sof-cv__dim__tick sof-cv__dim__tick--t" />
                    <span className="sof-cv__dim__line sof-cv__dim__line--v" />
                    <span className="sof-cv__dim__label sof-cv__dim__label--v" style={{ top: "50%" }}>
                      {Math.round(bb.h)}
                      <span className="sof-cv__dim__unit">cm</span>
                    </span>
                    <span className="sof-cv__dim__tick sof-cv__dim__tick--b" />
                  </div>
                </div>
              );
            })}

            {/* cells */}
            {displayCells.map((c) => {
              const id = c.id!;
              const box = cellRenderBox(c, depth);
              const isSideways = c.rot % 180 !== 0;
              // For 90/270 we render the silhouette at pre-rotation dims, then rotate().
              const nativeW = isSideways ? box.h : box.w;
              const nativeH = isSideways ? box.w : box.h;
              const selected = selectedId === id;
              const violated = violationIds.has(id);
              const matched = matchedCellIds.has(id);
              return (
                <div
                  key={id}
                  onPointerDown={(e) => onCellPointerDown(id, e)}
                  onPointerMove={onCellPointerMove}
                  onPointerUp={onCellPointerUp}
                  className="absolute cursor-grab touch-none select-none active:cursor-grabbing"
                  style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
                  data-testid={`sofa-cell-${id}`}
                  data-code={c.moduleCode}
                  data-selected={selected ? "true" : undefined}
                  data-matched={matched ? "true" : undefined}
                >
                  <div
                    className="absolute left-1/2 top-1/2"
                    style={{
                      width: nativeW,
                      height: nativeH,
                      transform: `translate(-50%, -50%) rotate(${c.rot}deg)`,
                    }}
                  >
                    {/* Canvas cells draw the UPLOADED compartment art when the
                        pool row carries one (Loo 2026-07-06 — "完完全全跟着我
                        upload 的照片", supersedes the 2026-06-21 SVG-only
                        lock). `flush` alpha-bbox-fits the art so joined
                        modules tile with NO seams; a code without art falls
                        back to the schematic SVG, also flush. */}
                    <CompartmentSilhouette
                      code={c.moduleCode}
                      depth={depth}
                      iconUrl={iconByCode.get(c.moduleCode) ?? null}
                      flush
                      selected={selected}
                      violation={violated}
                      className="h-full w-full"
                    />
                  </div>
                  {selected && (
                    <div
                      className="sof-cv__tools"
                      data-cell-tool
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        data-cell-tool
                        onClick={() => rotateCell(id)}
                        className="sof-cv__btn"
                        aria-label="Rotate"
                        title="Rotate 90° CW"
                        data-testid={`sofa-cell-rotate-${id}`}
                      >
                        <RotateCw size={13} />
                      </button>
                      <button
                        type="button"
                        data-cell-tool
                        onClick={() => removeCell(id)}
                        className="sof-cv__btn sof-cv__btn--del"
                        aria-label="Delete"
                        title="Remove"
                        data-testid={`sofa-cell-delete-${id}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </main>
      </div>

      {/* Bottom price bar + pickers + add */}
      <footer
        className="flex shrink-0 flex-wrap items-center gap-4 px-5 py-3"
        style={{ borderTop: "1px solid var(--line)", background: "var(--pos-panel, #fff)" }}
      >
        {/* Fabric picker — Series → Colour, both deferrable via KIV. IDENTICAL
            to the POS quick-pick rail (shared useSeriesFabric hook): pick a
            series, then its colour; either level can stay KIV so the sofa still
            adds to cart. One series → the series step auto-collapses. */}
        {fabricChoices.length > 0 && (
          <label className="flex items-center gap-2 t-small text-base-600">
            <span className="flex flex-col leading-tight">
              Fabric
              <span className="t-micro text-base-400">Series · colour · KIV</span>
            </span>
            {fab.seriesList.length > 1 && (
              <select
                value={fab.series}
                onChange={(e) => fab.chooseSeries(e.target.value)}
                aria-label="Fabric series"
                className="rounded-[6px] border border-base-300 bg-white px-2 py-1.5 t-small"
                data-testid="sofa-build-fabric-series"
              >
                <option value="">KIV · series</option>
                {fab.seriesList.map((s) => (
                  <option key={s} value={s}>
                    {s === "Other" ? "Other" : `${s} series`}
                  </option>
                ))}
              </select>
            )}
            {fab.series && (
              <select
                value={fab.colourKey}
                onChange={(e) => fab.setColourKey(e.target.value)}
                aria-label="Fabric colour"
                className="rounded-[6px] border border-base-300 bg-white px-2 py-1.5 t-small"
                data-testid="sofa-build-fabric"
              >
                <option value={FABRIC_KIV}>KIV · colour</option>
                {fab.seriesColours.map((f) => {
                  const delta = resolveFabricDelta(
                    f.tier,
                    fabricTierOverride ?? null,
                    fabricTierConfig ?? null,
                  );
                  return (
                    <option key={f.key} value={f.key}>
                      {f.name}
                      {delta > 0 ? ` · +RM ${delta.toLocaleString("en-MY")}` : " · Included"}
                    </option>
                  );
                })}
              </select>
            )}
          </label>
        )}

        {/* Leg-height picker (0201) — optional; surcharge joins the live total */}
        {legOpts.length > 0 && (
          <label className="flex items-center gap-2 t-small text-base-600">
            <span className="flex flex-col leading-tight">
              Leg height
              <span className="t-micro text-base-400">Optional · KIV to defer</span>
            </span>
            <select
              value={legHeight}
              onChange={(e) => setLegHeight(e.target.value)}
              className="rounded-[6px] border border-base-300 bg-white px-2 py-1.5 t-small"
              data-testid="sofa-build-leg"
            >
              <option value="">KIV</option>
              {legOpts.map((o) => (
                <option key={o.id} value={o.value}>
                  {o.value}
                  {o.surcharge != null && o.surcharge !== 0
                    ? ` · +RM ${o.surcharge.toLocaleString("en-MY")}`
                    : ""}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Size picker — the ACTIVE Maintenance sofa sizes (0201 + 0204: also
            the per-size à-la-carte price axis). Shown ONLY when the size is
            uncontrolled; the POS configurator drives it from the top-bar size
            chips, so a bottom picker there is redundant (Loo 2026-07-06). */}
        {heightValue === undefined && (
          <label className="flex items-center gap-2 t-small text-base-600">
            Size
            <select
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              className="rounded-[6px] border border-base-300 bg-white px-2 py-1.5 t-small font-mono"
              data-testid="sofa-build-height"
            >
              {heightChoices.map((h) => (
                <option key={h} value={h}>
                  {/^\d+$/.test(h) ? `${h}″` : h}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Price + combo badge */}
        <div className="ml-auto flex items-center gap-3">
          {priceResult.basis === "combo" && (
            <span className="pill pill-confirmed" data-testid="sofa-build-combo-badge">
              Combo applied · saves RM {fmtRM(comboSavings)}
            </span>
          )}
          <div className="text-right">
            <div className="pos-eyebrow" style={{ fontSize: 10 }}>Live total</div>
            <div
              style={{
                fontFamily: "var(--font-mark, Georgia, serif)",
                fontStretch: "80%",
                fontWeight: 900,
                fontSize: 26,
                lineHeight: 1.1,
                color: "var(--c-burnt, #BC4319)",
                letterSpacing: "-0.01em",
              }}
              data-testid="sofa-build-total"
            >
              RM {fmtRM(priceResult.total)}
            </div>
          </div>
          {onCreateCombo && (
            <button
              type="button"
              onClick={() => onCreateCombo(cells.map((c) => c.moduleCode))}
              disabled={!canAdd}
              className="btn btn--secondary btn--lg"
              data-testid="sofa-build-create-combo"
              title="Save this arrangement as a priced combo (principal)"
            >
              Create combo
            </button>
          )}
          {onCreateQuickPick && (
            <button
              type="button"
              onClick={() => onCreateQuickPick(cells.map((c) => c.moduleCode))}
              disabled={!canAdd}
              className="btn btn--secondary btn--lg"
              data-testid="sofa-build-create-quickpick"
              title="Save this arrangement as a Quick Pick preset — no price (principal)"
            >
              Create quick pick
            </button>
          )}
          <button
            type="button"
            onClick={handleAdd}
            disabled={!canAdd}
            className="btn btn--primary btn--lg"
            data-testid="sofa-build-add"
          >
            {blocker ?? "Add to cart"}
          </button>
        </div>
      </footer>
    </div>
  );
}
