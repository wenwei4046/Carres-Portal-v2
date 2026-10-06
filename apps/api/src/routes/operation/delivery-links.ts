import { Hono, type Context } from "hono";
import {
  ANOTHER_DATE_REASONS,
  CANNOT_DELIVER_REASONS,
  stockRouteOfDestination,
  type DestinationSiteKind,
  type LogisticsCardFacts,
  type StockRouteKey,
} from "@carres/shared";
import { requireOperationOrPrincipal } from "../../lib/auth-guards";
import { mapPgError } from "../../lib/route-helpers";
import { adminClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * THE LOGISTICS CARD'S DELIVERY DOORS — owner rulings 2026-09-24
 * (docs/delivery/MASTER.md §5.5 · docs/workspace/MASTER.md §5.9).
 *
 * ```
 * GET  /:orderId/logistics-card?leg=   the facts the Work Logistics card reads
 *                                      beyond the Monitor card: the partner and
 *                                      whether it has a portal, the stock route,
 *                                      the external link, the partner's latest
 *                                      answer and recent history
 * POST /:orderId/link?leg=             Create link — refused while one is active
 * POST /:orderId/link/revoke?leg=      Revoke link
 * ```
 *
 * The stock route is READ from its owners — Purchasing's `Supplier Deliver
 * To` (line override, else the PO's) and Stock's Site kind — never stored
 * here. Every write is Delivery's own record (0581), service role after the
 * Operation/Principal gate: the link table has no grant for any signed-in role.
 */
const deliveryLinksRouter = new Hono<AppEnv>();

const UUID = /^[0-9a-f-]{36}$/i;

function scopeOf(c: Context<AppEnv>): { orderId: string; leg: number } | null {
  const orderId = c.req.param("orderId") ?? "";
  if (!UUID.test(orderId)) return null;
  const leg = Number(c.req.query("leg") ?? "0") || 0;
  if (leg < 0 || leg > 20) return null;
  return { orderId, leg };
}

/** 256 random bits, base64url — 43 characters, never guessable. */
export function newLinkToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

type Sb = ReturnType<typeof adminClient>;

/** The scope's current company — the arrangement's, else (whole-order scope
 *  only) the order's own assignment, exactly the fallback every Delivery door
 *  uses. An `ops_assigned_logistic` NAME is resolved to its partner row. */
export async function scopePartner(
  sb: Sb,
  orderId: string,
  leg: number,
): Promise<{ id: string; name: string; hasPortal: boolean; kvDefault: boolean } | null> {
  const [{ data: arr, error: arrErr }, { data: ord, error: ordErr }] = await Promise.all([
    sb.from("ops_delivery_arrangements").select("partner_id").eq("order_id", orderId).eq("leg", leg).maybeSingle(),
    sb.from("orders").select("delivery_partner_id, ops_assigned_logistic").eq("id", orderId).maybeSingle(),
  ]);
  if (arrErr) throw arrErr;
  if (ordErr) throw ordErr;
  const arrangement = arr as { partner_id: string | null } | null;
  const order = ord as { delivery_partner_id: string | null; ops_assigned_logistic: string | null } | null;
  let ref: string | null = arrangement ? arrangement.partner_id : null;
  if (!arrangement && leg === 0) ref = order?.delivery_partner_id ?? order?.ops_assigned_logistic ?? null;
  if (!ref) return null;
  const query = sb.from("delivery_partners").select("id, name, kv_default");
  const { data: partner, error } = UUID.test(ref)
    ? await query.eq("id", ref).maybeSingle()
    : await query.ilike("name", ref.trim().replace(/[%_\\]/g, "\\$&")).maybeSingle();
  if (error) throw error;
  if (!partner) return null;
  const p = partner as { id: string; name: string; kv_default: boolean | null };
  const { data: users, error: usersErr } = await sb
    .from("app_users")
    .select("id")
    .eq("partner_id", p.id)
    .eq("role", "partner")
    .eq("status", "active")
    .limit(1);
  if (usersErr) throw usersErr;
  return { id: p.id, name: p.name, hasPortal: ((users ?? []) as unknown[]).length > 0, kvDefault: Boolean(p.kv_default) };
}

/** THE STOCK ROUTE, read from its owners: Purchasing's destination (line
 *  override, else the PO's) resolved to Stock's Site kind (0509), plus the
 *  Units already reserved to the order. One reader for the Work card and the
 *  external link page. `null` when the order does not exist. */
export async function readStockRoutes(sb: Sb, orderId: string): Promise<{ routes: LogisticsCardFacts["routes"] } | null> {
  const scope = { orderId };
    /* ── the stock route: Purchasing's destination → Stock's Site kind ── */
    const [{ data: order, error: oErr }, { data: threads, error: tErr }, { data: sources, error: sErr }, { data: destinations, error: dErr }] =
      await Promise.all([
        sb.from("orders").select("id, so").eq("id", scope.orderId).maybeSingle(),
        sb.from("order_supplier_threads").select("po_id").eq("order_id", scope.orderId),
        sb.from("po_line_sources").select("po_id").eq("order_id", scope.orderId),
        sb.from("purchasing_destinations").select("id, name, warehouse_id"),
      ]);
    const readErr = oErr ?? tErr ?? sErr ?? dErr;
    if (readErr) throw readErr;
    if (!order) return null;
    const so = (order as { so: number }).so;

    const poIds = [
      ...new Set(
        [...((threads ?? []) as Array<{ po_id: string | null }>), ...((sources ?? []) as Array<{ po_id: string | null }>)]
          .map((r) => r.po_id)
          .filter((v): v is string => Boolean(v)),
      ),
    ];
    const destRows = (destinations ?? []) as Array<{ id: string; name: string; warehouse_id: string | null }>;

    const [{ data: pos, error: pErr }, { data: poLines, error: lErr }, { data: warehouses, error: wErr }, { data: receipts, error: rErr }, { data: units, error: uErr }] =
      await Promise.all([
        poIds.length
          ? sb.from("purchase_orders").select("id, status, destination_id, official_delivery_date, suppliers(name)").in("id", poIds)
          : Promise.resolve({ data: [], error: null }),
        poIds.length
          ? sb.from("purchase_order_lines").select("po_id, destination_id").in("po_id", poIds)
          : Promise.resolve({ data: [], error: null }),
        sb.from("warehouses").select("id, name, kind"),
        poIds.length
          ? sb.from("warehouse_receipts").select("po_id, goods_received_at, status").in("po_id", poIds)
          : Promise.resolve({ data: [], error: null }),
        sb.from("ops_stock_items").select("warehouse_id, status").eq("status", "reserved").eq("reserved_ref", `SO-${so}`),
      ]);
    const readErr2 = pErr ?? lErr ?? wErr ?? rErr ?? uErr;
    if (readErr2) throw readErr2;

    const whById = new Map(((warehouses ?? []) as Array<{ id: string; name: string; kind: string }>).map((w) => [w.id, w]));
    const kindOfDestination = (destId: string | null): { kind: DestinationSiteKind | null; place: string | null } => {
      const dest = destRows.find((d) => d.id === destId);
      if (!dest) return { kind: null, place: null };
      if (!dest.warehouse_id) return { kind: "no_site", place: dest.name };
      const wh = whById.get(dest.warehouse_id);
      if (!wh) return { kind: null, place: dest.name };
      return { kind: wh.kind === "own" ? "own" : "operation_partner", place: wh.name };
    };

    const routes = new Map<string, LogisticsCardFacts["routes"][number]>();
    const routeFor = (key: StockRouteKey, place: string | null) => {
      const k = `${key}#${place ?? ""}`;
      if (!routes.has(k)) routes.set(k, { key, place, purchaseOrders: [], readyUnits: 0 });
      return routes.get(k)!;
    };
    const receiptRows = (receipts ?? []) as Array<{ po_id: string; goods_received_at: string | null; status: string | null }>;
    const lineRows = (poLines ?? []) as Array<{ po_id: string; destination_id: string | null }>;
    for (const po of (pos ?? []) as Array<{
      id: string;
      status: string | null;
      destination_id: string | null;
      official_delivery_date: string | null;
      suppliers: { name: string } | { name: string }[] | null;
    }>) {
      if (po.status === "cancelled") continue;
      const destIds = new Set(lineRows.filter((l) => l.po_id === po.id).map((l) => l.destination_id ?? po.destination_id));
      if (destIds.size === 0) destIds.add(po.destination_id);
      const supplier = Array.isArray(po.suppliers) ? po.suppliers[0]?.name ?? null : po.suppliers?.name ?? null;
      const received = receiptRows
        .filter((r) => r.po_id === po.id && r.status !== "voided" && r.goods_received_at)
        .map((r) => r.goods_received_at as string)
        .sort()
        .pop() ?? null;
      for (const destId of destIds) {
        const { kind, place } = kindOfDestination(destId);
        routeFor(stockRouteOfDestination(kind), place).purchaseOrders.push({
          poNo: po.id,
          supplier,
          poDeliveryDate: po.official_delivery_date,
          receivedDate: received ? received.slice(0, 10) : null,
        });
      }
    }
    for (const unit of (units ?? []) as Array<{ warehouse_id: string | null }>) {
      const wh = unit.warehouse_id ? whById.get(unit.warehouse_id) : undefined;
      const key: StockRouteKey = wh ? (wh.kind === "own" ? "carres_klang" : "supplier_to_logistics") : "not_known";
      routeFor(key, wh?.name ?? null).readyUnits += 1;
    }

  return { routes: [...routes.values()] };
}

