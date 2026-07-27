import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  computeSupplierScorecard,
  type ScorecardClaim,
  type ScorecardLine,
  type ScorecardPo,
} from "@carres/shared";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/operation/suppliers-overview — Phase 10 read-only oversight of the
 * supplier roster + per-supplier PO performance. Mirrors `reference/proto/
 * principal-suppliers.jsx` data contract.
 *
 * Distinct from /api/operation/suppliers (the editable CRUD endpoint used by
 * the procurement admin flow): this is an observation surface — supplier
 * cards + recent-12-PO drawer for the dealer/finance/operation reads.
 * Suffix `-overview` keeps the two endpoints disambiguated.
 *
 * GET / — list with rolled-up PO stats per supplier (open / received /
 *         total), PLUS the R5 scorecard (see below).
 *
 * GET /:id/pos — recent 12 POs for the drawer view.
 *
 * 2026-05-19 — moved from /api/principal/suppliers.
 *
 * ── R5 · the supplier scorecard (2026-07-27) ────────────────────────────────
 *
 * The card: "per supplier, derived from R1-R4 data … Done when: next supplier
 * negotiation opens with numbers, not memory."
 *
 * It is DERIVED here and nowhere else — no RPC, no migration, no stored
 * figure. The arithmetic lives in `computeSupplierScorecard`
 * (packages/shared/src/supplier-scorecard.ts) so the API and any later
 * consumer read one rule; this route's whole job is to hand it honest inputs.
 *
 * Three things about those inputs are load-bearing:
 *
 *  1. **`purchase_orders.status` never reaches the score.** R4's carry-forward:
 *     a PO whose shortfall is made good by RELEASING held units stays `open`
 *     forever, so a scorecard keyed on that word would report a supplier as
 *     permanently undelivered for a problem they fixed. Completeness is read
 *     from the lines. (The legacy open/received tallies below still read the
 *     column — they are the old PO counters, not the score.)
 *  2. **Dates are MYT calendar days.** The Worker's clock is UTC; between
 *     16:00 and midnight UTC it is already tomorrow in Klang, and a receipt
 *     stamped then would read as a day late against its promised date.
 *  3. **The window is stated, never assumed.** A window is not a history:
 *     the payload carries `scorecardWindow` so the screen can say what it
 *     looked at instead of implying it looked at everything.
 */
const operationSuppliersOverviewRouter = new Hono<AppEnv>();

/** How far back the scorecard looks. A year of deliveries is what a supplier
 *  negotiation is actually about; older POs describe a different price list. */
const SCORECARD_WINDOW_DAYS = 365;
/** Hard ceiling on the PO scan. Reported to the screen when hit — a silent
 *  truncation reads as "we looked at everything" when we did not. */
const PO_SCAN_LIMIT = 2000;
/** `?po_id=in.(…)` travels in the URL, so the id list is chunked rather than
 *  sent as one request a proxy would refuse. */
const IN_CHUNK = 150;

/** Today in MYT — see note 2 above. */
function todayIsoMYT(): string {
  return new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
}

/** A timestamptz → the MYT calendar day it fell on. NULL stays NULL: a missing
 *  stamp must never become a date (the engine's gate D depends on it). */
function isoDayMYT(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const ms = Date.parse(ts);
  if (Number.isNaN(ms)) return null;
  return new Date(ms + 8 * 3_600_000).toISOString().slice(0, 10);
}

