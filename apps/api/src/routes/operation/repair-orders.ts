import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  goodsCategoryWordOf,
  repairOrderCancelInputSchema,
  repairOrderConsentInputSchema,
  repairOrderCreateInputSchema,
  repairOrderIssueInputSchema,
  repairOrderReceiptInputSchema,
  repairOrderReplyInputSchema,
  repairOrderReturnTarget,
  repairProblemLabel,
  REPAIR_ORDER_WORK_RULE,
  REPAIR_ORDER_DEFAULT_WORKING_DAYS,
  REPAIR_ORDER_TARGET_CALENDAR,
  officeWorkingDayOptions,
  type RepairCostResponsibility,
  type RepairOrderConsent,
  type RepairOrderDetail,
  type RepairOrderEligibleUnit,
  type RepairOrderEvidenceFile,
  type RepairOrderListRow,
  type RepairOrderPrintData,
  type RepairOrderReply,
  type RepairOrderSend,
  type RepairOrderUnitRow,
} from "@carres/shared";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { chunk } from "../../lib/purchase-demand-read";
import { adminClient, userClient } from "../../lib/supabase";
import { resolveActorNames } from "../../lib/actor-names";
import { readOfficeCalendar } from "../../lib/office-calendar";
import type { AppEnv } from "../../types";
import { repairOrderWorkCompletion } from "../../lib/repair-order-work";

/**
 * ⭐ REPAIR ORDERS — `docs/purchasing/MASTER.md` §9.7, migration 0602.
 *
 * Every write is a thin door onto a SECURITY DEFINER function; the rules
 * (exact Units only, refused by name, no duplicate active repair, receipt
 * before target, replies never move the target) live in the database.
 *
 * The reads assemble ONE row shape (`RepairOrderListRow` / `RepairOrderDetail`
 * from `@carres/shared`) from the facts their owners keep: the RO and its
 * Units (Purchasing), the send ledger, Stock's repair-return arrival source
 * and its pickup events, and Receiving's GRN. Nothing is added up here; the
 * shared module owns every count (ERP-ARCHITECTURE law D).
 *
 * The Office working-day arithmetic for the Carres return target is the
 * shared engine's (`repairOrderReturnTarget`); the door checks the result
 * against the governed period and refuses one that does not fit.
 */
const router = new Hono<AppEnv>();
const PAGE = 200;
const SIGNED_URL_TTL_SECONDS = 60 * 10;

function gate(c: { var: { auth: { role: string } } }) {
  const role = c.var.auth.role;
  if (role !== "operation" && role !== "principal") {
    throw new HTTPException(403, { message: "operation or principal only" });
  }
}

type Row = Record<string, unknown>;
type Page = PromiseLike<{ data: Row[] | null; error: unknown }>;

async function readAll(page: (from: number, to: number) => Page) {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) return { rows: [] as Row[], error };
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return { rows, error: null as unknown };
}
async function readAllIn(ids: readonly string[], page: (batch: string[], from: number, to: number) => Page) {
  const rows: Row[] = [];
  for (const batch of chunk([...new Set(ids.filter(Boolean))])) {
    const r = await readAll((from, to) => page(batch, from, to));
    if (r.error) return { rows: [] as Row[], error: r.error };
    rows.push(...r.rows);
  }
  return { rows, error: null as unknown };
}

/** A refused door answers with its own words and its `detail` as the code, so
 *  the screen can print `U1-000-001: Reserved for SO2609-4827` by name. */
function failRo(c: Context, error: { code?: string; message?: string; details?: string; detail?: string }) {
  const detail = error.details ?? error.detail;
  if (error.code === "23514" || error.code === "22023") {
    return c.json({ error: "refused", code: detail ?? "invalid_param", message: error.message ?? "refused" }, error.code === "23514" ? 409 : 422);
  }
  const m = mapPgError(error);
  return c.json(m.body, m.status);
}

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

