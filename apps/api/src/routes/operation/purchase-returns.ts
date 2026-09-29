import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  goodsCategoryWordOf,
  NO_RETURN_WAS_ISSUED,
  type PurchaseReturnDetail,
  type PurchaseReturnEvidenceCount,
  type PurchaseReturnIssueSource,
  type PurchaseReturnPendingIssue,
  type PurchaseReturnPrintData,
} from "@carres/shared";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { chunk } from "../../lib/purchase-demand-read";
import { adminClient, userClient } from "../../lib/supabase";
import { resolveActorNames } from "../../lib/actor-names";
import { purchaseReturnWorkCompletion } from "../../lib/purchase-return-work";
import type { AppEnv } from "../../types";

/**
 * ⭐ PURCHASE RETURNS — `docs/purchasing/MASTER.md` §9.6: the register
 * (owner-confirmed 2026-09-18, storage 0548) and the creation door
 * (owner-approved 2026-09-25, 0609).
 *
 *   GET  /                        the register (every permitted return)
 *   GET  /work-source             claims awaiting a return + open returns (Work)
 *   GET  /issue-source?claim=     the `Issue Purchase Return` form's facts
 *   GET  /:id                     one return: Units, send ledger, confirmations
 *   GET  /:id/print-data          the money-free paper's payload
 *   POST /                        `Issue Purchase Return` → the ONE 0548/0609 door
 *   POST /:id/send                `Return document sent to supplier`
 *   POST /:id/pickup-confirmation `Confirmed Pickup` (evidenced)
 *
 * Every write is a thin door onto a SECURITY DEFINER function; there is no
 * table write here (ERP-ARCHITECTURE law C). Issuing moves no stock (§7.4):
 * the pickup facts are Stock's Outbound `Return to supplier` handover, read
 * here and never written.
 *
 * The shape is the shared row (`PurchaseReturnDetail` ⊇ `PurchaseReturnListRow`)
 * and nothing is added up here — every derived count is the shared module's
 * (ERP-ARCHITECTURE law D). The sent state is the `document_sends` ledger; the
 * 0548 column `document_sent_at` is no longer read.
 */
const purchaseReturnsRouter = new Hono<AppEnv>();

const DEFAULT_LIMIT = 200;

function gate(c: { var: { auth: { role: string } } }) {
  const role = c.var.auth.role;
  if (role !== "operation" && role !== "principal") {
    throw new HTTPException(403, { message: "operation or principal only" });
  }
}

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v ? v : null);

/** Read every permitted row, not the first page: §9.6's rail counts, the
 *  search and the export must all cover the full permitted set, and a count
 *  taken from a capped page is a wrong count with a confident look. */
async function readAll(
  page: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: unknown }>,
): Promise<{ rows: Row[]; error: unknown }> {
  const rows: Row[] = [];
  for (let from = 0; ; from += DEFAULT_LIMIT) {
    const { data, error } = await page(from, from + DEFAULT_LIMIT - 1);
    if (error) return { rows: [], error };
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < DEFAULT_LIMIT) break;
  }
  return { rows, error: null };
}

/**
 * An `in (…)` list lives in the URL, so every id list is chunked (the claims
 * route's `chunk`) and each chunk still fully paginated.
 */
async function readAllIn(
  ids: readonly string[],
  page: (batch: string[], from: number, to: number) =>
    PromiseLike<{ data: Row[] | null; error: unknown }>,
): Promise<{ rows: Row[]; error: unknown }> {
  const rows: Row[] = [];
  for (const batch of chunk([...new Set(ids.filter(Boolean))])) {
    const result = await readAll((from, to) => page(batch, from, to));
    if (result.error) return { rows: [], error: result.error };
    rows.push(...result.rows);
  }
  return { rows, error: null };
}

/** A refused door answers with its own words. A Unit refused by name carries
 *  the approved closing sentence `No return was issued.` (§9.6). */
