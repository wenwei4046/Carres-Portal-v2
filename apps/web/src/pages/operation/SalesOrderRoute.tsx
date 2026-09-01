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
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronRight, Circle, CircleDot, Maximize2, Minus, Plus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { ROUTE_NODE_W } from "@carres/shared";
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
const CONTEXT_H = 18;
const DOOR_H = 18;

const MIN_SCALE = 0.4;
const MAX_SCALE = 1.6;
const STEP = 0.15;
/** ⭐ OWNER RULING 2026-08-17: the load fit never shrinks below this — a text
 *  scaled past it is an unreadable stripe, not a map. A wider map opens
 *  centred on the Sales Order and pans; the ⛶ control still offers the true
 *  whole-map fit as an explicit act. */
const FIT_FLOOR = 0.7;

const MAP_PAD = 28;
const MAP_COLUMN_GAP = 32;
const MAP_GROUP_GAP = 72;
const MAP_ROW_GAP = 30;
const MAP_BAND_HEIGHT = 22;
const MAP_BAND_GAP = 28;
const MAP_BAND_DROP = 18;
const MAP_GATE_GAP = 56;

function routeElbow(from: RouteNode, to: RouteNode) {
  const x1 = from.x + from.w / 2;
  const y1 = from.y + from.h;
  const x2 = to.x + to.w / 2;
  const y2 = to.y;
  if (x1 === x2) return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
  const midY = y1 + (y2 - y1) / 2;
  return [
    { x: x1, y: y1 },
    { x: x1, y: midY },
    { x: x2, y: midY },
    { x: x2, y: y2 },
  ];
}

function goodsGroups(route: RouteMap) {
  const outgoing = new Map<string, string[]>();
  for (const edge of route.edges) {
    const list = outgoing.get(edge.from) ?? [];
    list.push(edge.to);
    outgoing.set(edge.from, list);
  }
  const byId = new Map(route.nodes.map((node) => [node.id, node]));
  return route.nodes
    .filter((node) => node.kind === "goods-line")
    .map((plate) => {
      const ids = new Set<string>([plate.id]);
      const queue = [plate.id];
      while (queue.length > 0) {
        const from = queue.shift()!;
        for (const id of outgoing.get(from) ?? []) {
          const next = byId.get(id);
          if (!next || next.branch !== "goods" || ids.has(id)) continue;
          ids.add(id);
          queue.push(id);
        }
      }
      return { plate, ids };
    });
}

export function defaultExpandedGoods(route: RouteMap): string | null {
  const groups = goodsGroups(route);
  const current = route.nodes.find((node) => node.branch === "goods" && node.current);
  return groups.find((group) => current && group.ids.has(current.id))?.plate.id ?? groups[0]?.plate.id ?? null;
}

/**
 * The resolver keeps the complete truth graph. This presentation fold gives a
 * long order a readable shape: goods lines stack down the page; the line with
 * today's work opens; the rest stay as one-line disclosure plates. Delivery
 * and Money remain parallel, and every visible branch still converges on the
 * one Delivery Order gate.
 */