/** Read everything the register and the object page print, for these ROs. */
async function assemble(c: Context<AppEnv>, documents: Row[]): Promise<{ rows: RepairOrderDetail[]; error: unknown }> {
  const sb = userClient(c.env, c.var.auth.jwt);
  const ids = documents.map((d) => d.id as string);
  if (ids.length === 0) return { rows: [], error: null };

  const [units, sends, replies, consents, sources] = await Promise.all([
    readAllIn(ids, (b, f, t) => sb.from("repair_order_units").select("repair_order_id, stock_item_id, unit_code, po_no, sku, ownership, problem, problem_note, repair_requirement, evidence, released_at, removed_at").in("repair_order_id", b).is("removed_at", null).order("unit_code").range(f, t)),
    readAllIn(ids, (b, f, t) => sb.from("document_sends").select("document_id, version, recipient, channel, confirmed, sent_by, sent_at").eq("document_kind", "repair_order").in("document_id", b).order("sent_at").range(f, t)),
    readAllIn(ids, (b, f, t) => sb.from("repair_order_supplier_replies").select("id, repair_order_id, expected_return_date, reason, note, reference, recorded_by, recorded_at").in("repair_order_id", b).order("recorded_at").range(f, t)),
    readAllIn(ids, (b, f, t) => sb.from("repair_order_owner_consents").select("id, repair_order_id, stock_item_ids, outcome, evidence, note, recorded_by, recorded_at").in("repair_order_id", b).order("recorded_at").range(f, t)),
    readAllIn(ids, (b, f, t) => sb.from("arrival_sources").select("id, repair_order_id, cancelled_at").in("repair_order_id", b).range(f, t)),
  ]);
  for (const r of [units, sends, replies, consents, sources]) if (r.error) return { rows: [], error: r.error };

  const liveSources = sources.rows.filter((s) => !s.cancelled_at);
  const sourceIds = liveSources.map((s) => s.id as string);
  const stockIds = units.rows.map((u) => u.stock_item_id as string);
  const skus = [...new Set(units.rows.map((u) => u.sku as string).filter(Boolean))];
  const [events, receipts, stock, catalog, suppliers, claims, sites] = await Promise.all([
    readAllIn(sourceIds, (b, f, t) => sb.from("arrival_source_events").select("source_id, kind, unit_ids, person, evidence, occurred_at").in("source_id", b).in("kind", ["collected", "carrier_received"]).range(f, t)),
    readAllIn(sourceIds, (b, f, t) => sb.from("warehouse_receipts").select("id, arrival_source_id, grn_no, goods_received_at, do_file_path, status").in("arrival_source_id", b).eq("status", "posted").range(f, t)),
    readAllIn(stockIds, (b, f, t) => sb.from("ops_stock_items").select("id, status, hold_reason, condition, supplier").in("id", b).range(f, t)),
    readAllIn(skus, (b, f, t) => sb.from("product_skus").select("sku, variant, product_models(name, category)").in("sku", b).range(f, t)),
    readAllIn(documents.map((d) => d.supplier_id as string), (b, f, t) => sb.from("suppliers").select("id, name").in("id", b).range(f, t)),
    readAllIn(documents.map((d) => d.supplier_claim_id as string), (b, f, t) => sb.from("supplier_claims").select("id, claim_no").in("id", b).range(f, t)),
    readAllIn(documents.flatMap((d) => [d.pickup_site_id as string, d.return_site_id as string]), (b, f, t) => sb.from("warehouses").select("id, name").in("id", b).range(f, t)),
  ]);
  for (const r of [events, receipts, stock, catalog, suppliers, claims, sites]) if (r.error) return { rows: [], error: r.error };

  const receiptIds = receipts.rows.map((r) => r.id as string);
  const results = await readAllIn(receiptIds, (b, f, t) => sb.from("receiving_unit_results").select("receipt_id, stock_item_id, outcome").in("receipt_id", b).in("outcome", ["received", "received_with_issue"]).range(f, t));
  if (results.error) return { rows: [], error: results.error };

  const actors = await resolveActorNames(adminClient(c.env), [
    ...sends.rows.map((s) => s.sent_by as string),
    ...replies.rows.map((r) => r.recorded_by as string),
    ...consents.rows.map((r) => r.recorded_by as string),
    ...documents.map((d) => d.created_by as string),
  ]);

  const nameOf = (rows: Row[], key = "name") => new Map(rows.map((r) => [r.id as string, (r[key] as string) ?? ""]));
  const supplierName = nameOf(suppliers.rows);
  const claimNo = nameOf(claims.rows, "claim_no");
  const siteName = nameOf(sites.rows);
  const stockById = new Map(stock.rows.map((s) => [s.id as string, s]));
  const catalogBySku = new Map(catalog.rows.map((r) => {
    const model = Array.isArray(r.product_models) ? (r.product_models as Row[])[0] : (r.product_models as Row | null);
    return [r.sku as string, { item: str(model?.name), category: str(model?.category), spec: str(r.variant) }];
  }));
  const sourceByRo = new Map<string, string[]>();
  for (const s of liveSources) sourceByRo.set(s.repair_order_id as string, [...(sourceByRo.get(s.repair_order_id as string) ?? []), s.id as string]);

  // Per Unit: the pickup event (Stock) and the return GRN (Receiving).
  const pickup = new Map<string, { at: string; person: string | null; proof: boolean }>();
  for (const e of events.rows) {
    for (const id of (e.unit_ids as string[]) ?? []) {
      const prev = pickup.get(id);
      if (!prev || (e.occurred_at as string) < prev.at) pickup.set(id, { at: e.occurred_at as string, person: str(e.person), proof: Boolean(str(e.evidence)) });
    }
  }
  const receiptById = new Map(receipts.rows.map((r) => [r.id as string, r]));
  const returned = new Map<string, { grn: string | null; at: string | null; proof: boolean }>();
  for (const r of results.rows) {
    const receipt = receiptById.get(r.receipt_id as string);
    if (!receipt) continue;
    returned.set(r.stock_item_id as string, { grn: str(receipt.grn_no), at: str(receipt.goods_received_at), proof: Boolean(str(receipt.do_file_path)) });
  }

  const group = <T,>(rows: Row[], key: string, map: (r: Row) => T) => {
    const m = new Map<string, T[]>();
    for (const r of rows) m.set(r[key] as string, [...(m.get(r[key] as string) ?? []), map(r)]);
    return m;
  };
  const unitsByRo = group(units.rows, "repair_order_id", (u): RepairOrderUnitRow => {
    const id = u.stock_item_id as string;
    const cat = catalogBySku.get(u.sku as string);
    const st = stockById.get(id);
    const back = returned.get(id);
    const out = pickup.get(id);
    return {
      stock_item_id: id,
      unit_id: u.unit_code as string,
      po_no: str(u.po_no),
      sku: str(u.sku),
      // The shared dictionary word (`Mattress` · `Sofa` …), read by the ONE
      // category ladder; `Not recorded` only when there is no SKU to read.
      category: u.sku ? goodsCategoryWordOf({ sku: u.sku as string, category: cat?.category ?? null }) : null,
      item: cat?.item ?? null,
      item_spec: cat?.spec ?? null,
      ownership: str(u.ownership),
      owner_name: str(u.ownership) && u.ownership !== "carres_owned" ? str(st?.supplier) : null,
      display: st?.condition === "exhibition",
      problem: u.problem as string,
      problem_note: u.problem_note as string,
      repair_requirement: u.repair_requirement as string,
      evidence: Array.isArray(u.evidence) ? (u.evidence as RepairOrderEvidenceFile[]) : [],
      collected_by: out?.person ?? null,
      actual_pickup_date: out?.at ?? null,
      goods_received_date: back?.at ?? null,
      grn_no: back?.grn ?? null,
      pickup_proof: out ? out.proof : null,
      return_proof: back ? back.proof : null,
      // Receiving holds a returned repair for inspection; once that hold is
      // released the inspection result exists.
      inspected: Boolean(back) && !(st?.status === "on_hold" && st?.hold_reason === "inspection"),
    };
  });
  const sendsByRo = group(sends.rows, "document_id", (s): RepairOrderSend & { confirmed: boolean } => ({
    version: s.version as number, recipient: s.recipient as string, channel: s.channel as string,
    sent_by: actors.get(s.sent_by as string) ?? null, sent_at: s.sent_at as string, confirmed: Boolean(s.confirmed),
  }));
  const repliesByRo = group(replies.rows, "repair_order_id", (r): RepairOrderReply => ({
    id: r.id as string, expected_return_date: str(r.expected_return_date), reason: r.reason as string,
    note: str(r.note), reference: r.reference as string, recorded_by: actors.get(r.recorded_by as string) ?? null,
    recorded_at: r.recorded_at as string,
  }));
  const consentsByRo = group(consents.rows, "repair_order_id", (r): RepairOrderConsent => ({
    id: r.id as string, stock_item_ids: (r.stock_item_ids as string[]) ?? [], outcome: r.outcome as "given" | "refused",
    evidence: r.evidence as string, note: str(r.note), recorded_by: actors.get(r.recorded_by as string) ?? null,
    recorded_at: r.recorded_at as string,
  }));

  const rows = documents.map((d): RepairOrderDetail => {
    const id = d.id as string;
    const version = (d.version as number) ?? 1;
    const allSends = sendsByRo.get(id) ?? [];
    const allReplies = repliesByRo.get(id) ?? [];
    return {
      id,
      ro_no: d.ro_no as string,
      ro_doc_date: d.ro_doc_date as string,
      version,
      supplier_id: d.supplier_id as string,
      supplier_name: supplierName.get(d.supplier_id as string) || null,
      claim_id: str(d.supplier_claim_id),
      claim_no: claimNo.get(d.supplier_claim_id as string) || null,
      cost_responsibility: d.cost_responsibility as RepairCostResponsibility,
      price: d.price == null ? null : Number(d.price),
      pickup_site_id: d.pickup_site_id as string,
      pickup_site_name: siteName.get(d.pickup_site_id as string) || null,
      return_site_id: d.return_site_id as string,
      return_site_name: siteName.get(d.return_site_id as string) || null,
      issued: allSends.some((s) => s.confirmed && s.version === version),
      supplier_received_at: str(d.supplier_received_at),
      return_target_date: str(d.return_target_date),
      cancelled_at: str(d.cancelled_at),
      latest_reply: allReplies.length ? allReplies[allReplies.length - 1]! : null,
      units: unitsByRo.get(id) ?? [],
      quotation_path: str(d.quotation_path),
      supplier_received_source: str(d.supplier_received_source),
      supplier_received_evidence: str(d.supplier_received_evidence),
      return_target_working_days: (d.return_target_working_days as number | null) ?? null,
      return_target_calendar: str(d.return_target_calendar),
      cancel_reason: str(d.cancel_reason),
      created_by: actors.get(d.created_by as string) ?? null,
      created_at: d.created_at as string,
      sends: allSends.map(({ confirmed: _confirmed, ...s }) => s),
      replies: allReplies,
      consents: consentsByRo.get(id) ?? [],
      pickup_source_id: sourceByRo.get(id)?.[0] ?? null,
    };
  });
  return { rows, error: null };
}

