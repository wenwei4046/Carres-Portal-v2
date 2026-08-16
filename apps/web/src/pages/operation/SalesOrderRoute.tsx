/**
 * ORDER ROUTE — ONE NODE MAP.
 *
 * ⭐ OWNER RULING 2026-08-16 (`docs/cards/CARD-2026-08-16-order-route-node-map.md`).
 * The three stacked section cards are gone. This is one connected, pannable,
 * zoomable canvas: white node cards joined by connector lines, three routes
 * leaving the Sales Order at once, converging on the Delivery Order gate.
 *
 * The canvas is READ-ONLY. Every node is a door into the module that owns the
 * fact; nothing here writes, and there is no Release or Approve control in any
 * state — the SYSTEM issues the delivery order.
 *
 * Geometry (positions, sizes, elbows) is computed in `@carres/shared` so the
 * connectors can be asserted without a DOM. The box heights below MUST match
 * that module's constants, or a connector would stop short of its node.
 *
 * The reading model is copied from org-chart / parcel-tracking / GitHub-checks
 * PATTERNS only; every colour, size, spacing and component here is the Carres
 * UI Kit.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Circle, CircleDot, Maximize2, Minus, Plus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import type {
  NodeMark,
  RouteEdge,
  RouteNode,
  SalesOrderRouteMap as RouteMap,
  StationOwnerKey,
} from "@carres/shared";
import Loading from "@/components/kit/Loading";
import { fmtDate } from "@/lib/fmt-date";
import { avatarColor, personInitials, personLabel } from "@/lib/staff-avatar";

/** The resolved people behind the action lines. The Route never derives duty;
 *  it is handed the holders the Work Engine roster already names (card §7). */
export interface RouteActionOwners {
  purchasing: RoutePerson | null;
  receiving: RoutePerson | null;
  stock?: RoutePerson | null;
  delivery?: RoutePerson | null;
  sales?: RoutePerson | null;
  payment?: RoutePerson | null;
}

export interface RoutePerson {
  userId: string;
  name: string | null;
  email: string;
}

/* ONE date spelling. Facts carry ISO with their meaning attached
   (`Issued: 2026-08-13`); the year rule lives in `fmtDate`. */
