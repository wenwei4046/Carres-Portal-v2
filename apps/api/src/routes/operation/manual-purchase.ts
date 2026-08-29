import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  DEMAND_PURPOSE_VALUES,
  LEGACY_OPS_MANAGER_EMAILS,
  expectedArrivalOf,
  isOpsGenericAccount,
  manualPurchaseLineRemainingOf,
  PURCHASING_REFUSAL_CODES,
  purchasingRefusal,
  railItemLabel,
} from "@carres/shared";
import { requireOperation } from "../../lib/auth-guards";
import { dutyHolders, myDuties } from "../../lib/duties";
import { loadPurchasingSettings } from "../../lib/purchasing-settings";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

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
function refuse(
  c: Context<AppEnv>,
  status: 400 | 403 | 409 | 422 | 500,
  code: string,
  facts?: Parameters<typeof purchasingRefusal>[1],
) {
  const r = purchasingRefusal(code, facts);
  return c.json(
    { error: code, code, message: r.wrong, action: r.todo, ...(facts ?? {}) },
    status,
  );
}

/** The approver is the Settings manager — the card names them one and the
 *  same gate (`ops_manager` duty or principal). `canApprove` decides what
 *  RENDERS (the money, the Approve row); `purchasing_decide_request`
 *  re-gates in SQL, which is the actual protection.
 *
 *  ⭐ THE RENDER GATE ASKS EXACTLY WHAT THE DOOR ASKS. The SQL gate
 *  (`purchasing_settings_gate`, 0360/0303) passes the `principal` role or a
 *  real `ops_manager` POSITION duty — it has no legacy-email pass. The old
 *  `isOpsManager` check here did (the shared operation@ login is a manager
 *  for other daily surfaces), so the shared login was offered Approve/Refuse
 *  the door then refused — measured on production, MPR-20260829-2779,
 *  2026-08-29. One authority, two consumers: the web hides, SQL enforces. */
async function canApprove(c: Context<AppEnv>): Promise<boolean> {
  if (c.var.auth.role === "principal") return true;
  return (await myDuties(c)).includes("ops_manager");
}

/**
 * Card 03 §3 — THE REAL ACTION OWNER'S NAME. The rail says `Need approval`;
 * the Register and object print who actually decides: the resolved
 * `ops_manager` duty holder(s) (Purchasing Settings' own gate — Jess today,
 * changeable in HR without redesigning the rail), falling back to the governed
 * legacy list while the duty seat is empty. A robot or shared-password account
 * is a PERMISSION, not a person (org-duties' own words: "the shared
 * operation@ login is a manager for daily surfaces") — it never prints as the
 * owner while a named person also holds the gate.
 */
