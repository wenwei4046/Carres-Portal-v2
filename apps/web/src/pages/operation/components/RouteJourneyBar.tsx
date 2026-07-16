import {
  AlertTriangle,
  Building2,
  Factory,
  MapPin,
  Plus,
  Route as RouteIcon,
  Trash2,
  Warehouse,
} from "lucide-react";
import { STOCK_LOCATIONS } from "@carres/shared";

/**
 * RouteJourneyBar — the per-item transfer "Option D" design (Jess 2026-07-11,
 * locked after 3-option review; she asked for long-term international-tracker UX,
 * not the easy reuse). It reads the way a parcel/freight tracker reads: a
 * SEGMENTED JOURNEY BAR that is scannable across many items at once, so at
 * 500-1000 orders/month staff SCAN colour, they don't READ words.
 *
 * The design language (Jess "avoid any wording", weak-English staff, one easy
 * panel): ICONS ARE THE PLACES, COLOUR IS THE PROGRESS. The only text left is a
 * short carrier proper-noun pill (NETS / HOUZS / AL — logo-like, unavoidable).
 *   🏭 supplier · 🏢 warehouse / hub · 🏠 customer
 *   green = done · blue = moving · grey = pending · red = stuck
 *
 * This first cut derives a single default leg (origin → carrier → customer) from
 * data that exists today (line location + the order's assigned logistic + stock
 * readiness). Real multi-leg authoring (per-leg carrier + status + "+ Add leg")
 * lands with the transfer migration — the bar shape already accommodates it.
 */

export type JourneyStatus = "done" | "moving" | "pending" | "stuck";

const SEG: Record<JourneyStatus, string> = {
  done: "#16A34A",
  moving: "#2563EB",
  pending: "#D8D3C8",
  stuck: "#DC2626",
};

/** Pick the place-icon purely from the location name — no words shown. */
function PlaceIcon({ loc, className }: { loc: string; className?: string }) {
  const l = loc.toLowerCase();
  if (l.includes("klang") || l.includes("balakong"))
    return <Warehouse className={className} strokeWidth={2} />;
  if (l.includes("future") || l.includes("ohana") || l.includes("supplier"))
    return <Factory className={className} strokeWidth={2} />;
  if (l === "al") return <Building2 className={className} strokeWidth={2} />;
  return <MapPin className={className} strokeWidth={2} />;
}

/** A colour for an icon that mirrors the segment state it leads. */
function iconColor(status: JourneyStatus): string {
  return status === "stuck" ? SEG.stuck : status === "done" ? SEG.done : status === "moving" ? SEG.moving : "#A8A398";
}

export interface RouteLeg {
  from: string;
  to: string;
  carrier: string | null;
  status: JourneyStatus;
}

/**
 * Derive the default journey from data that exists TODAY — the item's current
 * location, the order's assigned logistic, and stock readiness. No fake precision:
 * green = stock secured at that hop · grey = still waiting · red = no PO raised.
 * A supplier-origin item shows the real two-hop shape (supplier → consolidation
 * hub → customer); a warehouse item is a single hop. Real per-leg carrier + status
 * authoring ("+ Add leg") replaces this once the transfer migration lands.
 */
export function deriveRouteLegs({
  location,
  carrier,
  readiness,
}: {
  location: string;
  carrier: string | null;
  readiness: "ready" | "waiting" | "nopo";
}): RouteLeg[] {
  const origin = location || "Carres Klang";
  const gather: JourneyStatus =
    readiness === "nopo" ? "stuck" : readiness === "waiting" ? "pending" : "done";
  const isSupplier = /future|ohana|supplier/i.test(origin);
  if (isSupplier) {
    const hub = /houzs/i.test(carrier ?? "") ? "Houzs Balakong" : "Carres Klang";
    const pickup = /houzs/i.test(carrier ?? "") ? "HOUZS" : null;
    return [
      { from: origin, to: hub, carrier: pickup, status: gather },
      { from: hub, to: "Customer", carrier, status: "pending" },
    ];
  }
  return [{ from: origin, to: "Customer", carrier, status: gather }];
}

