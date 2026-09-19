import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { mapPgError } from "../../lib/route-helpers";
import { chunk } from "../../lib/purchase-demand-read";
import { adminClient, userClient } from "../../lib/supabase";
import { resolveActorNames } from "../../lib/actor-names";
import type { AppEnv } from "../../types";

/**
 * ⭐ PURCHASE RETURNS — the register's read.
 * `docs/purchasing/MASTER.md` §9.6 (owner-confirmed 2026-09-18), storage in
 * migration 0548.
 *
 * ── READ ONLY, AND THAT IS THE WHOLE ROUTER ─────────────────────────────────
 * There is no POST here. §9.6 confirmed the REGISTER — the layout, the labels
 * and the inspection interactions — and it did not confirm a creation screen.
 * The door that issues a return exists in SQL (`purchasing_issue_purchase_return`,
 * 0548) because §7.4 rules who may create one; the screen that calls it is a
 * later scope with its own owner decision, and inventing it here would be
 * exactly the "screen that guessed" this module keeps warning about.
 *
 * ── THE SHAPE IS THE SHARED ROW, NOT A SECOND ONE ───────────────────────────
 * This returns `PurchaseReturnListRow` from `@carres/shared` — the same type
 * the page's columns, the rail's predicates and the tests all read. One shape,
 * so the API and the screen cannot disagree about what a purchase return is.
 *
 * ── AND IT ADDS NOTHING UP ──────────────────────────────────────────────────
 * `Qty`, `Collected Qty`, the parent dates and every rail condition are DERIVED
 * IN THE SHARED MODULE from the Units this route returns (ERP-ARCHITECTURE law
 * D: a derived fact has ONE arithmetic). If this route also computed them there
 * would be two arithmetics that agree today.
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
 * ⭐ AN `in (…)` LIST IS NOT UNBOUNDED, AND THIS ROUTE LEARNED IT FROM THE
 * CLAIMS ROUTE RATHER THAN FROM PRODUCTION.
 *
 * PostgREST puts the whole id list in the URL. Passing every return id in one
 * `.in(...)` works while there are four documents and fails once there are
 * several hundred — a failure that arrives late, looks like an outage and
 * lands on the day the register finally has data in it. `supplier-claims.ts`
 * already chunks for exactly this reason (`readEveryClaimRelation`), so this
 * reuses its `chunk` rather than growing a second answer.
 *
 * Each chunk is still fully paginated: a chunk of 100 documents can carry far
 * more than `DEFAULT_LIMIT` Units between them.
 */
async function readAllIn(
  ids: readonly string[],
  page: (batch: string[], from: number, to: number) =>
    PromiseLike<{ data: Row[] | null; error: unknown }>,
): Promise<{ rows: Row[]; error: unknown }> {
  const rows: Row[] = [];
  for (const batch of chunk([...new Set(ids)])) {
    const result = await readAll((from, to) => page(batch, from, to));
    if (result.error) return { rows: [], error: result.error };
    rows.push(...result.rows);
  }
  return { rows, error: null };
}