const DOC_SELECT =
  "id, ro_no, ro_doc_date, version, supplier_id, supplier_claim_id, cost_responsibility, price, quotation_path, pickup_site_id, return_site_id, supplier_received_at, supplier_received_source, supplier_received_evidence, return_target_date, return_target_working_days, return_target_calendar, cancelled_at, cancel_reason, created_by, created_at";

// ── GET / — the register (every permitted row; the rail counts need all) ────
router.get("/", async (c) => {
  gate(c);
  const sb = userClient(c.env, c.var.auth.jwt);
  const documents = await readAll((f, t) =>
    sb.from("repair_orders").select(DOC_SELECT).order("ro_doc_date", { ascending: false }).order("created_at", { ascending: false }).range(f, t));
  if (documents.error) return failRo(c, documents.error as never);
  const { rows, error } = await assemble(c, documents.rows);
  if (error) return failRo(c, error as never);
  const list: RepairOrderListRow[] = rows.map((r) => ({
    id: r.id, ro_no: r.ro_no, ro_doc_date: r.ro_doc_date, version: r.version, supplier_id: r.supplier_id,
    supplier_name: r.supplier_name, claim_id: r.claim_id, claim_no: r.claim_no, cost_responsibility: r.cost_responsibility,
    price: r.price, pickup_site_id: r.pickup_site_id, pickup_site_name: r.pickup_site_name, return_site_id: r.return_site_id,
    return_site_name: r.return_site_name, issued: r.issued, supplier_received_at: r.supplier_received_at,
    return_target_date: r.return_target_date, cancelled_at: r.cancelled_at, latest_reply: r.latest_reply, units: r.units,
  }));
  return c.json({ repairOrders: list });
});

