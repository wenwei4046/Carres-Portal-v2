import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  DEMAND_PURPOSE_VALUES,
  expectedArrivalOf,
  isOpsGenericAccount,
  isOtherCreditor,
  manualPurchaseLineRemainingOf,
  orderByFromDeliveryDate,
  productionWorkingDaysFor,
  poSupplierDeliveryDateOf,
  type PoDatePromise,
  PURCHASING_REFUSAL_CODES,
  purchasingRefusal,
  purchasingSuppliersOnly,
  railItemLabel,
  stockMatchKey,
  transitDaysFor,
  manualPurchaseIntentSchema,
  manualPurchaseLineStockRemaining,
  manualPurchaseStockBlockOf,
  manualPurchaseStockSaveInputSchema,
  type ManualPurchaseIntent,
  type ManualPurchaseStockLine,
  type ManualPurchaseStockResponse,
  type ManualPurchaseStockUnit,
} from "@carres/shared";
import { requireOperation } from "../../lib/auth-guards";
import { resolveActorNames } from "../../lib/actor-names";
import { purchasingActorMayIssue } from "../../lib/purchasing-po-authority";
import { readFreeStock } from "../../lib/purchase-demand-read";
import {
  loadPurchasingSettings,
  type LoadedPurchasingSettings,
} from "../../lib/purchasing-settings";
import { fail, mapPgError } from "../../lib/route-helpers";
import { readyStockRefusedUnitId } from "./so-batch-ready-stock";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";
import { todayIsoMYT } from "../../lib/delivery-order-issue";

/**
 * MANUAL PURCHASE — the request lane's doors
 * (CARD-2026-08-18-manual-purchase; docs/purchasing/MASTER.md §3).
 *
 *   GET  /               — the register: every request header with its lines,
 *                          destination and supplier names. Status is NOT
 *                          computed here: the ONE arithmetic is
 *                          `manualPurchaseStatusOf` in packages/shared (Law D)
 *                          and the web calls it over these facts.
 *   POST /               — the header. `why` is door-enforced non-blank
 *                          (0359); this route only relays the RPC's answer.
 *   POST /:id/lines      — ONE line. The workspace submits line by line so a
 *                          failed SKU keeps its row with the server's own
 *                          words while created lines stay created — the same
 *                          per-row contract the retired dialog proved.
 *   GET  /already-have   — ?sku=… → what is already on an open PO. `free`
 *                          deliberately does NOT live here: the workspace's
 *                          picker already carries it from the pick-items read
 *                          (P10's rule, called once) and a second free count
 *                          is a second answer waiting to disagree.
 *
 * The picker itself is REUSED, not rebuilt: the workspace calls the existing
 * `/api/operation/purchase/to-order/demand/pick-items`.
 */
const manualPurchaseRouter = new Hono<AppEnv>();

/**
 * EVERY REFUSAL LEAVES IN THE APPROVED TWO LINES (closure §9).
 *
 * Manual Purchase and SO Batch Purchase reach the same creation authority, so
 * they must refuse in the same words — `purchasingRefusal` is the one place
 * those words live.
 */
function refusalBody(code: string, facts?: Parameters<typeof purchasingRefusal>[1]) {
  const r = purchasingRefusal(code, facts);
  return { error: code, code, message: r.wrong, action: r.todo, ...(facts ?? {}) };
}

function refuse(
  c: Context<AppEnv>,
  status: 400 | 403 | 404 | 409 | 422 | 500,
  code: string,
  facts?: Parameters<typeof purchasingRefusal>[1],
) {
  return c.json(refusalBody(code, facts), status);
}

/** `iso` + n CALENDAR days — the same day arithmetic `earliest_sell_days`
 *  is counted in (0422). No working-day walk: the number is calendar days. */
function plusCalendarDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * THE SERVER DATE PROJECTION (Card 06 §3) — one place stamps every demand
 * line with its date-plan facts, so the Register, the object and the Work
 * lens read the SAME arithmetic (Law D) and the browser performs no
 * working-day arithmetic of its own:
 *
 *   delivery_date            the line's stored `required_by`, falling back to
 *                            the request header's — when supplier goods must
 *                            reach Deliver To. Never invented.
 *   order_by                 Delivery Date − transit (Office week) −
 *                            Supplier × Category production (factory week),
 *                            via the ONE inverse planner. Null is a real
 *                            answer: missing Settings, missing Catalog
 *                            relationship or a historical `Not recorded`
 *                            date produce NO Order By, never a guessed one.
 *   production_days_missing  a live line whose Supplier × Category pair has
 *   transit_days_missing     no configured number — the exact Settings fact
 *                            the rail's setup lens and Work rows name.
 *
 * `settings == null` (the loader failed) stamps nulls and no gap flags —
 * an unavailable plan is stated by `planUnavailable`, never faked.
 */
function withDatePlan(
  settings: LoadedPurchasingSettings | null,
  lines: Array<Record<string, unknown>>,
  requestRequiredBy: Map<string, string | null>,
  /** The one open request's own date — the detail read's lines carry no
   *  `request_id` column, so the header fact rides in directly. */
  fallbackRequiredBy: string | null = null,
): Array<Record<string, unknown>> {
  return lines.map((l) => {
    const deliveryDate =
      ((l.required_by as string | null) ??
        requestRequiredBy.get(l.request_id as string) ??
        fallbackRequiredBy) ||
      null;
    const live = l.cancelled_at == null;
    const supplierId = (l.supplier_id as string | null) ?? null;
    const category = (l.category as string | null) ?? null;
    const production =
      settings != null
        ? productionWorkingDaysFor(settings, supplierId, category)
        : null;
    const transit = settings != null ? transitDaysFor(settings, supplierId) : null;
    return {
      ...l,
      delivery_date: deliveryDate,
      order_by:
        settings != null
          ? orderByFromDeliveryDate(settings, {
              supplierId,
              category,
              deliveryDateIso: deliveryDate,
            })
          : null,
      production_days_missing:
        settings != null && live && supplierId != null && category != null &&
        production == null,
      transit_days_missing:
        settings != null && live && supplierId != null && transit == null,
    };
  });
}

/** `canApprove` decides what RENDERS (the money, the Approve row);
 *  `purchasing_decide_request` re-gates in SQL, which is the actual
 *  protection.
 *
 *  ⭐ THE RENDER GATE ASKS EXACTLY WHAT THE DOOR ASKS. 0533 (owner rulings
 *  2026-09-18) left `purchasing_approver_gate` ONE rung: today's resolved
 *  `purchasing_approver` actor — the holder, or their dated Principal cover.
 *  No role rung (the shared owner login executes no duty), no `ops_manager`
 *  rung, no email list. When the holder is away with no cover the approval
 *  waits for them; it is never handed to Operation. */
async function canApprove(c: Context<AppEnv>): Promise<boolean> {
  const actor = await purchasingApproverActor(c);
  return actor.userId != null && actor.userId === c.var.auth.id;
}

/**
 * TODAY'S PURCHASING APPROVER, through the ONE Shared Duty Resolver (0425).
 *
 * ⭐ THE SCREEN AND THE DOOR MUST ASK THE SAME SYSTEM. Staff & Duties writes
 * `workspace_duty_assignments` and `workspace_resolve_duty` reads it — that
 * is the Constitution's GLOBAL DUTY LAW. `actor_user_id` is already
 * `coalesce(today's cover, the assignment)`, so a cover decides while they
 * cover and not after.
 *
 * FAILS SOFT to "nobody": an unreachable resolver renders no Approve row and
 * the SQL door still decides — never a wider gate, never a 500.
 */
async function purchasingApproverActor(
  c: Context<AppEnv>,
): Promise<{ userId: string | null }> {
  try {
    const sb = userClient(c.env, c.var.auth.jwt);
    const { data, error } = await sb.rpc("workspace_resolve_duty", {
      p_duty_key: "purchasing_approver",
    });
    if (error || data == null || typeof data !== "object") {
      return { userId: null };
    }
    const raw = data as Record<string, unknown>;
    const userId = typeof raw.actor_user_id === "string" ? raw.actor_user_id : null;
    return { userId };
  } catch {
    return { userId: null };
  }
}

/**
 * THE REAL ACTION OWNER'S NAME — the ONE resolved Purchasing Approver
 * (holder or today's cover), named through the governed actor-name read
 * (`actor_display_names`), so an Operation reader sees the Principal's name
 * even though `app_users` row security hides Principal rows from them.
 *
 * Nobody resolved → `[]`, which the screens print as
 * `Nobody holds Purchasing Approver.` — never the operations manager and
 * never an email list (owner ruling 2026-09-18: the email fallback is gone).
 */
async function resolveApprovers(
  c: Context<AppEnv>,
): Promise<Array<{ id: string; name: string | null }>> {
  const actor = await purchasingApproverActor(c);
  if (actor.userId == null) return [];
  /* The name is a label, never the gate: an unreadable name keeps the
     approver and prints no name rather than failing the Register. */
  let name: string | null = null;
  try {
    const names = await resolveActorNames(userClient(c.env, c.var.auth.jwt), [actor.userId]);
    name = names.get(actor.userId) ?? null;
  } catch {
    name = null;
  }
  return [{ id: actor.userId, name }];
}

/**
 * `Arrived` IS NOT A BUTTON (the Observation Law, card §5): the system reads
 * the linked PO's posted receipt. A demand line is `received` when the PO
 * line it became is received in full — matched by its own `demand_id` link
 * (0361), with a `(po_id, sku)` fallback for lines issued before the link
 * existed.
 */
async function stampReceived(
  sb: ReturnType<typeof userClient>,
  lines: Array<Record<string, unknown>>,
): Promise<Array<Record<string, unknown>>> {
  const issued = lines.filter((l) => l.po_id != null);
  if (issued.length === 0) return lines;
  const poIds = [...new Set(issued.map((l) => l.po_id as string))];
  const { data: poLines } = await sb
    .from("purchase_order_lines")
    .select("po_id, sku, qty, received_qty, demand_id")
    .in("po_id", poIds);
  const byDemand = new Map<string, boolean>();
  const byPoSku = new Map<string, boolean>();
  for (const pl of poLines ?? []) {
    const full = Number(pl.received_qty ?? 0) >= Number(pl.qty ?? 0) && Number(pl.qty ?? 0) > 0;
    if (pl.demand_id) byDemand.set(pl.demand_id as string, full);
    byPoSku.set(`${pl.po_id}|${pl.sku}`, full);
  }
  return lines.map((l) => ({
    ...l,
    received:
      l.po_id == null
        ? false
        : (byDemand.get(l.id as string) ??
          byPoSku.get(`${l.po_id}|${l.sku}`) ??
          false),
  }));
}

/**
 * THE CATALOG WORDS AND THE PO LINEAGE, once (Cards 03/04/05 — Law D).
 *
 * Both the Register and the Object Detail stamp each demand line with the
 * CATALOG's category and item words and with its REAL PO lineage
 * (`purchase_order_lines.demand_id`, 0361, plus the demand's own `po_id` as
 * the pre-0361 fallback). One implementation, so the row and the object can
 * never disagree about which documents a line became.
 *
 * ⭐ THE PO NUMBER IS THE PO's OWN `id` (`PO-2054`) — `purchase_orders` has
 * no `po_no` column. The previous read selected one and would have 400'd the
 * whole Register the first time a Manual Purchase gained lineage; production
 * never hit it only because no MPR had been issued yet (latent, found by
 * Card 05's authority read against the live schema).
 */
async function withCatalogAndLineage(
  sb: ReturnType<typeof userClient>,
  lines: Array<Record<string, unknown>>,
): Promise<
  | {
      lines: Array<Record<string, unknown>>;
      pos: Array<{
        id: string;
        po_no: string;
        version: number | null;
        /** 0428/0430 — the ORIGINAL supplier-facing date, never `eta_date`. */
        official_delivery_date: string | null;
        supplier_id: string | null;
      }>;
      /** po_id → the qty this set of lines actually put on that document. */
      orderedByPo: Map<string, number>;
      error: null;
    }
  | { error: { code?: string; message: string } }
