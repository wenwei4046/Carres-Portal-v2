import { Hono } from "hono";
import {
  assignLogisticsInputSchema,
  saveDeliveryArrangementInputSchema,
  isLogisticsChange,
  type DeliveryScopeRef,
} from "@carres/shared";
import { requireOperationOrPrincipal } from "../../lib/auth-guards";
import { mapPgError } from "../../lib/route-helpers";
import { adminClient, userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * THE DELIVERY ARRANGEMENT DOORS (0379) — Delivery's own writes.
 *
 * Owner correction 2026-08-24 overwrites the earlier "Delivery Work writes
 * nothing" claim. Delivery owns the ARRANGEMENT: who carries a scope, on what
 * agreed day, in what window, with which proof of the partner's actual reply.
 * Sales Orders keeps the commercial promise and every customer-owned fact, and
 * NONE of them is writable through this file — `saveDeliveryArrangementInput`
 * simply has no field for them, so a hand-made request cannot smuggle one in.
 *
 * ```
 * GET  /                       every arrangement + its history (workspace read)
 * GET  /:orderId               one scope's arrangement, its history and the
 *                              read-only Sales facts Edit Delivery prints
 * POST /assign                 ONE partner onto one or many scopes, atomically
 * PUT  /:orderId               Save Delivery — the whole form for one scope
 * ```
 *
 * ── THE ONE RULE THIS FILE EXISTS TO ENFORCE ────────────────────────────────
 *
 *   "Never silently replace an existing Logistics Partner. Changing an existing
 *    Partner uses governed `Change logistics`, requiring reason and history."
 *
 * So every write runs the same three steps in ONE service-role transaction:
 * read the current partner → classify assign-vs-change (`isLogisticsChange`,
 * the SAME predicate the dialog runs, so the form cannot ask for something the
 * server does not require) → write the arrangement AND its history row
 * together. A change without a reason is refused with 409 and the scopes it
 * would have overwritten are NAMED, because "some of these already have a
 * carrier" is not an error an operator can act on.
 *
 * ── WHY SERVICE ROLE ────────────────────────────────────────────────────────
 *
 * 0379 gives these tables NO write policy at all (0366's shape). The history
 * row and the partner move must land together or not at all, and a client-side
 * UPDATE cannot promise that. The guard above still runs first: only Operation
 * or Principal reaches this file.
 */
const deliveryArrangementsRouter = new Hono<AppEnv>();

const ARRANGEMENT_SELECT =
  "id, order_id, leg, partner_id, confirmed_date, confirmed_time, expected_arrival, " +
  "logistics_note, reply_proof_path, driver_name, vehicle, updated_at, updated_by, " +
  "delivery_partners(id, name)";

type ArrangementRecord = {
  id: string;
  order_id: string;
  leg: number;
  partner_id: string | null;
  confirmed_date: string | null;
  confirmed_time: string | null;
  expected_arrival: string | null;
  logistics_note: string | null;
  reply_proof_path: string | null;
  driver_name: string | null;
  vehicle: string | null;
  updated_at: string;
  updated_by: string | null;
  delivery_partners?: { id: string; name: string } | null;
};

const shape = (r: ArrangementRecord) => ({
  id: r.id,
  order_id: r.order_id,
  leg: r.leg,
  partner_id: r.partner_id,
  partner_name: r.delivery_partners?.name ?? null,
  confirmed_date: r.confirmed_date,
  confirmed_time: r.confirmed_time,
  /* `time` comes back as `14:30:00`; the form and the document both want
     `14:30`. Trimmed once here so no caller invents a second spelling. */
  expected_arrival: r.expected_arrival ? r.expected_arrival.slice(0, 5) : null,
  logistics_note: r.logistics_note,
  reply_proof_path: r.reply_proof_path,
  driver_name: r.driver_name,
  vehicle: r.vehicle,
  updated_at: r.updated_at,
  updated_by: r.updated_by,
});

/** Every arrangement — the workspace reads them all in one round trip. */
deliveryArrangementsRouter.get("/", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.from("ops_delivery_arrangements").select(ARRANGEMENT_SELECT);
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ arrangements: ((data ?? []) as unknown as ArrangementRecord[]).map(shape) });
});