/**
 * Collapsed bar shown inside the Items-table Route cell. Icons + colour only;
 * carrier is a tiny pill. Click is handled by the parent (toggles the editor).
 */
export function RouteJourneyBar({
  legs,
  onClick,
  open,
}: {
  legs: RouteLeg[];
  onClick?: () => void;
  open?: boolean;
}) {
  if (legs.length === 0) {
    return <span className="text-base-300 text-[11px]">—</span>;
  }
  const stuck = legs.some((l) => l.status === "stuck");
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      title="Transfer route — click to see the legs"
      className={`w-full flex items-center gap-1 rounded px-0.5 py-1 hover:bg-base-50 ${open ? "bg-base-50" : ""}`}
    >
      <PlaceIcon loc={legs[0].from} className="w-3.5 h-3.5 shrink-0" />
      {legs.map((leg, i) => (
        <span key={i} className="flex items-center gap-1 min-w-0 flex-1">
          <span
            className="h-1.5 rounded-full flex-1 min-w-[10px]"
            style={{ backgroundColor: SEG[leg.status] }}
          />
          <PlaceIcon
            loc={leg.to}
            className="w-3.5 h-3.5 shrink-0"
          />
        </span>
      ))}
      {stuck && (
        <AlertTriangle
          className="w-3.5 h-3.5 shrink-0"
          style={{ color: SEG.stuck }}
          strokeWidth={2}
        />
      )}
    </button>
  );
}

/**
 * Is this route worth drawing a picture for? Jess 2026-07-11: showing a journey
 * bar on EVERY item is noise — most items just go the standard single hop from
 * the consolidation warehouse to the customer. Only a SPECIAL arrangement (a
 * multi-hop transfer — supplier pickup, cross-warehouse) earns the bar; the rest
 * stay quiet and only reveal the arranger on click.
 */
export function isSpecialRoute(legs: RouteLeg[]): boolean {
  return legs.length > 1;
}

/**
 * The quiet default for a standard route — reads the destination in PLAIN WORDS
 * (the default consolidation warehouse, e.g. "Carres Klang") with a small place
 * icon, so staff see WHERE it goes at a glance (Jess 2026-07-11: the bare icon
 * was cryptic). Click opens the arranger to set up a special multi-leg transfer.
 */
export function RouteQuietButton({
  label,
  onClick,
  open,
}: {
  label: string;
  onClick?: () => void;
  open?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      title="Goes here by default — click to arrange a special transfer"
      className={`w-full flex items-center gap-1.5 rounded px-1.5 py-1 text-[11px] hover:bg-base-50 ${
        open ? "bg-base-50 text-primary" : "text-base-600 hover:text-primary"
      }`}
    >
      <PlaceIcon loc={label} className="w-3.5 h-3.5 shrink-0 text-base-400" />
      <span className="truncate">{label}</span>
      <RouteIcon className="w-3 h-3 shrink-0 text-base-300 ml-auto" strokeWidth={2} />
    </button>
  );
}

/**
 * Map STORED route STOPS to DISPLAY legs for the bar. A route is an ORDERED
 * list of real locations riding `ops_order_control.line_locations[sku]`
 * (UI-KIT §7.6 / bug-0 fix 2026-07-13: the deployed order-control schema
 * accepts `line_locations: Record<sku, string[]>`; the richer `line_legs`
 * {from,to,carrier,done} shape is deploy-gated, so routes are modelled as
 * stops — stop[0] = the item's current/default location, each further stop =
 * the next transfer hop). Consecutive stops become legs; all read "pending"
 * (no per-leg done tracking in the stop shape).
 */