> {
  /* The rail's `PRODUCT` section is the CATALOG's answer
     (`product_models.category`) and `Items` is the ONE item-label arithmetic
     (`railItemLabel`) — never SKU-text inference. Read whole and matched
     here, never `.in()` over free-text SKUs (live rows carry a double
     quote — `Leg 4"` — which breaks the filter). */
  const { data: catRows, error: catErr } = await sb
    .from("product_skus")
    .select("sku, variant, variant_kind, product_models(category, name)");
  if (catErr) return { error: catErr };
  const catalogBySku = new Map(
    (catRows ?? []).map((r) => {
      const model = r.product_models as unknown as {
        category: string | null;
        name: string | null;
      } | null;
      return [
        r.sku as string,
        {
          category: (model?.category ?? null) as string | null,
          itemLabel: railItemLabel(
            (model?.name ?? "").trim() || (r.sku as string),
            r.variant_kind === "size" ? ((r.variant as string) ?? null) : null,
          ),
        },
      ];
    }),
  );

  /* UUID lists are safe in `.in()` — the free-text ban above is about SKUs. */
  const lineIds = lines.map((l) => l.id as string);
  const directPoIds = lines
    .map((l) => l.po_id as string | null)
    .filter((v): v is string => v != null);
  const { data: lineagePoLines, error: lineageErr } =
    lineIds.length > 0
      ? await sb
          .from("purchase_order_lines")
          .select("po_id, demand_id, qty, destination_id")
          .in("demand_id", lineIds)
      : { data: [] as Array<Record<string, unknown>>, error: null };
  if (lineageErr) return { error: lineageErr };
  const poIdsByDemand = new Map<string, Set<string>>();
  const orderedByPo = new Map<string, number>();
  const lineageDemands = new Set<string>();
  /**
   * ⭐ EACH QUANTITY BELONGS TO THE DOCUMENT THAT ACTUALLY CARRIES IT (owner
   * ruling 2026-09-11).
   *
   * The lineage read already knew which purchase orders a demand line went
   * onto; it threw away HOW MUCH went onto each one and kept only the set of
   * numbers. So the expansion printed one row carrying the whole request
   * quantity beside a comma-joined list of documents — read left to right,
   * that says every one of those POs ordered the full amount. On a line split
   * across two suppliers it overstates the buy by exactly the split.
   *
   * `purchase_order_lines` has carried `qty` and `destination_id` per line all
   * along (0311 · 0361); this keeps them, so the goods table can print one row
   * per ALLOCATION with that document's own quantity and its own destination.
   */
  const allocationsByDemand = new Map<
    string,
    Array<{ poId: string; qty: number; destinationId: string | null }>
  >();
  for (const pl of lineagePoLines ?? []) {
    const d = pl.demand_id as string | null;
    if (!d) continue;
    lineageDemands.add(d);
    const set = poIdsByDemand.get(d) ?? new Set<string>();
    set.add(pl.po_id as string);
    poIdsByDemand.set(d, set);
    orderedByPo.set(
      pl.po_id as string,
      (orderedByPo.get(pl.po_id as string) ?? 0) + Number(pl.qty ?? 0),
    );
    allocationsByDemand.set(d, [
      ...(allocationsByDemand.get(d) ?? []),
      {
        poId: pl.po_id as string,
        qty: Number(pl.qty ?? 0),
        destinationId: (pl.destination_id as string | null) ?? null,
      },
    ]);
  }
  /* A pre-0361 issue left no `demand_id` on the PO line; the demand's own
     `po_id` + `issued_qty` is the only stored account of that document. */
  for (const l of lines) {
    if (l.po_id != null && !lineageDemands.has(l.id as string)) {
      orderedByPo.set(
        l.po_id as string,
        (orderedByPo.get(l.po_id as string) ?? 0) + Number(l.issued_qty ?? 0),
      );
      allocationsByDemand.set(l.id as string, [
        {
          poId: l.po_id as string,
          qty: Number(l.issued_qty ?? 0),
          destinationId: (l.destination_id as string | null) ?? null,
        },
      ]);
    }
  }
  const allPoIds = [
    ...new Set([
      ...directPoIds,
      ...[...poIdsByDemand.values()].flatMap((s) => [...s]),
    ]),
  ];
  let pos: Array<{
    id: string;
    po_no: string;
    version: number | null;
    official_delivery_date: string | null;
    supplier_id: string | null;
  }> = [];
  if (allPoIds.length > 0) {
    /* `version` rides along for the Work lens: `Issue the purchase order`
       completes only when the CURRENT version has confirmed-sent evidence
       (Card 06 §7), and the current version is the PO's own fact.
       `official_delivery_date` is the ORIGINAL supplier-facing date stamped
       at birth (0428/0430) — never `eta_date`, which is the LIVE planning
       arrival and moves when a factory ready date is recorded. The SO Batch
       sibling column reads exactly this field. */
    const poRes = await sb
      .from("purchase_orders")
      .select("id, version, official_delivery_date, supplier_id")
      .in("id", allPoIds);
    if (poRes.error) return { error: poRes.error };
    pos = (poRes.data ?? []).map((p) => ({
      id: p.id as string,
      po_no: p.id as string,
      version: (p.version as number | null) ?? null,
      official_delivery_date: (p.official_delivery_date as string | null) ?? null,
      supplier_id: (p.supplier_id as string | null) ?? null,
    }));
  }

  return {
    lines: lines.map((l) => {
      const viaLineage = poIdsByDemand.get(l.id as string);
      const poIds = new Set<string>(viaLineage ?? []);
      if (l.po_id != null) poIds.add(l.po_id as string);
      const cat = catalogBySku.get(l.sku as string);
      return {
        ...l,
        category: cat?.category ?? null,
        item_label: cat?.itemLabel ?? (l.sku as string),
        po_ids: [...poIds],
        /* One entry per purchase order this line actually went onto, with
           THAT document's quantity and destination. Empty = nothing issued. */
        allocations: allocationsByDemand.get(l.id as string) ?? [],
      };
    }),
    pos,
    orderedByPo,
    error: null,
  };
}

/**
 * ⭐ D2 · ONE SERVER-RESOLVED IDENTITY (Manual Purchase round 2, 2026-09-17).
 *
 * The Register printed the raw `app_users.name` of whoever created a request
 * — `Operations`, the SHARED login — while the object filtered shared accounts
 * out and printed `Staff identity not recorded`. Two surfaces, two answers to
 * "who asked for this". And the Register's plain `app_users` read cannot see
 * a principal account at all from an operation reader (0235's peers policy),
 * so a real person could vanish from one surface and not the other.
 *
 * This is now the ONE answer for the Register, the object, search and export:
 *   · the name comes from the shared actor resolver (`resolveActorNames`,
 *     0390's narrow definer door) — every reader can name internal staff;
 *   · a shared or robot login is a PERMISSION, not a person, and resolves to
 *     null — the reader prints `Staff identity not recorded`;
 *   · an id nobody can name resolves to null. A person is never invented.
 */
const SHARED_LOGIN_EMAILS = ["operation@carres.com"];

function identityResolver(
  users: ReadonlyArray<{ id: string; email?: string | null }>,
  names: ReadonlyMap<string, string>,
) {
  const emailById = new Map(users.map((u) => [u.id, (u.email ?? "").toLowerCase()]));
  return (userId: string | null | undefined): { userId: string; name: string } | null => {
    if (!userId) return null;
    const email = emailById.get(userId) ?? "";
    if (isOpsGenericAccount(email) || SHARED_LOGIN_EMAILS.includes(email)) return null;
    const name = (names.get(userId) ?? "").trim();
    return name === "" ? null : { userId, name };
  };
}

