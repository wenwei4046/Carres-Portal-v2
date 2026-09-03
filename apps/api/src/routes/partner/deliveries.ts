import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  partnerCannotDeliverInput,
  partnerSaveArrangementInput,
  type PartnerDeliveryCard,
} from "@carres/shared";
import { mapPgError } from "../../lib/route-helpers";
import { adminClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * THE PARTNER'S OWN DELIVERY SCREEN — Delivery Card 07 (0417).
 * `docs/delivery/MASTER.md` §5 + §13, owner rulings 2026-09-01.
 *
 * The ruled NETS portal: the partner sees ONLY its own assigned deliveries and
 * the minimum facts (DO, customer, area, goods summary, requested date,
 * special requirements), and has exactly TWO acts:
 *
 *   `Save Delivery Arrangement`  — confirmed date · window · ETA · note
 *   `Cannot Deliver`             — a governed reason, append-only, reassigning
 *                                  NOTHING; Operations decides what happens next
 *
 * There is no Accept (NETS is responsible without one), no money, no other
 * partner's work, no commercial terms, and no way to reassign.
 *
 * ── WHY ADMIN CLIENT ────────────────────────────────────────────────────────
 * `ops_delivery_arrangements` has SELECT for internal roles only and NO write
 * policy at all (0386) — the same deliberate shape as the Warehouse Schedule
 * feed. So this file gates on `role=partner + partnerId` first, reads with the
 * service role, and narrows EVERY row to the authenticated partner in code.
 * A scope this partner does not carry returns 404, not 403: the difference
 * between "not yours" and "does not exist" is exactly the information the
 * boundary exists to withhold.
 *
 * ── ASSIGNMENT TRUTH ────────────────────────────────────────────────────────
 * The arrangement row's partner wins; a whole-order scope with no arrangement
 * row yet inherits the order's own assignment (`delivery_partner_id`, else the
 * `ops_assigned_logistic` NAME) — the same fallback the operation doors use
 * (`currentPartners`), so the partner and the workspace can never disagree
 * about who carries a scope.
 */
const partnerDeliveriesRouter = new Hono<AppEnv>();

type PartnerAuth = { partnerId: string; partnerName: string };

async function requirePartner(c: Context<AppEnv>): Promise<PartnerAuth> {
  const auth = c.var.auth;
  if (auth.role !== "partner" || !auth.partnerId) {
    throw new HTTPException(403, { message: "Only partner role with partner_id" });
  }
  const sb = adminClient(c.env);
  const { data, error } = await sb
    .from("delivery_partners")
    .select("id, name")
    .eq("id", auth.partnerId)
    .maybeSingle();
  if (error) throw new HTTPException(500, { message: error.message });
  if (!data) throw new HTTPException(403, { message: "Unknown partner" });
  return { partnerId: auth.partnerId, partnerName: (data as { name: string }).name };
}

type OrderRow = {
  id: string;
  status: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address_city: string | null;
  customer_address_state: string | null;
  building_type: string | null;
  delivery_date: string | null;
  delivery_date_tbd: boolean | null;
  delivered_at: string | null;
  do_number: string | null;
  delivery_partner_id: string | null;
  ops_assigned_logistic: string | null;
  order_lines: Array<{ sku: string; qty: number }> | null;
};

type ArrangementRow = {
  id: string;
  order_id: string;
  leg: number;
  partner_id: string | null;
  confirmed_date: string | null;
  confirmed_time: string | null;
  expected_arrival: string | null;
  logistics_note: string | null;
};

/** Is this whole-order row assigned to ME through the order's own columns? */
function orderAssignedToMe(o: OrderRow, me: PartnerAuth): boolean {
  if (o.delivery_partner_id) return o.delivery_partner_id === me.partnerId;
  if (o.ops_assigned_logistic) {
    return o.ops_assigned_logistic.trim().toLowerCase() === me.partnerName.trim().toLowerCase();
  }
  return false;
}

function goodsSummaryOf(o: OrderRow): string {
  const lines = o.order_lines ?? [];
  if (lines.length === 0) return "No items listed";
  return lines.map((l) => `${l.qty} × ${l.sku}`).join(", ");
}

