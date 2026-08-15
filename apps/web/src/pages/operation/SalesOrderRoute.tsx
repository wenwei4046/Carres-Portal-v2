/**
 * ORDER ROUTE — the owner's two-layer drawing, rendered.
 *
 * ```
 * ORDER TRACKS      four FIXED parallel facts, never one status
 * LINKED PROBLEMS   only when a case exists — Service is not a fifth track
 * GOODS ROUTES      one collapsible block per goods line, forking by quantity
 * DELIVERY RELEASE  derived, read-only, NO release button
 * ```
 *
 * The reading model is copied from parcel tracking / Stripe timelines /
 * GitHub checks as a PATTERN only; every colour, size, spacing and component
 * here is the Carres UI Kit. Nothing on this page writes.
 */
import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronRight, Circle, CircleDot } from "lucide-react";
import { Link } from "react-router-dom";
import type {
  GoodsRoute,
  GoodsSubLane,
  RouteDoor,
  RouteMark,
  RouteStation,
  SalesOrderRoute as Route,
  StationOwnerKey,
} from "@carres/shared";
import Loading from "@/components/kit/Loading";
import { fmtDate } from "@/lib/fmt-date";
import { avatarColor, personInitials, personLabel } from "@/lib/staff-avatar";

/** The resolved person behind an action-engine line. The Route never derives
 *  duty; it is handed the holder the roster already names. */
export interface RouteActionOwners {
  purchasing: { userId: string; name: string | null; email: string } | null;
  receiving: { userId: string; name: string | null; email: string } | null;
}

/* ONE date spelling. Facts carry ISO with their meaning attached
   (`Issued: 2026-08-13`); the year rule lives in `fmtDate`. */
const spellDates = (s: string) => s.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (iso) => fmtDate(iso));

const MARK_TONE: Record<RouteMark, string> = {
  complete: "bg-kit-green-3 text-kit-green-11",
  current: "bg-kit-blue-3 text-kit-blue-11",
  waiting: "bg-kit-slate-3 text-kit-slate-9",
  blocked: "bg-kit-amber-3 text-kit-amber-11",
};