manualPurchaseRouter.get("/", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  const { data: requests, error } = await sb
    .from("purchase_requests")
    .select(
      `id, req_no, purpose, destination_id, required_by, why, approval_required,
       approved_at, approved_by, refused_at, refused_by, refuse_reason,
       withdrawn_at, sent_back_at, sent_back_reason, submitted_at, round,
       for_service_case_id, for_staff_user_id, for_subsidiary_name,
       created_by, created_at`,
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return fail(c, error);

  const ids = (requests ?? []).map((r) => r.id as string);
  let lines: Array<Record<string, unknown>> = [];
  /**
   * ⭐ AN UNREAD REMAINDER IS NOT ZERO (owner ruling R2, 2026-09-16). When
   * the lines cannot be read, the Register still shows every request — and
   * says the remainder could not be checked. An approved request then stays
   * in `To buy`, visibly unticked, instead of falling into `No purchase
   * needed` as if everything had been bought.
   */
  let linesUnavailable = false;
  /** id → po_no, for every PO the lines' REAL lineage names (Card 04 §3.4),
   *  plus the Card 06 completion fact: whether the CURRENT version has
   *  confirmed-sent evidence. */
  let pos: Array<{
    id: string;
    po_no: string;
    sent: boolean;
    /** The goods table's `PO Delivery Date` column (0428/0430). */
    official_delivery_date: string | null;
    supplier_id: string | null;
  }> = [];
  const enriched =
    ids.length === 0
      ? null
      : await (async () => {
          const res = await sb
            .from("purchase_demands")
            .select(
              `id, request_id, sku, supplier_id, destination_id, qty, approved_qty,
               issued_qty, remaining_qty, required_by, remark, po_id, cancelled_at,
               cancel_reason`,
            )
            .in("request_id", ids);
          if (res.error) return { error: res.error };
          return withCatalogAndLineage(sb, await stampReceived(sb, res.data ?? []));
        })();
  if (enriched?.error) {
    linesUnavailable = true;
    console.error("manual purchase — request lines unavailable", enriched.error.message);
  }
  if (enriched && !enriched.error) {
    lines = enriched.lines;

    /**
     * ⭐ WHAT READY STOCK ALREADY ANSWERS, PER LINE (owner ruling 2026-09-18).
     *
     * The Register's `Status`, its `PO Safety Days` margin and its tick all
     * read what is still to BUY, and after this ruling that is the approved
     * quantity less what purchase orders took AND less the Units saved against
     * the exact line. Reading it here is what makes the server's saved result
     * drive the screen after a refresh — the browser never nets a number the
     * server has not confirmed.
     *
     * A failed read is UNKNOWN, not zero: it sets `linesUnavailable`, which
     * keeps the row out of `No PO needed` and refuses its tick by name. The ONE
     * exception is the deploy window before 0546 (`isMissingAllocationColumn`),
     * where no allocation can exist because there is nowhere to store one.
     */
    const lineIds = lines.map((l) => l.id as string);
    if (lineIds.length > 0) {
      const held = await sb
        .from("ops_stock_items")
        .select("reserved_purchase_demand_id, qty")
        .in("reserved_purchase_demand_id", lineIds)
        .in("status", ["reserved", "sold"]);
      if (held.error && !isMissingAllocationColumn(held.error)) {
        linesUnavailable = true;
        console.error(
          "manual purchase — saved stock unavailable",
          held.error.message,
        );
      } else if (held.error) {
        /* Pre-0546: the column is not there, so nothing is allocated. */
        lines = lines.map((l) => ({ ...l, stock_reserved_qty: 0 }));
      } else {
        const byLine = new Map<string, number>();
        for (const u of (held.data ?? []) as Array<Record<string, unknown>>) {
          const key = u.reserved_purchase_demand_id as string;
          byLine.set(key, (byLine.get(key) ?? 0) + Math.max(1, Number(u.qty ?? 1)));
        }
        lines = lines.map((l) => ({
          ...l,
          stock_reserved_qty: byLine.get(l.id as string) ?? 0,
        }));
      }
    }

    /* Card 06 §7 — issuance work completes ONLY on the current PO version's
       confirmed-sent evidence (`po_sends`, 0378). A numbered PO or an opened
       WhatsApp/email completes nothing. */
    const poIds = enriched.pos.map((p) => p.id);
    const sentVersions = new Set<string>();
    if (poIds.length > 0) {
      const sends = await sb
        .from("po_sends")
        .select("po_id, po_version, kind")
        .eq("kind", "confirmed_sent")
        .in("po_id", poIds);
      if (sends.error) return fail(c, sends.error);
      for (const s of sends.data ?? []) {
        // SQL already filtered; the guard keeps a permissive test double honest.
        if (s.kind != null && s.kind !== "confirmed_sent") continue;
        if (s.po_version == null) continue;
        sentVersions.add(`${s.po_id as string}::${Number(s.po_version)}`);
      }
    }
    pos = enriched.pos.map((p) => ({
      id: p.id,
      po_no: p.po_no,
      sent: sentVersions.has(`${p.id}::${p.version ?? 1}`),
      official_delivery_date: p.official_delivery_date,
      supplier_id: p.supplier_id,
    }));
  }

  /* Card 06 §3 — the ONE server date projection stamps every line. The plan
     failing to load costs the timing facts, never the Register (the honest
     flag travels; nothing is guessed). */
  let settings: LoadedPurchasingSettings | null = null;
  let planUnavailable = false;
  try {
    settings = await loadPurchasingSettings(sb);
  } catch (e) {
    planUnavailable = true;
    console.error("manual purchase — date plan unavailable", (e as Error).message);
  }
  const requestRequiredBy = new Map(
    (requests ?? []).map((r) => [r.id as string, (r.required_by as string | null) ?? null]),
  );
  lines = withDatePlan(settings, lines, requestRequiredBy);

  // Names for the columns — read through the owners' tables, never stored
  // twice (Law B: a summary is read-only).
  const forCaseIds = (requests ?? [])
    .map((r) => r.for_service_case_id as string | null)
    .filter((v): v is string => v != null);
  const [dests, sups, users, cases] = await Promise.all([
    sb.from("purchasing_destinations").select("id, name, is_default").order("name"),
    sb.from("suppliers").select("id, name, kind"),
    sb.from("app_users").select("id, name, email"),
    forCaseIds.length > 0
      ? sb
          .from("service_cases")
          /* ⭐ THE CUSTOMER COLUMNS HAVE EXACTLY ONE SOURCE (owner ruling
             2026-09-18). Most Manual Purchases serve `Ready Stock`,
             `Showroom Display` or an internal purpose and have NO customer;
             those rows print blank. A `Service Case` purchase is the one
             purpose whose structured record names a real person, so the case's
             own snapshot and its linked Sales Order answer — and nothing else
             may. */
          .select("id, case_no, customer_name, order_id")
          .in("id", forCaseIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
  ]);
  for (const r of [dests, sups, users, cases]) {
    if (r.error) return fail(c, r.error);
  }
  /* The linked order's OWN facts — the date the customer asked for and where
     they are. Read from `orders`, never copied onto the request: a summary is
     read-only (Law B) and a stale copy of a customer's date is worse than no
     date at all. */
  const caseOrderIds = [
    ...new Set(
      (cases.data ?? [])
        .map((sc) => (sc as Record<string, unknown>).order_id as string | null)
        .filter((v): v is string => v != null),
    ),
  ];
  const caseOrders =
    caseOrderIds.length > 0
      ? await sb
          .from("orders")
          .select(
            "id, customer_name, delivery_date, delivery_date_tbd, customer_address_city, customer_address_state",
          )
          .in("id", caseOrderIds)
      : { data: [] as Array<Record<string, unknown>>, error: null };
  if (caseOrders.error) return fail(c, caseOrders.error);
  const orderFactById = new Map(
    (caseOrders.data ?? []).map((o) => [
      o.id as string,
      {
        customerName: (o.customer_name as string | null) ?? null,
        /* TBD is not a date, and a TBD order must never print one. */
        requestedDeliveryDate: o.delivery_date_tbd
          ? null
          : (((o.delivery_date as string | null) ?? null)?.slice(0, 10) ?? null),
        city: (o.customer_address_city as string | null) ?? null,
        state: (o.customer_address_state as string | null) ?? null,
      },
    ]),
  );
  const approvers = await resolveApprovers(c);
  /* D2 — the ONE requester identity (see `identityResolver`). */
  const requesterOf = identityResolver(
    (users.data ?? []) as Array<{ id: string; email: string | null }>,
    await resolveActorNames(sb, (requests ?? []).map((r) => r.created_by as string | null)),
  );

  /* ⭐ PO DUTY — resolved by the ONE actor authority (0379), shown ONLY
     beside a selection's issue action (Card 04: with no selection, no PO
     Duty block anywhere). Fails soft: an unresolved duty costs the chip,
     never the Register. */
  let currentPoDuty: { userId: string; name: string } | null = null;
  let actingPoDuty: { userId: string; name: string } | null = null;
  let poDutyUnavailable = false;
  let mayIssue = false;
  try {
    const authority = await purchasingActorMayIssue(sb, c.var.auth.id);
    if (authority.error) {
      console.error("manual purchase — PO issue authority unavailable", authority.error.message);
    } else {
      mayIssue = authority.mayIssue;
    }
    const actorRes = await sb.rpc("purchasing_po_actor");
    if (actorRes.error) {
      poDutyUnavailable = true;
      console.error("manual purchase — PO duty unavailable", actorRes.error.message);
    } else {
      const actor = (actorRes.data ?? {}) as {
        normal_user_id?: string | null;
        acting_user_id?: string | null;
        actor_user_id?: string | null;
      };
      const label = (id: string | null | undefined): string | null => {
        if (!id) return null;
        const u = (users.data ?? []).find((x) => x.id === id) as
          | { name?: string | null; email?: string | null }
          | undefined;
        return ((u?.name ?? "").trim() || (u?.email ?? "").trim()) || null;
      };
      const normalName = label(actor.normal_user_id);
      const actingName = label(actor.acting_user_id);
      if (actor.normal_user_id && normalName) {
        currentPoDuty = { userId: actor.normal_user_id, name: normalName };
      }
      if (actor.acting_user_id && actingName) {
        actingPoDuty = { userId: actor.acting_user_id, name: actingName };
      }
    }
  } catch (e) {
    poDutyUnavailable = true;
    console.error("manual purchase — PO duty unavailable", (e as Error).message);
  }

  return c.json({
    requests: (requests ?? []).map((r) => {
      const who = requesterOf(r.created_by as string | null);
      return {
        ...r,
        requested_by_name: who?.name ?? null,
        requested_by_user_id: who?.userId ?? null,
      };
    }),
    lines,
    /* R2 — true when the lines could not be read: every remainder is UNKNOWN,
       never zero. */
    linesUnavailable,
    pos,
    serviceCases: (cases.data ?? []).map((sc) => {
      const order = sc.order_id ? orderFactById.get(sc.order_id as string) : undefined;
      return {
        id: sc.id as string,
        case_no: sc.case_no as string,
        /* The case's own snapshot first (it is what Service recorded), the
           linked order second. Neither is invented, and a case with neither
           simply has no customer name. */
        customer_name:
          ((sc.customer_name as string | null) ?? "").trim() ||
          order?.customerName ||
          null,
        requested_delivery_date: order?.requestedDeliveryDate ?? null,
        delivery_city: order?.city ?? null,
        delivery_state: order?.state ?? null,
      };
    }),
    destinations: (dests.data ?? []).map((d) => ({ id: d.id, name: d.name })),
    /* ⭐ THE TWO GOVERNED DELIVER TO FACTS (owner, 2026-09-03). Until now the
       create form defaulted Deliver To to whichever destination came first
       and offered every one as an equal choice, so a request for a supplier
       Carres COLLECTS from could name Carres Klang — and the issue door then
       refused it (`supplier_collection_destination_mismatch`) with no door
       left to correct the request. SO Batch ships both facts
       (`purchase-demands.ts`); this lane never did. `settings` is already in
       hand from the date plan, so this costs no subrequest. No default
       configured means NO default (MASTER §5.4). */
    defaultDestinationId:
      ((dests.data ?? []).find((d) => d.is_default === true)?.id as string | undefined) ?? null,
    supplierCollections: settings?.supplierCollections ?? [],
    /* 0477 — Finance's other creditors share the table; Purchasing's list
       never carries one. */
    suppliers: purchasingSuppliersOnly(sups.data ?? []),
    users: (users.data ?? []).map((u) => ({ id: u.id, name: u.name })),
    approvers,
    canApprove: await canApprove(c),
    currentPoDuty,
    actingPoDuty,
    poDutyUnavailable,
    mayIssue,
    /* Card 06 — the Malaysia calendar date the timing lens compares against
       (the browser never reads its own clock for a business classification),
       and the honest date-plan availability fact. */
    todayIso: todayIsoMYT(),
    planUnavailable,
    /* 0422 — Purchasing Settings' `manual_purchase_min_delivery_days`
       (calendar days after the Proceed Date). The create form mirrors the
       door's refusal under the date field; the door refuses regardless.
       Settings unavailable: 0, no floor — the same answer the door gives. */
    minDeliveryDays: settings?.manualPurchaseMinDeliveryDays ?? 0,
  });
});

/**
 * One request, for the object detail (ui/MASTER §4.1 — ONE SCROLL, no tabs).
 * Money rides ONLY for the approver: the same request renders for both roles,
 * minus the money — never a permission error (card §4).
 */
manualPurchaseRouter.get("/detail/:id", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const id = c.req.param("id");
  if (!z.string().uuid().safeParse(id).success) {
    return c.json({ error: "invalid_request_id", code: "invalid_param" }, 400);
  }

  const { data: request, error } = await sb
    .from("purchase_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return fail(c, error);
  if (!request) return c.json({ error: "not_found" }, 404);

  const { data: lines, error: lineErr } = await sb
    .from("purchase_demands")
    .select(
      `id, sku, supplier_id, destination_id, qty, approved_qty, issued_qty,
       remaining_qty, required_by, remark, po_id, cancelled_at, cancel_reason,
       cancelled_by`,
    )
    .eq("request_id", id);
  if (lineErr) return fail(c, lineErr);

  let stamped = await stampReceived(sb, lines ?? []);
  /* Catalog words + real PO lineage — the same one implementation the
     Register calls (Card 05 §3.3/§3.6; Law D). */
  const enriched = await withCatalogAndLineage(sb, stamped);
  if (enriched.error) return fail(c, enriched.error);
  stamped = enriched.lines;

  /* Card 06 §3/§6 — the SAME server date projection the Register reads, so
     the object's `Order by {date}` fact can never disagree with the row. */
  let settings: LoadedPurchasingSettings | null = null;
  let planUnavailable = false;
  try {
    settings = await loadPurchasingSettings(sb);
  } catch (e) {
    planUnavailable = true;
    console.error("manual purchase — date plan unavailable", (e as Error).message);
  }
  stamped = withDatePlan(
    settings,
    stamped,
    new Map(),
    (request.required_by as string | null) ?? null,
  );

  const approver = await canApprove(c);
  let costs: Record<string, number | null> = {};
  if (approver && (lines ?? []).length > 0) {
    /* Read whole and matched here — no free-text SKU in a PostgREST `.in()`
       (live rows carry a double quote, `Leg 4"`). */
    const { data: skuRows } = await sb.from("product_skus").select("sku, cost");
    const wanted = new Set((lines ?? []).map((l) => l.sku as string));
    costs = Object.fromEntries(
      (skuRows ?? [])
        .filter((s) => wanted.has(s.sku as string))
        .map((s) => [s.sku as string, (s.cost as number | null) ?? null]),
    );
  }

  const [dests, sups, users] = await Promise.all([
    /* `active` rides so the object's Deliver To door offers only open places;
       a closed one still resolves to its name on a request that named it. */
    sb.from("purchasing_destinations").select("id, name, active").order("name"),
    sb.from("suppliers").select("id, name, kind"),
    sb.from("app_users").select("id, name, email, role"),
  ]);
  const approvers = await resolveApprovers(c);

  /* The request's round history (0522) — every send back, every send again
     and a withdrawal, append-only. An older database without the table
     degrades to no rounds, never to a failed object. */
  const eventsRes = await sb
    .from("purchase_request_events")
    .select("round, kind, actor_id, occurred_at, reason, changes")
    .eq("request_id", id)
    .order("occurred_at", { ascending: true });
  const roundEvents = (eventsRes.error ? [] : (eventsRes.data ?? [])) as Array<{
    round: number;
    kind: "sent_back" | "resubmitted" | "withdrawn";
    actor_id: string | null;
    occurred_at: string;
    reason: string | null;
    changes: unknown;
  }>;

  /**
   * WHO IS AN INDIVIDUAL (Card 05 §3.2; STAFF IDENTITY LAW 2026-08-27) — the
   * ONE resolver the Register also uses (D2). A shared or robot login resolves
   * to null and the reader prints `Staff identity not recorded`.
   */
  const userRoles = new Map(
    ((users.data ?? []) as Array<{ id: string; role: string | null }>).map((u) => [u.id, u.role]),
  );
  const resolveIdentity = identityResolver(
    (users.data ?? []) as Array<{ id: string; email: string | null }>,
    await resolveActorNames(sb, [
      request.created_by as string | null,
      request.approved_by as string | null,
      request.refused_by as string | null,
      ...roundEvents.map((e) => e.actor_id),
      ...(lines ?? []).map((l) => (l as { cancelled_by?: string | null }).cancelled_by ?? null),
    ]),
  );
  const individual = (
    userId: string | null | undefined,
  ): { name: string; role: string | null } | null => {
    const who = resolveIdentity(userId);
    return who ? { name: who.name, role: userRoles.get(who.userId) ?? null } : null;
  };

  /* The structured For's readable identity (Card 04 §3.6). */
  let serviceCaseNo: string | null = null;
  if (request.for_service_case_id) {
    const { data: sc } = await sb
      .from("service_cases")
      .select("case_no")
      .eq("id", request.for_service_case_id as string)
      .maybeSingle();
    serviceCaseNo = (sc?.case_no as string | null) ?? null;
  }

  // Original PO date and supplier answer have separate authorities. Only an
  // evidenced reply to the current version counts; legacy dates are not guessed.
  let pos: Array<{
    id: string;
    po_no: string;
    placed_at: string | null;
    /** D5 — the CURRENT version's marked-sent time; null = `Sending not confirmed`. */
    marked_sent_at: string | null;
    po_delivery_date: string | null;
    supplier_delivery_date: string | null;
    ordered_qty: number;
  }> = [];
  if (enriched.pos.length > 0) {
    const poIds = enriched.pos.map((p) => p.id);
    const [poRes, promRes, sendRes] = await Promise.all([
      sb.from("purchase_orders").select("id, placed_at, official_delivery_date, version").in("id", poIds),
      sb
        .from("po_supplier_promises")
        .select("po_id, kind, answer, about_date, previous_date, new_date, reason, recorded_at, po_version, channel, recipient, evidence, reported_by, reported_at, recorded_by")
        .in("po_id", poIds)
        .order("recorded_at", { ascending: true }),
      sb
        .from("po_sends")
        .select("po_id, po_version, kind, sent_at")
        .eq("kind", "confirmed_sent")
        .in("po_id", poIds),
    ]);
    if (poRes.error) return fail(c, poRes.error);
    if (promRes.error) return fail(c, promRes.error);
    if (sendRes.error) return fail(c, sendRes.error);
    pos = (poRes.data ?? []).map((p) => {
      const replies = (promRes.data ?? []).filter(row => row.po_id === p.id) as unknown as PoDatePromise[];
      const originalDate = (p.official_delivery_date as string | null) ?? null;
      const supplierDate = poSupplierDeliveryDateOf(replies, Number(p.version ?? 1));
      /* D5 — `PO Issued` means what it means on Purchase Orders: the CURRENT
         version's marked-sent time, the latest mark if marked twice. */
      const version = Number(p.version ?? 1);
      const markedSentAt =
        (sendRes.data ?? [])
          .filter(
            (row) =>
              row.po_id === p.id &&
              (row.kind == null || row.kind === "confirmed_sent") &&
              Number(row.po_version ?? 0) === version,
          )
          .map((row) => row.sent_at as string)
          .sort()
          .at(-1) ?? null;
      return {
        id: p.id as string,
        po_no: p.id as string,
        placed_at: (p.placed_at as string | null) ?? null,
        marked_sent_at: markedSentAt,
        po_delivery_date: originalDate,
        // This compact connected-document view adds a column only for a change.
        supplier_delivery_date: supplierDate !== originalDate ? supplierDate : null,
        ordered_qty: enriched.orderedByPo.get(p.id as string) ?? 0,
      };
    });
  }

  /**
   * HISTORY — only events the store proves (Card 05 §3.7): request created ·
   * purchase approved/refused · remaining demand marked not going ahead ·
   * exact linked PO issue. Actor is the resolved INDIVIDUAL or null (the
   * reader prints the governed defect sentence); nothing here infers that a
   * supplier received a PO or that goods arrived.
   */
  const liveLines = stamped.filter((l) => l.cancelled_at === null);
  const history: Array<Record<string, unknown>> = [];
  const withActor = (userId: string | null | undefined) => {
    const person = individual(userId);
    return { actor: person?.name ?? null, actor_role: person?.role ?? null };
  };
  history.push({
    kind: "created",
    occurred_at: request.created_at,
    ...withActor(request.created_by as string | null),
    units: (stamped ?? []).reduce((n, l) => n + Number(l.qty ?? 0), 0),
  });
  if (request.approved_at != null) {
    history.push({
      kind: "approved",
      occurred_at: request.approved_at,
      ...withActor(request.approved_by as string | null),
      requested_units: liveLines.reduce((n, l) => n + Number(l.qty ?? 0), 0),
      approved_units: liveLines.reduce(
        (n, l) => n + Number((l.approved_qty as number | null) ?? l.qty ?? 0),
        0,
      ),
    });
  }
  if (request.refused_at != null) {
    history.push({
      kind: "refused",
      occurred_at: request.refused_at,
      ...withActor(request.refused_by as string | null),
      reason: (request.refuse_reason as string | null) ?? null,
    });
  }
  /* D4 — a line marked not going ahead names who marked it (0522). A line
     cancelled before 0522 has no stored actor and reads the audit defect. */
  for (const l of stamped) {
    if (l.cancelled_at != null) {
      history.push({
        kind: "line_not_going_ahead",
        occurred_at: l.cancelled_at,
        ...withActor((l.cancelled_by as string | null) ?? null),
        sku: l.sku,
        reason: (l.cancel_reason as string | null) ?? null,
      });
    }
  }
  /* R3 / R4 — every round, as stored. */
  for (const e of roundEvents) {
    history.push({
      kind: e.kind,
      occurred_at: e.occurred_at,
      ...withActor(e.actor_id),
      reason: e.reason,
      round: e.round,
      changes: Array.isArray(e.changes) ? e.changes : [],
    });
  }
  for (const p of pos) {
    history.push({
      kind: "po_issued",
      occurred_at: p.placed_at ?? request.created_at,
      actor: null,
      actor_role: null,
      po_no: p.po_no,
      units: p.ordered_qty,
    });
  }

  const requestedBy = resolveIdentity(request.created_by as string | null);
  const liveIssued = (lines ?? []).some(
    (l) => l.po_id != null || Number(l.issued_qty ?? 0) > 0,
  );
  const undecided =
    request.approved_at == null && request.refused_at == null && request.withdrawn_at == null;
  const isRequester = request.created_by != null && request.created_by === c.var.auth.id;

  return c.json({
    request,
    serviceCaseNo,
    requested_by_user_id: requestedBy?.userId ?? null,
    /**
     * R3 / R4 — what the CALLER may do to this request's round, computed from
     * the same facts the SQL doors check. The doors still decide; these only
     * decide what renders, so a control is never offered and then refused.
     */
    canWithdraw: isRequester && undecided && !liveIssued,
    canEditAndSendAgain: isRequester && undecided && request.sent_back_at != null,
    /** The REQUEST section's `Requested By` — the real individual only; a
     *  shared-account record answers null and the reader states the defect. */
    requested_by_name: requestedBy?.name ?? null,
    lines: stamped.map((l) => ({
      ...l,
      // The approver's money — absent entirely for everyone else, so the
      // same screen renders minus the money, never a permission error.
      ...(approver ? { unit_cost: costs[l.sku as string] ?? null } : {}),
    })),
    pos,
    history,
    destinations: dests.data ?? [],
    /* The collection rule per collected supplier — the object's Deliver To
       door applies the same lock the create form applies (1083). */
    supplierCollections: settings?.supplierCollections ?? [],
    suppliers: purchasingSuppliersOnly(sups.data ?? []),
    users: (users.data ?? []).map((u) => ({ id: u.id, name: u.name })),
    approvers,
    /* Owner ruling 2026-09-18: nobody decides a purchase they raised. */
    canApprove: approver && request.created_by !== c.var.auth.id,
    todayIso: todayIsoMYT(),
    planUnavailable,
  });
});

/**
 * ⭐ THE DEPLOY WINDOW — 0546 IS NOT APPLIED YET, AND THAT MUST NOT BREAK THE
 * REGISTER.
 *
 * `main` deploys the code; the migration is applied through its own governed
 * path, and the two do not land in the same second. Between them
 * `ops_stock_items.reserved_purchase_demand_id` does not exist, and PostgREST
 * answers the read below with `42703` / `PGRST204`.
 *
 * Treating THAT as unknown would have been a portal-wide P1: `linesUnavailable`
 * makes every remainder unknown, so every Manual Purchase row would read
 * `Remaining quantity not checked` and NOTHING could be ticked — Issue PO
 * unusable for the whole module until the migration landed.
 *
 * ⛔ AND IT IS NOT "UNKNOWN IS ZERO" EITHER, which the ruling forbids. Before
 * the column exists, NO allocation can exist: there is nowhere to store one and
 * no door that writes one. Zero is the TRUE answer by construction, not a
 * guess — which is exactly why this narrow code, and only this code, is
 * tolerated. Every OTHER failure stays UNKNOWN and still refuses the tick.
 *
 * DELETE THIS the day 0546 is verified applied in production. It is a
 * deploy-window tolerance, not a permanent rule (0471's delegator, same debt,
 * paid the same day).
 */
function isMissingAllocationColumn(error: {
  code?: string | null;
  message?: string | null;
}): boolean {
  if (error.code === "42703" || error.code === "PGRST204") return true;
  return /reserved_purchase_demand_id/.test(error.message ?? "");
}

/**
 * THE STOCK PICKER'S SIX FACTS, read from ONE place.
 *
 * The approved columns are `Goods Received Date · Stock Location · Supplier ·
 * PO No / Ref No (Unit ID on line two) · Condition`, so this is exactly what
 * the register view is asked for. `reserved_ref` rides along because a Unit
 * this request does NOT hold may still carry somebody else's reference, and
 * `po_no` is the Unit's OWN source document — never the purchase looking at it.
 */
const STOCK_UNIT_COLUMNS =
  "id, unit_code, sku, qty, date_in, condition, site_name, supplier, po_no, ownership, identity_scope, reserved_ref, reserved_purchase_demand_id";

type StockRegisterRow = {
  id: string;
  unit_code: string | null;
  sku: string;
  qty: number | null;
  date_in: string | null;
  condition: string | null;
  site_name: string | null;
  supplier: string | null;
  po_no: string | null;
  ownership: string | null;
  identity_scope: string | null;
  reserved_ref: string | null;
  reserved_purchase_demand_id?: string | null;
};

/**
 * ⚠️ THE RECEIPT DATE IS A DATE ON THIS PICKER, AND THE STORED TIMESTAMP IS
 * NOT TOUCHED (owner ruling 2026-09-18).
 *
 * `date_in` is stored as a date or a timestamp depending on how the goods were
 * recorded. The picker shows the DAY; taking the first ten characters reads the
 * day off both shapes without rewriting either. The Receiving surfaces keep
 * printing the full `Goods Received Date` with its time, which is a different
 * column on a different page answering a different question.
 */
function receiptDateOf(raw: string | null): string | null {
  if (!raw) return null;
  return raw.slice(0, 10);
}

/**
 * WHERE THE UNIT CAME FROM — its own purchase order, or the reference it is
 * held against, or nothing.
 *
 * ⛔ IT NEVER FALLS BACK TO THE MANUAL PURCHASE READING IT. A Unit that
 * records no provenance has none, and printing this request's own number there
 * would manufacture a document lineage that does not exist.
 */
function sourceRefOf(u: StockRegisterRow): string | null {
  const po = (u.po_no ?? "").trim();
  if (po !== "") return po;
  const ref = (u.reserved_ref ?? "").trim();
  return ref !== "" ? ref : null;
}

function stockUnitOf(
  u: StockRegisterRow,
  reservedForThisLine: boolean,
  blocked: ManualPurchaseStockUnit["blocked"],
): ManualPurchaseStockUnit {
  return {
    itemId: u.id,
    unitCode: u.unit_code,
    identityScope: u.identity_scope === "quantity" ? "quantity" : "unit",
    sku: u.sku,
    goodsReceivedDate: receiptDateOf(u.date_in),
    stockLocation: u.site_name,
    supplier: u.supplier,
    sourceRef: sourceRefOf(u),
    /* A GRADE, not availability (0371), through the ONE shared vocabulary so
       `exhibition` cannot read `Display` here and `Exhibition` there. The raw
       value rides to the browser; the word is composed there. */
    condition: u.condition,
    ownership:
      u.ownership === "supplier_consignment" ? "supplier_consignment" : "carres_owned",
    qty: Math.max(1, Number(u.qty ?? 1)),
    reservedForThisLine,
    blocked,
  };
}

/**
 * ── MANUAL PURCHASE · READY STOCK ALLOCATION ────────────────────────────────
 * GET  /:id/stock-allocation   what is on the shelf for each line, and what
 *                              this line already holds
 * POST /:id/stock-allocation   the one save — the COMPLETE desired set for one
 *                              line, reconciled in one transaction
 *
 * ⭐ THIS REPLACES THE READ-ONLY `ready-stock` DOOR, AND THE REPLACEMENT IS AN
 * OWNER RULING, NOT A REFACTOR (Jess, 2026-09-18; MASTER §9.2).
 *
 * The retired door was built on one sentence — *an internal replenishment is
 * owed by nobody on the shelf, so there is nothing to bind and nothing to
 * press* — and that sentence described ONE kind of Manual Purchase while being
 * written as though it described all of them. A `Service Case` buy, an
 * `Internal Staff Purchase`, a `Showroom Display`: each is a CONCRETE NEED
 * that the exact sofa standing in Klang can answer today. The ruling keeps the
 * other half intact: buying EXTRA stock is never reduced by what is already
 * there.
 *
 * WHICH OF THE TWO A REQUEST IS, IS READ, NEVER GUESSED
 * (`purchase_requests.fulfilment_intent`, 0546). Not from the SKU, not from
 * the shelf count, and not from the purpose — `Other Purchase` answers
 * nothing. A request that recorded neither gets the goods READ-ONLY and a
 * sentence saying so.
 *
 * ── WHAT THIS ROUTE DECIDES: NOTHING ────────────────────────────────────────
 *
 * Availability is `stock_unit_register_v`'s (0371) through the ONE
 * `readFreeStock` reader — the same offer SO Batch Purchase shows, so two
 * purchasing pages cannot disagree about what is free. Matching is
 * `stockMatchKey`. The remaining quantity is
 * `purchasing_mpr_line_remaining_requirement`'s, restated here only so the
 * table can explain itself before anything is pressed; the door re-derives it
 * on the locked row, so a tab left open across somebody else's purchase order
 * is refused by name rather than allowed to over-commit.
 *
 * ── AND AN MPR IS NEVER AN SO ───────────────────────────────────────────────
 *
 * The save calls `purchasing_allocate_ready_units`, which binds
 * `ops_stock_items.reserved_purchase_demand_id`. It does NOT call
 * `so_batch_reserve_ready_units`, and a Manual Purchase id never reaches
 * `p_order_line_id`. Those are two different business bindings and the day one
 * is passed to the other's door is the day a customer's sofa answers an office
 * chair request.
 */
manualPurchaseRouter.get("/:id/stock-allocation", requireOperation, async (c) => {
  const id = c.req.param("id");
  if (!z.string().uuid().safeParse(id).success) {
    return c.json({ error: "invalid_request_id", code: "invalid_param" }, 400);
  }
  const sb = userClient(c.env, c.var.auth.jwt);

  const { data: request, error: reqErr } = await sb
    .from("purchase_requests")
    .select(
      "id, req_no, fulfilment_intent, approved_at, refused_at, withdrawn_at, sent_back_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (reqErr) return fail(c, reqErr);
  if (!request) {
    return c.json({ error: "request_not_found", code: "request_not_found" }, 404);
  }

  const { data: lineRows, error: lineErr } = await sb
    .from("purchase_demands")
    .select("id, sku, qty, approved_qty, issued_qty, cancelled_at")
    .eq("request_id", id);
  if (lineErr) return fail(c, lineErr);
  const lines = (lineRows ?? []) as Array<{
    id: string;
    sku: string;
    qty: number;
    approved_qty: number | null;
    issued_qty: number;
    cancelled_at: string | null;
  }>;

  /* The Catalog's human words, read whole and matched here — never `.in()`
     over free-text SKUs (a live row carries a double quote, `Leg 4"`, which
     breaks the filter). */
  const { data: catRows, error: catErr } = await sb
    .from("product_skus")
    .select("sku, variant, variant_kind, product_models(name)");
  if (catErr) return fail(c, catErr);
  const itemLabelBySku = new Map(
    (catRows ?? []).map((r) => {
      const model = r.product_models as unknown as { name: string | null } | null;
      return [
        r.sku as string,
        railItemLabel(
          (model?.name ?? "").trim() || (r.sku as string),
          r.variant_kind === "size" ? ((r.variant as string) ?? null) : null,
        ),
      ];
    }),
  );

  /**
   * WHAT THIS REQUEST ALREADY HOLDS, per line and by Unit.
   *
   * Read from the authoritative register view, so a saved Unit prints the same
   * provenance the free ones do. `reserved` AND `sold` both count: the binding
   * survives the sale, and a Unit that has left the building must not return
   * to the Register as something still to buy.
   */
  const demandIds = lines.map((l) => l.id);
  const heldByLine = new Map<string, StockRegisterRow[]>();
  if (demandIds.length > 0) {
    const { data: held, error: heldErr } = await sb
      .from("stock_unit_register_v")
      .select(STOCK_UNIT_COLUMNS)
      .in("reserved_purchase_demand_id", demandIds)
      .in("status", ["reserved", "sold"]);
    if (heldErr) return fail(c, heldErr);
    for (const row of (held ?? []) as StockRegisterRow[]) {
      const key = row.reserved_purchase_demand_id as string;
      heldByLine.set(key, [...(heldByLine.get(key) ?? []), row]);
    }
  }

  const { freeUnitsByKey } = await readFreeStock(sb);

  const approved =
    request.approved_at != null &&
    request.refused_at == null &&
    request.withdrawn_at == null &&
    request.sent_back_at == null;
  const intent = (request.fulfilment_intent as ManualPurchaseIntent | null) ?? null;
  const reference = (request.req_no as string | null) ?? null;

  const outLines: ManualPurchaseStockLine[] = lines.map((l) => {
    const held = heldByLine.get(l.id) ?? [];
    const reservedQty = held.reduce((n, u) => n + Math.max(1, Number(u.qty ?? 1)), 0);
    const remainingQty = manualPurchaseLineStockRemaining({
      qty: Math.max(0, Number(l.qty) || 0),
      approvedQty: l.approved_qty,
      issuedQty: Math.max(0, Number(l.issued_qty) || 0),
      reservedQty,
      cancelled: l.cancelled_at != null,
    });
    const free = freeUnitsByKey.get(stockMatchKey(l.sku)) ?? [];
    const availableQty = free.reduce((n, u) => n + Math.max(1, u.qty), 0);
    const stockBlock = manualPurchaseStockBlockOf({
      approved,
      intent,
      hasReference: reference != null,
      cancelled: l.cancelled_at != null,
      remainingQty,
      reservedQty,
    });
    /* ⭐ THE SAVED UNITS COME FIRST AND THEY ARE NEVER HIDDEN. A line whose
       free availability has fallen to zero still has to show what it holds —
       otherwise the one journey that takes a choice BACK disappears exactly
       when the operator needs it (MASTER §9.2: "saved choices remain reachable
       even at zero available"). */
    const units: ManualPurchaseStockUnit[] = [
      ...held.map((u) => stockUnitOf(u, true, null)),
      ...free.map((u) =>
        stockUnitOf(
          {
            id: u.id,
            unit_code: u.unitCode,
            sku: u.sku,
            qty: u.qty,
            date_in: u.dateIn,
            condition: u.condition,
            site_name: u.siteName,
            supplier: u.supplier,
            po_no: u.poNo,
            ownership: u.ownership,
            identity_scope: u.identityScope,
            reserved_ref: null,
            reserved_purchase_demand_id: null,
          },
          false,
          /* 0368: bulk is not bindable, and it SHOWS rather than being hidden —
             hiding the 893 counted pieces would make a full shelf read empty.
             A line with nothing left to buy still shows the shelf; what it
             loses is the tick. */
          u.identityScope !== "unit"
            ? "counted_stock"
            : remainingQty <= 0
              ? "nothing_left_to_buy"
              : null,
        ),
      ),
    ];

    return {
      demandId: l.id,
      sku: l.sku,
      item: itemLabelBySku.get(l.sku) ?? l.sku,
      requestedQty: Math.max(0, Number(l.qty) || 0),
      approvedQty: l.approved_qty,
      issuedQty: Math.max(0, Number(l.issued_qty) || 0),
      availableQty,
      reservedQty,
      remainingQty,
      stockBlock,
      units,
    };
  });

  const body: ManualPurchaseStockResponse = {
    requestId: id,
    reference,
    intent,
    approved,
    lines: outLines,
  };
  return c.json(body);
});

/**
 * POST /:id/stock-allocation — ONE ACT, ONE TRANSACTION.
 *
 * The browser states the COMPLETE set it wants this line to hold. The door
 * reconciles: releases what left, draws what joined, all or none — including
 * an empty set, which releases everything. There is no partial success to
 * explain, no per-Unit release button and no second stock writer.
 *
 * The browser names Units; it decides NOTHING. Approval, intent, availability,
 * the goods match and the remaining requirement are all re-derived in SQL on
 * the locked rows.
 */
manualPurchaseRouter.post("/:id/stock-allocation", requireOperation, async (c) => {
  const id = c.req.param("id");
  if (!z.string().uuid().safeParse(id).success) {
    return c.json({ error: "invalid_request_id", code: "invalid_param" }, 400);
  }
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json", code: "invalid_json" }, 400);
  }
  const parsed = manualPurchaseStockSaveInputSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", code: "invalid_param" }, 400);
  }
  const { demandId, itemIds, expectedItemIds } = parsed.data;
  const sb = userClient(c.env, c.var.auth.jwt);

  /* THE LINE MUST BELONG TO THE REQUEST IN THE URL. Without this a caller
     could save Units against any line in the portal by naming somebody else's
     request — the door would happily bind them, because it only asks about the
     LINE. The route owns the relationship between its own two identities. */
  const { data: line, error: lineErr } = await sb
    .from("purchase_demands")
    .select("id, request_id")
    .eq("id", demandId)
    .maybeSingle();
  if (lineErr) return fail(c, lineErr);
  if (!line || line.request_id !== id) {
    return c.json(
      { error: "mpr_line_not_found", code: "mpr_line_not_found" },
      404,
    );
  }

  const { data, error } = await sb.rpc("purchasing_allocate_ready_units", {
    p_demand_id: demandId,
    p_item_ids: itemIds,
    p_expected_item_ids: expectedItemIds ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    /* The door's own code, so the browser prints the sentence for THAT refusal
       rather than a generic one; and WHICH Unit stopped it, which the loop
       re-raises as `unit_id=<uuid>` because it is the only place that knows.
       `null` is a real answer — a refusal raised before the loop is about no
       Unit at all. */
    const code =
      (error as { message?: string }).message?.match(
        /(mpr_line_not_found|mpr_line_has_no_request|mpr_line_not_going_ahead|mpr_line_already_covered|mpr_line_needs_request_ref|request_not_approved|request_not_a_concrete_need|request_has_no_number|unit_not_found|unit_does_not_match_line|unit_not_available|unit_no_longer_free|unit_cannot_be_released|quantity_row_not_bindable|stock_selection_changed|duplicate_unit_chosen|too_many_units|one_binding_only)/,
      )?.[1] ?? null;
    const itemId = readyStockRefusedUnitId(error);
    return c.json(
      { ...(m.body as object), ...(code ? { code } : {}), ...(itemId ? { itemId } : {}) },
      m.status,
    );
  }
  return c.json(data);
});

const decideBody = z.object({
  /* R4 (2026-09-16) — `send_back` returns the SAME request to its requester. */
  decision: z.enum(["approve", "refuse", "send_back"]),
  reason: z.string().max(1000).nullish(),
  cuts: z
    .array(z.object({ id: z.string().uuid(), qty: z.number().int().min(0) }))
    .nullish(),
});

manualPurchaseRouter.post("/:id/decide", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const id = c.req.param("id");
  if (!z.string().uuid().safeParse(id).success) {
    return c.json({ error: "invalid_request_id", code: "invalid_param" }, 400);
  }

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = decideBody.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", code: "invalid_param" }, 400);
  }
  const { decision, reason, cuts } = parsed.data;

  const { data, error } = await sb.rpc("purchasing_decide_request", {
    p_id: id,
    p_decision: decision,
    p_reason: reason ?? null,
    p_cuts: cuts && cuts.length > 0 ? cuts : null,
  });
  if (error) {
    /* THE SAME DOOR, THE SAME WORDS (closure §9): the SQL gate refuses a
       non-approver with a bare 42501 whose message is the single word
       `forbidden` — measured reaching the operator raw on production
       (MPR-20260829-2779, 2026-08-29). The refusal leaves in the approved
       two lines and names who can actually decide — and when nobody at all
       holds the gate, it says THAT (Card 05 §5). */
    if ((error as { code?: string }).code === "42501") {
      const detail42501 = String((error as { details?: string }).details ?? "").trim();
      if (detail42501 === "own_request") return refuse(c, 403, "own_request");
      const approvers = await resolveApprovers(c);
      const names = approvers
        .map((a) => (a.name ?? "").trim())
        .filter((n) => n !== "");
      if (names.length === 0) {
        return refuse(c, 403, "no_purchase_approver");
      }
      return refuse(c, 403, "not_purchase_approver", { actor: names.join(" or ") });
    }
    /* Every 0360 refusal leaves in the approved two lines (Card 05 §5) —
       never raw PostgreSQL text. The door's own detail is the code where the
       dictionary answers it by name; anything else is the honest
       decision fallback, because a message with no next act is the defect
       the dictionary exists to remove. */
    const detail = String((error as { details?: string }).details ?? "").trim();
    if (detail === "already_decided") return refuse(c, 409, "already_decided");
    /* The race losers, by name (R4): whichever door ran second says what the
       first one did. */
    if (detail === "request_withdrawn") return refuse(c, 409, "request_withdrawn");
    if (detail === "request_sent_back") return refuse(c, 409, "request_sent_back");
    if (detail === "reason_required") return refuse(c, 422, "reason_required");
    if (detail === "invalid_cut_qty") return refuse(c, 422, "invalid_cut_qty");
    if (detail === "unknown_request") return refuse(c, 404, "decision_not_recorded");
    if (
      ["invalid_decision", "cuts_on_refusal", "invalid_cuts", "unknown_line"].includes(
        detail,
      )
    ) {
      return refuse(c, 422, "decision_not_recorded");
    }
    return refuse(c, 500, "decision_not_recorded");
  }
  return c.json(data);
});