// ----- GET / -----
//
// `?claim=<claim_no|uuid>` narrows to one Supplier Claim's returns, so the
// claim object can link straight into its own paperwork.
purchaseReturnsRouter.get("/", async (c) => {
  gate(c);
  const auth = c.var.auth;
  const sb = userClient(c.env, auth.jwt);

  const claimParam = c.req.query("claim")?.trim() || null;

  const documents = await readAll((from, to) =>
    sb
      .from("purchase_returns")
      .select(
        "id, pr_no, pr_doc_date, supplier_id, supplier_claim_id, warehouse_receipt_id, document_sent_at, confirmed_pickup_date",
      )
      .order("pr_doc_date", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to),
  );
  if (documents.error) {
    const mapped = mapPgError(documents.error);
    return c.json(mapped.body, mapped.status);
  }

  const returnIds = documents.rows.map((row) => row.id as string);
  if (returnIds.length === 0) return c.json({ returns: [] });

  const units = await readAllIn(returnIds, (batch, from, to) =>
    sb
      .from("purchase_return_units")
      .select(
        "purchase_return_id, stock_item_id, unit_code, po_id, category, item, item_spec, pickup_location, return_to, collected_by, collected_by_name, actual_pickup_date, supplier_received_date, evidence",
      )
      .in("purchase_return_id", batch)
      .order("unit_code", { ascending: true })
      .range(from, to),
  );
  if (units.error) {
    const mapped = mapPgError(units.error);
    return c.json(mapped.body, mapped.status);
  }

  /* Supplier and claim NUMBERS are resolved here rather than snapshotted onto
     the return row for display: the document snapshots the supplier ID so the
     paperwork survives a rename, and a human reading the register needs the
     name as it stands today. Same split 0288 made for claims. */
  const admin = adminClient(c.env);
  const supplierIds = [
    ...new Set(documents.rows.map((row) => row.supplier_id as string).filter(Boolean)),
  ];
  const claimIds = [
    ...new Set(documents.rows.map((row) => row.supplier_claim_id as string).filter(Boolean)),
  ];
  const receiptIds = [
    ...new Set(
      documents.rows.map((row) => row.warehouse_receipt_id as string).filter(Boolean),
    ),
  ];

  const [supplierRes, claimRes, receiptRes, collectorNames] = await Promise.all([
    readAllIn(supplierIds, (batch, from, to) =>
      sb.from("suppliers").select("id, name").in("id", batch).range(from, to),
    ),
    readAllIn(claimIds, (batch, from, to) =>
      sb.from("supplier_claims").select("id, claim_no").in("id", batch).range(from, to),
    ),
    readAllIn(receiptIds, (batch, from, to) =>
      sb.from("warehouse_receipts").select("id, grn_no").in("id", batch).range(from, to),
    ),
    resolveActorNames(
      admin,
      units.rows.map((row) => row.collected_by as string | null),
    ),
  ]);
  for (const result of [supplierRes, claimRes, receiptRes]) {
    if (result.error) {
      const mapped = mapPgError(result.error);
      return c.json(mapped.body, mapped.status);
    }
  }

  const supplierName = new Map<string, string>();
  for (const row of supplierRes.rows) {
    supplierName.set(row.id as string, (row.name as string) ?? "");
  }
  const claimNo = new Map<string, string>();
  for (const row of claimRes.rows) {
    claimNo.set(row.id as string, (row.claim_no as string) ?? "");
  }
  const grnNo = new Map<string, string>();
  for (const row of receiptRes.rows) {
    grnNo.set(row.id as string, (row.grn_no as string) ?? "");
  }

  const unitsByReturn = new Map<string, Row[]>();
  for (const row of units.rows) {
    const key = row.purchase_return_id as string;
    const list = unitsByReturn.get(key);
    if (list) list.push(row);
    else unitsByReturn.set(key, [row]);
  }

  const returns = documents.rows
    .map((row) => {
      const claim = claimNo.get(row.supplier_claim_id as string) ?? null;
      return {
        id: row.id as string,
        pr_no: (row.pr_no as string) ?? null,
        pr_doc_date: (row.pr_doc_date as string) ?? null,
        supplier_id: (row.supplier_id as string) ?? null,
        supplier_name: supplierName.get(row.supplier_id as string) || null,
        claim_no: claim || null,
        grn_no: grnNo.get(row.warehouse_receipt_id as string) || null,
        document_sent_at: (row.document_sent_at as string) ?? null,
        confirmed_pickup_date: (row.confirmed_pickup_date as string) ?? null,
        units: (unitsByReturn.get(row.id as string) ?? []).map((unit) => ({
          /* §9.6's `Unit ID` is the Unit's own code, not the table's key — the
             code is what an operator reads off the label and types into a
             search, and a uuid is neither. */
          unit_id: (unit.unit_code as string) ?? "",
          po_id: (unit.po_id as string) ?? null,
          category: (unit.category as string) ?? null,
          item: (unit.item as string) ?? null,
          item_spec: (unit.item_spec as string) ?? null,
          pickup_location: (unit.pickup_location as string) ?? null,
          return_to: (unit.return_to as string) ?? null,
          /* The recorded name wins over a directory lookup: §9.6 wants the
             ACTUAL collector, and a person who has since left the company is
             still who collected the goods that day. */
          collected_by:
            (unit.collected_by_name as string) ||
            collectorNames.get(unit.collected_by as string) ||
            null,
          actual_pickup_date: (unit.actual_pickup_date as string) ?? null,
          supplier_received_date: (unit.supplier_received_date as string) ?? null,
          evidence: countEvidence(unit.evidence),
        })),
      };
    })
    .filter((row) => !claimParam || row.claim_no === claimParam);

  return c.json({ returns });
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
function countEvidence(raw: unknown): Array<{ purpose: string; photos: number; videos: number }> {
  if (!Array.isArray(raw)) return [];
  const byPurpose = new Map<string, { purpose: string; photos: number; videos: number }>();
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