export function compactOrderRoute(route: RouteMap, expandedPlateId: string | null): RouteMap {
  const source = new Map(route.nodes.map((node) => [node.id, node]));
  const placed = new Map<string, RouteNode>();
  const groups = goodsGroups(route);
  const goodsSourceIds = new Set(groups.flatMap((group) => [...group.ids]));
  const cancelled = route.nodes.filter((node) => node.branch === "goods" && !goodsSourceIds.has(node.id));

  const groupBounds = groups.map((group) => {
    const nodes = [...group.ids].map((id) => source.get(id)!).filter(Boolean);
    return {
      ...group,
      nodes,
      minX: Math.min(...nodes.map((node) => node.x)),
      minY: Math.min(...nodes.map((node) => node.y)),
      width: Math.max(...nodes.map((node) => node.x + node.w)) - Math.min(...nodes.map((node) => node.x)),
      height: Math.max(...nodes.map((node) => node.y + node.h)) - Math.min(...nodes.map((node) => node.y)),
    };
  });
  const expanded = groupBounds.find((group) => group.plate.id === expandedPlateId) ?? groupBounds[0] ?? null;
  const goodsWidth = Math.max(ROUTE_NODE_W, expanded?.width ?? ROUTE_NODE_W);
  const deliveryWidth = ROUTE_NODE_W;
  const moneyWidth = ROUTE_NODE_W;
  const loanNodes = route.nodes.filter((node) => node.branch === "loan");
  const loanWidth = loanNodes.length > 0
    ? loanNodes.length * ROUTE_NODE_W + (loanNodes.length - 1) * MAP_COLUMN_GAP
    : 0;
  const totalWidth =
    goodsWidth + MAP_GROUP_GAP + deliveryWidth + MAP_GROUP_GAP + moneyWidth +
    (loanWidth > 0 ? MAP_GROUP_GAP + loanWidth : 0);
  const centreX = MAP_PAD + totalWidth / 2;
  const originSource = route.nodes.find((node) => node.kind === "sales-order")!;
  const origin = { ...originSource, x: centreX - originSource.w / 2, y: MAP_PAD };
  placed.set(origin.id, origin);
  const bandY = origin.y + origin.h + MAP_BAND_GAP;
  const rowTop = bandY + MAP_BAND_HEIGHT + MAP_BAND_DROP;

  let goodsY = rowTop;
  for (const group of groupBounds) {
    if (group.plate.id === expanded?.plate.id) {
      for (const node of group.nodes) {
        placed.set(node.id, {
          ...node,
          x: MAP_PAD + node.x - group.minX,
          y: goodsY + node.y - group.minY,
        });
      }
      goodsY += group.height + MAP_ROW_GAP;
    } else {
      placed.set(group.plate.id, { ...group.plate, x: MAP_PAD, y: goodsY, w: ROUTE_NODE_W });
      goodsY += group.plate.h + 18;
    }
  }
  for (const node of cancelled) {
    placed.set(node.id, { ...node, x: MAP_PAD, y: goodsY });
    goodsY += node.h + 18;
  }

  const deliveryX = MAP_PAD + goodsWidth + MAP_GROUP_GAP;
  const moneyX = deliveryX + deliveryWidth + MAP_GROUP_GAP;
  const loanX = moneyX + moneyWidth + MAP_GROUP_GAP;
  const placeChain = (branch: RouteNode["branch"], x: number) => {
    const chain = route.nodes.filter((node) => node.branch === branch);
    if (chain.length === 0) return rowTop;
    const minY = Math.min(...chain.map((node) => node.y));
    let bottom = rowTop;
    chain.forEach((node, index) => {
      const next = { ...node, x: x + index * (branch === "loan" ? ROUTE_NODE_W + MAP_COLUMN_GAP : 0), y: rowTop + node.y - minY };
      placed.set(node.id, next);
      bottom = Math.max(bottom, next.y + next.h);
    });
    return bottom;
  };
  const deliveryBottom = placeChain("delivery", deliveryX);
  const moneyBottom = placeChain("money", moneyX);
  const loanBottom = placeChain("loan", loanX);
  const deepest = Math.max(goodsY - MAP_ROW_GAP, deliveryBottom, moneyBottom, loanBottom);

  const gateSource = route.nodes.find((node) => node.kind === "delivery-order")!;
  const gate = { ...gateSource, x: centreX - gateSource.w / 2, y: deepest + MAP_GATE_GAP };
  placed.set(gate.id, gate);
  let tailY = gate.y + gate.h + MAP_ROW_GAP;
  for (const node of route.nodes.filter((item) => item.branch === "tail")) {
    const next = { ...node, x: centreX - node.w / 2, y: tailY };
    placed.set(node.id, next);
    tailY += node.h + MAP_ROW_GAP;
  }

  const visible = new Set(placed.keys());
  const edges: RouteEdge[] = route.edges
    .filter((edge) => visible.has(edge.from) && visible.has(edge.to))
    .map((edge) => {
      const from = placed.get(edge.from)!;
      const to = placed.get(edge.to)!;
      return { ...edge, points: routeElbow(from, to), labelAt: null };
    });
  for (const group of groupBounds) {
    if (group.plate.id === expanded?.plate.id) continue;
    edges.push({
      id: `${group.plate.id}→delivery-order:collapsed`,
      from: group.plate.id,
      to: gate.id,
      style: "dashed",
      labelLines: [],
      points: routeElbow(placed.get(group.plate.id)!, gate),
      labelAt: null,
    });
  }

  const bands = [
    { id: "goods" as const, label: "GOODS", x: MAP_PAD, y: bandY, w: goodsWidth, h: MAP_BAND_HEIGHT },
    { id: "delivery" as const, label: "DELIVERY", x: deliveryX, y: bandY, w: ROUTE_NODE_W, h: MAP_BAND_HEIGHT },
    { id: "money" as const, label: "MONEY", x: moneyX, y: bandY, w: ROUTE_NODE_W, h: MAP_BAND_HEIGHT },
    ...(loanNodes.length > 0
      ? [{ id: "loan" as const, label: "LOAN", x: loanX, y: bandY, w: loanWidth, h: MAP_BAND_HEIGHT }]
      : []),
  ];
  return {
    ...route,
    nodes: [...placed.values()],
    edges,
    bands,
    width: MAP_PAD * 2 + totalWidth,
    height: tailY - MAP_ROW_GAP + MAP_PAD,
  };
}

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