function failDoor(c: Context, error: { code?: string; message?: string; details?: string; detail?: string }) {
  const detail = error.details ?? error.detail;
  if (error.code === "23514" || error.code === "22023") {
    const byName = detail === "unit_not_eligible" || detail === "unit_changed" || detail === "unit_twice" || detail === "unit_not_tracked";
    const message = byName ? `${error.message ?? "refused"}. ${NO_RETURN_WAS_ISSUED}` : (error.message ?? "refused");
    return c.json({ error: "refused", code: detail ?? "invalid_param", message }, error.code === "23514" ? 409 : 422);
  }
  const m = mapPgError(error);
  return c.json(m.body, m.status);
}

const DOCUMENT_COLUMNS = "id, pr_no, pr_doc_date, supplier_id, supplier_claim_id, warehouse_receipt_id, confirmed_pickup_date, created_by";

/** Everything the register, the record and Work print, for these returns. */
async function assemble(c: Context<AppEnv>, documents: Row[]): Promise<{ rows: PurchaseReturnDetail[]; error: unknown }> {
  const sb = userClient(c.env, c.var.auth.jwt);
  const ids = documents.map((d) => d.id as string);
  if (ids.length === 0) return { rows: [], error: null };

  const [units, sends, confirmations] = await Promise.all([
    readAllIn(ids, (batch, from, to) =>
      sb.from("purchase_return_units")
        .select("purchase_return_id, stock_item_id, unit_code, po_id, category, item, item_spec, pickup_location, return_to, collected_by, collected_by_name, actual_pickup_date, supplier_received_date, evidence")
        .in("purchase_return_id", batch).order("unit_code", { ascending: true }).range(from, to)),
    readAllIn(ids, (batch, from, to) =>
      sb.from("document_sends").select("id, document_id, channel, recipient, sent_by, sent_at")
        .eq("document_kind", "purchase_return").in("document_id", batch).order("sent_at", { ascending: true }).range(from, to)),
    readAllIn(ids, (batch, from, to) =>
      sb.from("purchase_return_pickup_confirmations").select("purchase_return_id, confirmed_pickup_date, evidence, recorded_by, recorded_at")
        .in("purchase_return_id", batch).order("recorded_at", { ascending: true }).range(from, to)),
  ]);
  for (const r of [units, sends, confirmations]) if (r.error) return { rows: [], error: r.error };

  const admin = adminClient(c.env);
  const [supplierRes, claimRes, receiptRes, actorNames] = await Promise.all([
    readAllIn(documents.map((d) => d.supplier_id as string), (b, f, t) => sb.from("suppliers").select("id, name").in("id", b).range(f, t)),
    readAllIn(documents.map((d) => d.supplier_claim_id as string), (b, f, t) => sb.from("supplier_claims").select("id, claim_no").in("id", b).range(f, t)),
    readAllIn(documents.map((d) => d.warehouse_receipt_id as string), (b, f, t) => sb.from("warehouse_receipts").select("id, grn_no").in("id", b).range(f, t)),
    resolveActorNames(admin, [
      ...units.rows.map((u) => u.collected_by as string | null),
      ...sends.rows.map((s) => s.sent_by as string | null),
      ...confirmations.rows.map((r) => r.recorded_by as string | null),
    ]),
  ]);
  for (const r of [supplierRes, claimRes, receiptRes]) if (r.error) return { rows: [], error: r.error };

  const nameOf = (rows: Row[], key: string) => new Map(rows.map((r) => [r.id as string, (r[key] as string) ?? ""]));
  const supplierName = nameOf(supplierRes.rows, "name");
  const claimNo = nameOf(claimRes.rows, "claim_no");
  const grnNo = nameOf(receiptRes.rows, "grn_no");
  const group = (rows: Row[], key: string) => {
    const m = new Map<string, Row[]>();
    for (const r of rows) m.set(r[key] as string, [...(m.get(r[key] as string) ?? []), r]);
    return m;
  };
  const unitsBy = group(units.rows, "purchase_return_id");
  const sendsBy = group(sends.rows, "document_id");
  const confirmationsBy = group(confirmations.rows, "purchase_return_id");

  const rows = documents.map((row): PurchaseReturnDetail => {
    const id = row.id as string;
    const docSends = (sendsBy.get(id) ?? []).map((s) => ({
      id: s.id as string,
      channel: s.channel as string,
      recipient: s.recipient as string,
      sent_at: s.sent_at as string,
      sent_by_name: actorNames.get(s.sent_by as string) ?? null,
    }));
    return {
      id,
      pr_no: str(row.pr_no),
      pr_doc_date: str(row.pr_doc_date),
      supplier_id: str(row.supplier_id),
      supplier_name: supplierName.get(row.supplier_id as string) || null,
      supplier_claim_id: str(row.supplier_claim_id),
      claim_no: claimNo.get(row.supplier_claim_id as string) || null,
      grn_no: grnNo.get(row.warehouse_receipt_id as string) || null,
      // The ledger is the fact (0609); the 0548 column is not read.
      sent_at: docSends[0]?.sent_at ?? null,
      confirmed_pickup_date: str(row.confirmed_pickup_date),
      sends: docSends,
      confirmations: (confirmationsBy.get(id) ?? []).map((r) => ({
        confirmed_pickup_date: r.confirmed_pickup_date as string,
        evidence: r.evidence as string,
        recorded_at: r.recorded_at as string,
        recorded_by_name: actorNames.get(r.recorded_by as string) ?? null,
      })),
      units: (unitsBy.get(id) ?? []).map((unit) => ({
        /* §9.6's `Unit ID` is the Unit's own code, not the table's key. */
        unit_id: (unit.unit_code as string) ?? "",
        po_id: str(unit.po_id),
        category: str(unit.category),
        item: str(unit.item),
        item_spec: str(unit.item_spec),
        pickup_location: str(unit.pickup_location),
        return_to: str(unit.return_to),
        /* The RECORDED collector wins over a directory lookup: §9.6 wants the
           actual collector, and a person who has since left is still who
           collected the goods that day. */
        collected_by: str(unit.collected_by_name) || actorNames.get(unit.collected_by as string) || null,
        actual_pickup_date: str(unit.actual_pickup_date),
        supplier_received_date: str(unit.supplier_received_date),
        evidence: countEvidence(unit.evidence),
      })),
    };
  });
  return { rows, error: null };
}