function chunk<T>(xs: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

operationSuppliersOverviewRouter.use("*", async (c, next) => {
  const role = c.var.auth?.role;
  if (role !== "operation" && role !== "principal") {
    throw new HTTPException(403, { message: "Operation/Principal only" });
  }
  await next();
});

operationSuppliersOverviewRouter.get("/", async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  const asOf = todayIsoMYT();
  const windowStart = new Date(
    Date.parse(`${asOf}T00:00:00Z`) - SCORECARD_WINDOW_DAYS * 86_400_000,
  )
    .toISOString()
    .slice(0, 10);

  const [suppliersRes, posRes] = await Promise.all([
    sb
      .from("suppliers")
      .select("id, name, contact, contact_email, lead_time, kind, cat_covered, portal_enabled, slug")
      .order("name"),
    sb
      .from("purchase_orders")
      .select("id, supplier_id, status, sup_status, eta_date, placed_at, do_uploaded_at")
      .gte("placed_at", windowStart)
      .order("placed_at", { ascending: false })
      .limit(PO_SCAN_LIMIT),
  ]);
  if (suppliersRes.error) throw new HTTPException(500, { message: suppliersRes.error.message });
  if (posRes.error) throw new HTTPException(500, { message: posRes.error.message });

  const poRows = posRes.data ?? [];
  const truncated = poRows.length >= PO_SCAN_LIMIT;
  const poIds = poRows.map((p) => p.id as string);

  // The lines and the claims for exactly those POs. Both are read with the
  // caller's JWT, so RLS stays the security boundary.
  const [lineChunks, claimChunks] = await Promise.all([
    Promise.all(
      chunk(poIds, IN_CHUNK).map((ids) =>
        sb
          .from("purchase_order_lines")
          .select("po_id, qty, received_qty, damaged_qty, wrong_item_qty")
          .in("po_id", ids),
      ),
    ),
    Promise.all(
      chunk(poIds, IN_CHUNK).map((ids) =>
        sb
          .from("supplier_claims")
          .select("po_id, claim_type, status, reported_at, closed_at")
          .in("po_id", ids),
      ),
    ),
  ]);

  const posBySupplier = new Map<string, ScorecardPo[]>();
  const linesBySupplier = new Map<string, ScorecardLine[]>();
  const claimsBySupplier = new Map<string, ScorecardClaim[]>();
  const supplierOfPo = new Map<string, string>();

  // Group POs per supplier into open / received / total tallies (legacy) and
  // into the scorecard's own input shape.
  const tally = new Map<string, { open: number; received: number; total: number }>();
  for (const p of poRows) {
    const sid = (p.supplier_id as string | null) ?? null;
    if (!sid) continue;
    supplierOfPo.set(p.id as string, sid);

    const t = tally.get(sid) ?? { open: 0, received: 0, total: 0 };
    t.total += 1;
    if (p.status === "received") t.received += 1;
    else if (p.status === "open") t.open += 1;
    tally.set(sid, t);

    const arr = posBySupplier.get(sid) ?? [];
    arr.push({
      id: p.id as string,
      supplier_id: sid,
      eta_date: (p.eta_date as string | null) ?? null,
      placed_at: String(p.placed_at ?? "").slice(0, 10),
      received_on: isoDayMYT(p.do_uploaded_at as string | null),
    });
    posBySupplier.set(sid, arr);
  }

  for (const res of lineChunks) {
    if (res.error) throw new HTTPException(500, { message: res.error.message });
    for (const l of res.data ?? []) {
      const sid = supplierOfPo.get(l.po_id as string);
      if (!sid) continue;
      const arr = linesBySupplier.get(sid) ?? [];
      arr.push({
        po_id: l.po_id as string,
        qty: Number(l.qty ?? 0),
        received_qty: Number(l.received_qty ?? 0),
        damaged_qty: Number(l.damaged_qty ?? 0),
        wrong_item_qty: Number(l.wrong_item_qty ?? 0),
      });
      linesBySupplier.set(sid, arr);
    }
  }

  for (const res of claimChunks) {
    if (res.error) throw new HTTPException(500, { message: res.error.message });
    for (const cl of res.data ?? []) {
      const sid = supplierOfPo.get(cl.po_id as string);
      if (!sid) continue;
      const arr = claimsBySupplier.get(sid) ?? [];
      arr.push({
        po_id: cl.po_id as string,
        claim_type: cl.claim_type as string,
        status: cl.status as string,
        // A claim always carries `reported_at` (NOT NULL); the fallback only
        // exists so an unparseable stamp reads as "today", never as an
        // impossibly old open claim.
        reported_on: isoDayMYT(cl.reported_at as string) ?? asOf,
        closed_on: isoDayMYT(cl.closed_at as string | null),
      });
      claimsBySupplier.set(sid, arr);
    }
  }

  const suppliers = (suppliersRes.data ?? []).map((s) => {
    const t = tally.get(s.id) ?? { open: 0, received: 0, total: 0 };
    return {
      id: s.id,
      name: s.name,
      contact: s.contact,
      contactEmail: s.contact_email,
      leadTime: s.lead_time,
      kind: s.kind, // own_logistics | factory_pickup
      catCovered: s.cat_covered ?? [],
      portalEnabled: s.portal_enabled,
      slug: s.slug,
      openPos: t.open,
      receivedPos: t.received,
      totalPos: t.total,
      // R5 — computed, never stored.
      scorecard: computeSupplierScorecard({
        supplier_id: s.id,
        pos: posBySupplier.get(s.id) ?? [],
        lines: linesBySupplier.get(s.id) ?? [],
        claims: claimsBySupplier.get(s.id) ?? [],
        asOf,
      }),
    };
  });

  return c.json({
    suppliers,
    scorecardWindow: { days: SCORECARD_WINDOW_DAYS, asOf, truncated },
  });
});

operationSuppliersOverviewRouter.get("/:id/pos", async (c) => {
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("purchase_orders")
    .select("id, status, sup_status, eta_date, placed_at")
    .eq("supplier_id", id)
    .order("placed_at", { ascending: false, nullsFirst: false })
    .limit(12);
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json({
    pos: (data ?? []).map((p) => ({
      id: p.id,
      status: p.status,
      supStatus: p.sup_status,
      etaDate: p.eta_date,
      placedAt: p.placed_at,
    })),
  });
});

export default operationSuppliersOverviewRouter;
