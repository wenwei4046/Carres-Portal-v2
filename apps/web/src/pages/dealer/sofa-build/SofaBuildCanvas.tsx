import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { X, RotateCw, Trash2 } from "lucide-react";
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
  classifySofaCompartment,
  computeSofaPrice,
  ROOM_W,
  ROOM_H,
  type SofaBuild,
  type SofaPricingSnapshot,
} from "@carres/shared";
import CompartmentSilhouette from "./CompartmentSilhouette";
import ModulePaletteItem from "./ModulePaletteItem";
import { sellingFabricsFor, type SellingFabric } from "./selling-fabrics";

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
  fabricSurcharge: number;
  /** True when the salesperson deferred fabric choice (customer to confirm). */
  fabricDeferred: boolean;
  /** 0201-wiring — the chosen sofa_leg_height pool value + its SERVER-shaped
   *  surcharge (computeSofaPrice legDelta; already inside `total`). */
  legHeight: string | null;
  legSurcharge: number;
  total: number;
  priceBasis: "combo" | "a_la_carte";
}

/** Fabric-select sentinel — "Confirm later, customer to confirm". */
const FABRIC_DEFER = "__defer__";

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
  onAddBuild,
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
  /** 0201-wiring — the ACTIVE Maintenance sofa sizes (seat heights). Absent →
   *  the full canonical SOFA_HEIGHTS axis (legacy behaviour). */
  heights?: readonly string[];
  onAddBuild: (payload: SofaBuildAddPayload) => void;
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
  // 0201-wiring — the seat-height axis follows the ACTIVE Maintenance sofa
  // sizes when the caller passes them; legacy callers keep the full axis.
  const heightChoices = useMemo<readonly string[]>(
    () => (heights && heights.length > 0 ? heights : SOFA_HEIGHTS),
    [heights],
  );
  const [height, setHeight] = useState<string>(
    heightChoices.includes("24") ? "24" : heightChoices[0]!,
  );
  // 0202-wiring — one unified selling-fabric list (legacy per-model rows +
  // opted-in master fabrics); callers that don't pass it keep legacy rows only.
  const fabricChoices = useMemo<SellingFabric[]>(
    () => sellingFabrics ?? sellingFabricsFor(model, sofaFabrics, null),
    [sellingFabrics, model, sofaFabrics],
  );
  const [fabricKey, setFabricKey] = useState<string>(fabricChoices[0]?.key ?? "");
  // 0201-wiring — leg height ('' = confirm later / none).
  const [legHeight, setLegHeight] = useState<string>("");
  const legOpts = legHeightOptions ?? [];

  const depth = height; // seat-depth axis == the chosen height key (cm widening)
  // "Confirm later" — salesperson defers the fabric; the sofa still adds to
  // cart, priced at the base tier, flagged for the customer to confirm.
  const fabricDeferred = fabricKey === FABRIC_DEFER;
  const fabric = fabricDeferred ? null : fabricChoices.find((f) => f.key === fabricKey) ?? null;
  const fabricTier: FabricTierValue = fabric?.tier ?? "PRICE_1";

  // Live drag override — carries the in-flight translation for the dragging
  // cell(s); `cells` state is untouched mid-drag (committed on pointer-up).
  const [draftDelta, setDraftDelta] = useState<{ ids: string[]; dx: number; dy: number } | null>(null);
  const dragRef = useRef<DragState | null>(null);

  /* ─── Room scale (fit the 600×480 stage into the viewport) ───────── */

  const stageRef = useRef<HTMLDivElement | null>(null);
  const [visualScale, setVisualScale] = useState(1);
  const visualScaleRef = useRef(1);

  useEffect(() => {
    const el = stageRef.current?.parentElement;
    if (!el || typeof ResizeObserver === "undefined") return;
    const apply = (width: number, vpH: number) => {
      const s = Math.min(width / ROOM_W, vpH / ROOM_H, 1.4);
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
  }, []);

  /* ─── Place / rotate / delete ────────────────────────────────────── */

  const addCell = useCallback(
    (code: string) => {
      const m = findModule(code);
      const fp = moduleFootprint(m ?? { w: 95, d: 95, cushions: 0 }, 0, depth);
      const id = nextCellId();
      setCells((prev) => [
        ...prev,
        { id, moduleCode: code, x: ROOM_W / 2 - fp.w / 2, y: ROOM_H / 2 - fp.h / 2, rot: 0 },
      ]);
      setSelectedId(id);
    },
    [depth],
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
    setSelectedId(id);
    dragRef.current = {
      id,
      pid: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      moved: false,
      group: [{ id, x: cell.x, y: cell.y }],
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
    finalX = Math.max(0, Math.min(finalX, ROOM_W - fp.w));
    finalY = Math.max(0, Math.min(finalY, ROOM_H - fp.h));

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
                    onAdd={addCell}
                  />
                ))}
              </div>
            </div>
          ))}
        </aside>

        {/* Center room */}
        <main className="flex min-w-0 flex-1 items-center justify-center overflow-hidden p-4">
          <div
            ref={stageRef}
            className="sof-cv__room"
            style={{
              width: ROOM_W,
              height: ROOM_H,
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
              return (
                <div key={`g${gi}`}>
                  {a.closed && (
                    <div
                      className="pointer-events-none absolute rounded-[6px] border-2 border-primary/40"
                      style={{ left: bb.x - 6, top: bb.y - 6, width: bb.w + 12, height: bb.h + 12 }}
                      data-testid="sofa-group-outline"
                    />
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
                    {/* Canvas cells ALWAYS draw the plan-view SVG — never the
                        photoreal icon_url (an opaque product photo breaks the
                        top-down plan look + the joined-group SofaPlanView
                        styling; photos live in the palette + Maintenance). */}
                    <CompartmentSilhouette
                      code={c.moduleCode}
                      depth={depth}
                      selected={selected}
                      violation={violated}
                      className="h-full w-full"
                    />
                  </div>
                  {matched && (
                    <span
                      className="pill pill-confirmed pointer-events-none absolute -top-2 left-1 scale-90"
                      data-testid="sofa-cell-combo-badge"
                    >
                      Combo
                    </span>
                  )}
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
        {/* Fabric picker — optional, deferrable to the customer. One unified
            list: legacy per-model rows + the model's opted-in master fabrics. */}
        <label className="flex items-center gap-2 t-small text-base-600">
          <span className="flex flex-col leading-tight">
            Fabric
            <span className="t-micro text-base-400">Optional · confirm later</span>
          </span>
          <select
            value={fabricKey}
            onChange={(e) => setFabricKey(e.target.value)}
            className="rounded-[6px] border border-base-300 bg-white px-2 py-1.5 t-small"
            data-testid="sofa-build-fabric"
          >
            {fabricChoices.length === 0 && <option value="">— none —</option>}
            {fabricChoices.map((f) => (
              <option key={f.key} value={f.key}>
                {f.name} · {f.tier.replace("PRICE_", "P")}
              </option>
            ))}
            <option value={FABRIC_DEFER}>Confirm later — customer to confirm</option>
          </select>
        </label>

        {/* Leg-height picker (0201) — optional; surcharge joins the live total */}
        {legOpts.length > 0 && (
          <label className="flex items-center gap-2 t-small text-base-600">
            <span className="flex flex-col leading-tight">
              Leg height
              <span className="t-micro text-base-400">Optional · confirm later</span>
            </span>
            <select
              value={legHeight}
              onChange={(e) => setLegHeight(e.target.value)}
              className="rounded-[6px] border border-base-300 bg-white px-2 py-1.5 t-small"
              data-testid="sofa-build-leg"
            >
              <option value="">Confirm later</option>
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

        {/* Height picker — the ACTIVE Maintenance sofa sizes (0201) */}
        <label className="flex items-center gap-2 t-small text-base-600">
          Seat height
          <select
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            className="rounded-[6px] border border-base-300 bg-white px-2 py-1.5 t-small font-mono"
            data-testid="sofa-build-height"
          >
            {heightChoices.map((h) => (
              <option key={h} value={h}>
                {h}&Prime;
              </option>
            ))}
          </select>
        </label>

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