/* Two governed lists that share keys (`no_capacity`): a label is always read
   from the list of ITS event, never from a merged map. */
const ANOTHER_DATE_LABEL = new Map<string, string>(ANOTHER_DATE_REASONS.map((r) => [r.key, r.label]));
const CANNOT_DELIVER_LABEL = new Map<string, string>(CANNOT_DELIVER_REASONS.map((r) => [r.key, r.label]));

/* ── GET the card's facts ─────────────────────────────────────────────── */
deliveryLinksRouter.get("/:orderId/logistics-card", requireOperationOrPrincipal, async (c) => {
  const scope = scopeOf(c);
  if (!scope) return c.json({ error: "not_found", message: "Order not found" }, 404);
  const sb = adminClient(c.env);
  try {
    const partner = await scopePartner(sb, scope.orderId, scope.leg);

    const route = await readStockRoutes(sb, scope.orderId);
    if (!route) return c.json({ error: "not_found", message: "Order not found" }, 404);
    const routes = route.routes;

    /* ── the link, the answers, the history ── */
    const [{ data: links, error: linkErr }, { data: events, error: evErr }, { data: contacts, error: cErr }] = await Promise.all([
      sb
        .from("ops_delivery_partner_links")
        .select("id, token, partner_id, created_at, created_by, revoked_at, first_opened_at, last_opened_at")
        .eq("order_id", scope.orderId)
        .eq("leg", scope.leg)
        .order("created_at", { ascending: false })
        .limit(20),
      sb
        .from("ops_delivery_arrangement_events")
        .select("event, source, recorded_at, recorded_by, from_partner_id, to_partner_id, reason_key, proposed_date, note")
        .eq("order_id", scope.orderId)
        .eq("leg", scope.leg)
        .order("recorded_at", { ascending: false })
        .limit(30),
      sb
        .from("ops_delivery_contacts")
        .select("contacted_at, contacted_person, on_behalf_of_partner_id")
        .eq("order_id", scope.orderId)
        .eq("leg", scope.leg)
        .order("contacted_at", { ascending: true }),
    ]);
    const readErr3 = linkErr ?? evErr ?? cErr;
    if (readErr3) throw readErr3;

    type LinkRow = { id: string; token: string; partner_id: string; created_at: string; created_by: string | null; revoked_at: string | null; first_opened_at: string | null; last_opened_at: string | null };
    type EventRow = { event: string; source: string | null; recorded_at: string; recorded_by: string | null; from_partner_id: string | null; to_partner_id: string | null; reason_key: string | null; proposed_date: string | null; note: string | null };
    const linkRows = (links ?? []) as LinkRow[];
    const eventRows = (events ?? []) as EventRow[];
    const active = linkRows.find((l) => !l.revoked_at && l.partner_id === partner?.id) ?? null;
    const lastRevoked = linkRows.find((l) => l.revoked_at)?.revoked_at ?? null;

    const people = [...new Set([...eventRows.map((e) => e.recorded_by), active?.created_by].filter((v): v is string => Boolean(v)))];
    const partnerIds = [...new Set(eventRows.flatMap((e) => [e.from_partner_id, e.to_partner_id]).filter((v): v is string => Boolean(v)))];
    const [{ data: users }, { data: partners }] = await Promise.all([
      people.length ? sb.from("app_users").select("id, name").in("id", people) : Promise.resolve({ data: [] }),
      partnerIds.length ? sb.from("delivery_partners").select("id, name").in("id", partnerIds) : Promise.resolve({ data: [] }),
    ]);
    const nameOf = new Map(((users ?? []) as Array<{ id: string; name: string | null }>).map((u) => [u.id, u.name]));
    const partnerName = new Map(((partners ?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name]));

    /* DETAILS RECEIVED — only what the portal itself observed: a portal
       partner is assigned (its portal shows the delivery at once), the link
       page rendered, the partner answered through its own door, or a Carres
       operator recorded the partner's reply. A prepared or copied message is
       never evidence. */
    const assignedAt =
      eventRows
        .filter((e) => (e.event === "assigned" || e.event === "changed") && e.to_partner_id === partner?.id)
        .map((e) => e.recorded_at)
        .sort()[0] ?? null;
    const partnerAnswers = eventRows
      .filter((e) => e.source === "external_link" || e.source === "partner_portal" || e.event === "cannot_deliver")
      .map((e) => e.recorded_at);
    const partnerContacts = ((contacts ?? []) as Array<{ contacted_at: string; contacted_person: string; on_behalf_of_partner_id: string | null }>)
      .filter((k) => k.contacted_person === "partner" && (!partner || !k.on_behalf_of_partner_id || k.on_behalf_of_partner_id === partner.id))
      .map((k) => k.contacted_at);
    const opened = linkRows.filter((l) => l.partner_id === partner?.id && l.first_opened_at).map((l) => l.first_opened_at as string);
    /* A PORTAL company sees its assigned deliveries at once; an auto-assigned
       whole-order scope (NETS, Klang Valley) may carry no assignment event, so
       the earliest recorded fact of the scope stands in, else the read time. */
    const portalSince = partner?.hasPortal
      ? assignedAt ?? eventRows.map((e) => e.recorded_at).sort()[0] ?? new Date().toISOString()
      : null;
    const candidates = [
      ...(portalSince ? [portalSince] : []),
      ...opened,
      ...partnerAnswers,
      ...partnerContacts,
    ].sort();
    const detailsReceivedAt = partner ? candidates[0] ?? null : null;

    /* THE LATEST NON-SCHEDULE ANSWER that is newer than the last save. */
    const lastSave = eventRows.find((e) => e.event === "arrangement_saved")?.recorded_at ?? null;
    const latestAnswer = eventRows.find((e) => e.event === "another_date_requested" || e.event === "cannot_deliver") ?? null;
    const answer =
      latestAnswer && (!lastSave || latestAnswer.recorded_at > lastSave)
        ? {
            kind: latestAnswer.event === "cannot_deliver" ? ("cannot_deliver" as const) : ("another_date" as const),
            at: latestAnswer.recorded_at,
            proposedDate: latestAnswer.proposed_date,
            reasonKey: latestAnswer.reason_key ?? "other",
          }
        : null;

    const who = (e: EventRow): string | null => {
      if (e.source === "external_link") {
        const company = partnerName.get(e.from_partner_id ?? e.to_partner_id ?? "") ?? partner?.name ?? "Logistics";
        return `${company} via external link`;
      }
      if (e.source === "partner_portal") return partnerName.get(e.from_partner_id ?? "") ?? partner?.name ?? null;
      return e.recorded_by ? nameOf.get(e.recorded_by) ?? "Staff identity not recorded" : "Staff identity not recorded";
    };
    const detail = (e: EventRow): string | null => {
      if (e.event === "assigned") return partnerName.get(e.to_partner_id ?? "") ?? null;
      if (e.event === "changed")
        return `${partnerName.get(e.from_partner_id ?? "") ?? "Logistics"} → ${partnerName.get(e.to_partner_id ?? "") ?? "Logistics"}`;
      if (e.event === "another_date_requested") return [e.proposed_date, ANOTHER_DATE_LABEL.get(e.reason_key ?? "")].filter(Boolean).join(" · ");
      if (e.event === "cannot_deliver") return CANNOT_DELIVER_LABEL.get(e.reason_key ?? "") ?? e.note;
      if (e.event === "arrangement_saved") return e.note;
      return null;
    };

    const facts: LogisticsCardFacts = {
      partner,
      routes,
      link: active
        ? {
            id: active.id,
            token: active.token,
            createdAt: active.created_at,
            createdByName: active.created_by ? nameOf.get(active.created_by) ?? null : null,
            firstOpenedAt: active.first_opened_at,
            lastOpenedAt: active.last_opened_at,
          }
        : null,
      lastRevokedAt: lastRevoked,
      detailsReceivedAt,
      answer,
      history: eventRows
        .filter((e) => e.event !== "message_prepared")
        .slice(0, 8)
        .map((e) => ({ event: e.event, at: e.recorded_at, source: e.source, who: who(e), detail: detail(e) })),
    };
    return c.json(facts);
  } catch (err) {
    const m = mapPgError(err as never);
    return c.json(m.body, m.status);
  }
});

