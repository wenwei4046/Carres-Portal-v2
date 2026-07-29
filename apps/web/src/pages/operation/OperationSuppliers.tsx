import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  MIN_JUDGED_POS,
  SCORECARD_UNKNOWN_TEXT,
  scorecardHeadline,
  type ScorecardRate,
  type SupplierScorecard,
} from "@carres/shared";
import { qk } from "@/lib/queries";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";

/**
 * Phase 10 · Operation · Suppliers — `reference/proto/principal-suppliers.jsx`
 * pixel parity. 2-col grid of clickable supplier cards; click opens a 480-wide
 * right-side drawer with recent 12 POs.
 *
 * Distinct from operation's CRUD suppliers admin (procurement-side): this is
 * the read-only roster/oversight view. Endpoint /api/operation/suppliers-overview.
 *
 * 2026-05-19 — moved from PrincipalSuppliers.
 *
 * ── R5 · the scorecard lives here (2026-07-27) ──────────────────────────────
 * `docs/receiving-claim-execution-queue.md`: "Lives on the Suppliers page …
 * Done when: next supplier negotiation opens with numbers, not memory."
 *
 * Every figure is computed by `computeSupplierScorecard` in the shared module
 * and arrives on the row — this file renders the answer and does no arithmetic
 * of its own, so the card and the drawer can never disagree.
 *
 * TWO deliberate absences, both of them the point:
 *
 *  · **No colour on any figure.** UI-KIT reserves colour for action, selection,
 *    status and alert. A percentage is none of those until somebody sets a
 *    target, and NOBODY HAS: painting 82% amber would be the portal inventing
 *    a supplier policy Jess never ruled — the same trap R2 and R3 each refused.
 *    When a target exists it becomes a status and earns its colour.
 *  · **No score where there are no records.** Live prod holds ten suppliers and
 *    zero purchase orders, so a naive build opens ten cards with `0%` against
 *    ten names that never failed. Where a rate is withheld the card says WHY
 *    and what changes it, which is the empty-state law, not decoration.
 */

type SupplierRow = {
  id: string;
  name: string;
  contact: string | null;
  contactEmail: string | null;
  leadTime: string | null;
  kind: "own_logistics" | "factory_pickup" | null;
  catCovered: string[];
  portalEnabled: boolean;
  slug: string | null;
  openPos: number;
  receivedPos: number;
  totalPos: number;
  scorecard: SupplierScorecard;
};

type PoRow = {
  id: string;
  status: string;
  supStatus: string | null;
  etaDate: string | null;
  placedAt: string | null;
};

type OverviewResponse = {
  suppliers: SupplierRow[];
  scorecardWindow?: { days: number; asOf: string; truncated: boolean };
};

/** The figure, or an em dash. Never a zero nobody earned. */
function rateText(r: ScorecardRate): string {
  return r.known ? `${r.pct}%` : "—";
}

/** Why a figure is missing — the sentence goes under the dash so the reader is
 *  never left guessing whether the supplier is perfect or unmeasured. */
function rateWhy(r: ScorecardRate): string | null {
  return r.known ? null : SCORECARD_UNKNOWN_TEXT[r.reason];
}