const spellDates = (s: string) =>
  s.replace(
    /\b(\d{4}-\d{2}-\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?/g,
    (_value, day: string) => fmtDate(day),
  );

/* ── the box, to the pixel the shared geometry assumed ──────────────────── */
const BOX_PAD_Y = 11;
const TITLE_H = 20;
const LINE_H = 18;
const REQ_H = 16;
const ACTION_H = 22;
const DOOR_H = 18;

const MIN_SCALE = 0.4;
const MAX_SCALE = 1.6;
const STEP = 0.15;

/** State is never colour-only (card §12): every mark carries a glyph too. */
const MARK_GLYPH: Record<NodeMark, typeof Check> = {
  complete: Check,
  current: CircleDot,
  waiting: Circle,
  blocked: AlertTriangle,
  future: Circle,
};

const MARK_BADGE: Record<NodeMark, string> = {
  complete: "bg-kit-green-3 text-kit-green-11",
  current: "bg-kit-blue-3 text-kit-blue-11",
  waiting: "bg-kit-slate-3 text-kit-slate-9",
  blocked: "bg-kit-amber-3 text-kit-amber-11",
  future: "bg-kit-slate-3 text-kit-slate-9",
};

/**
 * The BOX stays on the neutral ramp and the MARK BADGE carries the state
 * colour — the same division the shipped station list uses. Only the steps
 * `tailwind.config.ts` publishes exist; a step it does not publish renders
 * nothing at all (`kit-palette.test.ts`), so no ramp is invented here.
 */
const MARK_BOX: Record<NodeMark, string> = {
  complete: "border-kit-slate-5 bg-white",
  current: "border-kit-blue-9 bg-white shadow-sm",
  waiting: "border-kit-slate-5 bg-white",
  blocked: "border-kit-slate-5 bg-kit-amber-3",
  future: "border-dashed border-kit-slate-5 bg-white",
};

function ownerOf(owners: RouteActionOwners, key: StationOwnerKey): RoutePerson | null {
  switch (key) {
    case "receiving":
      return owners.receiving ?? null;
    case "stock":
      return owners.stock ?? null;
    case "delivery":
      return owners.delivery ?? null;
    case "sales":
      return owners.sales ?? null;
    case "payment":
      return owners.payment ?? null;
    default:
      return owners.purchasing ?? null;
  }
}

/** Initials only on the node; Team Work shows the full names, and the action
 *  sentence never repeats the person (card §7). */
function OwnerChip({ person }: { person: RoutePerson }) {
  const colors = avatarColor(person.userId);
  const label = personLabel(person.name, person.email);
  return (
    <span
      className="inline-grid h-5 w-5 shrink-0 place-items-center rounded-full text-label font-semibold"
      style={{ background: colors.bg, color: colors.fg }}
      title={label}
      aria-hidden="true"
    >
      {personInitials(person.name, person.email)}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * One node.
 * ──────────────────────────────────────────────────────────────────────────── */

function Node({ node, owners }: { node: RouteNode; owners: RouteActionOwners }) {
  const navigate = useNavigate();
  const Glyph = MARK_GLYPH[node.mark];
  const person = node.action ? ownerOf(owners, node.action.ownerKey) : null;

  const spoken = [
    node.title,
    ...node.lines.map(spellDates),
    ...node.requirements.map((r) => `${r.met ? "met" : "not met"}: ${spellDates(r.text)}`),
    node.action
      ? `${person ? personLabel(person.name, person.email) : "Unassigned"}: ${node.action.label}`
      : null,
  ]
    .filter(Boolean)
    .join(" — ");

  const go = () => {
    if (node.door) navigate(node.door.href);
  };

  return (
    <div
      data-testid={`route-node-${node.id}`}
      data-kind={node.kind}
      data-mark={node.mark}
      data-current={node.current ? "true" : "false"}
      role={node.door ? "link" : "group"}
      tabIndex={0}
      aria-label={spoken}
      aria-current={node.current ? "step" : undefined}
      onKeyDown={(e) => {
        if (node.door && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          go();
        }
      }}
      className={`absolute overflow-hidden rounded-card border ${MARK_BOX[node.mark]} focus:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9`}
      style={{
        left: node.x,
        top: node.y,
        width: node.w,
        height: node.h,
        paddingTop: BOX_PAD_Y,
        paddingBottom: BOX_PAD_Y,
        paddingLeft: 12,
        paddingRight: 12,
        borderWidth: node.mark === "current" ? 2 : 1,
      }}
    >
      <div className="flex items-center gap-1.5" style={{ height: TITLE_H }}>
        <span
          className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${MARK_BADGE[node.mark]}`}
          aria-hidden="true"
        >
          <Glyph size={14} />
        </span>
        <span className="truncate text-label font-semibold uppercase tracking-wide text-base-600">
          {node.title}
        </span>
        {node.current && (
          <span className="ml-auto shrink-0 text-label font-semibold uppercase tracking-wide text-kit-blue-11">
            Current
          </span>
        )}
      </div>

      {node.lines.map((line, i) => (
        <div
          key={`${node.id}-line-${i}`}
          className={`truncate text-body ${
            node.mark === "future" ? "text-kit-slate-9" : "text-base-900"
          }`}
          style={{ height: LINE_H, lineHeight: `${LINE_H}px` }}
        >
          {spellDates(line)}
        </div>
      ))}

      {node.requirements.map((req) => (
        <div
          key={req.id}
          data-testid={`route-requirement-${req.id}`}
          data-met={req.met ? "true" : "false"}
          className="flex items-center gap-1 truncate text-label"
          style={{ height: REQ_H, lineHeight: `${REQ_H}px` }}
        >
          <span
            className={req.met ? "text-kit-green-11" : "text-kit-slate-9"}
            aria-hidden="true"
          >
            {req.met ? "✓" : "·"}
          </span>
          <span className={`truncate ${req.met ? "text-base-600" : "text-base-900"}`}>
            {spellDates(req.text)}
          </span>
        </div>
      ))}

      {node.action && (
        /* The 13 / 11 two-line grammar: the FACT above, the INSTRUCTION here,
           with the owner as a chip rather than a name inside the sentence. */
        <div
          className="flex items-center gap-1.5"
          style={{ height: ACTION_H }}
          data-testid={`route-action-${node.id}`}
        >
          {person && <OwnerChip person={person} />}
          <span className="truncate text-label text-base-600">{node.action.label}</span>
        </div>
      )}

      {node.door && (
        <div style={{ height: DOOR_H, lineHeight: `${DOOR_H}px` }}>
          <Link
            to={node.door.href}
            tabIndex={-1}
            className="truncate text-label font-medium text-kit-blue-11 underline-offset-2 hover:underline"
          >
            {node.door.label}
          </Link>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The connectors. One polyline per edge, plus its small grey label.
 * ──────────────────────────────────────────────────────────────────────────── */

function Edges({ map }: { map: RouteMap }) {
  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      width={map.width}
      height={map.height}
      aria-hidden="true"
      data-testid="route-edges"
    >
      {map.edges.map((edge: RouteEdge) => (
        <g key={edge.id} data-testid={`route-edge-${edge.from}--${edge.to}`} data-style={edge.style}>
          <polyline
            points={edge.points.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            className={edge.style === "dashed" ? "stroke-kit-slate-6" : "stroke-kit-slate-9"}
            strokeWidth={1.5}
            strokeDasharray={edge.style === "dashed" ? "4 4" : undefined}
          />
          {edge.labelAt &&
            edge.labelLines.map((line, i) => (
              <text
                key={`${edge.id}-label-${i}`}
                x={edge.labelAt!.x}
                y={edge.labelAt!.y - (edge.labelLines.length - 1 - i) * 12}
                textAnchor="middle"
                className="fill-kit-slate-9 text-label"
              >
                {line}
              </text>
            ))}
        </g>
      ))}
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The page — a pan/zoom surface that FITS the whole map on load.
 * ──────────────────────────────────────────────────────────────────────────── */

export default function SalesOrderRoute({
  route,
  owners = { purchasing: null, receiving: null },
  loading = false,
}: {
  route: RouteMap;
  owners?: RouteActionOwners;
  loading?: boolean;
}) {
  const frame = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  /** ⛶ — fit the whole map to the viewport. Also what happens on load, so the
   *  operator never opens the page already lost inside it (card §11). */
  const fit = useCallback(() => {
    const box = frame.current?.getBoundingClientRect();
    if (!box || box.width === 0 || route.width === 0) return;
    const scale = Math.max(
      MIN_SCALE,
      Math.min(1, box.width / route.width, box.height / route.height),
    );
    setView({
      scale,
      tx: Math.max(0, (box.width - route.width * scale) / 2),
      ty: Math.max(0, (box.height - route.height * scale) / 2),
    });
  }, [route.width, route.height]);

  useLayoutEffect(() => {
    fit();
  }, [fit]);

  useEffect(() => {
    const onResize = () => fit();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [fit]);

  const zoom = (dir: 1 | -1) =>
    setView((v) => ({
      ...v,
      scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale + dir * STEP)),
    }));

  if (loading) return <Loading label="Opening the order route" />;

  return (
    <div className="flex flex-col gap-3" data-testid="sales-order-route">
      {/* A linked exception is NOT a node: a node is a stage every Sales Order
          passes through, and Service is not one. It stays a conditional strip
          beside the map, rendered only when one is open. */}
      {route.linkedProblems.length > 0 && (
        <section
          className="rounded-card border border-kit-slate-5 bg-kit-amber-3 px-4 py-3"
          data-testid="linked-problems"
        >
          <h2 className="text-label font-semibold uppercase tracking-wide text-kit-amber-11">
            Linked problems
          </h2>
          <ul className="mt-1 flex flex-col gap-1">
            {route.linkedProblems.map((problem) => (
              <li key={problem.id} className="flex items-center gap-2 text-body text-base-900">
                <span>{problem.title}</span>
                <Link
                  to={problem.door.href}
                  className="text-label font-medium text-kit-blue-11 underline-offset-2 hover:underline"
                >
                  {problem.door.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div
        ref={frame}
        data-testid="route-canvas"
        className="relative h-[calc(100vh-260px)] min-h-[420px] overflow-hidden rounded-card border border-kit-slate-5 bg-kit-slate-3"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("[data-testid^='route-node-']")) return;
          drag.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          setView((v) => ({ ...v, tx: d.tx + (e.clientX - d.x), ty: d.ty + (e.clientY - d.y) }));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <div
          data-testid="route-surface"
          className="absolute left-0 top-0 origin-top-left motion-safe:transition-transform motion-safe:duration-150"
          style={{
            width: route.width,
            height: route.height,
            transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
          }}
        >
          <Edges map={route} />
          {route.nodes.map((node) => (
            <Node key={node.id} node={node} owners={owners} />
          ))}
        </div>

        {/* `− + ⛶`, bottom-left, always visible and keyboard-operable. */}
        <div className="absolute bottom-3 left-3 flex overflow-hidden rounded-control border border-kit-slate-5 bg-white">
          <button
            type="button"
            onClick={() => zoom(-1)}
            data-testid="route-zoom-out"
            aria-label="Zoom out"
            className="grid h-7 w-7 place-items-center text-base-600 hover:bg-kit-slate-3"
          >
            <Minus size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => zoom(1)}
            data-testid="route-zoom-in"
            aria-label="Zoom in"
            className="grid h-7 w-7 place-items-center border-l border-kit-slate-5 text-base-600 hover:bg-kit-slate-3"
          >
            <Plus size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={fit}
            data-testid="route-fit"
            aria-label="Fit the whole route"
            className="grid h-7 w-7 place-items-center border-l border-kit-slate-5 text-base-600 hover:bg-kit-slate-3"
          >
            <Maximize2 size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