// ── GET /options — the create page's Sites and Suppliers ─────────────────────
router.get("/options", async (c) => {
  gate(c);
  const sb = userClient(c.env, c.var.auth.jwt);
  const [sites, suppliers] = await Promise.all([
    sb.from("warehouses").select("id, name, kind").order("name"),
    sb.from("suppliers").select("id, name").order("name"),
  ]);
  if (sites.error) return failRo(c, sites.error);
  if (suppliers.error) return failRo(c, suppliers.error);
  return c.json({
    // `pickup` is a Carres Site (kind own) — PJ Showroom included; `return`
    // may be any governed Site.
    sites: (sites.data ?? []).map((s) => ({ id: s.id as string, name: s.name as string, carres: s.kind === "own" })),
    suppliers: (suppliers.data ?? []).map((s) => ({ id: s.id as string, name: s.name as string })),
  });
});

// ── GET /eligible-units?site=&claim=&search= — the Add Units drawer ─────────
router.get("/eligible-units", async (c) => {
  gate(c);
  const site = c.req.query("site");
  if (!site || !/^[0-9a-f-]{36}$/i.test(site)) return c.json({ error: "invalid_param", code: "site_required", message: "Choose where the goods are now" }, 422);
  const claim = c.req.query("claim");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("repair_order_eligible_units", {
    p_site: site,
    p_claim: claim && /^[0-9a-f-]{36}$/i.test(claim) ? claim : null,
    p_search: c.req.query("search")?.trim() || null,
  });
  if (error) return failRo(c, error);
  const rows = (data ?? []) as Row[];
  const catalog = await sb.from("product_skus").select("sku, variant, product_models(name)").in("sku", [...new Set(rows.map((r) => r.sku as string))].slice(0, 200));
  const itemOf = new Map((catalog.data ?? []).map((r: Row) => {
    const model = Array.isArray(r.product_models) ? (r.product_models as Row[])[0] : (r.product_models as Row | null);
    return [r.sku as string, [str(model?.name), str(r.variant)].filter(Boolean).join(" · ") || null];
  }));
  const units: RepairOrderEligibleUnit[] = rows.map((r) => ({
    id: r.id as string, unit_id: r.unit_code as string, sku: r.sku as string, item: itemOf.get(r.sku as string) ?? null,
    po_no: str(r.po_no), site_id: r.warehouse_id as string, site_name: null, display: r.condition === "exhibition",
    ownership: str(r.ownership), refusal: str(r.refusal),
  }));
  return c.json({ units });
});

