import { Hono, type Context } from "hono";
import {
  ANOTHER_DATE_REASONS,
  CANNOT_DELIVER_REASONS,
  LINK_COPY,
  STOCK_ROUTE_LABEL,
  isSundayIso,
  linkAnotherDateInput,
  linkCannotDeliverInput,
  linkSaveScheduledInput,
  myHolidaySet,
  type ExternalDeliveryLinkView,
} from "@carres/shared";
import { mapPgError } from "../../lib/route-helpers";
import { adminClient } from "../../lib/supabase";
import { todayIsoMYT } from "../../lib/today";
import { readStockRoutes, scopePartner } from "../operation/delivery-links";
import type { AppEnv } from "../../types";

/**
 * THE EXTERNAL LOGISTICS LINK — owner rulings 2026-09-24 (0581 ·
 * docs/delivery/MASTER.md §5.5 · docs/ERP-ARCHITECTURE.md §6.4).
 *
 * Mounted OUTSIDE the signed-in `/api` group, like the Stripe webhook: the
 * logistics company has no login. The TOKEN is the whole trust boundary — a
 * 256-bit bearer secret bound to ONE delivery scope and ONE company:
 *
 *   · unknown, revoked, or the scope's company has since changed → 404 with
 *     one sentence (`This link no longer works…`), never a hint which;
 *   · the delivery is delivered or cancelled → the same 404;
 *   · every write names the company and `external_link` as its source, and
 *     NO person — the link never claims to know who pressed the button.
 *
 * WHAT THE COMPANY SEES is the governed minimum: the customer's own
 * reference (never the internal SO number), the customer and address it must
 * deliver to, the goods without prices, the pickup route, the requested date
 * and what it already saved. No money, no other delivery, no commercial term.
 *
 * ```
 * GET  /:token                  the view
 * POST /:token/opened           the page RENDERED (never the preview GET)
 * PUT  /:token/arrangement      Save scheduled delivery · date required, time optional
 * POST /:token/another-date     Ask for another date · date + governed reason
 * POST /:token/cannot-deliver   Cannot deliver · governed reason (+ words for `other`)
 * ```
 */
const publicDeliveryLinkRouter = new Hono<AppEnv>();

const TOKEN = /^[A-Za-z0-9_-]{40,64}$/;

type Sb = ReturnType<typeof adminClient>;
type LinkRow = { id: string; order_id: string; leg: number; partner_id: string };

function dead(c: Context<AppEnv>) {
  return c.json({ error: "link_dead", message: LINK_COPY.dead }, 404);
}

async function resolve(sb: Sb, token: string) {
  if (!TOKEN.test(token)) return null;
  const { data: link, error } = await sb
    .from("ops_delivery_partner_links")
    .select("id, order_id, leg, partner_id")
    .eq("token", token)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!link) return null;
  const row = link as LinkRow;
  const { data: order, error: oErr } = await sb
    .from("orders")
    .select(
      "id, status, delivered_at, customer_name, customer_phone, customer_address, building_type:entry_data->fields->>building_type, delivery_date, delivery_date_tbd, source_ref, order_lines(sku, qty)",
    )
    .eq("id", row.order_id)
    .maybeSingle();
  if (oErr) throw oErr;
  if (!order) return null;
  const o = order as {
    status: string | null;
    delivered_at: string | null;
    customer_name: string | null;
    customer_phone: string | null;
    customer_address: string | null;
    building_type: string | null;
    delivery_date: string | null;
    delivery_date_tbd: boolean | null;
    source_ref: string[] | string | null;
    order_lines: Array<{ sku: string; qty: number }> | null;
  };
  if (o.status === "cancelled" || o.delivered_at) return null;
  const partner = await scopePartner(sb, row.order_id, row.leg);
  if (!partner || partner.id !== row.partner_id) return null;
  return { link: row, order: o, partner };
}

async function stampOpened(sb: Sb, linkId: string) {
  const now = new Date().toISOString();
  await sb.from("ops_delivery_partner_links").update({ first_opened_at: now }).eq("id", linkId).is("first_opened_at", null);
  await sb.from("ops_delivery_partner_links").update({ last_opened_at: now }).eq("id", linkId);
}