/**
 * THE ROUND DOORS' SHARED REFUSAL MAP (R3/R4, 0522). Each SQL detail leaves in
 * the governed two lines; the requester is named when the caller is not them.
 */
async function refuseRoundError(
  c: Context<AppEnv>,
  sb: ReturnType<typeof userClient>,
  requestId: string,
  error: { code?: string; details?: string },
) {
  const detail = String(error.details ?? "").trim();
  if (detail === "not_requester") {
    const { data: req } = await sb
      .from("purchase_requests")
      .select("created_by")
      .eq("id", requestId)
      .maybeSingle();
    const { data: users } = await sb.from("app_users").select("id, email");
    const who = identityResolver(
      (users ?? []) as Array<{ id: string; email: string | null }>,
      await resolveActorNames(sb, [(req?.created_by as string | null) ?? null]),
    )((req?.created_by as string | null) ?? null);
    return refuse(c, 403, "not_requester", { actor: who?.name ?? null });
  }
  const known: Record<string, 404 | 409 | 422> = {
    unknown_request: 404,
    request_withdrawn: 409,
    already_decided: 409,
    not_sent_back: 409,
    request_ordered: 409,
    lines_required: 422,
    delivery_date_required: 422,
    invalid_qty: 422,
    unknown_line: 422,
  };
  if (detail === "request_ordered") return refuse(c, 409, "request_already_ordered");
  if (detail === "unknown_request") return refuse(c, 404, "decision_not_recorded");
  if (detail in known && PURCHASING_REFUSAL_CODES.includes(detail as never)) {
    return refuse(c, known[detail]!, detail);
  }
  /* Header/line facts the create door also refuses — the same words. */
  if (PURCHASING_REFUSAL_CODES.includes(detail as never)) return refuse(c, 422, detail);
  if ((error.code ?? "") === "42501") return refuse(c, 403, "not_requester");
  return fail(c, error as { code?: string; message: string });
}