export default function OperationSuppliers() {
  const { data, isLoading } = useQuery<OverviewResponse>({
    queryKey: qk.operation.suppliersOverview(),
    queryFn: () => apiFetch("/api/operation/suppliers-overview"),
  });
  const suppliers = data?.suppliers ?? [];
  const win = data?.scorecardWindow;
  const [open, setOpen] = useState<SupplierRow | null>(null);

  return (
    <div className="px-9 py-8 pb-14">
      <div className="mb-[22px]">
        <div className="kicker">HQ · Network</div>
        <h1 className="text-page font-display mt-1.5">
          Suppliers
        </h1>
        <div className="text-body text-base-600 mt-1.5">
          {suppliers.length} active · upstream of stock pipeline.
        </div>
        {win && (
          <div className="text-label text-base-500 mt-1">
            Delivery record covers the last {win.days} days, to {fmtDate(win.asOf)}.
            {win.truncated
              ? " Older POs beyond the scan limit are not counted."
              : ""}
          </div>
        )}
      </div>

      {isLoading && <div className="text-body text-base-600">Loading…</div>}

      {!isLoading && suppliers.length === 0 && (
        <div className="text-body text-base-500">No suppliers yet.</div>
      )}

      <div className="grid grid-cols-2 gap-3.5">
        {suppliers.map((s) => (
          <button
            key={s.id}
            onClick={() => setOpen(s)}
            className="text-left p-5 bg-white border border-base-200 rounded hover:border-base-400 transition-colors cursor-pointer"
          >
            <div className="flex justify-between items-start mb-2.5">
              <div>
                <div className="text-strong font-semibold">{s.name}</div>
                <div className="text-label text-base-500 mt-[3px]">
                  {s.contactEmail ?? s.contact ?? "—"}
                </div>
              </div>
              <KindChip kind={s.kind} />
            </div>
            {/* P1 (2026-07-28) — the `Lead time` stat is RETIRED. It printed
                `suppliers.lead_time`, free text ("7-21 days") that no engine
                could compute from and that 8 of 10 suppliers left empty. How
                long a factory takes is now a number a human sets, per supplier
                × category, on Purchasing → Settings — and two places claiming
                to answer one question is how the sofa ended up with three
                different production times. The column is untouched in the DB;
                it simply stops being shown as an answer. */}
            <div className="grid grid-cols-2 gap-2.5 mt-3.5">
              <Stat label="Open POs" v={s.openPos} />
              <Stat label="Received" v={s.receivedPos} />
            </div>
            <div className="mt-3 text-label text-base-500">
              Covers · {s.catCovered.length ? s.catCovered.join(" · ") : "—"}
            </div>
            <CardScorecard sc={s.scorecard} />
          </button>
        ))}
      </div>

      {open && <SupplierDrawer supplier={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function KindChip({ kind }: { kind: SupplierRow["kind"] }) {
  if (!kind) return null;
  const isOwn = kind === "own_logistics";
  return (
    <span
      className={`text-label font-semibold uppercase tracking-[0.06em] px-2.5 py-[2px] rounded-full ${
        isOwn ? "bg-success-soft text-success" : "bg-base-100 text-base-700"
      }`}
    >
      {isOwn ? "Own Logistics" : "Factory Pickup"}
    </span>
  );
}

function Stat({ label, v }: { label: string; v: number | string }) {
  return (
    <div>
      <div className="text-label font-semibold uppercase tracking-[0.08em] text-base-500">
        {label}
      </div>
      <div className="text-strong font-semibold text-base-900 mt-0.5 tabular-nums">
        {v}
      </div>
    </div>
  );
}

/**
 * The card's scorecard strip.
 *
 * When nothing can be scored yet it shows ONE sentence instead of a row of
 * dashes — ten identical rows of "—" teach nothing, and the sentence says both
 * why the figures are absent and what makes them appear.
 */
function CardScorecard({ sc }: { sc: SupplierScorecard }) {
  const anyKnown =
    sc.onTime.known || sc.inFull.known || sc.faulty.known || sc.claimRate.known;

  return (
    <div className="mt-3.5 pt-3 border-t border-base-100">
      {anyKnown && (
        <div className="grid grid-cols-4 gap-2.5 mb-2">
          <Stat label="On time" v={rateText(sc.onTime)} />
          <Stat label="In full" v={rateText(sc.inFull)} />
          <Stat label="Damaged or wrong" v={rateText(sc.faulty)} />
          <Stat label="Needed a claim" v={rateText(sc.claimRate)} />
        </div>
      )}
      <div className="text-label text-base-600">{scorecardHeadline(sc)}</div>
    </div>
  );
}

function SupplierDrawer({ supplier, onClose }: { supplier: SupplierRow; onClose: () => void }) {
  const { data, isLoading } = useQuery<{ pos: PoRow[] }>({
    queryKey: qk.operation.suppliersOverviewPos(supplier.id),
    queryFn: () => apiFetch(`/api/operation/suppliers-overview/${supplier.id}/pos`),
  });
  const pos = data?.pos ?? [];

  return (
    <div className="fixed inset-0 z-[90] flex justify-end">
      <div onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative w-[480px] bg-white h-screen overflow-auto p-7">
        <div className="flex justify-between items-start mb-[18px]">
          <div>
            <div className="kicker">{supplier.slug ?? supplier.id.slice(0, 8)}</div>
            <h2 className="text-page font-display mt-1">
              {supplier.name}
            </h2>
            <div className="text-meta text-base-600 mt-1">
              {/* P1 — the free-text lead time is not appended here either;
                  see the card above. */}
              {supplier.contactEmail ?? supplier.contact ?? "—"}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-strong text-base-500 hover:text-base-900 cursor-pointer"
          >
            ×
          </button>
        </div>

        <ScorecardBlock sc={supplier.scorecard} />

        <div className="text-label font-semibold uppercase tracking-[0.08em] text-base-500 mb-2">
          Recent POs
        </div>
        <div className="border border-base-200 rounded">
          {isLoading && <div className="p-4 text-meta text-base-500">Loading…</div>}
          {!isLoading && pos.length === 0 && (
            <div className="p-4 text-meta text-base-500">No POs yet.</div>
          )}
          {pos.map((p, i) => (
            <div
              key={p.id}
              className={`px-3.5 py-2.5 flex justify-between text-meta ${i ? "border-t border-base-100" : ""}`}
            >
              <div>
                <div className="font-mono font-semibold">{p.id}</div>
                <div className="text-label text-base-500 mt-0.5">
                  {fmtDate(p.placedAt)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-label text-base-500 uppercase font-semibold tracking-[0.05em]">
                  {(p.supStatus ?? p.status)?.replace(/_/g, " ")}
                </div>
                <div className="text-label text-base-500 mt-0.5">
                  {p.etaDate ? `ETA ${p.etaDate}` : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The negotiation sheet — the five numbers the card asks for, each one either
 * backed by records or replaced by the reason it is not.
 *
 * The coverage lines below the figures are not filler: they are what stops the
 * reader treating "12 deliveries" as the whole story when four of them carried
 * no promised date and were never scored.
 */
function ScorecardBlock({ sc }: { sc: SupplierScorecard }) {
  const c = sc.coverage;
  const notes: string[] = [];
  if (c.noPromisedDate > 0)
    notes.push(
      c.noPromisedDate === 1
        ? "1 PO carries no promised date and cannot be scored"
        : `${c.noPromisedDate} POs carry no promised date and cannot be scored`,
    );
  if (c.notDueYet > 0)
    notes.push(
      c.notDueYet === 1
        ? "1 PO has not reached its promised date"
        : `${c.notDueYet} POs have not reached their promised date`,
    );
  if (c.noDeliveryDate > 0)
    notes.push(
      c.noDeliveryDate === 1
        ? "1 PO arrived complete with no receipt date, so on time cannot be answered for it"
        : `${c.noDeliveryDate} POs arrived complete with no receipt date, so on time cannot be answered for them`,
    );

  return (
    <div className="mb-6">
      <div className="text-label font-semibold uppercase tracking-[0.08em] text-base-500 mb-2">
        Scorecard
      </div>
      <div className="border border-base-200 rounded p-4">
        <div className="text-meta text-base-800 mb-3">
          {scorecardHeadline(sc)}
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Measure label="On time" r={sc.onTime} noun="deliveries" />
          <Measure label="In full" r={sc.inFull} noun="deliveries" />
          <Measure label="Damaged or wrong" r={sc.faulty} noun="units they sent" />
          <Measure label="Needed a claim" r={sc.claimRate} noun="deliveries" />
        </div>

        <div className="mt-4 pt-3 border-t border-base-100">
          <div className="text-label font-semibold uppercase tracking-[0.08em] text-base-500">
            Claims
          </div>
          <div className="text-meta text-base-800 mt-1 tabular-nums">
            {sc.claims.open} open · {sc.claims.closed} settled
            {sc.claims.avgDaysToSettle !== null
              ? ` · settled in ${sc.claims.avgDaysToSettle} day${sc.claims.avgDaysToSettle === 1 ? "" : "s"} on average`
              : ""}
          </div>
          {sc.claims.closed === 0 && sc.claims.open > 0 && (
            <div className="text-label text-base-500 mt-1">
              Nothing settled yet, so there is no average to show.
            </div>
          )}
          {sc.claims.oldestOpenDays !== null && (
            <div className="text-label text-base-500 mt-1 tabular-nums">
              Oldest open claim: {sc.claims.oldestOpenDays} day
              {sc.claims.oldestOpenDays === 1 ? "" : "s"}.
            </div>
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-base-100 text-label text-base-500">
          <div className="tabular-nums">
            {c.pos} PO{c.pos === 1 ? "" : "s"} on file
            {c.from ? ` since ${fmtDate(c.from)}` : ""} · {c.judged} scored.
          </div>
          {notes.map((n) => (
            <div key={n} className="mt-0.5">
              {n}.
            </div>
          ))}
          {c.judged > 0 && c.judged < MIN_JUDGED_POS && (
            <div className="mt-0.5">
              A score needs {MIN_JUDGED_POS} deliveries — one late delivery out
              of one is not a record.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Measure({
  label,
  r,
  noun,
}: {
  label: string;
  r: ScorecardRate;
  /** What the denominator counts — "deliveries" or "units they sent". The
   *  fraction is always spelt out beneath the percentage, so nobody reads
   *  "33%" without seeing it is one delivery out of three. */
  noun: string;
}) {
  const why = rateWhy(r);
  return (
    <div>
      <div className="text-label font-semibold uppercase tracking-[0.08em] text-base-500">
        {label}
      </div>
      <div className="text-strong font-semibold text-base-900 mt-0.5 tabular-nums">
        {rateText(r)}
      </div>
      <div className="text-label text-base-500 mt-0.5">
        {why ?? `${r.hits} of ${r.of} ${noun}`}
      </div>
    </div>
  );
}