async function body(c: Context<AppEnv>): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

/** A date the company may use: not past, not Sunday, not a public holiday. */
function dateRefusal(iso: string): string | null {
  if (iso < todayIsoMYT()) return LINK_COPY.pastRefused;
  if (isSundayIso(iso)) return LINK_COPY.sundayRefused;
  if (myHolidaySet().has(iso)) return LINK_COPY.holidayRefused;
  return null;
}

publicDeliveryLinkRouter.get("/:token", async (c) => {
  const sb = adminClient(c.env);
  try {
    const r = await resolve(sb, c.req.param("token"));
    if (!r) return dead(c);
    const skus = [...new Set((r.order.order_lines ?? []).map((l) => l.sku))];
    const [{ data: skuRows }, { data: arrangement }, routes] = await Promise.all([
      skus.length ? sb.from("product_skus").select("sku, variant").in("sku", skus) : Promise.resolve({ data: [] }),
      sb
        .from("ops_delivery_arrangements")
        .select("confirmed_date, confirmed_time")
        .eq("order_id", r.link.order_id)
        .eq("leg", r.link.leg)
        .maybeSingle(),
      readStockRoutes(sb, r.link.order_id),
    ]);
    const nameOf = new Map(((skuRows ?? []) as Array<{ sku: string; variant: string | null }>).map((s) => [s.sku, s.variant]));
    const refs = Array.isArray(r.order.source_ref) ? r.order.source_ref : r.order.source_ref ? [r.order.source_ref] : [];
    const arr = arrangement as { confirmed_date: string | null; confirmed_time: string | null } | null;
    const view: ExternalDeliveryLinkView = {
      company: r.partner.name,
      reference: refs.filter(Boolean).join(" · ") || null,
      customerName: r.order.customer_name ?? "",
      customerPhone: r.order.customer_phone,
      address: r.order.customer_address,
      building: r.order.building_type,
      requestedDate: r.order.delivery_date_tbd ? null : r.order.delivery_date,
      goods: (r.order.order_lines ?? []).map((l) => ({ name: nameOf.get(l.sku) || l.sku, qty: Number(l.qty) })),
      pickup: (routes?.routes ?? [])
        .filter((route) => route.key !== "not_known")
        .map((route) => [STOCK_ROUTE_LABEL[route.key], route.place].filter(Boolean).join(" · ")),
      scheduledDate: arr?.confirmed_date ?? null,
      scheduledTime: arr?.confirmed_time ?? null,
    };
    return c.json(view);
  } catch (err) {
    const m = mapPgError(err as never);
    return c.json(m.body, m.status);
  }
});

publicDeliveryLinkRouter.post("/:token/opened", async (c) => {
  const sb = adminClient(c.env);
  const r = await resolve(sb, c.req.param("token"));
  if (!r) return dead(c);
  await stampOpened(sb, r.link.id);
  return c.json({ ok: true });
});

publicDeliveryLinkRouter.put("/:token/arrangement", async (c) => {
  const sb = adminClient(c.env);
  const parsed = linkSaveScheduledInput.safeParse(await body(c));
  if (!parsed.success) {
    return c.json({ error: "invalid_input", message: parsed.error.issues[0]?.message ?? "invalid input" }, 422);
  }
  const refusal = dateRefusal(parsed.data.scheduledDate);
  if (refusal) return c.json({ error: "invalid_date", message: refusal }, 422);
  try {
    const r = await resolve(sb, c.req.param("token"));
    if (!r) return dead(c);
    const time = parsed.data.scheduledTime ?? null;
    const { error } = await sb.from("ops_delivery_arrangements").upsert(
      {
        order_id: r.link.order_id,
        leg: r.link.leg,
        partner_id: r.partner.id,
        confirmed_date: parsed.data.scheduledDate,
        confirmed_time: time,
        updated_at: new Date().toISOString(),
        updated_by: null,
        updated_via: "external_link",
      },
      { onConflict: "order_id,leg" },
    );
    if (error) throw error;
    const { error: evErr } = await sb.from("ops_delivery_arrangement_events").insert({
      order_id: r.link.order_id,
      leg: r.link.leg,
      event: "arrangement_saved",
      source: "external_link",
      link_id: r.link.id,
      from_partner_id: r.partner.id,
      note: [parsed.data.scheduledDate, time].filter(Boolean).join(" · "),
      recorded_by: null,
    });
    if (evErr) throw evErr;
    await sb.from("order_history").insert({
      order_id: r.link.order_id,
      text: `${LINK_COPY.actor(r.partner.name)} scheduled the delivery — ${parsed.data.scheduledDate}${time ? ` · ${time}` : ""}`,
      by_role: "partner",
    });
    await stampOpened(sb, r.link.id);
    return c.json({ saved: true });
  } catch (err) {
    const m = mapPgError(err as never);
    return c.json(m.body, m.status);
  }
});

