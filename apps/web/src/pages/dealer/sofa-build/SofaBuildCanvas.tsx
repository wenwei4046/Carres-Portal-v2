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
  fabricName: string | null;
  fabricSurcharge: number;
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
  onAddBuild,
  onClose,
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
  onAddBuild: (payload: SofaBuildAddPayload) => void;
  onClose: () => void;
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

  /** Code (or its mirror) → the pool compartment (for the icon_url + price). */
  const poolForCode = useCallback(
    (code: string): SofaCompartmentDto | null =>
      compartmentPool.find((c) => c.code === code) ??
      compartmentPool.find((c) => c.code === mirrorCode(code)) ??
      null,
    [compartmentPool],
  );

  /* ─── Build state ────────────────────────────────────────────────── */

  const [cells, setCells] = useState<GeoCell[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [height, setHeight] = useState<string>(SOFA_HEIGHTS.includes("24") ? "24" : SOFA_HEIGHTS[0]);
  const [fabricId, setFabricId] = useState<string>(sofaFabrics[0]?.id ?? "");

  const depth = height; // seat-depth axis == the chosen height key (cm widening)
  const fabric = sofaFabrics.find((f) => f.id === fabricId) ?? null;
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
    }),
    [compartmentPool, modelCompartments, sofaCombos, model.id, fabricTierOverride, fabricTierConfig],
  );

  const priceResult = useMemo(() => {
    const build: SofaBuild = {
      modelId: model.id,
      cells: cells.map((c) => ({ moduleCode: c.moduleCode, x: c.x, y: c.y, rot: c.rot })),
      fabricTier,
      height,
    };
    return computeSofaPrice(build, snapshot);
  }, [cells, model.id, fabricTier, height, snapshot]);

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
      fabricName: fabric?.fabricName ?? null,
      fabricSurcharge: priceResult.fabricDelta,
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
      className="fixed inset-0 z-50 flex flex-col bg-base-50"
      data-testid="sofa-build-canvas"
      role="dialog"
      aria-label={`Build a sofa — ${model.name}`}
    >
      {/* Header */}
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

      {/* Body: palette | room */}
      <div className="flex min-h-0 flex-1">
        {/* Left palette */}
        <aside className="hidden w-64 shrink-0 flex-col overflow-y-auto border-r border-base-200 bg-white p-3 md:flex" data-testid="sofa-build-palette">
          {palette.length === 0 && (
            <p className="t-small text-base-500">This model has no offered compartments.</p>
          )}
          {palette.map(({ group, rows }) => (
            <div key={group} className="mb-4">
              <div className="t-micro mb-1.5 text-base-400">{group}</div>
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
        <main className="flex min-w-0 flex-1 items-center justify-center overflow-hidden bg-base-100 p-4">
          <div
            ref={stageRef}
            className="relative overflow-visible rounded-[6px] border border-base-300 bg-white shadow-md"
            style={{
              width: ROOM_W,
              height: ROOM_H,
              transform: `scale(${visualScale})`,
              transformOrigin: "center center",
            }}
            data-testid="sofa-build-room"
          >
            {/* connected-sofa outlines + dimension callouts */}
            {analyses.map((a, gi) => {
              const bb = cellsBbox(a.group, depth);
              if (!bb) return null;
              return (
                <div key={`g${gi}`}>
                  <div
                    className={`pointer-events-none absolute rounded-[6px] border-2 ${a.closed ? "border-primary/40" : "border-danger/50"}`}
                    style={{ left: bb.x - 6, top: bb.y - 6, width: bb.w + 12, height: bb.h + 12 }}
                    data-testid="sofa-group-outline"
                  />
                  {/* width callout (top) */}
                  <div
                    className="pointer-events-none absolute text-center t-tiny font-mono text-base-500"
                    style={{ left: bb.x, top: bb.y - 24, width: bb.w }}
                  >
                    {Math.round(bb.w)}cm
                  </div>
                  {/* height callout (right) */}
                  <div
                    className="pointer-events-none absolute t-tiny font-mono text-base-500"
                    style={{ left: bb.x + bb.w + 10, top: bb.y + bb.h / 2 - 8 }}
                  >
                    {Math.round(bb.h)}cm
                  </div>
                  {!a.closed && (
                    <span
                      className="pill pill-overdue pointer-events-none absolute"
                      style={{ left: bb.x, top: bb.y + bb.h + 8 }}
                      data-testid="sofa-group-not-closed"
                    >
                      {a.reason ?? "Not closed"}
                    </span>
                  )}
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
                    <CompartmentSilhouette
                      code={c.moduleCode}
                      depth={depth}
                      iconUrl={poolForCode(c.moduleCode)?.iconUrl ?? null}
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
                    <div className="absolute -top-3 right-0 flex gap-1" data-cell-tool>
                      <button
                        type="button"
                        data-cell-tool
                        onClick={() => rotateCell(id)}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-base-300 bg-white text-base-700 shadow-sm hover:border-primary hover:text-primary"
                        aria-label="Rotate"
                        data-testid={`sofa-cell-rotate-${id}`}
                      >
                        <RotateCw size={13} />
                      </button>
                      <button
                        type="button"
                        data-cell-tool
                        onClick={() => removeCell(id)}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-base-300 bg-white text-danger shadow-sm hover:border-danger"
                        aria-label="Delete"
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
      <footer className="flex shrink-0 flex-wrap items-center gap-4 border-t border-base-200 bg-white px-5 py-3">
        {/* Fabric picker */}
        <label className="flex items-center gap-2 t-small text-base-600">
          Fabric
          <select
            value={fabricId}
            onChange={(e) => setFabricId(e.target.value)}
            className="rounded-[6px] border border-base-300 bg-white px-2 py-1.5 t-small"
            data-testid="sofa-build-fabric"
          >
            {sofaFabrics.length === 0 && <option value="">— none —</option>}
            {sofaFabrics.map((f) => (
              <option key={f.id} value={f.id}>
                {f.fabricName} · {f.tier.replace("PRICE_", "P")}
              </option>
            ))}
          </select>
        </label>

        {/* Height picker */}
        <label className="flex items-center gap-2 t-small text-base-600">
          Seat height
          <select
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            className="rounded-[6px] border border-base-300 bg-white px-2 py-1.5 t-small font-mono"
            data-testid="sofa-build-height"
          >
            {SOFA_HEIGHTS.map((h) => (
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
            <div className="t-micro text-base-400">Total</div>
            <div className="t-h2 font-mono text-base-900" data-testid="sofa-build-total">
              RM {fmtRM(priceResult.total)}
            </div>
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!canAdd}
            className="btn-hero disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="sofa-build-add"
          >
            {blocker ?? "Add to cart"}
          </button>
        </div>
      </footer>
    </div>
  );
}