/** The one shared scope resolver: which partner carries (orderId, leg)? */
async function scopePartnerOf(
  sb: ReturnType<typeof adminClient>,
  orderId: string,
  leg: number,
  me: PartnerAuth,
): Promise<{ mine: boolean; arrangement: ArrangementRow | null; order: OrderRow | null }> {
  const [{ data: arr }, { data: ord, error }] = await Promise.all([
    sb
      .from("ops_delivery_arrangements")
      .select("id, order_id, leg, partner_id, confirmed_date, confirmed_time, expected_arrival, logistics_note")
      .eq("order_id", orderId)
      .eq("leg", leg)
      .maybeSingle(),
    sb
      .from("orders")
      .select(
        "id, status, customer_name, customer_phone, customer_address_city, customer_address_state, building_type, delivery_date, delivery_date_tbd, delivered_at, do_number, delivery_partner_id, ops_assigned_logistic, order_lines(sku, qty)",
      )
      .eq("id", orderId)
      .maybeSingle(),
  ]);
  if (error) throw new HTTPException(500, { message: error.message });
  const order = (ord ?? null) as OrderRow | null;
  const arrangement = (arr ?? null) as ArrangementRow | null;
  if (!order) return { mine: false, arrangement, order: null };
  const mine = arrangement
    ? arrangement.partner_id === me.partnerId
    : leg === 0 && orderAssignedToMe(order, me);
  return { mine, arrangement, order };
}

/** GET / — every live scope this partner carries, as ruled minimum cards. */
partnerDeliveriesRouter.get("/", async (c) => {
  const me = await requirePartner(c);
  const sb = adminClient(c.env);

  const [{ data: arrangements, error: arrErr }, { data: orders, error: ordErr }] =
    await Promise.all([
      sb
        .from("ops_delivery_arrangements")
        .select(
          "id, order_id, leg, partner_id, confirmed_date, confirmed_time, expected_arrival, logistics_note",
        )
        .eq("partner_id", me.partnerId),
      sb
        .from("orders")
        .select(
          "id, status, customer_name, customer_phone, customer_address_city, customer_address_state, building_type, delivery_date, delivery_date_tbd, delivered_at, do_number, delivery_partner_id, ops_assigned_logistic, order_lines(sku, qty)",
        )
        .is("delivered_at", null)
        .neq("status", "cancelled"),
    ]);
  const firstErr = arrErr ?? ordErr;
  if (firstErr) {
    const m = mapPgError(firstErr);
    return c.json(m.body, m.status);
  }

  const arrRows = (arrangements ?? []) as ArrangementRow[];
  const orderRows = (orders ?? []) as OrderRow[];
  const orderById = new Map(orderRows.map((o) => [o.id, o]));

  /* Cannot Deliver already reported and not yet re-arranged: the latest event
     on the scope is the partner's report. Read once for all my scopes. */
  const scopeKeys = new Set<string>();
  const cards: PartnerDeliveryCard[] = [];

  for (const a of arrRows) {
    const o = orderById.get(a.order_id);
    if (!o) continue; // delivered/cancelled orders left the list above
    scopeKeys.add(`${a.order_id}#${a.leg}`);
    cards.push({
      orderId: a.order_id,
      leg: a.leg,
      doNumber: o.do_number,
      customerName: o.customer_name ?? "",
      customerPhone: o.customer_phone,
      area: [o.customer_address_city, o.customer_address_state].filter(Boolean).join(", ") || null,
      building: o.building_type,
      goodsSummary: goodsSummaryOf(o),
      requestedDate: o.delivery_date_tbd ? null : o.delivery_date,
      specialRequirements: a.logistics_note,
      confirmedDate: a.confirmed_date,
      confirmedTime: a.confirmed_time,
      expectedArrival: a.expected_arrival ? a.expected_arrival.slice(0, 5) : null,
      note: a.logistics_note,
      cannotDeliverReported: false,
    });
  }

  /* Whole-order scopes assigned through the order's own columns, with no
     arrangement row yet — NETS' auto-assigned Klang Valley trips live here. */
  for (const o of orderRows) {
    if (scopeKeys.has(`${o.id}#0`)) continue;
    if (!orderAssignedToMe(o, me)) continue;
    cards.push({
      orderId: o.id,
      leg: 0,
      doNumber: o.do_number,
      customerName: o.customer_name ?? "",
      customerPhone: o.customer_phone,
      area: [o.customer_address_city, o.customer_address_state].filter(Boolean).join(", ") || null,
      building: o.building_type,
      goodsSummary: goodsSummaryOf(o),
      requestedDate: o.delivery_date_tbd ? null : o.delivery_date,
      specialRequirements: null,
      confirmedDate: null,
      confirmedTime: null,
      expectedArrival: null,
      note: null,
      cannotDeliverReported: false,
    });
  }

  /* Stamp cannotDeliverReported from the scope's LATEST event. */
  if (cards.length > 0) {
    const { data: events } = await sb
      .from("ops_delivery_arrangement_events")
      .select("order_id, leg, event, recorded_at")
      .in("order_id", [...new Set(cards.map((card) => card.orderId))])
      .order("recorded_at", { ascending: false });
    const latestByScope = new Map<string, string>();
    for (const e of (events ?? []) as Array<{ order_id: string; leg: number; event: string }>) {
      const key = `${e.order_id}#${e.leg}`;
      if (!latestByScope.has(key)) latestByScope.set(key, e.event);
    }
    for (const card of cards) {
      card.cannotDeliverReported =
        latestByScope.get(`${card.orderId}#${card.leg}`) === "cannot_deliver";
    }
  }

  cards.sort((a, b) => (a.confirmedDate ?? "9999").localeCompare(b.confirmedDate ?? "9999"));
  return c.json({ partner: me.partnerName, deliveries: cards });
});

