import { Building2, Factory, MapPin, Plus, Trash2, Warehouse } from "lucide-react";
import { STOCK_LOCATIONS } from "@carres/shared";

/**
 * The transfer route of one order line, as STOPS: an ordered list of real
 * locations riding `ops_order_control.line_locations[sku]`. stop[0] is where
 * the item sits now; each further stop is the next transfer hop.
 * MiniStopsBar shows the route, StopsEditor edits it.
 */

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

// Route = INBOUND pickup stops only (Jess 2026-07-11) — getting an item INTO the
// consolidation warehouse. The final delivery to the customer is the Delivery
// panel's job, so "Customer" is deliberately NOT a stop here.
const LEG_PLACES = [...STOCK_LOCATIONS] as const;

/**
 * MiniStopsBar (rev18, Jess Option 3 — the freight-tracker pattern she picked
 * in v3 "Option D"): an ALWAYS-VISIBLE numbered route bar under the item name,
 * drawn ONLY when a special multi-stop route is authored (standard single-stop
 * items stay quiet — her no-noise rule). Stop 1 = filled (where the item sits
 * now); later stops = numbered rings; short site names after. No words beyond
 * the place names.
 */
export function MiniStopsBar({
  stops,
  names,
}: {
  stops: string[];
  /** Pre-shortened site names ("Klang → AL"). */
  names: string;
}) {
  if (stops.length < 2) return null;
  return (
    <span className="inline-flex items-center gap-1 min-w-0">
      {stops.map((_, i) => (
        <span key={i} className="inline-flex items-center gap-1 shrink-0">
          {i > 0 && (
            <span className="w-4 h-0.5 bg-base-200 rounded-full" aria-hidden="true" />
          )}
          <span
            className={`w-4 h-4 rounded-full grid place-items-center text-label font-semibold leading-none ${
              i === 0
                ? "bg-base-700 text-white"
                : "bg-white border border-base-300 text-base-400"
            }`}
          >
            {i + 1}
          </span>
        </span>
      ))}
      <span className="text-label text-base-500 truncate min-w-0">{names}</span>
    </span>
  );
}

/**
 * The in-place route STOPS editor — HORIZONTAL chips (rev17, Jess: routes are
 * horizontal things; the old vertical numbered list + explanation sentence +
 * separate journey bar said the same route three ways and still read as a
 * puzzle). The chips ARE the journey AND the editor: place-icon + select in a
 * pill, → between pills, 🗑 on multi-stop pills, a round + to append a hop.
 * No explanatory words (Jess's locked language law: colour + icon + position).
 * One chip = the standard single location; more = a multi-hop transfer.
 */
export function StopsEditor({
  stops,
  onChange,
  onDone,
}: {
  stops: string[];
  onChange: (stops: string[]) => void;
  /** Renders a ✓ Done chip that closes the editor (rev18b — Jess: "once I
   *  choose the route, how does it hide?"). */
  onDone?: () => void;
}) {
  const halt = (e: { stopPropagation: () => void }) => e.stopPropagation();
  const shown = stops.length > 0 ? stops : ["Carres Klang"];
  const update = (i: number, v: string) =>
    onChange(shown.map((s, j) => (j === i ? v : s)));
  // "+" appends a place DIFFERENT from the last stop — appending the same
  // default place made an instant meaningless "Klang → Klang" route.
  const nextPlace =
    LEG_PLACES.find((p) => p !== shown[shown.length - 1]) ?? "Carres Klang";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map((s, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {i > 0 && (
            <span className="text-base-400 text-body" aria-hidden="true">
              →
            </span>
          )}
          <span className="inline-flex items-center gap-1 bg-white border border-base-200 rounded-full pl-2 pr-1 py-0.5">
            <PlaceIcon loc={s} className="w-3.5 h-3.5 shrink-0 text-base-500" />
            <select
              value={s}
              onClick={halt}
              onChange={(e) => update(i, e.target.value)}
              title={i === 0 ? "Where the item sits" : "Next transfer stop"}
              className="bg-transparent text-meta text-base-800 focus:outline-none cursor-pointer"
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
            {shown.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  halt(e);
                  onChange(shown.filter((_, j) => j !== i));
                }}
                title="Remove stop"
                className="text-base-300 hover:text-danger shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </span>
        </span>
      ))}
      <button
        type="button"
        onClick={(e) => {
          halt(e);
          onChange([...shown, nextPlace]);
        }}
        title="Add a transfer stop"
        className="size-6 rounded-full border border-base-200 bg-white grid place-items-center text-base-500 hover:text-primary hover:border-base-300 shrink-0"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
      {onDone && (
        <button
          type="button"
          onClick={(e) => {
            halt(e);
            onDone();
          }}
          title="Done — close the route editor (the route is kept)"
          className="inline-flex items-center gap-1 text-meta font-semibold text-base-600 hover:text-base-900 bg-white border border-base-200 rounded-full px-2.5 py-0.5 shrink-0 ml-1"
        >
          ✓ Done
        </button>
      )}
    </div>
  );
}