/**
 * POST /:id/withdraw — R3 · `Withdraw request`. The requester only, only
 * before a decision and before any purchase order (0522 enforces all three
 * and stores the real actor and server time).
 */
manualPurchaseRouter.post("/:id/withdraw", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const id = c.req.param("id");
  if (!z.string().uuid().safeParse(id).success) {
    return c.json({ error: "invalid_request_id", code: "invalid_param" }, 400);
  }
  const { data, error } = await sb.rpc("purchasing_withdraw_request", { p_id: id });
  if (error) return refuseRoundError(c, sb, id, error);
  return c.json(data);
});

const resubmitBody = z
  .object({
    destinationId: z.string().uuid(),
    requiredBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    why: z.string().max(1000).nullish(),
    serviceCaseId: z.string().uuid().nullish(),
    staffUserId: z.string().uuid().nullish(),
    subsidiaryName: z.string().max(200).nullish(),
    lines: z
      .array(
        z.object({
          id: z.string().uuid().nullish(),
          sku: z.string().min(1),
          qty: z.number().int().min(1),
          note: z.string().max(500).nullish(),
        }),
      )
      .min(1),
  })
  .strict();

/**
 * POST /:id/resubmit — R4 · `Edit and send again`. The requester edits the
 * SAME request and sends it for a NEW approval; the round, every change, the
 * actor and the time are kept (0522). The 0422 earliest-Delivery-Date floor
 * is measured from today's Malaysia date, exactly as a new request is.
 */