async function resolveApprovers(
  c: Context<AppEnv>,
  users: Array<{ id: string; name: string | null; email: string | null }>,
): Promise<Array<{ id: string; name: string | null }>> {
  const holders = await dutyHolders(c);
  let approvers = users.filter((u) => (holders[u.id] ?? []).includes("ops_manager"));
  if (approvers.length === 0) {
    approvers = users.filter((u) =>
      (LEGACY_OPS_MANAGER_EMAILS as readonly string[]).includes(u.email ?? ""),
    );
  }
  const isSharedLogin = (email: string | null) =>
    (email ?? "").toLowerCase() === "operation@carres.com";
  const named = approvers.filter(
    (u) => !isOpsGenericAccount(u.email) && !isSharedLogin(u.email),
  );
  if (named.length > 0) approvers = named;
  return approvers.map((u) => ({ id: u.id, name: u.name }));
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

manualPurchaseRouter.get("/", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  const { data: requests, error } = await sb
    .from("purchase_requests")
    .select(
      `id, req_no, purpose, destination_id, required_by, why, approval_required,
       approved_at, approved_by, refused_at, refused_by, refuse_reason,
       for_service_case_id, for_staff_user_id, for_subsidiary_name,
       created_by, created_at`,
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  const ids = (requests ?? []).map((r) => r.id as string);
  let lines: Array<Record<string, unknown>> = [];
  /** id → po_no, for every PO the lines' REAL lineage names (Card 04 §3.4). */
  let pos: Array<{ id: string; po_no: string }> = [];
  if (ids.length > 0) {
    const res = await sb
      .from("purchase_demands")
      .select(
        `id, request_id, sku, supplier_id, destination_id, qty, approved_qty,
         issued_qty, remaining_qty, required_by, remark, po_id, cancelled_at,
         cancel_reason`,
      )
      .in("request_id", ids);
    if (res.error) {
      const m = mapPgError(res.error);
      return c.json(m.body, m.status);
    }
    lines = await stampReceived(sb, res.data ?? []);

    /* THE CATALOG'S CATEGORY AND ITEM WORDS RIDE EACH LINE (Cards 03/04) —
       the rail's `PRODUCT` section is the CATALOG's answer
       (`product_models.category`) and the Register's `Items` column is the
       ONE item-label arithmetic (`railItemLabel`) over the CATALOG's model
       name — never SKU-text inference. Read whole and matched here, never
       `.in()` over free-text SKUs (live rows carry a double quote —
       `Leg 4"` — which breaks the filter; the same rule issue-costs keeps). */
    const { data: catRows, error: catErr } = await sb
      .from("product_skus")
      .select("sku, variant, variant_kind, product_models(category, name)");
    if (catErr) {
      const m = mapPgError(catErr);
      return c.json(m.body, m.status);
    }
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

    /* ⭐ THE PO LINEAGE, NEVER AN INFERENCE (Card 04 §3.4). A demand's own
       `po_id` records the LAST issue only; `purchase_order_lines.demand_id`
       (0361) holds every PO a line was actually issued onto. Both are read;
       nothing is matched by SKU, supplier or date. UUID lists are safe in
       `.in()` — the free-text ban above is about SKUs. */
    const lineIds = lines.map((l) => l.id as string);
    const directPoIds = lines
      .map((l) => l.po_id as string | null)
      .filter((v): v is string => v != null);
    const { data: lineagePoLines, error: lineageErr } =
      lineIds.length > 0
        ? await sb
            .from("purchase_order_lines")
            .select("po_id, demand_id")
            .in("demand_id", lineIds)
        : { data: [] as Array<Record<string, unknown>>, error: null };
    if (lineageErr) {
      const m = mapPgError(lineageErr);
      return c.json(m.body, m.status);
    }
    const poIdsByDemand = new Map<string, Set<string>>();
    for (const pl of lineagePoLines ?? []) {
      const d = pl.demand_id as string | null;
      if (!d) continue;
      const set = poIdsByDemand.get(d) ?? new Set<string>();
      set.add(pl.po_id as string);
      poIdsByDemand.set(d, set);
    }
    const allPoIds = [
      ...new Set([
        ...directPoIds,
        ...[...poIdsByDemand.values()].flatMap((s) => [...s]),
      ]),
    ];
    if (allPoIds.length > 0) {
      const poRes = await sb
        .from("purchase_orders")
        .select("id, po_no")
        .in("id", allPoIds);
      if (poRes.error) {
        const m = mapPgError(poRes.error);
        return c.json(m.body, m.status);
      }
      pos = (poRes.data ?? []).map((p) => ({
        id: p.id as string,
        po_no: (p.po_no as string | null) ?? (p.id as string),
      }));
    }

    lines = lines.map((l) => {
      const viaLineage = poIdsByDemand.get(l.id as string);
      const poIds = new Set<string>(viaLineage ?? []);
      if (l.po_id != null) poIds.add(l.po_id as string);
      const cat = catalogBySku.get(l.sku as string);
      return {
        ...l,
        category: cat?.category ?? null,
        item_label: cat?.itemLabel ?? (l.sku as string),
        po_ids: [...poIds],
      };
    });
  }

  // Names for the columns — read through the owners' tables, never stored
  // twice (Law B: a summary is read-only).
  const forCaseIds = (requests ?? [])
    .map((r) => r.for_service_case_id as string | null)
    .filter((v): v is string => v != null);
  const [dests, sups, users, cases] = await Promise.all([
    sb.from("purchasing_destinations").select("id, name"),
    sb.from("suppliers").select("id, name, kind"),
    sb.from("app_users").select("id, name, email"),
    forCaseIds.length > 0
      ? sb.from("service_cases").select("id, case_no").in("id", forCaseIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
  ]);
  for (const r of [dests, sups, users, cases]) {
    if (r.error) {
      const m = mapPgError(r.error);
      return c.json(m.body, m.status);
    }
  }
  const approvers = await resolveApprovers(
    c,
    (users.data ?? []) as Array<{ id: string; name: string | null; email: string | null }>,
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
      mayIssue = actor.actor_user_id != null && actor.actor_user_id === c.var.auth.id;
    }
  } catch (e) {
    poDutyUnavailable = true;
    console.error("manual purchase — PO duty unavailable", (e as Error).message);
  }

  return c.json({
    requests: requests ?? [],
    lines,
    pos,
    serviceCases: (cases.data ?? []).map((sc) => ({
      id: sc.id as string,
      case_no: sc.case_no as string,
    })),
    destinations: dests.data ?? [],
    suppliers: sups.data ?? [],
    users: (users.data ?? []).map((u) => ({ id: u.id, name: u.name })),
    approvers,
    canApprove: await canApprove(c),
    currentPoDuty,
    actingPoDuty,
    poDutyUnavailable,
    mayIssue,
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
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!request) return c.json({ error: "not_found" }, 404);

  const { data: lines, error: lineErr } = await sb
    .from("purchase_demands")
    .select(
      `id, sku, supplier_id, qty, approved_qty, issued_qty, remaining_qty,
       required_by, remark, po_id, cancelled_at, cancel_reason`,
    )
    .eq("request_id", id);
  if (lineErr) {
    const m = mapPgError(lineErr);
    return c.json(m.body, m.status);
  }

  const stamped = await stampReceived(sb, lines ?? []);
  const approver = await canApprove(c);
  let costs: Record<string, number | null> = {};
  if (approver && (lines ?? []).length > 0) {
    const { data: skuRows } = await sb
      .from("product_skus")
      .select("sku, cost")
      .in("sku", (lines ?? []).map((l) => l.sku as string));
    costs = Object.fromEntries(
      (skuRows ?? []).map((s) => [s.sku as string, (s.cost as number | null) ?? null]),
    );
  }

  const [dests, sups, users] = await Promise.all([
    sb.from("purchasing_destinations").select("id, name"),
    sb.from("suppliers").select("id, name, kind"),
    sb.from("app_users").select("id, name, email"),
  ]);
  const approvers = await resolveApprovers(
    c,
    (users.data ?? []) as Array<{ id: string; name: string | null; email: string | null }>,
  );

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

  return c.json({
    request,
    serviceCaseNo,
    lines: stamped.map((l) => ({
      ...l,
      // The approver's money — absent entirely for everyone else, so the
      // same screen renders minus the money, never a permission error.
      ...(approver ? { unit_cost: costs[l.sku as string] ?? null } : {}),
    })),
    destinations: dests.data ?? [],
    suppliers: sups.data ?? [],
    users: (users.data ?? []).map((u) => ({ id: u.id, name: u.name })),
    approvers,
    canApprove: approver,
  });
});

const decideBody = z.object({
  decision: z.enum(["approve", "refuse"]),
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
       two lines and names who can actually decide. */
    if ((error as { code?: string }).code === "42501") {
      const { data: users } = await sb.from("app_users").select("id, name, email");
      const approvers = await resolveApprovers(
        c,
        (users ?? []) as Array<{ id: string; name: string | null; email: string | null }>,
      );
      const names = approvers
        .map((a) => (a.name ?? "").trim())
        .filter((n) => n !== "");
      return refuse(c, 403, "not_purchase_approver", {
        actor: names.length > 0 ? names.join(" or ") : null,
      });
    }
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
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
    requiredBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
    why: z.string().max(1000).nullish(),
    serviceCaseId: z.string().uuid().nullish(),
    staffUserId: z.string().uuid().nullish(),
    subsidiaryName: z.string().max(200).nullish(),
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
  const { purpose, destinationId, requiredBy, why, serviceCaseId, staffUserId, subsidiaryName } =
    parsed.data;

  const { data, error } = await sb.rpc("purchasing_create_request", {
    p_purpose: purpose,
    p_destination_id: destinationId,
    p_why: (why ?? "").trim() || null,
    p_required_by: requiredBy ?? null,
    p_for_service_case_id: serviceCaseId ?? null,
    p_for_staff_user_id: staffUserId ?? null,
    p_for_subsidiary_name: (subsidiaryName ?? "").trim() || null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
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
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

const issueBody = z.object({
  requestIds: z.array(z.string().uuid()).min(1).max(20),
  /** The consolidation OFFER's answer. Declinable by design (card §6):
   *  `false` issues one document per request. */
  together: z.boolean(),
  /** supplierId → delivery partner, required only for factory-pickup
   *  suppliers; the RPC re-validates. */
  partners: z.record(z.string().uuid(), z.string().uuid()).nullish(),
  /**
   * ⭐ THE TRANSACTION COST THE OPERATOR REVIEWED, per SKU (0380; closure §2).
   *
   * This lane issues at the Catalog price, and the API used to read that price
   * itself and hand it back to the RPC as `cost_source: catalog` — so the
   * database compared its own live value against itself and agreed every time.
   * A supplier price that moved between the review and Issue was adopted with
   * nobody's approval.
   *
   * The browser now declares what it SHOWED. The stored number is still the
   * server's own read; the declaration is only what makes the comparison
   * possible at all.
   */
  expectedCosts: z.record(z.string().min(1), z.number().nonnegative()),
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
  const { requestIds, together, partners, expectedCosts } = parsed.data;

  const { data: requests, error: reqErr } = await sb
    .from("purchase_requests")
    .select("*")
    .in("id", requestIds);
  if (reqErr) {
    const m = mapPgError(reqErr);
    return c.json(m.body, m.status);
  }
  if ((requests ?? []).length !== requestIds.length) {
    return c.json({ error: "unknown_request", code: "unknown_request" }, 404);
  }
  for (const r of requests ?? []) {
    const ready = r.refused_at === null && (!r.approval_required || r.approved_at !== null);
    if (!ready) {
      return c.json(
        { error: "not_ready_to_order", code: "not_ready_to_order", requestId: r.id },
        409,
      );
    }
  }

  const { data: allLines, error: lineErr } = await sb
    .from("purchase_demands")
    .select("id, request_id, sku, supplier_id, qty, approved_qty, issued_qty, cancelled_at")
    .in("request_id", requestIds);
  if (lineErr) {
    const m = mapPgError(lineErr);
    return c.json(m.body, m.status);
  }

  // What is still to buy on each line: the approver's number less what was
  // already issued — never the original ask. THE one remainder arithmetic
  // (`manualPurchaseLineRemainingOf`, Law D — the Register expansion and
  // issue-costs read the same function).
  const toIssue = (allLines ?? [])
    .filter((l) => l.cancelled_at === null)
    .map((l) => ({
      ...l,
      issueQty: manualPurchaseLineRemainingOf({
        qty: Number(l.qty),
        approvedQty: l.approved_qty == null ? null : Number(l.approved_qty),
        issuedQty: Number(l.issued_qty ?? 0),
      }),
    }))
    .filter((l) => l.issueQty > 0);
  if (toIssue.length === 0) {
    return c.json({ error: "nothing_to_issue", code: "nothing_to_issue" }, 409);
  }

  // The catalog facts: supplier truth, cost, category (for the ETA).
  const skus = [...new Set(toIssue.map((l) => l.sku as string))];
  const { data: catRows, error: catErr } = await sb
    .from("product_skus")
    .select("sku, supplier_id, cost, product_models!inner(category)")
    .in("sku", skus);
  if (catErr) {
    const m = mapPgError(catErr);
    return c.json(m.body, m.status);
  }
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

  const { data: supRows } = await sb.from("suppliers").select("id, kind");
  const supplierKind = new Map((supRows ?? []).map((s) => [s.id as string, s.kind as string]));

  const { data: whRows, error: whErr } = await sb
    .from("warehouses")
    .select("id, name, kind")
    .eq("kind", "own");
  if (whErr) {
    const m = mapPgError(whErr);
    return c.json(m.body, m.status);
  }
  const warehouse =
    (whRows ?? []).find((w) => /klang|klg/i.test((w.name as string) ?? "")) ??
    (whRows ?? [])[0];
  if (!warehouse) return c.json({ error: "no_warehouse", code: "no_warehouse" }, 500);

  let settings;
  try {
    settings = await loadPurchasingSettings(sb);
  } catch (e) {
    return c.json({ error: "settings_unavailable", message: (e as Error).message }, 500);
  }

  const reqById = new Map((requests ?? []).map((r) => [r.id as string, r]));

  // A document never mixes suppliers, categories, destinations or purposes.
  // `together` widens the group across requests inside those walls.
  const groups = new Map<string, typeof toIssue>();
  for (const l of toIssue) {
    const cat = catalog.get(l.sku as string);
    if (!cat || !cat.supplierId) {
      return c.json(
        { error: "unresolved_supplier", code: "unresolved_supplier", sku: l.sku },
        422,
      );
    }
    if (cat.cost == null || cat.cost <= 0) {
      // The manual lane issues at catalog cost; a SKU without one is a
      // configuration hole the catalog must fix — surfaced by name.
      return refuse(c, 422, "cost_required", { sku: l.sku as string });
    }
    /* ⭐ THE REVIEWED PRICE MUST STILL BE TRUE (0380; closure §2). Nothing
       declared means nothing reviewed, and a declaration that no longer matches
       Catalog means the supplier moved the price after the operator looked.
       Neither is Operations' decision to wave through. */
    const reviewed = expectedCosts[l.sku as string];
    if (reviewed == null) {
      return refuse(c, 422, "expected_cost_required", { sku: l.sku as string });
    }
    if (reviewed !== cat.cost) {
      return refuse(c, 409, "supplier_price_changed", { sku: l.sku as string });
    }
    const req = reqById.get(l.request_id as string)!;
    const wall = `${cat.supplierId}|${cat.category}|${req.destination_id}|${req.purpose}`;
    const key = together ? wall : `${l.request_id}|${wall}`;
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const governedPos: Record<string, unknown>[] = [];
  for (const [, lines] of groups) {
    const first = catalog.get(lines[0].sku as string)!;
    const req = reqById.get(lines[0].request_id as string)!;
    const kind = supplierKind.get(first.supplierId!) ?? null;
    const partnerId = partners?.[first.supplierId!] ?? null;
    if (kind === "factory_pickup" && !partnerId) {
      return c.json(
        {
          error: "pickup_partner_required",
          code: "pickup_partner_required",
          supplierId: first.supplierId,
        },
        422,
      );
    }
    governedPos.push({
      supplier_id: first.supplierId,
      warehouse_id: warehouse.id as string,
      destination_id: req.destination_id,
      // The frozen ETA arithmetic, called not copied — no PO-day gate ever
      // touches this lane.
      eta_date: expectedArrivalOf(settings, {
        supplierId: first.supplierId!,
        category: first.category,
        fromIso: todayIso,
      }),
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
        /* …and the reviewed price travels beside it, so 0380 has two numbers to
           compare instead of one number compared with itself. */
        expected_catalog_cost: expectedCosts[l.sku as string] ?? null,
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
    const m = mapPgError(batchErr);
    return c.json(m.body, m.status);
  }
  const poIds = ((batch as { po_ids?: unknown } | null)?.po_ids ?? []) as string[];
  return c.json({ poIds, documents: governedPos.length });
});

/**
 * GET /issue-costs?requestIds=a,b,c — THE PRICES THE OPERATOR IS ABOUT TO
 * COMMIT TO (closure §2).
 *
 * `Issue as one PO` can pull in sibling requests whose lines are not on screen,
 * so the surface could not otherwise show — or declare — the price it was
 * buying at. This read answers exactly the SKUs those requests still have to
 * buy, and the browser sends the same numbers back to `/issue`.
 *
 * It is a READ. It creates nothing and reserves nothing, and a price it returns
 * is only a fact about right now — which is precisely why `/issue` compares it
 * again.
 */
manualPurchaseRouter.get("/issue-costs", requireOperation, async (c) => {
  const raw = (c.req.query("requestIds") ?? "").trim();
  const requestIds = raw
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  if (requestIds.length === 0 || requestIds.length > 20) {
    return refuse(c, 400, "invalid_param");
  }
  const sb = userClient(c.env, c.var.auth.jwt);

  const { data: lines, error } = await sb
    .from("purchase_demands")
    .select("id, sku, qty, approved_qty, issued_qty, cancelled_at")
    .in("request_id", requestIds);
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  /* The same arithmetic `/issue` uses (`manualPurchaseLineRemainingOf`) — the
     approver's number less what already went out. A line with nothing left to
     buy has no price to review. */
  const skus = [
    ...new Set(
      (lines ?? [])
        .filter((l) => l.cancelled_at === null)
        .filter(
          (l) =>
            manualPurchaseLineRemainingOf({
              qty: Number(l.qty),
              approvedQty: l.approved_qty == null ? null : Number(l.approved_qty),
              issuedQty: Number(l.issued_qty ?? 0),
            }) > 0,
        )
        .map((l) => l.sku as string),
    ),
  ];
  if (skus.length === 0) return c.json({ costs: [] });

  /* ⭐ NO SKU IN A POSTGREST `.in()` LIST. `sku` is free text and live rows carry
     a DOUBLE QUOTE (`Leg 4"`), which breaks the filter and makes the server
     answer with whatever it could parse. The catalog is a couple of hundred
     rows, so it is read whole and matched here — the same rule To Order keeps. */
  const { data: catRows, error: catErr } = await sb.from("product_skus").select("sku, cost");
  if (catErr) {
    const m = mapPgError(catErr);
    return c.json(m.body, m.status);
  }
  const wanted = new Set(skus);
  const costBySku = new Map(
    (catRows ?? [])
      .filter((r) => wanted.has(r.sku as string))
      .map((r) => [r.sku as string, (r.cost as number | null) ?? null]),
  );
  return c.json({
    costs: skus
      .map((sku) => ({ sku, unitCost: costBySku.get(sku) ?? null }))
      .sort((a, b) => a.sku.localeCompare(b.sku)),
  });
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
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

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