/* ── Create link ──────────────────────────────────────────────────────── */
deliveryLinksRouter.post("/:orderId/link", requireOperationOrPrincipal, async (c) => {
  const scope = scopeOf(c);
  if (!scope) return c.json({ error: "not_found", message: "Order not found" }, 404);
  const sb = adminClient(c.env);
  try {
    const partner = await scopePartner(sb, scope.orderId, scope.leg);
    if (!partner) {
      return c.json({ error: "Assign logistics before you create a link", code: "no_logistics" }, 409);
    }
    if (partner.hasPortal) {
      return c.json({ error: `${partner.name} answers in its own portal.`, code: "partner_has_portal" }, 409);
    }
    const { data: active, error: activeErr } = await sb
      .from("ops_delivery_partner_links")
      .select("id")
      .eq("order_id", scope.orderId)
      .eq("leg", scope.leg)
      .is("revoked_at", null)
      .maybeSingle();
    if (activeErr) throw activeErr;
    if (active) {
      return c.json({ error: "This delivery already has an active link. Revoke it first.", code: "link_active" }, 409);
    }
    const token = newLinkToken();
    const { data, error } = await sb
      .from("ops_delivery_partner_links")
      .insert({ order_id: scope.orderId, leg: scope.leg, partner_id: partner.id, token, created_by: c.var.auth.id ?? null })
      .select("id, token, created_at")
      .single();
    if (error) throw error;
    return c.json({ link: data }, 201);
  } catch (err) {
    const m = mapPgError(err as never);
    return c.json(m.body, m.status);
  }
});