function Node({
  node,
  owners,
  onReveal,
  goodsExpanded,
  onToggleGoods,
}: {
  node: RouteNode;
  owners: RouteActionOwners;
  /** Slice 4 — the page pans the transformed surface so a focused node is
   *  visible; the browser cannot do it for a CSS-transformed canvas. */
  onReveal?: (node: RouteNode) => void;
  goodsExpanded?: boolean;
  onToggleGoods?: (id: string) => void;
}) {
  const navigate = useNavigate();
  const Glyph = MARK_GLYPH[node.mark];

  /* The goods line's caption plate — a small grey header naming the line so
     no product name ever sits on a connector (owner ruling 2026-08-17). Not
     a station: no glyph, no state word, no action, no door. */
  if (node.kind === "goods-line") {
    return (
      <button
        type="button"
        data-testid={`route-node-${node.id}`}
        data-kind={node.kind}
        data-mark={node.mark}
        aria-label={[node.title, ...node.lines].join(" — ")}
        aria-expanded={goodsExpanded}
        onClick={() => onToggleGoods?.(node.id)}
        className="absolute overflow-hidden rounded-card border border-kit-slate-5 bg-kit-slate-3 px-3 text-left hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9"
        style={{
          left: node.x,
          top: node.y,
          width: node.w,
          height: node.h,
          paddingTop: BOX_PAD_Y,
          paddingBottom: BOX_PAD_Y,
        }}
      >
        <div
          className="flex items-center gap-1 truncate text-label font-semibold text-base-900"
          style={{ height: TITLE_H, lineHeight: `${TITLE_H}px` }}
        >
          {goodsExpanded ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
          <span className="truncate">{node.title}</span>
        </div>
        {node.lines.map((line, i) => (
          <div
            key={`${node.id}-line-${i}`}
            className="truncate text-label text-base-600"
            style={{ height: LINE_H, lineHeight: `${LINE_H}px` }}
          >
            {spellDates(line)}
          </div>
        ))}
      </button>
    );
  }
  const person = node.action ? ownerOf(owners, node.action.ownerKey) : null;
  const actionContext = node.action?.context.detail ?? null;

  const spoken = [
    node.title,
    ...node.lines.map(spellDates),
    ...node.requirements.map((r) => `${r.met ? "met" : "not met"}: ${spellDates(r.text)}`),
    /* `Unassigned` is in COPY-STANDARD's Do NOT use column for this surface,
       and it was not an edge case: the page supplies only two of the six owner
       keys, so most nodes printed it. With no owner the action speaks alone. */
    node.action
      ? person
        ? `${personLabel(person.name, person.email)}: ${node.action.label}`
        : node.action.label
      : null,
    actionContext ? spellDates(actionContext) : null,
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
      onFocus={() => onReveal?.(node)}
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
          data-testid={`route-fact-${node.id}-${i}`}
          className={`truncate text-body ${node.action ? "font-semibold" : ""} ${
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
          className="flex items-center gap-1.5 text-label"
          style={{ height: ACTION_H }}
          data-testid={`route-action-${node.id}`}
        >
          {person && <OwnerChip person={person} />}
          <span className="truncate text-label text-base-600">{node.action.label}</span>
        </div>
      )}

      {node.action && actionContext && (
        <div
          data-testid={`route-context-${node.id}`}
          className="truncate text-label text-base-600"
          style={{ height: CONTEXT_H, lineHeight: `${CONTEXT_H}px` }}
        >
          {spellDates(actionContext)}
        </div>
      )}

      {!node.action && node.door && (
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
  const initialExpanded = useMemo(() => defaultExpandedGoods(route), [route]);
  const [expandedGoods, setExpandedGoods] = useState<string | null>(initialExpanded);
  useEffect(() => setExpandedGoods(initialExpanded), [initialExpanded]);
  const map = useMemo(() => compactOrderRoute(route, expandedGoods), [route, expandedGoods]);
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  /** The load fit shows the whole map while it stays readable and never drops
   *  below FIT_FLOOR — past the floor the map opens centred on the Sales
   *  Order and the operator pans (owner ruling 2026-08-17). ⛶ remains the
   *  explicit whole-map fit. */
  const fit = useCallback(
    (whole = false) => {
      const box = frame.current?.getBoundingClientRect();
      if (!box || box.width === 0 || map.width === 0) return;
      const wFit = box.width / map.width;
      const raw = Math.min(1, wFit, box.height / map.height);
      if (whole || raw >= FIT_FLOOR) {
        const scale = Math.max(MIN_SCALE, raw);
        setView({
          scale,
          tx: Math.max(0, (box.width - map.width * scale) / 2),
          ty: Math.max(0, (box.height - map.height * scale) / 2),
        });
        return;
      }
      /* Readability beats completeness: fit the WIDTH when it (almost) clears
         the floor — the fan stays whole and the operator pans down to the
         gate — and only a genuinely wider map opens at the floor, centred on
         the Sales Order, panning sideways. */
      if (wFit >= FIT_FLOOR * 0.95) {
        const scale = Math.min(1, wFit);
        setView({ scale, tx: Math.max(0, (box.width - map.width * scale) / 2), ty: 0 });
        return;
      }
      const scale = FIT_FLOOR;
      const so = map.nodes.find((n) => n.kind === "sales-order");
      const cx = so ? so.x + so.w / 2 : map.width / 2;
      setView({
        scale,
        tx: Math.min(0, Math.max(box.width - map.width * scale, box.width / 2 - cx * scale)),
        ty: 0,
      });
    },
    [map],
  );

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

  /** ⭐ Slice 4 — keyboard reachability on a transformed surface. The canvas
   *  is positioned by CSS transform, so the browser CANNOT scroll a focused
   *  node into view by itself: a keyboard user tabbing along the route would
   *  walk off the visible frame and keep going, blind. When focus lands on a
   *  node outside the frame, pan the view just enough to show it — never
   *  re-zoom, never re-centre, so a mouse user's hand-placed view is
   *  disturbed by the minimum a keyboard needs. */
  const revealNode = useCallback(
    (node: { x: number; y: number; w: number; h: number }) => {
      const box = frame.current?.getBoundingClientRect();
      if (!box || box.width === 0 || box.height === 0) return;
      setView((v) => {
        const M = 16; // breathing margin, so a revealed node is not flush on the edge
        const left = node.x * v.scale + v.tx;
        const top = node.y * v.scale + v.ty;
        const right = left + node.w * v.scale;
        const bottom = top + node.h * v.scale;
        let { tx, ty } = v;
        if (left < M) tx += M - left;
        else if (right > box.width - M) tx -= right - (box.width - M);
        if (top < M) ty += M - top;
        else if (bottom > box.height - M) ty -= bottom - (box.height - M);
        return tx === v.tx && ty === v.ty ? v : { ...v, tx, ty };
      });
    },
    [],
  );

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
            width: map.width,
            height: map.height,
            transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
          }}
        >
          {/* The route names live on these bands — GOODS · DELIVERY · MONEY —
              never on the connectors (owner ruling 2026-08-17). */}
          {map.bands.map((band) => (
            <div
              key={band.id}
              data-testid={`route-band-${band.id}`}
              className="absolute truncate border-b border-kit-slate-5 text-label font-semibold uppercase tracking-wide text-base-600"
              style={{
                left: band.x,
                top: band.y,
                width: band.w,
                height: band.h,
                lineHeight: `${band.h - 2}px`,
              }}
            >
              {band.label}
            </div>
          ))}
          <Edges map={map} />
          {map.nodes.map((node) => (
            <Node
              key={node.id}
              node={node}
              owners={owners}
              onReveal={revealNode}
              goodsExpanded={node.kind === "goods-line" ? node.id === expandedGoods : undefined}
              onToggleGoods={(id) => setExpandedGoods((current) => current === id ? current : id)}
            />
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
            onClick={() => fit(true)}
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