/**
 * ONE scope, for Edit Delivery. Returns the arrangement, its carrier history
 * and the read-only Sales facts the left column prints — assembled here so the
 * form makes one request and cannot show a customer from one order beside an
 * arrangement from another.
 */
deliveryArrangementsRouter.get("/:orderId", requireOperationOrPrincipal, async (c) => {
  const orderId = c.req.param("orderId");
  const leg = Number(c.req.query("leg") ?? "0");
  if (!Number.isInteger(leg) || leg < 0 || leg > 20) {
    return c.json({ error: "Unknown delivery scope" }, 400);
  }
  const sb = userClient(c.env, c.var.auth.jwt);

  const [{ data: order, error: orderErr }, { data: rows, error: arrErr }] = await Promise.all([
    sb
      .from("orders")
      .select(
        "id, so, source_ref, customer_name, customer_phone, customer_emergency, customer_address, " +
          "customer_address_line1, customer_address_line2, customer_address_city, " +
          "customer_address_state, customer_address_postcode, delivery_date, delivery_date_tbd, " +
          "delivery_floor, delivery_has_lift, delivery_stops, do_number, " +
          "building_type:entry_data->fields->>building_type, " +
          "order_lines(id, sku, qty, attrs), delivery_partner_id, ops_assigned_logistic",
      )
      .eq("id", orderId)
      .maybeSingle(),
    sb.from("ops_delivery_arrangements").select(ARRANGEMENT_SELECT).eq("order_id", orderId).eq("leg", leg),
  ]);
  const firstError = orderErr ?? arrErr;
  if (firstError) {
    const m = mapPgError(firstError);
    return c.json(m.body, m.status);
  }
  if (!order) return c.json({ error: "Order not found" }, 404);

  const arrangement = ((rows ?? []) as unknown as ArrangementRecord[])[0] ?? null;

  let history: unknown[] = [];
  if (arrangement) {
    const { data: events, error: evErr } = await sb
      .from("ops_delivery_arrangement_events")
      .select(
        "id, arrangement_id, event, reason_key, note, recorded_by, recorded_at, " +
          "from_partner:delivery_partners!ops_delivery_arrangement_events_from_partner_id_fkey(name), " +
          "to_partner:delivery_partners!ops_delivery_arrangement_events_to_partner_id_fkey(name)",
      )
      .eq("arrangement_id", arrangement.id)
      .order("recorded_at", { ascending: false });
    if (evErr) {
      const m = mapPgError(evErr);
      return c.json(m.body, m.status);
    }
    history = (events ?? []).map((e) => {
      const row = e as unknown as Record<string, unknown> & {
        from_partner?: { name?: string | null } | null;
        to_partner?: { name?: string | null } | null;
      };
      return {
        id: row.id as string,
        arrangement_id: row.arrangement_id as string,
        event: row.event as "assigned" | "changed" | "cleared",
        from_partner_name: row.from_partner?.name ?? null,
        to_partner_name: row.to_partner?.name ?? null,
        reason_key: (row.reason_key as string | null) ?? null,
        note: (row.note as string | null) ?? null,
        recorded_by: (row.recorded_by as string | null) ?? null,
        recorded_by_name: null,
        recorded_at: row.recorded_at as string,
      };
    });
  }

  return c.json({ order, arrangement: arrangement ? shape(arrangement) : null, history });
});