/* ── Revoke link ──────────────────────────────────────────────────────── */
deliveryLinksRouter.post("/:orderId/link/revoke", requireOperationOrPrincipal, async (c) => {
  const scope = scopeOf(c);
  if (!scope) return c.json({ error: "not_found", message: "Order not found" }, 404);
  const sb = adminClient(c.env);
  const { data, error } = await sb
    .from("ops_delivery_partner_links")
    .update({ revoked_at: new Date().toISOString(), revoked_by: c.var.auth.id ?? null, revoke_reason: "revoked" })
    .eq("order_id", scope.orderId)
    .eq("leg", scope.leg)
    .is("revoked_at", null)
    .select("id");
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (((data ?? []) as unknown[]).length === 0) {
    return c.json({ error: "This delivery has no active link.", code: "no_active_link" }, 409);
  }
  return c.json({ revoked: true });
});

/** A change of company kills the old company's link (called by the
 *  arrangement doors in the same request that moved the company). */
export async function revokeLinksForOtherPartners(sb: Sb, orderId: string, leg: number, partnerId: string | null, actor: string | null) {
  let q = sb
    .from("ops_delivery_partner_links")
    .update({ revoked_at: new Date().toISOString(), revoked_by: actor, revoke_reason: "logistics_changed" })
    .eq("order_id", orderId)
    .eq("leg", leg)
    .is("revoked_at", null);
  if (partnerId) q = q.neq("partner_id", partnerId);
  return q;
}

export default deliveryLinksRouter;