manualPurchaseRouter.post("/:id/resubmit", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const id = c.req.param("id");
  if (!z.string().uuid().safeParse(id).success) {
    return c.json({ error: "invalid_request_id", code: "invalid_param" }, 400);
  }
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = resubmitBody.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", code: "invalid_param" }, 400);
  }
  const b = parsed.data;
  {
    let minDeliveryDays = 0;
    try {
      minDeliveryDays = (await loadPurchasingSettings(sb)).manualPurchaseMinDeliveryDays;
    } catch (e) {
      console.error("manual purchase — purchasing settings unavailable", (e as Error).message);
    }
    if (minDeliveryDays > 0) {
      const earliest = plusCalendarDays(todayIsoMYT(), minDeliveryDays);
      if (b.requiredBy < earliest) {
        return refuse(c, 422, "delivery_date_before_earliest", { date: b.requiredBy, earliest });
      }
    }
  }
  const { data, error } = await sb.rpc("purchasing_resubmit_request", {
    p_id: id,
    p_destination_id: b.destinationId,
    p_required_by: b.requiredBy,
    p_why: (b.why ?? "").trim() || null,
    p_for_service_case_id: b.serviceCaseId ?? null,
    p_for_staff_user_id: b.staffUserId ?? null,
    p_for_subsidiary_name: (b.subsidiaryName ?? "").trim() || null,
    p_lines: b.lines.map((l) => ({
      id: l.id ?? null,
      sku: l.sku,
      qty: l.qty,
      remark: (l.note ?? "").trim() || null,
    })),
  });
  if (error) return refuseRoundError(c, sb, id, error);
  return c.json(data);
});

const deliverToBody = z.object({ destinationId: z.string().uuid() }).strict();

/**
 * PUT /:id/deliver-to — THE DELIVER TO DOOR ON AN EXISTING REQUEST (0421).
 *
 * MPR-20260903-3381 was refused at Issue with "Set Deliver To to Ohana, then
 * issue again", and the request had no door to do that. This is the door.
 * The RPC moves the header and every live line together and refuses once a
 * line is on a PO (`request_ordered`), once the request is refused or every
 * line is cancelled (`request_refused` / `request_closed`), or when the place
 * is unknown or closed.
 *
 * The collection pre-flight `/issue` runs is run here first, so a move that
 * the issue door would refuse anyway is refused now, in the same words, and
 * nothing is written.
 */
manualPurchaseRouter.put("/:id/deliver-to", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const id = c.req.param("id");
  if (!z.string().uuid().safeParse(id).success) {
    return c.json({ error: "invalid_request_id", code: "invalid_param" }, 400);
  }

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = deliverToBody.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", code: "invalid_param" }, 400);
  }
  const { destinationId } = parsed.data;

  const { data: lines, error: lineErr } = await sb
    .from("purchase_demands")
    .select("id, supplier_id, cancelled_at")
    .eq("request_id", id);
  if (lineErr) return fail(c, lineErr);
  const supplierIds = [
    ...new Set(
      (lines ?? [])
        .filter((l) => l.cancelled_at == null)
        .map((l) => l.supplier_id as string | null)
        .filter((v): v is string => v != null),
    ),
  ];
  if (supplierIds.length > 0) {
    const { data: collectionRows, error: collectionErr } = await sb
      .from("purchasing_supplier_settings")
      .select("supplier_id, fixed_destination_id, collected_by_partner_id")
      .in("supplier_id", supplierIds);
    if (collectionErr) return fail(c, collectionErr);
    const governed = ((collectionRows ?? []) as Record<string, unknown>[]).find(
      (r) =>
        supplierIds.includes(r.supplier_id as string) &&
        r.fixed_destination_id != null &&
        r.fixed_destination_id !== destinationId,
    );
    if (governed) {
      const { data: supRows } = await sb
        .from("suppliers")
        .select("id, kind, name")
        .in("id", supplierIds);
      const sup = (supRows ?? []).find((s) => s.id === governed.supplier_id);
      /* Only a collected supplier is bound by its rule; the row for one that
         delivers its own goods is stale Settings, not a refusal. */
      if (sup?.kind === "factory_pickup") {
        const { data: destRow } = await sb
          .from("purchasing_destinations")
          .select("name")
          .eq("id", governed.fixed_destination_id as string)
          .maybeSingle();
        return refuse(c, 422, "supplier_collection_destination_mismatch", {
          supplier: (sup.name as string | null) ?? null,
          destination: (destRow?.name as string | null) ?? null,
        });
      }
    }
  }

  const { data, error } = await sb.rpc("purchasing_move_request_destination", {
    p_id: id,
    p_destination_id: destinationId,
  });
  if (error) {
    /* The door's own detail is the code; the dictionary turns it into the
       two lines. A 42501 (the role gate, the same one `requireOperation`
       already asked) and anything unnamed fall to `mapPgError`. */
    const detail = String((error as { details?: string }).details ?? "").trim();
    if (detail === "request_ordered") return refuse(c, 422, "request_ordered");
    if (detail === "request_closed") return refuse(c, 422, "request_closed");
    if (detail === "request_refused") return refuse(c, 409, "request_refused");
    if (detail === "unknown_request") return refuse(c, 404, "unknown_request");
    if (detail === "unknown_destination") return refuse(c, 422, "unknown_destination");
    if (detail === "inactive_destination") {
      const { data: destRow } = await sb
        .from("purchasing_destinations")
        .select("name")
        .eq("id", destinationId)
        .maybeSingle();
      return refuse(c, 422, "inactive_destination", {
        destination: (destRow?.name as string | null) ?? null,
      });
    }
    return fail(c, error);
  }
  return c.json({ ok: true, ...((data as Record<string, unknown> | null) ?? {}) });
});

/**
 * Card 04 — only `Other Purchase` asks (and must answer) `What is this
 * for?`; the other purposes carry their STRUCTURED For fact instead. The
 * zod mirror keeps the refusal near the form; `purchasing_create_request`
 * re-gates every rule in SQL, which is the actual protection.
 */
const headerBody = z
  .object({
    purpose: z.enum(DEMAND_PURPOSE_VALUES as [string, ...string[]]),
    destinationId: z.string().uuid(),
    /* Card 06 — a new request always carries its Delivery Date: the form
       blocks Send without one, and the door agrees rather than trusts. */
    requiredBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    why: z.string().max(1000).nullish(),
    serviceCaseId: z.string().uuid().nullish(),
    staffUserId: z.string().uuid().nullish(),
    subsidiaryName: z.string().max(200).nullish(),
    /* ⭐ THE RECORDED INTENT (0546 · 0548). Optional on the wire and NULLABLE
       in the column, because a request that recorded none is its own state and
       is never guessed into an answer. The form asks it and refuses Send
       without it; a caller that sends nothing gets the honest NULL and the
       Ready Stock section that says so. */
    fulfilmentIntent: manualPurchaseIntentSchema.nullish(),
    /* ⭐ THE WHOLE REQUEST ARRIVES AT ONCE (0410, YH 2026-09-01). The form
       used to POST the header, read back its id, then POST one line per line
       in a loop — six transactions for one act. A failure on line 3 left a
       committed header with two of five lines, on no screen and behind no
       door. The lines ride the header now and `0410` writes them in ONE
       database transaction.
       OPTIONAL, and that is deliberate: `0410` is applied BY HAND, so a build
       that reaches production before the migration does must still be able to
       create a Manual Purchase. Absent, this route falls back to exactly the
       behaviour it had — see the handler. */
    lines: z
      .array(
        z.object({
          sku: z.string().min(1),
          qty: z.number().int().min(1),
          requiredBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
          note: z.string().max(500).nullish(),
        }),
      )
      .min(1)
      .optional(),
  })
  .superRefine((b, ctx) => {
    if (b.purpose === "other_purchase" && !(b.why ?? "").trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["why"], message: "why_required" });
    }
    if (b.purpose === "service_case" && !b.serviceCaseId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["serviceCaseId"],
        message: "service_case_required",
      });
    }
    if (b.purpose === "internal_staff_purchase" && !b.staffUserId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["staffUserId"],
        message: "staff_member_required",
      });
    }
    if (b.purpose === "subsidiary_purchase" && !(b.subsidiaryName ?? "").trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["subsidiaryName"],
        message: "subsidiary_required",
      });
    }
  });