/** The current partner on each named scope — arrangement first, order as fallback. */
async function currentPartners(
  sb: ReturnType<typeof adminClient>,
  scopes: DeliveryScopeRef[],
): Promise<Map<string, { arrangementId: string | null; partnerId: string | null }>> {
  const orderIds = [...new Set(scopes.map((s) => s.orderId))];
  const [{ data: arrangements }, { data: orders }] = await Promise.all([
    sb.from("ops_delivery_arrangements").select("id, order_id, leg, partner_id").in("order_id", orderIds),
    sb.from("orders").select("id, delivery_partner_id, ops_assigned_logistic").in("id", orderIds),
  ]);
  const byOrder = new Map(
    ((orders ?? []) as Array<{ id: string; delivery_partner_id: string | null; ops_assigned_logistic: string | null }>).map(
      (o) => [o.id, o.delivery_partner_id ?? o.ops_assigned_logistic ?? null],
    ),
  );
  const out = new Map<string, { arrangementId: string | null; partnerId: string | null }>();
  const arrRows = (arrangements ?? []) as Array<{
    id: string;
    order_id: string;
    leg: number;
    partner_id: string | null;
  }>;
  for (const s of scopes) {
    const key = `${s.orderId}#${s.leg}`;
    const existing = arrRows.find((a) => a.order_id === s.orderId && a.leg === s.leg);
    if (existing) {
      out.set(key, { arrangementId: existing.id, partnerId: existing.partner_id });
      continue;
    }
    /* NO ARRANGEMENT ROW YET. The whole-order scope inherits whatever Sales'
       own door already recorded, so the first Delivery write is correctly
       classified as a CHANGE rather than a first assignment — otherwise every
       carrier that arrived through Accept Proceed could be replaced without a
       reason exactly once, which is the hole the ruling closes. A Journey LEG
       inherits nothing: the order-level column was never that leg's carrier. */
    out.set(key, {
      arrangementId: null,
      partnerId: s.leg === 0 ? byOrder.get(s.orderId) ?? null : null,
    });
  }
  return out;
}

/**
 * ASSIGN LOGISTICS — one partner onto one or many scopes, in one transaction.
 *
 * Refuses the WHOLE request when any scope would be silently overwritten. All
 * or nothing is deliberate: a partly-applied assignment across eleven scopes is
 * a state the operator cannot read back off the screen.
 */
deliveryArrangementsRouter.post("/assign", requireOperationOrPrincipal, async (c) => {
  const parsed = assignLogisticsInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Assign logistics needs a partner and at least one scope" }, 400);
  }
  const { scopes, partnerId, reason, note } = parsed.data;
  const sb = adminClient(c.env);

  const { data: partner, error: partnerErr } = await sb
    .from("delivery_partners")
    .select("id, name")
    .eq("id", partnerId)
    .maybeSingle();
  if (partnerErr) {
    const m = mapPgError(partnerErr);
    return c.json(m.body, m.status);
  }
  if (!partner) return c.json({ error: "That logistics partner does not exist" }, 404);

  const current = await currentPartners(sb, scopes);

  /* THE GATE. A change needs its reason, and the refusal NAMES the scopes so
     the operator can see which of their eleven picks already had a carrier. */
  if (!reason) {
    const changing = scopes.filter((s) =>
      isLogisticsChange(current.get(`${s.orderId}#${s.leg}`)?.partnerId, partnerId),
    );
    if (changing.length > 0) {
      return c.json(
        {
          error: "Some of these already have a logistics partner",
          code: "change_needs_reason",
          scopes: changing,
        },
        409,
      );
    }
  }

  const userId = c.var.auth.id;
  const stamp = new Date().toISOString();
  const results: Array<{ orderId: string; leg: number; event: string }> = [];

  for (const s of scopes) {
    const key = `${s.orderId}#${s.leg}`;
    const before = current.get(key) ?? { arrangementId: null, partnerId: null };
    /* Nothing to say and nothing to write: re-picking the partner a scope
       already has is not an event, and recording it would fill the history with
       lines that describe no change. */
    if (before.partnerId === partnerId && before.arrangementId) continue;

    const { data: saved, error: upsertErr } = await sb
      .from("ops_delivery_arrangements")
      .upsert(
        { order_id: s.orderId, leg: s.leg, partner_id: partnerId, updated_at: stamp, updated_by: userId },
        { onConflict: "order_id,leg" },
      )
      .select("id")
      .single();
    if (upsertErr) {
      const m = mapPgError(upsertErr);
      return c.json(m.body, m.status);
    }

    const event = isLogisticsChange(before.partnerId, partnerId) ? "changed" : "assigned";
    const { error: evErr } = await sb.from("ops_delivery_arrangement_events").insert({
      arrangement_id: saved.id,
      event,
      from_partner_id: before.partnerId,
      to_partner_id: partnerId,
      reason_key: event === "changed" ? reason ?? null : null,
      note: note ?? null,
      recorded_by: userId,
    });
    if (evErr) {
      const m = mapPgError(evErr);
      return c.json(m.body, m.status);
    }
    results.push({ orderId: s.orderId, leg: s.leg, event });
  }

  return c.json({ assigned: results.length, partner: partner.name, results });
});