/** PUT /:orderId/arrangement?leg= — Save Delivery Arrangement, partner-scoped. */
partnerDeliveriesRouter.put("/:orderId/arrangement", async (c) => {
  const me = await requirePartner(c);
  const orderId = c.req.param("orderId");
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    return c.json({ error: "not_found", message: "Delivery not found" }, 404);
  }
  const leg = Number(c.req.query("leg") ?? "0") || 0;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_input", message: "Body must be valid JSON" }, 400);
  }
  const parsed = partnerSaveArrangementInput.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return c.json(
      { error: "invalid_input", message: issue?.message ?? "invalid input" },
      422,
    );
  }

  const sb = adminClient(c.env);
  const scope = await scopePartnerOf(sb, orderId, leg, me);
  if (!scope.order || !scope.mine) {
    return c.json({ error: "not_found", message: "Delivery not found" }, 404);
  }

  const { error } = await sb.from("ops_delivery_arrangements").upsert(
    {
      order_id: orderId,
      leg,
      /* The partner NEVER moves the partner: its own id is written so the
         auto-assigned scope gains its arrangement row under the same carrier. */
      partner_id: me.partnerId,
      confirmed_date: parsed.data.confirmedDate ?? null,
      confirmed_time: parsed.data.confirmedTime ?? null,
      expected_arrival: parsed.data.expectedArrival ?? null,
      logistics_note: parsed.data.note ?? null,
      updated_at: new Date().toISOString(),
      updated_by: c.var.auth.id ?? null,
    },
    { onConflict: "order_id,leg" },
  );
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  const { error: histErr } = await sb.from("order_history").insert({
    order_id: orderId,
    text: `${me.partnerName} saved the delivery arrangement${
      parsed.data.confirmedDate ? ` — ${parsed.data.confirmedDate}` : ""
    }`,
    by_role: "partner",
  });
  if (histErr) {
    const m = mapPgError(histErr);
    return c.json(m.body, m.status);
  }

  return c.json({ saved: true });
});

/** POST /:orderId/cannot-deliver?leg= — the governed report. Reassigns nothing. */
partnerDeliveriesRouter.post("/:orderId/cannot-deliver", async (c) => {
  const me = await requirePartner(c);
  const orderId = c.req.param("orderId");
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    return c.json({ error: "not_found", message: "Delivery not found" }, 404);
  }
  const leg = Number(c.req.query("leg") ?? "0") || 0;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_input", message: "Body must be valid JSON" }, 400);
  }
  const parsed = partnerCannotDeliverInput.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return c.json(
      { error: "invalid_input", message: issue?.message ?? "invalid input" },
      422,
    );
  }

  const sb = adminClient(c.env);
  const scope = await scopePartnerOf(sb, orderId, leg, me);
  if (!scope.order || !scope.mine) {
    return c.json({ error: "not_found", message: "Delivery not found" }, 404);
  }

  const { error } = await sb.from("ops_delivery_arrangement_events").insert({
    order_id: orderId,
    leg,
    event: "cannot_deliver",
    from_partner_id: me.partnerId,
    reason_key: parsed.data.reason,
    note: parsed.data.note ?? null,
    recorded_by: c.var.auth.id ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  const { error: histErr } = await sb.from("order_history").insert({
    order_id: orderId,
    text: `${me.partnerName} cannot deliver — ${parsed.data.reason}${
      parsed.data.note ? `: ${parsed.data.note}` : ""
    }`,
    by_role: "partner",
  });
  if (histErr) {
    const m = mapPgError(histErr);
    return c.json(m.body, m.status);
  }

  return c.json({ reported: true });
});

export default partnerDeliveriesRouter;