async function readReturns(c: Context<AppEnv>, filter?: { id?: string; claimId?: string }) {
  const sb = userClient(c.env, c.var.auth.jwt);
  const documents = await readAll((from, to) => {
    let q = sb.from("purchase_returns").select(DOCUMENT_COLUMNS);
    if (filter?.id) q = q.eq("id", filter.id);
    if (filter?.claimId) q = q.eq("supplier_claim_id", filter.claimId);
    return q.order("pr_doc_date", { ascending: false }).order("id", { ascending: false }).range(from, to);
  });
  if (documents.error) return { rows: [] as PurchaseReturnDetail[], error: documents.error };
  return assemble(c, documents.rows);
}

// ----- GET / -----
//
// `?claim=<claim_no>` narrows to one Supplier Claim's returns, so the claim
// record links straight into its own paperwork.
purchaseReturnsRouter.get("/", async (c) => {
  gate(c);
  const claimParam = c.req.query("claim")?.trim() || null;
  const { rows, error } = await readReturns(c);
  if (error) {
    const mapped = mapPgError(error as never);
    return c.json(mapped.body, mapped.status);
  }
  return c.json({ returns: rows.filter((row) => !claimParam || row.claim_no === claimParam || row.supplier_claim_id === claimParam) });
});

// ----- GET /work-source -----
//
// Work's two inputs: open claims that recorded `Return to supplier` and have
// no Purchase Return yet, and every return that is not fully picked up.
purchaseReturnsRouter.get("/work-source", async (c) => {
  gate(c);
  const sb = userClient(c.env, c.var.auth.jwt);
  const claims = await readAll((from, to) =>
    sb.from("supplier_claims").select("id, claim_no, supplier_id, carres_execution_at")
      .eq("status", "open").eq("carres_execution", "return_to_supplier").order("id").range(from, to));
  if (claims.error) {
    const m = mapPgError(claims.error as never);
    return c.json(m.body, m.status);
  }
  const { rows, error } = await readReturns(c);
  if (error) {
    const m = mapPgError(error as never);
    return c.json(m.body, m.status);
  }
  const withReturn = new Set(rows.map((r) => r.supplier_claim_id));
  const pendingClaims = claims.rows.filter((r) => !withReturn.has(r.id as string));
  const suppliers = await readAllIn(pendingClaims.map((r) => r.supplier_id as string), (b, f, t) => sb.from("suppliers").select("id, name").in("id", b).range(f, t));
  if (suppliers.error) {
    const m = mapPgError(suppliers.error as never);
    return c.json(m.body, m.status);
  }
  const names = new Map(suppliers.rows.map((s) => [s.id as string, s.name as string]));
  const pendingIssue: PurchaseReturnPendingIssue[] = pendingClaims.map((r) => ({
    id: r.id as string,
    claim_no: str(r.claim_no),
    supplier_name: names.get(r.supplier_id as string) ?? null,
    carres_execution_at: str(r.carres_execution_at),
  }));
  return c.json({ pendingIssue, returns: rows.filter((r) => r.units.some((u) => !u.actual_pickup_date)) });
});