export function stopsToDisplay(stops: string[]): RouteLeg[] {
  const legs: RouteLeg[] = [];
  for (let i = 0; i + 1 < stops.length; i++) {
    legs.push({ from: stops[i], to: stops[i + 1], carrier: null, status: "pending" });
  }
  return legs;
}

// Route = INBOUND pickup stops only (Jess 2026-07-11) — getting an item INTO the
// consolidation warehouse. The final delivery to the customer is the Delivery
// panel's job, so "Customer" is deliberately NOT a stop here.
const LEG_PLACES = [...STOCK_LOCATIONS] as const;

/**
 * The in-place route STOPS editor (UI-KIT §7.6 — replaces the leg-object
 * editor so routes SAVE against the live order-control schema). Each row is a
 * real location; "+ Add stop" appends the consolidation warehouse. One stop =
 * the standard single location; more = a multi-hop transfer.
 */
export function StopsEditor({
  stops,
  onChange,
}: {
  stops: string[];
  onChange: (stops: string[]) => void;
}) {
  const halt = (e: { stopPropagation: () => void }) => e.stopPropagation();
  const shown = stops.length > 0 ? stops : ["Carres Klang"];
  const update = (i: number, v: string) =>
    onChange(shown.map((s, j) => (j === i ? v : s)));
  const sel =
    "border border-base-300 rounded-[3px] bg-white px-1 py-0.5 text-[11px] focus:border-primary focus:outline-none";
  return (
    <div className="space-y-1.5">
      {shown.map((s, i) => (
        <div key={i} className="flex items-center gap-1.5 text-[11px]">
          <span className="w-4 text-right text-base-300 tabular-nums shrink-0">
            {i + 1}.
          </span>
          <PlaceIcon loc={s} className="w-3.5 h-3.5 shrink-0 text-base-400" />
          <select
            value={s}
            onClick={halt}
            onChange={(e) => update(i, e.target.value)}
            className={sel}
          >
            {LEG_PLACES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
            {!LEG_PLACES.includes(s as (typeof LEG_PLACES)[number]) && (
              <option value={s}>{s}</option>
            )}
          </select>
          {i < shown.length - 1 && <span className="text-base-300">↓</span>}
          {shown.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                halt(e);
                onChange(shown.filter((_, j) => j !== i));
              }}
              title="Remove stop"
              className="text-base-300 hover:text-danger shrink-0 ml-auto"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={(e) => {
          halt(e);
          onChange([...shown, "Carres Klang"]);
        }}
        className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
      >
        <Plus className="w-3 h-3" /> Add stop
      </button>
    </div>
  );
}

/**
 * Expanded editor row content — one line per leg (from → to · carrier · status),
 * shown in-place beneath the item row (no second drawer). For now it renders the
 * derived legs read-mostly and keeps the existing location control as the write
 * affordance; per-leg carrier picking + "+ Add leg" arrive with the migration.
 */
export function RouteLegList({ legs }: { legs: RouteLeg[] }) {
  return (
    <div className="space-y-1">
      {legs.map((leg, i) => (
        <div key={i} className="flex items-center gap-2 text-[11px]">
          <span style={{ color: iconColor(leg.status) }} className="shrink-0">
            {leg.status === "done" ? (
              "●"
            ) : leg.status === "stuck" ? (
              <AlertTriangle className="w-3 h-3 inline" strokeWidth={2} />
            ) : (
              "○"
            )}
          </span>
          <PlaceIcon loc={leg.from} className="w-3.5 h-3.5 text-base-500 shrink-0" />
          <span className="text-base-600 truncate">{leg.from}</span>
          <span className="text-base-300">→</span>
          <PlaceIcon loc={leg.to} className="w-3.5 h-3.5 text-base-500 shrink-0" />
          <span className="text-base-600 truncate">{leg.to}</span>
          {leg.carrier && (
            <span className="ml-auto text-[11px] font-medium px-2 py-0.5 rounded-full bg-white border border-base-200 whitespace-nowrap">
              {leg.carrier}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