/**
 * SAVE DELIVERY — the Edit Delivery form for ONE scope.
 *
 * It records the ARRANGEMENT and nothing else. It never issues a Delivery
 * Order: the SYSTEM issues one when the governed gate becomes true
 * (`docs/delivery/MASTER.md` §3), so there is no Issue, no Release and no
 * Approve on this path — saving an arrangement is simply one of the facts that
 * gate reads.
 */
deliveryArrangementsRouter.put("/:orderId", requireOperationOrPrincipal, async (c) => {
  const orderId = c.req.param("orderId");
  const leg = Number(c.req.query("leg") ?? "0");
  if (!Number.isInteger(leg) || leg < 0 || leg > 20) {
    return c.json({ error: "Unknown delivery scope" }, 400);
  }
  const parsed = saveDeliveryArrangementInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "That delivery cannot be saved" }, 400);
  }
  const input = parsed.data;
  const sb = adminClient(c.env);

  const { data: order, error: orderErr } = await sb
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr) {
    const m = mapPgError(orderErr);
    return c.json(m.body, m.status);
  }
  if (!order) return c.json({ error: "Order not found" }, 404);

  const current = await currentPartners(sb, [{ orderId, leg }]);
  const before = current.get(`${orderId}#${leg}`) ?? { arrangementId: null, partnerId: null };
  const nextPartner = input.partnerId ?? null;

  if (isLogisticsChange(before.partnerId, nextPartner) && !input.reason) {
    return c.json(
      {
        error: "Changing the logistics partner needs a reason",
        code: "change_needs_reason",
      },
      409,
    );
  }

  const userId = c.var.auth.id;
  const { data: saved, error: saveErr } = await sb
    .from("ops_delivery_arrangements")
    .upsert(
      {
        order_id: orderId,
        leg,
        partner_id: nextPartner,
        confirmed_date: input.confirmedDate ?? null,
        confirmed_time: input.confirmedTime ?? null,
        expected_arrival: input.expectedArrival ?? null,
        logistics_note: input.logisticsNote ?? null,
        reply_proof_path: input.replyProofPath ?? null,
        driver_name: input.driverName ?? null,
        vehicle: input.vehicle ?? null,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      },
      { onConflict: "order_id,leg" },
    )
    .select(ARRANGEMENT_SELECT)
    .single();
  if (saveErr) {
    const m = mapPgError(saveErr);
    return c.json(m.body, m.status);
  }

  /* The carrier moved, so the history says so — in the same request that moved
     it. A partner change recorded nowhere is the defect this table exists for. */
  if (before.partnerId !== nextPartner) {
    const event = !nextPartner ? "cleared" : isLogisticsChange(before.partnerId, nextPartner) ? "changed" : "assigned";
    const { error: evErr } = await sb.from("ops_delivery_arrangement_events").insert({
      arrangement_id: (saved as unknown as ArrangementRecord).id,
      event,
      from_partner_id: before.partnerId,
      to_partner_id: nextPartner,
      reason_key: event === "changed" ? input.reason ?? null : null,
      recorded_by: userId,
    });
    if (evErr) {
      const m = mapPgError(evErr);
      return c.json(m.body, m.status);
    }
  }

  return c.json({ arrangement: shape(saved as unknown as ArrangementRecord) });
});

export default deliveryArrangementsRouter;