// ── GET /work-source — every open RO as the object page reads it ─────────────
// The Work feed's one RO read (`lib/repair-order-work.ts`): cancelled ROs owe
// nothing, so they are not read. Registered before `/:id`.
router.get("/work-source", async (c) => {
  gate(c);
  const sb = userClient(c.env, c.var.auth.jwt);
  const documents = await readAll((f, t) =>
    sb.from("repair_orders").select(DOC_SELECT).is("cancelled_at", null).order("created_at").range(f, t));
  if (documents.error) return failRo(c, documents.error as never);
  const { rows, error } = await assemble(c, documents.rows);
  if (error) return failRo(c, error as never);
  return c.json({ repairOrders: rows });
});

// ── GET /:id/print-data — the A4 REPAIR ORDER (DOCUMENT-KIT §3 rules 11–12) ──
// MONEY-FREE, structurally (DOCUMENT-KIT §4): this payload carries no price,
// quotation or cost field, so the template cannot print one. The photographs
// are the Unit's and the Claim's OWN evidence, read through and signed on open
// — never a second upload against the document.
router.get("/:id/print-data", async (c) => {
  gate(c);
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);
  const column = /^[0-9a-f-]{36}$/i.test(id) ? "id" : "ro_no";
  const { data, error } = await sb.from("repair_orders").select(DOC_SELECT).eq(column, id).maybeSingle();
  if (error) return failRo(c, error);
  if (!data) return c.json({ error: "not_found", code: "not_found", message: "Repair Order not found" }, 404);
  const { rows, error: readError } = await assemble(c, [data as Row]);
  if (readError) return failRo(c, readError as never);
  const ro = rows[0]!;
  const [supplier, sites] = await Promise.all([
    sb.from("suppliers").select("name, address, contact").eq("id", ro.supplier_id).maybeSingle(),
    sb.from("warehouses").select("id, name, address").in("id", [...new Set([ro.pickup_site_id, ro.return_site_id])]),
  ]);
  if (supplier.error) return failRo(c, supplier.error);
  if (sites.error) return failRo(c, sites.error);
  const site = new Map((sites.data ?? []).map((w) => [w.id as string, { name: (w.name as string) ?? "", address: str(w.address) }]));
  const admin = adminClient(c.env);
  const units = await Promise.all(ro.units.map(async (u) => {
    const photos = await Promise.all(u.evidence.filter((e) => e.kind === "photo").map(async (e) => {
      const bucket = e.source === "claim" ? "delivery-orders" : "issue-evidence";
      const { data: signed } = await admin.storage.from(bucket).createSignedUrl(e.path, SIGNED_URL_TTL_SECONDS);
      return signed?.signedUrl ?? null;
    }));
    return {
      unit_id: u.unit_id,
      po_no: u.po_no,
      category: u.category,
      item: u.item,
      item_spec: u.item_spec,
      problem: repairProblemLabel(u.problem),
      problem_note: u.problem_note,
      repair_requirement: u.repair_requirement,
      photos: photos.filter((p): p is string => Boolean(p)),
    };
  }));
  const s = supplier.data as { name: string | null; address: string | null; contact: string | null } | null;
  const payload: RepairOrderPrintData = {
    ro_no: ro.ro_no,
    version: ro.version,
    ro_doc_date: ro.ro_doc_date,
    supplier: { name: s?.name ?? ro.supplier_name ?? "", address: s?.address ?? null, contact: s?.contact ?? null },
    claim_no: ro.claim_no,
    pickup: site.get(ro.pickup_site_id) ?? { name: ro.pickup_site_name ?? "", address: null },
    return_to: site.get(ro.return_site_id) ?? { name: ro.return_site_name ?? "", address: null },
    issued_by: ro.created_by,
    units,
  };
  return c.json(payload);
});