publicDeliveryLinkRouter.post("/:token/another-date", async (c) => {
  const sb = adminClient(c.env);
  const parsed = linkAnotherDateInput.safeParse(await body(c));
  if (!parsed.success) {
    return c.json({ error: "invalid_input", message: parsed.error.issues[0]?.message ?? "invalid input" }, 422);
  }
  const refusal = dateRefusal(parsed.data.proposedDate);
  if (refusal) return c.json({ error: "invalid_date", message: refusal }, 422);
  try {
    const r = await resolve(sb, c.req.param("token"));
    if (!r) return dead(c);
    const { error } = await sb.from("ops_delivery_arrangement_events").insert({
      order_id: r.link.order_id,
      leg: r.link.leg,
      event: "another_date_requested",
      source: "external_link",
      link_id: r.link.id,
      from_partner_id: r.partner.id,
      proposed_date: parsed.data.proposedDate,
      reason_key: parsed.data.reason,
      recorded_by: null,
    });
    if (error) throw error;
    const reason = ANOTHER_DATE_REASONS.find((x) => x.key === parsed.data.reason)?.label ?? parsed.data.reason;
    await sb.from("order_history").insert({
      order_id: r.link.order_id,
      text: `${LINK_COPY.actor(r.partner.name)} requested another date — ${parsed.data.proposedDate} · ${reason}`,
      by_role: "partner",
    });
    await stampOpened(sb, r.link.id);
    return c.json({ saved: true });
  } catch (err) {
    const m = mapPgError(err as never);
    return c.json(m.body, m.status);
  }
});

publicDeliveryLinkRouter.post("/:token/cannot-deliver", async (c) => {
  const sb = adminClient(c.env);
  const parsed = linkCannotDeliverInput.safeParse(await body(c));
  if (!parsed.success) {
    return c.json({ error: "invalid_input", message: parsed.error.issues[0]?.message ?? "invalid input" }, 422);
  }
  try {
    const r = await resolve(sb, c.req.param("token"));
    if (!r) return dead(c);
    const { error } = await sb.from("ops_delivery_arrangement_events").insert({
      order_id: r.link.order_id,
      leg: r.link.leg,
      event: "cannot_deliver",
      source: "external_link",
      link_id: r.link.id,
      from_partner_id: r.partner.id,
      reason_key: parsed.data.reason,
      note: parsed.data.note ?? null,
      recorded_by: null,
    });
    if (error) throw error;
    const reason = CANNOT_DELIVER_REASONS.find((x) => x.key === parsed.data.reason)?.label ?? parsed.data.reason;
    await sb.from("order_history").insert({
      order_id: r.link.order_id,
      text: `${LINK_COPY.actor(r.partner.name)} cannot deliver — ${reason}${parsed.data.note ? `: ${parsed.data.note}` : ""}`,
      by_role: "partner",
    });
    await stampOpened(sb, r.link.id);
    return c.json({ reported: true });
  } catch (err) {
    const m = mapPgError(err as never);
    return c.json(m.body, m.status);
  }
});

export default publicDeliveryLinkRouter;