function Mark({ mark }: { mark: RouteMark }) {
  const Glyph =
    mark === "complete" ? Check : mark === "blocked" ? AlertTriangle : mark === "current" ? CircleDot : Circle;
  return (
    <span
      className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${MARK_TONE[mark]}`}
      data-mark={mark}
      aria-hidden="true"
    >
      <Glyph size={14} />
    </span>
  );
}

function Door({ door }: { door: RouteDoor }) {
  return (
    <Link
      to={door.href}
      className="inline-flex text-label font-medium text-kit-blue-11 underline-offset-2 hover:underline"
    >
      {door.label}
    </Link>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Layer 1
 * ──────────────────────────────────────────────────────────────────────────── */

function OrderTracks({ route }: { route: Route }) {
  return (
    <section className="rounded-card border border-kit-slate-5 bg-white" data-testid="order-tracks">
      <div className="border-b border-kit-slate-5 px-4 py-3">
        <h2 className="text-label font-semibold tracking-wide text-base-500 uppercase">Order tracks</h2>
      </div>
      <div className="divide-y divide-kit-slate-5">
        {route.tracks.map((track) => (
          <div key={track.key} className="flex items-start gap-3 px-4 py-3" data-testid={`track-${track.key}`}>
            <Mark mark={track.mark} />
            <span className="w-24 shrink-0 text-label font-semibold tracking-wide text-base-600 uppercase">
              {track.title}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-body text-base-900">{spellDates(track.status)}</span>
              {track.door && (
                <span className="mt-1 block">
                  <Door door={track.door} />
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Conditional and visually separate. A section that says "nothing" on every
 *  order is a section the operator learns to skip. */
function LinkedProblems({ route }: { route: Route }) {
  if (route.linkedProblems.length === 0) return null;
  return (
    <section
      className="rounded-card border border-kit-slate-5 bg-kit-amber-3"
      data-testid="linked-problems"
    >
      <div className="border-b border-kit-slate-5 px-4 py-3">
        <h2 className="text-label font-semibold tracking-wide text-kit-amber-11 uppercase">Linked problems</h2>
      </div>
      <div className="divide-y divide-kit-slate-5">
        {route.linkedProblems.map((problem) => (
          <div key={problem.id} className="flex items-start gap-3 px-4 py-3">
            <Mark mark="blocked" />
            <span className="min-w-0 flex-1">
              <span className="block text-body font-medium text-base-900">{problem.title}</span>
              <span className="mt-1 block">
                <Door door={problem.door} />
              </span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Layer 2 · a station
 * ──────────────────────────────────────────────────────────────────────────── */

function OwnerChip({
  ownerKey,
  owners,
}: {
  ownerKey: StationOwnerKey;
  owners: RouteActionOwners;
}) {
  const person = ownerKey === "receiving" ? owners.receiving : owners.purchasing;
  if (!person) return null;
  const colors = avatarColor(person.userId);
  const label = personLabel(person.name, person.email);
  return (
    <span
      className="inline-grid h-5 w-5 shrink-0 place-items-center rounded-full text-label font-semibold"
      style={{ background: colors.bg, color: colors.fg }}
      title={label}
      aria-label={label}
    >
      {personInitials(person.name, person.email)}
    </span>
  );
}

function Station({ station, owners }: { station: RouteStation; owners: RouteActionOwners }) {
  return (
    <div className="flex items-start gap-2.5 py-2" data-testid={`station-${station.id}`}>
      <Mark mark={station.mark} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-label font-semibold tracking-wide text-base-600 uppercase">
            {station.title}
          </span>
          {station.current && (
            <span className="text-label font-semibold tracking-wide text-kit-blue-11">CURRENT</span>
          )}
        </div>
        {station.evidence && (
          <div className="mt-0.5 text-body text-base-900">{spellDates(station.evidence)}</div>
        )}
        {station.status && (
          <div className="mt-0.5 text-body text-base-900">{spellDates(station.status)}</div>
        )}
        {station.action && (
          /* The 13 / 11 two-line grammar: the FACT above, the INSTRUCTION here,
             with the owner as a chip rather than a name inside the sentence. */
          <div className="mt-1 flex items-center gap-1.5">
            <OwnerChip ownerKey={station.action.ownerKey} owners={owners} />
            <span className="text-label font-normal text-base-600">{station.action.label}</span>
          </div>
        )}
        {station.door && (
          <div className="mt-1">
            <Door door={station.door} />
          </div>
        )}
      </div>
    </div>
  );
}

function SubLane({
  lane,
  forked,
  owners,
}: {
  lane: GoodsSubLane;
  forked: boolean;
  owners: RouteActionOwners;
}) {
  return (
    <div
      className={forked ? "border-l border-kit-slate-6 pl-4" : ""}
      data-testid={`sub-lane-${lane.id}`}
    >
      <div className="text-label font-semibold tracking-wide text-base-600 uppercase">{lane.title}</div>
      <div className="mt-1 divide-y divide-kit-slate-5 border-l border-kit-slate-5 pl-3">
        {lane.stations.map((station) => (
          <Station key={station.id} station={station} owners={owners} />
        ))}
      </div>
    </div>
  );
}

function GoodsBlock({ goods, owners }: { goods: GoodsRoute; owners: RouteActionOwners }) {
  const [open, setOpen] = useState(true);
  if (goods.cancelled) {
    return (
      <article className="px-4 py-3" data-testid={`goods-route-${goods.id}`}>
        <div className="text-body text-kit-slate-9">
          {goods.title} · {goods.cancelledWord}
        </div>
      </article>
    );
  }
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <article className="px-4 py-3" data-testid={`goods-route-${goods.id}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left"
      >
        <Chevron size={16} className="shrink-0 text-base-600" aria-hidden="true" />
        <span className="text-body font-semibold text-base-900">{goods.title}</span>
      </button>
      {open && (
        <div className="mt-3 pl-6">
          {goods.origin && <Station station={goods.origin} owners={owners} />}
          <div className="mt-2 flex flex-col gap-4">
            {goods.lanes.map((lane) => (
              <SubLane key={lane.id} lane={lane} forked={goods.forked} owners={owners} />
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Layer 2 · the release gate. Read-only: the ONLY control is the way out.
 * ──────────────────────────────────────────────────────────────────────────── */

function DeliveryRelease({ route }: { route: Route }) {
  const { release } = route;
  return (
    <section className="rounded-card border border-kit-slate-5 bg-white" data-testid="delivery-release">
      <div className="border-b border-kit-slate-5 px-4 py-3">
        <h2 className="text-label font-semibold tracking-wide text-base-500 uppercase">Delivery release</h2>
      </div>
      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          <Mark mark={release.ready ? "complete" : "waiting"} />
          <span className="min-w-0">
            <span className="block text-body font-semibold text-base-900">{release.headline}</span>
            <span className="block text-label font-normal text-base-600">{release.summary}</span>
          </span>
        </div>
        <div className="mt-3 divide-y divide-kit-slate-5 border-t border-kit-slate-5">
          {release.requirements.map((requirement) => (
            <div
              key={requirement.id}
              className="flex items-start gap-3 py-2.5"
              data-testid={`release-${requirement.id}`}
            >
              <Mark mark={requirement.mark} />
              <span className="min-w-0">
                <span className="block text-body font-medium text-base-900">{requirement.title}</span>
                {requirement.details.map((detail) => (
                  <span key={detail} className="block text-label font-normal text-base-600">
                    {spellDates(detail)}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 border-t border-kit-slate-5 pt-3">
          <Door door={release.door} />
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The page.
 * ──────────────────────────────────────────────────────────────────────────── */

export default function SalesOrderRoute({
  route,
  owners = { purchasing: null, receiving: null },
  loading = false,
}: {
  route: Route;
  owners?: RouteActionOwners;
  loading?: boolean;
}) {
  if (loading) return <Loading label="Opening the order route" />;
  return (
    <div className="mx-auto flex max-w-[1080px] flex-col gap-5" data-testid="sales-order-route">
      <div className="border-b border-kit-slate-6 pb-3">
        <h1 className="text-page text-kit-slate-12">Order Route</h1>
        <p className="mt-1 text-body text-kit-slate-11">
          {route.soNumber}
          {route.customerName ? ` · ${route.customerName}` : ""}
        </p>
      </div>

      <OrderTracks route={route} />
      <LinkedProblems route={route} />

      <section className="rounded-card border border-kit-slate-5 bg-white" data-testid="goods-routes">
        <div className="border-b border-kit-slate-5 px-4 py-3">
          <h2 className="text-label font-semibold tracking-wide text-base-500 uppercase">Goods routes</h2>
        </div>
        {route.goodsRoutes.length === 0 ? (
          <div className="px-4 py-4 text-body text-kit-slate-9">No goods on this order</div>
        ) : (
          <div className="divide-y divide-kit-slate-5">
            {route.goodsRoutes.map((goods) => (
              <GoodsBlock key={goods.id} goods={goods} owners={owners} />
            ))}
          </div>
        )}
      </section>

      <DeliveryRelease route={route} />
    </div>
  );
}