// ── GET /:id — the object ────────────────────────────────────────────────────
router.get("/:id", async (c) => {
  gate(c);
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);
  const column = /^[0-9a-f-]{36}$/i.test(id) ? "id" : "ro_no";
  const { data, error } = await sb.from("repair_orders").select(DOC_SELECT).eq(column, id).maybeSingle();
  if (error) return failRo(c, error);
  if (!data) return c.json({ error: "not_found", code: "not_found", message: "Repair Order not found" }, 404);
  const { rows, error: readError } = await assemble(c, [data as Row]);
  if (readError) return failRo(c, readError as never);
  return c.json({ repairOrder: rows[0] });
});

// ── GET /:id/evidence — signed URLs, minted only when somebody opens one ────
router.get("/:id/evidence", async (c) => {
  gate(c);
  const sb = userClient(c.env, c.var.auth.jwt);
  // RLS is the boundary: the caller must be able to read the RO and its Units.
  const [unitsRes, roRes] = await Promise.all([
    sb.from("repair_order_units").select("stock_item_id, unit_code, evidence").eq("repair_order_id", c.req.param("id")),
    sb.from("repair_orders").select("quotation_path").eq("id", c.req.param("id")).maybeSingle(),
  ]);
  if (unitsRes.error) return failRo(c, unitsRes.error);
  if (roRes.error) return failRo(c, roRes.error);
  const admin = adminClient(c.env);
  const files = await Promise.all((unitsRes.data ?? []).flatMap((u) =>
    ((u.evidence as RepairOrderEvidenceFile[]) ?? []).map(async (e) => {
      // Unit photos live in `issue-evidence`; Claim photos in the Claim's own
      // bucket (`delivery-orders`, 0288) and are read by reference.
      const bucket = e.source === "claim" ? "delivery-orders" : "issue-evidence";
      const { data: signed } = await admin.storage.from(bucket).createSignedUrl(e.path, SIGNED_URL_TTL_SECONDS);
      return { stock_item_id: u.stock_item_id as string, unit_id: u.unit_code as string, ...e, url: signed?.signedUrl ?? null };
    })));
  const path = str((roRes.data as Row | null)?.quotation_path);
  let quotation: { path: string; url: string | null } | null = null;
  if (path) {
    const { data: signed } = await admin.storage.from("issue-evidence").createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    quotation = { path, url: signed?.signedUrl ?? null };
  }
  return c.json({ files, quotation });
});

// ── writes ───────────────────────────────────────────────────────────────────
router.post("/", async (c) => {
  gate(c);
  const p = await parseJsonBody(c, repairOrderCreateInputSchema);
  if (!p.ok) return c.json(p.body, p.status);
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("repair_order_create", { p_input: p.data });
  if (error) return failRo(c, error);
  const out = data as { id: string; ro_no: string; replayed: boolean };
  return c.json(out, out.replayed ? 200 : 201);
});