/** The form's facts, read as the caller: the claim, Supplier Master's return
 *  address, and every tracked Unit with the door's own refusal words. The
 *  catalog snapshot (Category · Items) is read here, never taken from the
 *  browser. */
async function readIssueSource(c: Context<AppEnv>, claimId: string): Promise<{ source: PurchaseReturnIssueSource | null; error: unknown }> {
  const sb = userClient(c.env, c.var.auth.jwt);
  const claim = await sb.from("supplier_claims").select("id, claim_no, supplier_id, warehouse_receipt_id").eq("id", claimId).maybeSingle();
  if (claim.error) return { source: null, error: claim.error };
  if (!claim.data) return { source: null, error: null };
  const row = claim.data as Row;
  const [supplier, grn, units] = await Promise.all([
    sb.from("suppliers").select("name, return_address").eq("id", row.supplier_id as string).maybeSingle(),
    row.warehouse_receipt_id
      ? sb.from("warehouse_receipts").select("grn_no").eq("id", row.warehouse_receipt_id as string).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    sb.rpc("purchase_return_eligible_units", { p_claim: claimId }),
  ]);
  for (const r of [supplier, grn, units]) if (r.error) return { source: null, error: r.error };
  const unitRows = ((units.data ?? []) as Row[]);
  const skus = [...new Set(unitRows.map((u) => u.sku as string).filter(Boolean))];
  const catalog = await readAllIn(skus, (b, f, t) => sb.from("product_skus").select("sku, variant, product_models(name, category)").in("sku", b).range(f, t));
  if (catalog.error) return { source: null, error: catalog.error };
  const bySku = new Map(catalog.rows.map((r) => {
    const model = (Array.isArray(r.product_models) ? (r.product_models as Row[])[0] : r.product_models) as Row | null;
    return [r.sku as string, { item: str(model?.name), category: str(model?.category), spec: str(r.variant) }];
  }));
  const s = supplier.data as { name?: string | null; return_address?: string | null } | null;
  return {
    source: {
      claim_id: claimId,
      claim_no: str(row.claim_no),
      supplier_name: s?.name ?? null,
      return_address: str(s?.return_address?.trim()),
      grn_no: str((grn.data as Row | null)?.grn_no),
      units: unitRows.map((u) => {
        const cat = bySku.get(u.sku as string);
        return {
          stock_item_id: u.stock_item_id as string,
          unit_code: u.unit_code as string,
          po_no: str(u.po_no),
          category: u.sku ? goodsCategoryWordOf({ sku: u.sku as string, category: cat?.category ?? null }) : null,
          item: cat?.item ?? null,
          item_spec: cat?.spec ?? null,
          pickup_location: str(u.pickup_location),
          seen: String(u.seen ?? ""),
          refusal: str(u.refusal),
        };
      }),
    },
    error: null,
  };
}