manualPurchaseRouter.post("/", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = headerBody.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", code: "invalid_param" }, 400);
  }
  const {
    purpose, destinationId, requiredBy, why, serviceCaseId, staffUserId, subsidiaryName, lines,
    fulfilmentIntent,
  } = parsed.data;

  /* ⭐ 0422 — THE EARLIEST DELIVERY DATE A MANUAL PURCHASE MAY ASK FOR
     (YH, 2026-09-04; owner ruling: a NUMBER, not a switch). Purchasing
     Settings holds `manual_purchase_min_delivery_days` — CALENDAR days, like
     `earliest_sell_days`. The floor is the Proceed Date (today in Malaysia,
     the date this request is created on — the same `todayIsoMYT()` the `/plan`
     preview shows as Proceed Date) + that many days. 0 means no floor.
     The lead-time plan's `deliveryDateDefault` stays a proposal only; the
     two are NOT combined.

     Refused HERE, before any row is written, in the same words the form
     prints under the date field. If the settings cannot be loaded there is
     no number to measure against, so the door lets the create RPC decide
     as before — it refuses nothing it cannot compute. */
  {
    let minDeliveryDays = 0;
    try {
      minDeliveryDays = (await loadPurchasingSettings(sb)).manualPurchaseMinDeliveryDays;
    } catch (e) {
      console.error("manual purchase — purchasing settings unavailable", (e as Error).message);
    }
    if (minDeliveryDays > 0) {
      const earliest = plusCalendarDays(todayIsoMYT(), minDeliveryDays);
      if (requiredBy < earliest) {
        return refuse(c, 422, "delivery_date_before_earliest", { date: requiredBy, earliest });
      }
    }
  }

  const header = {
    p_purpose: purpose,
    p_destination_id: destinationId,
    p_why: (why ?? "").trim() || null,
    p_required_by: requiredBy ?? null,
    p_for_service_case_id: serviceCaseId ?? null,
    p_for_staff_user_id: staffUserId ?? null,
    p_for_subsidiary_name: (subsidiaryName ?? "").trim() || null,
    /* ⭐ SENT BY NAME, AND THAT IS THE WHOLE FIX (0548). PostgREST resolves an
       RPC by the argument NAMES the request carries, so omitting this one
       bound the call to the pre-intent overload and stored NULL — which left
       every Ready Stock line reading `This purchase did not record whether
       stock can answer it` and made the entire allocation unreachable. */
    p_fulfilment_intent: fulfilmentIntent ?? null,
  };

  /* ⭐ ONE TRANSACTION FOR ONE ACT (0410). When the caller sends its lines,
     the whole request is written by `purchasing_create_request_with_lines`,
     which calls the SAME two doors this route used to call one after another —
     so every gate still runs, in its own body, and the only thing that changed
     is that a refusal on line 3 now takes the header with it. */
  if (lines && lines.length > 0) {
    const { data, error } = await sb.rpc("purchasing_create_request_with_lines", {
      ...header,
      p_lines: lines.map((l) => ({
        sku: l.sku,
        qty: l.qty,
        required_by: l.requiredBy ?? null,
        remark: (l.note ?? "").trim() || null,
      })),
    });
    if (!error) return c.json(data);

    /* ⛔ MERGED IS NOT APPLIED — and DEGRADING IS NOT DROPPING (YH,
       2026-09-01, correcting the same day's own change).

       The first version of this branch fell through to the header-only door
       when `0410` was missing, on the reasoning that a create form which 404s
       for a day is worse than one that degrades. That reasoning was right and
       the implementation was wrong: the header-only door cannot write lines,
       and the browser is the only caller and ALWAYS sends them. So a missing
       migration produced a `200`, an empty request, and a form that ticked
       every line as created. An approver could then approve a purchase with
       no items, and it would read `Ready to order` for ever.

       "Degrade, not abort" means keep working with LESS, never claim to have
       done something you did not do. Silence about dropped lines is the
       worse failure of the two — a 404 is visible in a second, an empty
       approved purchase is found weeks later by somebody wondering why
       nothing arrived.

       So a missing function is now a REFUSAL that names itself. The
       header-only path below survives for the caller that genuinely sends no
       lines, which is the only caller it can serve honestly. */
    const code = String((error as { code?: string }).code ?? "");
    if (code === "PGRST202" || code === "42883") {
      return c.json(
        {
          error: "migration_not_applied",
          code: "migration_not_applied",
          message: "This Manual Purchase was not created.",
          action: "Ask IT to apply migration 0410, then send it again.",
        },
        503,
      );
    }
    return fail(c, error);
  }

  const { data, error } = await sb.rpc("purchasing_create_request", header);
  if (error) return fail(c, error);
  return c.json(data);
});

const lineBody = z.object({
  sku: z.string().min(1),
  qty: z.number().int().min(1),
  destinationId: z.string().uuid(),
  requiredBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  note: z.string().max(500).nullish(),
  purpose: z.enum(DEMAND_PURPOSE_VALUES as [string, ...string[]]),
});

manualPurchaseRouter.post("/:id/lines", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const requestId = c.req.param("id");
  if (!z.string().uuid().safeParse(requestId).success) {
    return c.json({ error: "invalid_request_id", code: "invalid_param" }, 400);
  }

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = lineBody.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", code: "invalid_param" }, 400);
  }
  const { sku, qty, destinationId, requiredBy, note, purpose } = parsed.data;

  // THERE IS NO `supplier` KEY AND THERE MAY NEVER BE ONE — the RPC derives
  // it from the SKU (Jess, 2026-08-03; kept from the retired dialog's route).
  const { data, error } = await sb.rpc("purchasing_create_demand", {
    p_sku: sku,
    p_qty: qty,
    p_destination_id: destinationId,
    p_required_by: requiredBy ?? null,
    p_remark: note ?? null,
    p_purpose: purpose,
    p_request_id: requestId,
  });
  if (error) return fail(c, error);
  return c.json(data);
});

/** The create form's plan read may name up to this many distinct SKUs —
 *  far above any real request, far below a scraping loop. */
const planBody = z
  .object({ skus: z.array(z.string().min(1).max(120)).max(50) })
  .strict();

/**
 * POST /plan — THE CREATE FORM'S DATE PLAN (Card 06 §3). A READ wearing POST
 * only because live SKUs carry free text (`Leg 4"`) no query string should
 * have to survive. It creates and reserves nothing.
 *
 * The server answers, for the preview Proceed Date (today, Malaysia):
 *
 *   proceedDate           the read-only preview the form shows before Send;
 *                         after Send the stored `created_at` is authoritative.
 *   lines[]               per asked SKU: the Catalog supplier × category and
 *                         the configured production/transit numbers (null
 *                         where nobody set one — the form names the exact
 *                         Settings fact and blocks Send), plus the proposed
 *                         arrival from the ONE forward planner.
 *   deliveryDateDefault   the LATEST line arrival — the one request date every
 *                         selected item can meet — and ONLY when every asked
 *                         SKU resolves and has complete Settings. A partial
 *                         plan proposes nothing; the browser never guesses.
 */
manualPurchaseRouter.post("/plan", requireOperation, async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = planBody.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", code: "invalid_param" }, 400);
  }
  const skus = [...new Set(parsed.data.skus)];
  const proceedDate = todayIsoMYT();
  if (skus.length === 0) {
    return c.json({
      proceedDate,
      lines: [],
      deliveryDateDefault: null,
      planUnavailable: false,
    });
  }

  const sb = userClient(c.env, c.var.auth.jwt);
  let settings: LoadedPurchasingSettings | null = null;
  let planUnavailable = false;
  try {
    settings = await loadPurchasingSettings(sb);
  } catch (e) {
    planUnavailable = true;
    console.error("manual purchase — date plan unavailable", (e as Error).message);
  }

  /* Read whole and matched here — no free-text SKU in a PostgREST `.in()`
     (live rows carry a double quote, `Leg 4"`). */
  const [catRes, supRes] = await Promise.all([
    sb.from("product_skus").select("sku, supplier_id, product_models(category)"),
    sb.from("suppliers").select("id, name"),
  ]);
  if (catRes.error) return fail(c, catRes.error);
  if (supRes.error) return fail(c, supRes.error);
  const catalogBySku = new Map(
    (catRes.data ?? []).map((r) => [
      r.sku as string,
      {
        supplierId: (r.supplier_id as string | null) ?? null,
        category:
          ((r.product_models as unknown as { category: string | null } | null)
            ?.category as string | null) ?? null,
      },
    ]),
  );
  const supplierName = new Map(
    (supRes.data ?? []).map((s) => [s.id as string, (s.name as string | null) ?? null]),
  );

  const lines = skus.map((sku) => {
    const cat = catalogBySku.get(sku);
    const supplierId = cat?.supplierId ?? null;
    const category = cat?.category ?? null;
    const productionDays =
      settings != null ? productionWorkingDaysFor(settings, supplierId, category) : null;
    const transitDays = settings != null ? transitDaysFor(settings, supplierId) : null;
    return {
      sku,
      supplierId,
      supplierName: supplierId ? (supplierName.get(supplierId) ?? null) : null,
      category,
      productionDays,
      transitDays,
      /* The ONE forward arithmetic (`expectedArrivalOf`) from the preview
         Proceed Date — null is a real answer, never a guessed arrival. */
      arrival:
        settings != null
          ? expectedArrivalOf(settings, { supplierId, category, fromIso: proceedDate })
          : null,
    };
  });

  const complete = lines.every((l) => l.arrival != null);
  const deliveryDateDefault = complete
    ? lines.reduce<string | null>(
        (latest, l) => (latest == null || l.arrival! > latest ? l.arrival! : latest),
        null,
      )
    : null;

  return c.json({ proceedDate, lines, deliveryDateDefault, planUnavailable });
});

const issueBody = z.object({
  requestIds: z.array(z.string().uuid()).min(1).max(20),
  /** The consolidation OFFER's answer. Declinable by design (card §6):
   *  `false` issues one document per request. */
  together: z.boolean(),
  /**
   * ⭐ THE CHOSEN GOODS LINES (owner ruling 2026-09-18) — optional, and its
   * absence means *every eligible line of the named requests*, which is what
   * the parent tick has always meant.
   *
   * A request that carries three items and needs two of them bought could not
   * say so while the tick lived only on the parent row. A line named here that
   * does not belong to a named request is refused; the server still recomputes
   * every quantity from its own read, so this NARROWS the issue and can never
   * widen it.
   */
  demandIds: z.array(z.string().uuid()).max(200).optional(),
});

/**
 * ISSUE — approved requests become purchase orders, THE SAME DAY (card §6:
 * no PO-day gate anywhere on this lane; consolidation windows buy nothing
 * from a furniture factory). Everything goes through the ONE creation
 * authority `purchasing_issue_pos_batch` (0339); 0361 taught its payload the
 * `purpose` and the per-line `demand_id`, and the issue is recorded on the
 * demand inside the same transaction.
 *
 * Grouping: a document never mixes suppliers, categories, destinations or
 * purposes — `together` merges across REQUESTS within those walls; declined,
 * each request keeps its own documents. The server recomputes everything
 * from its own read; a stale tab cannot issue yesterday's quantities.
 */