router.post("/:id/issue", repairOrderWorkCompletion([REPAIR_ORDER_WORK_RULE.issue]), async (c) => {
  gate(c);
  const p = await parseJsonBody(c, repairOrderIssueInputSchema);
  if (!p.ok) return c.json(p.body, p.status);
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("repair_order_issue", {
    p_ro_id: c.req.param("id"), p_channel: p.data.channel, p_recipient: p.data.recipient, p_note: p.data.note ?? null,
  });
  if (error) return failRo(c, error);
  return c.json({ sendId: data });
});

router.post("/:id/supplier-receipt", repairOrderWorkCompletion([REPAIR_ORDER_WORK_RULE.confirmReceipt]), async (c) => {
  gate(c);
  const p = await parseJsonBody(c, repairOrderReceiptInputSchema);
  if (!p.ok) return c.json(p.body, p.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const setting = await sb.from("purchasing_settings").select("repair_return_working_days").order("id").limit(1).maybeSingle();
  const period = (setting.data?.repair_return_working_days as number | undefined) ?? REPAIR_ORDER_DEFAULT_WORKING_DAYS;
  /* 14 OFFICE working days on the STORED Office calendar (Settings → Office:
     weekdays + holidays); the 0677 door refuses a target that calendar does
     not work. Fails safe to the owner defaults. */
  const office = (await readOfficeCalendar(sb)).calendar;
  const target = repairOrderReturnTarget(p.data.received_at, period, officeWorkingDayOptions(office));
  const { data, error } = await sb.rpc("repair_order_record_supplier_receipt", {
    p_ro_id: c.req.param("id"), p_received_at: p.data.received_at, p_source: p.data.source,
    p_evidence: p.data.reference, p_target: target, p_calendar: REPAIR_ORDER_TARGET_CALENDAR,
  });
  if (error) return failRo(c, error);
  return c.json(data);
});

router.post("/:id/supplier-reply", async (c) => {
  gate(c);
  const p = await parseJsonBody(c, repairOrderReplyInputSchema);
  if (!p.ok) return c.json(p.body, p.status);
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("repair_order_record_supplier_reply", { p_ro_id: c.req.param("id"), p_input: p.data });
  if (error) return failRo(c, error);
  return c.json({ replyId: data }, 201);
});

router.post("/:id/owner-consent", repairOrderWorkCompletion([REPAIR_ORDER_WORK_RULE.ownerConsent]), async (c) => {
  gate(c);
  const p = await parseJsonBody(c, repairOrderConsentInputSchema);
  if (!p.ok) return c.json(p.body, p.status);
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("repair_order_record_owner_consent", { p_ro_id: c.req.param("id"), p_input: p.data });
  if (error) return failRo(c, error);
  return c.json({ consentId: data }, 201);
});

router.post("/:id/quotation", async (c) => {
  gate(c);
  let path = "";
  try { path = String(((await c.req.json()) as { path?: unknown }).path ?? ""); } catch { path = ""; }
  if (!path.trim()) return c.json({ error: "invalid_input", code: "invalid_param", message: "Upload the Repair Quotation first" }, 422);
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("repair_order_record_quotation", { p_ro_id: c.req.param("id"), p_path: path.trim() });
  if (error) return failRo(c, error);
  return c.json(data);
});

router.post("/:id/units/:unitId/remove", async (c) => {
  gate(c);
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("repair_order_remove_unit", {
    p_ro_id: c.req.param("id"), p_stock_item_id: c.req.param("unitId"),
  });
  if (error) return failRo(c, error);
  return c.json(data);
});

// Cancelling is the authorised outcome that ends the return follow-up; the
// issue / receipt / consent follow-ups merely leave (not completed).
router.post("/:id/cancel", repairOrderWorkCompletion([REPAIR_ORDER_WORK_RULE.returnDatePassed]), async (c) => {
  gate(c);
  const p = await parseJsonBody(c, repairOrderCancelInputSchema);
  if (!p.ok) return c.json(p.body, p.status);
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("repair_order_cancel", { p_ro_id: c.req.param("id"), p_reason: p.data.reason });
  if (error) return failRo(c, error);
  return c.json(data);
});

export default router;