purchaseReturnsRouter.get("/issue-source", async (c) => {
  gate(c);
  const claimId = c.req.query("claim")?.trim() ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(claimId)) return c.json({ error: "invalid_input", code: "invalid_param", message: "claim is required" }, 422);
  const { source, error } = await readIssueSource(c, claimId);
  if (error) return failDoor(c, error as never);
  if (!source) throw new HTTPException(404, { message: "claim not found" });
  return c.json({ source });
});

// ----- POST / — `Issue Purchase Return` -----

const issueSchema = z.object({
  claim_id: z.string().uuid(),
  units: z.array(z.object({
    stock_item_id: z.string().uuid(),
    seen: z.string().min(1).max(64),
    pickup_location: z.string().trim().max(160).nullable().optional(),
  })).min(1).max(200),
  confirmed_pickup_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

purchaseReturnsRouter.post("/", purchaseReturnWorkCompletion("issue"), async (c) => {
  gate(c);
  const parsed = await parseJsonBody(c, issueSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const { source, error } = await readIssueSource(c, parsed.data.claim_id);
  if (error) return failDoor(c, error as never);
  if (!source) throw new HTTPException(404, { message: "claim not found" });
  const facts = new Map(source.units.map((u) => [u.stock_item_id, u]));
  const units = parsed.data.units.map((u) => {
    const f = facts.get(u.stock_item_id);
    return {
      stock_item_id: u.stock_item_id,
      seen: u.seen,
      pickup_location: u.pickup_location?.trim() || null,
      category: f?.category ?? null,
      item: f?.item ?? null,
      item_spec: f?.item_spec ?? null,
    };
  });
  const { data, error: doorError } = await userClient(c.env, c.var.auth.jwt).rpc("purchasing_issue_purchase_return", {
    p_claim_id: parsed.data.claim_id,
    p_units: units,
    p_confirmed_pickup_date: parsed.data.confirmed_pickup_date ?? null,
  });
  if (doorError) return failDoor(c, doorError);
  return c.json({ id: data as string }, 201);
});

// ----- GET /:id and /:id/print-data -----

async function readOne(c: Context<AppEnv>, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { row: null, error: null };
  const { rows, error } = await readReturns(c, { id });
  return { row: rows[0] ?? null, error };
}

purchaseReturnsRouter.get("/:id", async (c) => {
  gate(c);
  const { row, error } = await readOne(c, c.req.param("id"));
  if (error) return failDoor(c, error as never);
  if (!row) throw new HTTPException(404, { message: "purchase return not found" });
  return c.json({ purchaseReturn: row });
});

purchaseReturnsRouter.get("/:id/print-data", async (c) => {
  gate(c);
  const { row, error } = await readOne(c, c.req.param("id"));
  if (error) return failDoor(c, error as never);
  if (!row) throw new HTTPException(404, { message: "purchase return not found" });
  const sb = userClient(c.env, c.var.auth.jwt);
  const [supplier, doc] = await Promise.all([
    sb.from("suppliers").select("name, contact").eq("id", row.supplier_id ?? "").maybeSingle(),
    sb.from("purchase_returns").select("created_by").eq("id", row.id).maybeSingle(),
  ]);
  if (supplier.error) return failDoor(c, supplier.error);
  const createdBy = str((doc.data as Row | null)?.created_by);
  const issuer = createdBy ? (await resolveActorNames(adminClient(c.env), [createdBy])).get(createdBy) ?? null : null;
  const s = supplier.data as { name?: string | null; contact?: string | null } | null;
  // Money-free (DOCUMENT-KIT §4): the payload carries no figure at all.
  const print: PurchaseReturnPrintData = {
    pr_no: row.pr_no,
    pr_doc_date: row.pr_doc_date ?? new Date().toISOString(),
    supplier: { name: s?.name ?? row.supplier_name ?? "", contact: s?.contact ?? null },
    return_to: row.units[0]?.return_to ?? null,
    claim_no: row.claim_no,
    grn_no: row.grn_no,
    confirmed_pickup_date: row.confirmed_pickup_date,
    units: row.units.map((u) => ({ unit_id: u.unit_id, po_no: u.po_id, category: u.category, item: u.item, item_spec: u.item_spec, pickup_location: u.pickup_location })),
    issued_by: issuer,
  };
  return c.json(print);
});

// ----- POST /:id/send — `Return document sent to supplier` -----

const sendSchema = z.object({
  channel: z.enum(["whatsapp", "email", "print"]),
  recipient: z.string().trim().min(1).max(160),
  note: z.string().trim().max(500).nullable().optional(),
});

purchaseReturnsRouter.post("/:id/send", purchaseReturnWorkCompletion("send"), async (c) => {
  gate(c);
  const parsed = await parseJsonBody(c, sendSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("purchase_return_record_send", {
    p_return_id: c.req.param("id"),
    p_channel: parsed.data.channel,
    p_recipient: parsed.data.recipient,
    p_note: parsed.data.note || null,
  });
  if (error) return failDoor(c, error);
  return c.json({ id: data ?? null });
});

// ----- POST /:id/pickup-confirmation — `Confirmed Pickup` -----

const pickupSchema = z.object({
  confirmed_pickup_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  evidence: z.string().trim().min(1).max(300),
});

purchaseReturnsRouter.post("/:id/pickup-confirmation", purchaseReturnWorkCompletion("pickup"), async (c) => {
  gate(c);
  const parsed = await parseJsonBody(c, pickupSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("purchase_return_record_pickup_confirmation", {
    p_return_id: c.req.param("id"),
    p_date: parsed.data.confirmed_pickup_date,
    p_evidence: parsed.data.evidence,
  });
  if (error) return failDoor(c, error);
  return c.json({ id: data ?? null });
});


/**
 * Evidence counts, by purpose.
 *
 * The register shows HOW MANY files each purpose holds, never the files
 * themselves — a signed URL is minted only when somebody opens one, the way
 * claims already do it. `problem` is not counted here and cannot be: 0548's
 * trigger refuses it on the way in, because §9.6 forbids a damage photo being
 * presented as proof the goods left. Problem evidence is read from the linked
 * claim, which is why the shared module marks that purpose `source: "claim"`.
 */
function countEvidence(raw: unknown): PurchaseReturnEvidenceCount[] {
  if (!Array.isArray(raw)) return [];
  const byPurpose = new Map<string, PurchaseReturnEvidenceCount>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const purpose = typeof record.purpose === "string" ? record.purpose : null;
    if (purpose !== "pickup" && purpose !== "receipt") continue;
    const path = typeof record.path === "string" ? record.path : "";
    const counts =
      byPurpose.get(purpose) ?? { purpose, photos: 0, videos: 0 };
    // Same split the delivery-photo shape uses: the extension decides, because
    // the stored entry carries no media type of its own.
    if (/\.(mp4|mov|m4v|webm)$/i.test(path)) counts.videos += 1;
    else counts.photos += 1;
    byPurpose.set(purpose, counts);
  }
  return [...byPurpose.values()];
}

export default purchaseReturnsRouter;