manualPurchaseRouter.post("/issue", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = issueBody.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", code: "invalid_param" }, 400);
  }
  const { requestIds, together, demandIds } = parsed.data;

  /* Manual Purchase and SO Batch Purchase ask the same governed capability;
     the creation RPC asks again at the database boundary. */
  const authority = await purchasingActorMayIssue(sb, c.var.auth.id);
  if (authority.error) return fail(c, authority.error);
  if (!authority.mayIssue) return refuse(c, 403, "not_po_duty");

  const { data: requests, error: reqErr } = await sb
    .from("purchase_requests")
    .select("*")
    .in("id", requestIds);
  if (reqErr) return fail(c, reqErr);
  /* ⭐ EVERY REFUSAL ON THIS DOOR TRAVELS WITH ITS WORDS (YH, 2026-09-01).
     Four of the refusals below were bare `c.json({ error, code })` while their
     neighbours ten lines away already used `refuse()`. A bare body carries no
     `message` and no `action`, so `purchasingRefusal` fell through to its
     honest fallback — "The Portal refused this purchase order. Tell IT the
     message on screen." — and the TWO COMMONEST outcomes of this door, a
     request somebody else already issued and a request nobody has approved
     yet, both read to the operator as a system fault. Nothing was broken;
     nothing was said.
     `refuse()` is the same helper this file already uses for `cost_required`
     and `pickup_partner_required`. It is not new machinery; four throw sites
     were simply written without it. */
  if ((requests ?? []).length !== requestIds.length) {
    return refuse(c, 404, "unknown_request");
  }
  for (const r of requests ?? []) {
    /* ⭐ ONE CODE CANNOT SAY TWO THINGS. `not_ready_to_order` covered BOTH
       "nobody has approved this yet" and "somebody refused this", which are
       opposite facts with opposite next acts — one is a wait on an approver,
       the other is a row that must come off the list. The test is split so
       each carries its own sentence. */
    if (r.refused_at !== null) {
      return c.json(
        { ...refusalBody("request_refused"), requestId: r.id },
        409,
      );
    }
    if (r.withdrawn_at != null) {
      return c.json({ ...refusalBody("request_withdrawn"), requestId: r.id }, 409);
    }
    /* R1 — EVERY request needs its approval; `approval_required` is history,
       not an exemption. A sent-back request is not approved either. The SQL
       issue door re-checks inside the transaction (0522). */
    if (r.approved_at === null || r.sent_back_at != null) {
      return c.json(
        { ...refusalBody("not_ready_to_order"), requestId: r.id },
        409,
      );
    }
  }

  const { data: allLines, error: lineErr } = await sb
    .from("purchase_demands")
    .select(
      "id, request_id, sku, supplier_id, destination_id, qty, approved_qty, issued_qty, required_by, cancelled_at",
    )
    .in("request_id", requestIds);
  if (lineErr) return fail(c, lineErr);

  // What is still to buy on each line: the approver's number less what was
  // already issued — never the original ask. THE one remainder arithmetic
  // (`manualPurchaseLineRemainingOf`, Law D — the Register expansion reads
  // the same function).
  /* ⭐ WHAT READY STOCK ALREADY ANSWERS — subtracted here so the PREVIEW and
     the document agree with the door. `purchasing_demand_record_issue` applies
     the same reduction on the locked row (0546), so a stale tab is refused
     rather than allowed to buy a sofa that is already standing in Klang. */
  const heldByDemand = new Map<string, number>();
  const liveLineIds = (allLines ?? [])
    .filter((l) => l.cancelled_at === null)
    .map((l) => l.id as string);
  if (liveLineIds.length > 0) {
    const { data: heldUnits, error: heldErr } = await sb
      .from("ops_stock_items")
      .select("reserved_purchase_demand_id, qty")
      .in("reserved_purchase_demand_id", liveLineIds)
      .in("status", ["reserved", "sold"]);
    /* Pre-0546 the column is not there and nothing is allocated, so there is
       nothing to subtract; any OTHER failure still stops the issue, because
       issuing against an unread allocation would buy goods twice. */
    if (heldErr && !isMissingAllocationColumn(heldErr)) return fail(c, heldErr);
    for (const u of (heldUnits ?? []) as Array<Record<string, unknown>>) {
      const key = u.reserved_purchase_demand_id as string;
      heldByDemand.set(key, (heldByDemand.get(key) ?? 0) + Math.max(1, Number(u.qty ?? 1)));
    }
  }

  /* THE OPERATOR'S CHOSEN LINES, when they named any. A line that is not on a
     named request is refused by name: the route owns the relationship between
     its own two identities. */
  const chosenLines = demandIds ? new Set(demandIds) : null;
  if (chosenLines) {
    const known = new Set((allLines ?? []).map((l) => l.id as string));
    for (const id of chosenLines) {
      if (!known.has(id)) return refuse(c, 404, "unknown_request");
    }
  }

  const toIssue = (allLines ?? [])
    .filter((l) => l.cancelled_at === null)
    .filter((l) => chosenLines == null || chosenLines.has(l.id as string))
    .map((l) => ({
      ...l,
      issueQty: Math.max(
        0,
        manualPurchaseLineRemainingOf({
          qty: Number(l.qty),
          approvedQty: l.approved_qty == null ? null : Number(l.approved_qty),
          issuedQty: Number(l.issued_qty ?? 0),
        }) - (heldByDemand.get(l.id as string) ?? 0),
      ),
    }))
    .filter((l) => l.issueQty > 0);
  if (toIssue.length === 0) {
    return refuse(c, 409, "nothing_to_issue");
  }

  // The catalog facts: supplier truth, cost, category (for the ETA).
  const skus = [...new Set(toIssue.map((l) => l.sku as string))];
  const { data: catRows, error: catErr } = await sb
    .from("product_skus")
    .select("sku, supplier_id, cost, product_models!inner(category)")
    .in("sku", skus);
  if (catErr) return fail(c, catErr);
  const catalog = new Map(
    (catRows ?? []).map((r) => [
      r.sku as string,
      {
        supplierId: r.supplier_id as string | null,
        cost: r.cost as number | null,
        category: (r.product_models as unknown as { category: string }).category,
      },
    ]),
  );

  /* `name` is read for the REFUSALS, not for the document. Both collection
     refusals below used to pass no facts at all, so `purchasingRefusal`
     degraded to its `the supplier` fallback and named nobody — on a batch
     spanning suppliers the operator could not tell which one refused. */
  const { data: supRows } = await sb.from("suppliers").select("id, kind, name");
  const supplierKind = new Map((supRows ?? []).map((s) => [s.id as string, s.kind as string]));
  const supplierNameById = new Map(
    (supRows ?? []).map((s) => [s.id as string, (s.name as string | null) ?? null]),
  );
  const { data: collectionRows, error: collectionErr } = await sb
    .from("purchasing_supplier_settings")
    .select("supplier_id, fixed_destination_id, collected_by_partner_id");
  if (collectionErr) return fail(c, collectionErr);
  const collectionBySupplier = new Map(
    ((collectionRows ?? []) as Record<string, unknown>[]).map((r) => [
      r.supplier_id as string,
      {
        partnerId: (r.collected_by_partner_id as string | null) ?? null,
        fixedDestinationId: (r.fixed_destination_id as string | null) ?? null,
      },
    ]),
  );

  const { data: whRows, error: whErr } = await sb
    .from("warehouses")
    .select("id, name, kind")
    .eq("kind", "own");
  if (whErr) return fail(c, whErr);
  const warehouse =
    (whRows ?? []).find((w) => /klang|klg/i.test((w.name as string) ?? "")) ??
    (whRows ?? [])[0];
  if (!warehouse) return refuse(c, 500, "no_warehouse");

  const reqById = new Map((requests ?? []).map((r) => [r.id as string, r]));

  /* A document never mixes suppliers, categories, destinations, purposes or
     DELIVERY DATES (Card 06 §7: one PO has one official supplier-facing
     delivery date, so different approved Manual Delivery Dates create
     different POs — the same partition `manualPurchaseIssueGroupCount`
     predicts in the browser, recomputed here from the server's own read).
     `together` widens the group across requests inside those walls. */
  const groups = new Map<
    string,
    { lines: typeof toIssue; destinationId: string; deliveryDate: string | null }
  >();
  for (const l of toIssue) {
    const cat = catalog.get(l.sku as string);
    /* A catalog slot that points at Finance's other creditor (0477) has no
       supplier Purchasing may buy from — the same refusal as an empty slot. */
    if (
      !cat ||
      !cat.supplierId ||
      isOtherCreditor({ kind: supplierKind.get(cat.supplierId) })
    ) {
      return refuse(c, 422, "unresolved_supplier", { sku: l.sku as string });
    }
    if (cat.cost == null || cat.cost <= 0) {
      // The manual lane issues at catalog cost; a SKU without one is a
      // configuration hole the catalog must fix — surfaced by name.
      return refuse(c, 422, "cost_required", { sku: l.sku as string });
    }
    /* Catalog is the commercial authority for this normal purchase. The
       creation RPC rechecks the same value inside the transaction. */
    const req = reqById.get(l.request_id as string)!;
    const destinationId =
      ((l.destination_id as string | null) ?? (req.destination_id as string));
    const deliveryDate =
      ((l.required_by as string | null) ?? (req.required_by as string | null)) || null;
    const wall = `${cat.supplierId}|${cat.category}|${destinationId}|${req.purpose}|${deliveryDate ?? ""}`;
    const key = together ? wall : `${l.request_id}|${wall}`;
    const group = groups.get(key) ?? { lines: [], destinationId, deliveryDate };
    group.lines.push(l);
    groups.set(key, group);
  }

  const governedPos: Record<string, unknown>[] = [];
  for (const [, group] of groups) {
    const lines = group.lines;
    const first = catalog.get(lines[0].sku as string)!;
    const req = reqById.get(lines[0].request_id as string)!;
    const kind = supplierKind.get(first.supplierId!) ?? null;
    const collection = collectionBySupplier.get(first.supplierId!) ?? null;
    const partnerId = kind === "factory_pickup" ? (collection?.partnerId ?? null) : null;
    const supplierNameForRefusal = first.supplierId
      ? (supplierNameById.get(first.supplierId) ?? null)
      : null;
    if (kind === "factory_pickup" && !partnerId) {
      return refuse(c, 422, "pickup_partner_required", { supplier: supplierNameForRefusal });
    }
    if (
      kind === "factory_pickup" &&
      collection?.fixedDestinationId &&
      collection.fixedDestinationId !== group.destinationId
    ) {
      /* Read the destination NAME here and nowhere else. It is wanted only to
         write the refusal, and this line is one statement from returning, so
         the happy path — the one that runs every time a PO is issued — pays no
         subrequest for it. A read that fails degrades to the unnamed sentence
         rather than turning a 422 into a 500. */
      const { data: destRow } = await sb
        .from("purchasing_destinations")
        .select("name")
        .eq("id", collection.fixedDestinationId)
        .maybeSingle();
      return refuse(c, 422, "supplier_collection_destination_mismatch", {
        supplier: supplierNameForRefusal,
        destination: ((destRow?.name as string | null) ?? null),
      });
    }
    governedPos.push({
      supplier_id: first.supplierId,
      warehouse_id: warehouse.id as string,
      destination_id: group.destinationId,
      /* ⭐ THE APPROVED MANUAL DELIVERY DATE BECOMES THE OFFICIAL PO DELIVERY
         DATE (Card 06 §7). An approved request date must survive into the
         supplier commitment — never recalculated from the issue day. A
         historical `Not recorded` request honestly issues with no date; a
         later supplier change records `Supplier Delivery Date` while the
         promise ledger preserves the original. */
      eta_date: group.deliveryDate,
      procurement_partner_id: kind === "factory_pickup" ? partnerId : null,
      so_refs: null,
      purpose: req.purpose,
      lines: lines.map((l) => ({
        sku: l.sku,
        qty: l.issueQty,
        /* THE SERVER'S OWN READ is what is stored. */
        cost: catalog.get(l.sku as string)!.cost,
        cost_source: "catalog",
        commercial_treatment: "normal",
        commercial_reason: null,
        /* SQL compares the Catalog value again inside the creation transaction. */
        expected_catalog_cost: catalog.get(l.sku as string)!.cost,
        demand_id: l.id,
      })),
    });
  }

  const { data: batch, error: batchErr } = await sb.rpc("purchasing_issue_pos_batch", {
    p_pos: governedPos,
  });
  if (batchErr) {
    /* ⭐ THE SAME DOOR, THE SAME WORDS (0379/0380; closure §1 · §9). This lane
       used to call the creation authority with NO duty check at all, and any
       Postgres message it raised reached the operator raw. Both are closed: the
       gate is in SQL, and its refusal arrives as the approved two lines. */
    const detail = String((batchErr as { details?: string }).details ?? "").trim();
    if ((PURCHASING_REFUSAL_CODES as readonly string[]).includes(detail)) {
      const status =
        detail === "not_po_duty" ? 403 : detail === "supplier_price_changed" ? 409 : 422;
      return refuse(c, status, detail);
    }
    return fail(c, batchErr);
  }
  const poIds = ((batch as { po_ids?: unknown } | null)?.po_ids ?? []) as string[];
  return c.json({ poIds, documents: governedPos.length });
});

manualPurchaseRouter.get("/already-have", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const sku = c.req.query("sku");
  if (!sku) {
    return c.json({ error: "sku_required", code: "invalid_param" }, 400);
  }

  // Open cover only: a line on a PO that is still open, less what already
  // arrived. The first PO (earliest arrival) is named on the row so the
  // requester can see WHICH order already carries their goods.
  const { data: poLines, error } = await sb
    .from("purchase_order_lines")
    .select("po_id, qty, received_qty, purchase_orders!inner(id, status, eta_date)")
    .eq("sku", sku)
    .eq("purchase_orders.status", "open");
  if (error) return fail(c, error);

  let alreadyOnPo = 0;
  let firstPo: { id: string; eta: string | null } | null = null;
  for (const l of poLines ?? []) {
    const open = Math.max(0, Number(l.qty ?? 0) - Number(l.received_qty ?? 0));
    if (open <= 0) continue;
    alreadyOnPo += open;
    const po = l.purchase_orders as unknown as { id: string; eta_date: string | null };
    if (!firstPo || (po.eta_date ?? "9999") < (firstPo.eta ?? "9999")) {
      firstPo = { id: po.id, eta: po.eta_date ?? null };
    }
  }

  return c.json({ sku, alreadyOnPo, firstPo });
});

export default manualPurchaseRouter;
