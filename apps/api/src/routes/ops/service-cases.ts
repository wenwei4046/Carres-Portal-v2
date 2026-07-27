import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  CASE_EVIDENCE_BUCKET,
  caseCloseBlockerMessage,
  caseEvidenceExtension,
  caseEvidenceGapMessage,
  caseEvidenceGaps,
  caseEvidenceMimeFits,
  caseEvidenceSlot,
  caseEvidenceUploadedSchema,
  caseFollowUpPlan,
  caseOpenSteps,
  caseStepDefinition,
  caseStepDone,
  createServiceCaseInputSchema,
  recordCaseStepInputSchema,
  signCaseEvidenceUploadInputSchema,
  updateServiceCaseInputSchema,
  type CaseEvidenceUploaded,
  type CaseFollowUpInput,
  type CaseProgressEntry,
  type CaseWantKey,
} from "@carres/shared";
import { requireOperationOrPrincipal } from "../../lib/auth-guards";
import { adminClient, userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Service Cases (SC) — migration 0210. The case / 病历 parent layer above
 * Service Notes (0140). A case classifies an issue (config-driven Case Type +
 * Status) and holds the medical fields; a printable Service Note dispatch order
 * is generated under it (P2).
 *
 * Link key is order_id (permanent). ref_no is an AutoCount alias only.
 *
 * Routes (literal paths registered BEFORE /:id so they win):
 *   GET    /config                 — { types[], statuses[] } for the dropdowns
 *   GET    /lookup?ref|so           — order autofill (0/>1 matches → manual entry)
 *   POST   /evidence/sign-upload    — S2: signed upload URL (draft or case)
 *   GET    /                        — list (filter ?state=ongoing|closed)
 *   POST   /                        — create (auto case_no via next_case_no() RPC)
 *   GET    /:id                     — detail
 *   PATCH  /:id                     — update
 *   GET    /:id/evidence            — S2: the ledger + signed view URLs
 *   POST   /:id/evidence            — S2: append a file to an existing case
 *   POST   /:id/progress            — S3: record one follow-up step's outcome
 */

const scRouter = new Hono<AppEnv>();

/**
 * J2 adds `orders(so)` to the embed: order_id is the permanent link key but it
 * is a uuid, so nothing could LABEL the link. The join is on an indexed FK and
 * costs one extra column per row.
 */
const CASE_SELECT =
  "*, service_case_types(label), service_case_statuses(label,is_closed), orders(so), suppliers(name)";

// ─────────────────────────────────────────────────────────────────────────────
// GET /config — config-driven Case Type + Status (active only, sorted)
// ─────────────────────────────────────────────────────────────────────────────
scRouter.get("/config", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  const [{ data: types, error: tErr }, { data: statuses, error: sErr }] =
    await Promise.all([
      sb.from("service_case_types").select("*").eq("active", true).order("sort_order"),
      sb.from("service_case_statuses").select("*").eq("active", true).order("sort_order"),
    ]);

  if (tErr) throw new HTTPException(500, { message: tErr.message });
  if (sErr) throw new HTTPException(500, { message: sErr.message });

  return c.json({
    types: (types ?? []).map((t) => ({
      id: t.id, code: t.code, label: t.label, sortOrder: t.sort_order, active: t.active,
    })),
    statuses: (statuses ?? []).map((s) => ({
      id: s.id, code: s.code, label: s.label, sortOrder: s.sort_order,
      active: s.active, isClosed: s.is_closed,
    })),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /lookup?ref=CR0418 | ?so=SO-1147 — order autofill
// Ref reverse-lookup uses orders.source_ref @> ARRAY[ref] (AutoCount Ref set).
// 0 or >1 matches → { order: null, matches: N } so the UI falls back to manual.
// ─────────────────────────────────────────────────────────────────────────────
scRouter.get("/lookup", requireOperationOrPrincipal, async (c) => {
  const sb  = userClient(c.env, c.var.auth.jwt);
  const so  = (c.req.query("so")  ?? "").trim();
  const ref = (c.req.query("ref") ?? "").trim();

  const cols = "id, so, source_ref, customer_name, customer_phone, customer_address, delivery_date";
  let rows: OrderRow[] = [];

  if (so) {
    const soNum = parseInt(so.replace(/^S[O0]-?/i, ""), 10);
    if (isNaN(soNum)) return c.json({ order: null, matches: 0 });
    const { data, error } = await sb.from("orders").select(cols).eq("so", soNum);
    if (error) throw new HTTPException(500, { message: error.message });
    rows = (data ?? []) as OrderRow[];
  } else if (ref) {
    // AutoCount Refs are stored uppercase in source_ref (e.g. TCF0497); the
    // array-containment match is exact, so upper-case the term to tolerate a
    // lower-case typed input.
    const { data, error } = await sb
      .from("orders")
      .select(cols)
      .contains("source_ref", [ref.toUpperCase()]);
    if (error) throw new HTTPException(500, { message: error.message });
    rows = (data ?? []) as OrderRow[];
  } else {
    return c.json({ order: null, matches: 0 });
  }

  if (rows.length !== 1) return c.json({ order: null, matches: rows.length });

  const ord = rows[0];
  const { data: lines } = await sb
    .from("order_lines")
    .select("id, sku, qty, source_po")
    .eq("order_id", ord.id)
    .order("created_at");

  return c.json({
    matches: 1,
    order: {
      id:              ord.id,
      so:              `SO-${ord.so}`,
      refNos:          ord.source_ref ?? [],
      customerName:    ord.customer_name ?? "",
      customerPhone:   ord.customer_phone ?? null,
      customerAddress: ord.customer_address ?? null,
      deliveryDate:    ord.delivery_date ?? null,
      lines: (lines ?? []).map((l) => ({
        id:       l.id,
        sku:      l.sku,
        qty:      l.qty,
        sourcePo: l.source_po ?? null,
      })),
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S2 (0289) — evidence. **No evidence, no service case.**
//
// The files must be uploadable BEFORE the case exists, because the case may not
// be created without them: the wizard mints a `draftId`, uploads against it, and
// hands the paths to POST / — which checks they really sit under that draft's
// own prefix and that they satisfy the issue type's required checklist.
//
// Bytes go browser → Supabase through a signed upload URL and never pass through
// the Worker (same pattern as the T6 delivery photo and the model photos). The
// Worker signs with the SERVICE client after its own operation/principal gate:
// server-generated key, so a client can neither pick nor overwrite a path.
// ─────────────────────────────────────────────────────────────────────────────

/** `case/{id}/…` for a filed case, `draft/{id}/…` for one being written. */
function evidencePrefix(kind: "draft" | "case", id: string): string {
  return `${kind}/${id}/`;
}

// POST /evidence/sign-upload
scRouter.post("/evidence/sign-upload", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseBody(c, signCaseEvidenceUploadInputSchema);

  const slot = caseEvidenceSlot(parsed.slot);
  if (!slot) throw new HTTPException(400, { message: `Unknown evidence slot: ${parsed.slot}` });

  // A photo filed as the video the checklist asked for would satisfy the count
  // and prove nothing. Refused before a single byte moves.
  if (!caseEvidenceMimeFits(slot.kind, parsed.mimeType)) {
    return c.json(
      {
        error: "invalid_input",
        code: "wrong_file_kind",
        message:
          slot.kind === "video"
            ? `"${slot.label}" needs a video, not a photo.`
            : `"${slot.label}" needs a photo, not a video.`,
      },
      422,
    );
  }

  const prefix = parsed.caseId
    ? evidencePrefix("case", parsed.caseId)
    : evidencePrefix("draft", parsed.draftId as string);
  const path = `${prefix}${crypto.randomUUID()}-${parsed.slot}.${caseEvidenceExtension(parsed.mimeType)}`;

  const admin = adminClient(c.env);
  const { data, error } = await admin.storage
    .from(CASE_EVIDENCE_BUCKET)
    .createSignedUploadUrl(path);
  if (error) throw new HTTPException(500, { message: error.message });

  return c.json({ token: data.token, path: data.path });
});

/** The stored entry. `at` / `by` / `by_role` are stamped HERE and nowhere else —
 *  the card's "every file is stamped who-uploaded + when" is only worth anything
 *  if the stamp cannot be authored by the uploader. (0289's CHECK refuses an
 *  entry missing any of them, so a future write path cannot skip this either.) */
function stampEvidence(
  files: readonly CaseEvidenceUploaded[],
  by: string,
  byRole: string,
): Record<string, unknown>[] {
  const at = new Date().toISOString();
  return files.map((f) => ({
    slot: f.slot,
    path: f.path,
    // Derived from the slot registry, never taken from the client.
    kind: caseEvidenceSlot(f.slot)?.kind ?? "photo",
    at,
    by,
    by_role: byRole,
  }));
}

/** Rows come back snake_case from the database; the ledger reads camelCase. */
function shapeEvidence(raw: unknown): {
  slot: string;
  path: string;
  kind: string;
  at: string;
  by: string;
  byRole: string;
}[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((e) => {
    const r = (e ?? {}) as Record<string, unknown>;
    return {
      slot: String(r.slot ?? ""),
      path: String(r.path ?? ""),
      kind: String(r.kind ?? "photo"),
      at: String(r.at ?? ""),
      by: String(r.by ?? ""),
      byRole: String(r.by_role ?? ""),
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// S3 (0293) — the follow-ups. **The case drives them.**
//
// The STEPS are derived from the intake answers (`caseFollowUpPlan`), never
// stored: there is no row to forget to create, none to delete, and none that can
// drift from what the customer asked for. What IS stored is each step's OUTCOME
// — the date it happened, stamped with who recorded it.
// ─────────────────────────────────────────────────────────────────────────────

/** Rows come back snake_case; the plan module reads camelCase. */
function shapeProgress(raw: unknown): CaseProgressEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((e) => {
    const r = (e ?? {}) as Record<string, unknown>;
    return {
      step:   String(r.step ?? ""),
      on:     String(r.on ?? ""),
      at:     String(r.at ?? ""),
      by:     String(r.by ?? ""),
      byRole: String(r.by_role ?? ""),
      note:   r.note == null ? null : String(r.note),
    };
  });
}

/** The parties whose names the chain's labels carry. */
function followUpInput(r: {
  customer_wants?: string[] | null;
  customer_name?: string | null;
  suppliers?: { name: string } | { name: string }[] | null;
}): CaseFollowUpInput {
  const sup = Array.isArray(r.suppliers) ? r.suppliers[0] : r.suppliers;
  return {
    customerWants: (r.customer_wants ?? []) as CaseWantKey[],
    customerName:  r.customer_name ?? null,
    supplierName:  sup?.name ?? null,
  };
}

/**
 * Which factory a case is about, from the SKU it named. Resolved SERVER-side and
 * snapshotted (S1's law) — the client never says which supplier a complaint
 * belongs to, and a case filed today keeps its answer if the catalog is
 * re-pointed tomorrow.
 *
 * A failure here is not a failure of the case: the follow-up degrades to "the
 * supplier" (COPY-STANDARD allows the role word where no name is stored) rather
 * than refusing a complaint over a catalog lookup.
 */
async function resolveSupplierId(
  sb: ReturnType<typeof userClient>,
  sku: string | undefined,
): Promise<string | null> {
  if (!sku) return null;
  const { data, error } = await sb
    .from("product_skus")
    .select("supplier_id")
    .eq("sku", sku)
    .limit(1);
  if (error) return null;
  return (data?.[0]?.supplier_id as string | null) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET / — list (filter ?state=ongoing|closed, derived from status.is_closed)
// ─────────────────────────────────────────────────────────────────────────────
scRouter.get("/", requireOperationOrPrincipal, async (c) => {
  const sb    = userClient(c.env, c.var.auth.jwt);
  const state = c.req.query("state"); // 'ongoing' | 'closed' | undefined
  // J2 — the order drawer asks "which cases belong to THIS order". Filtered in
  // the database on the indexed FK rather than by fetching every case and
  // discarding it in the browser.
  const orderId = (c.req.query("orderId") ?? "").trim();

  let q = sb
    .from("service_cases")
    .select(CASE_SELECT)
    .order("opened_at", { ascending: false })
    .order("case_no",   { ascending: false });

  if (orderId) q = q.eq("order_id", orderId);

  const { data, error } = await q;

  if (error) throw new HTTPException(500, { message: error.message });

  let rows = (data ?? []).map(shapeCase);
  if (state === "closed")  rows = rows.filter((r) => r.statusIsClosed);
  if (state === "ongoing") rows = rows.filter((r) => !r.statusIsClosed);

  return c.json({ items: rows, total: rows.length });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST / — create (auto case_no)
// ─────────────────────────────────────────────────────────────────────────────
scRouter.post("/", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseBody(c, createServiceCaseInputSchema);
  const sb     = userClient(c.env, c.var.auth.jwt);

  // ── S2 · no evidence, no case ─────────────────────────────────────────────
  // The disabled Submit button is the courtesy; THIS is the rule. A client that
  // skips the button, an old cached bundle, or a future caller all meet the same
  // refusal, and it is computed from the same shared checklist the wizard draws.
  const evidence = parsed.evidence ?? [];

  // Every path must sit under the draft the client claims — a case can never be
  // filed with another draft's (or another case's) files.
  if (evidence.length > 0) {
    if (!parsed.draftId) {
      return c.json(
        {
          error: "invalid_input",
          code: "missing_draft_id",
          message: "Evidence was sent without the draft it was uploaded against.",
        },
        422,
      );
    }
    const prefix = evidencePrefix("draft", parsed.draftId);
    if (evidence.some((f) => !f.path.startsWith(prefix))) {
      return c.json(
        {
          error: "invalid_input",
          code: "evidence_path_mismatch",
          message: "An evidence file does not belong to this case.",
        },
        422,
      );
    }
  }

  // The checklist gate. Only a case that NAMES an issue type is gated: the edit
  // modal still files prose-only cases with no issue question asked, and S1
  // deliberately kept that path alive.
  if (parsed.issueType) {
    const gaps = caseEvidenceGaps(parsed.issueType, parsed.reportedBy ?? null, evidence);
    if (gaps.length > 0) {
      return c.json(
        {
          error: "invalid_input",
          code: "evidence_missing",
          // Rule 6 — the error gives the fix, by name.
          message: `Cannot open the case yet. Take these first: ${caseEvidenceGapMessage(gaps)}`,
          missing: gaps,
        },
        422,
      );
    }
  }

  // S3 — which factory this is about, so the follow-up can name it.
  const supplierId = await resolveSupplierId(sb, parsed.productSku);

  const { data: caseNo, error: seqErr } = await sb.rpc("next_case_no");
  if (seqErr || !caseNo) {
    throw new HTTPException(500, { message: seqErr?.message ?? "Failed to generate case number" });
  }

  const { data: row, error: insErr } = await sb
    .from("service_cases")
    .insert({
      case_no:          caseNo,
      order_id:         parsed.orderId         ?? null,
      ref_no:           parsed.refNo           ?? null,
      customer_name:    parsed.customerName,
      customer_phone:   parsed.customerPhone   ?? null,
      customer_address: parsed.customerAddress ?? null,
      case_type_id:     parsed.caseTypeId      ?? null,
      status_id:        parsed.statusId        ?? null,
      what_happened:    parsed.whatHappened    ?? null,
      carres_action:    parsed.carresAction    ?? null,
      what_affected:    parsed.whatAffected    ?? null,
      incurred_charges: parsed.incurredCharges ?? null,
      opened_at:        parsed.openedAt        ?? new Date().toISOString().slice(0, 10),
      created_by:       c.var.auth.id,

      // S1 (0285) — the guided intake's answers. `priority` is NOT here and
      // must never be: it is a generated column derived from `usable`, which
      // is how "staff never pick a priority" is enforced rather than promised.
      reported_by:      parsed.reportedBy      ?? null,
      order_line_id:    parsed.orderLineId     ?? null,
      product_sku:      parsed.productSku      ?? null,
      product_category: parsed.productCategory ?? null,
      issue_type:       parsed.issueType       ?? null,
      usable:           parsed.usable          ?? null,
      customer_wants:   parsed.customerWants   ?? [],

      // S2 (0289) — the evidence, stamped server-side.
      evidence:         stampEvidence(evidence, c.var.auth.id, c.var.auth.role),

      // S3 (0293) — the factory the follow-up will call, resolved from the SKU
      // and snapshotted. `progress` is NOT here and must never be: a case is
      // born with nothing done, and the ledger has exactly one writer.
      supplier_id:      supplierId,
    })
    .select("id, case_no")
    .single();

  if (insErr || !row) throw new HTTPException(500, { message: insErr?.message ?? "Insert failed" });
  return c.json({ id: row.id, caseNo: row.case_no }, 201);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /:id — detail
// ─────────────────────────────────────────────────────────────────────────────
scRouter.get("/:id", requireOperationOrPrincipal, async (c) => {
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);

  const { data: row, error } = await sb
    .from("service_cases")
    .select(CASE_SELECT)
    .eq("id", id)
    .single();

  if (error || !row) throw new HTTPException(404, { message: "Service case not found" });
  return c.json(shapeCase(row));
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /:id — update
// ─────────────────────────────────────────────────────────────────────────────
scRouter.patch("/:id", requireOperationOrPrincipal, async (c) => {
  const id     = c.req.param("id");
  const parsed = await parseBody(c, updateServiceCaseInputSchema);
  const sb     = userClient(c.env, c.var.auth.jwt);

  // ── S3 · the close gate ───────────────────────────────────────────────────
  // The card's acceptance: **closing a case requires all its tasks closed +
  // customer-confirmed.** The greyed-out status option is the courtesy; THIS is
  // the rule, computed from the same shared plan the case view draws.
  //
  // Only the TRANSITION into a closed status is gated. A case that is already
  // closed stays editable — the one live row on file is closed, and a gate that
  // locked it would make its own history unfixable.
  if (parsed.statusId) {
    const { data: target } = await sb
      .from("service_case_statuses")
      .select("is_closed")
      .eq("id", parsed.statusId)
      .maybeSingle();

    if (target?.is_closed) {
      const { data: row, error: readErr } = await sb
        .from("service_cases")
        .select(CASE_SELECT)
        .eq("id", id)
        .maybeSingle();
      if (readErr) throw new HTTPException(500, { message: readErr.message });
      if (!row) throw new HTTPException(404, { message: "Service case not found" });

      const cur = row as unknown as RawCase;
      const alreadyClosed = cur.service_case_statuses?.is_closed ?? false;
      if (!alreadyClosed) {
        const open = caseOpenSteps(
          caseFollowUpPlan(followUpInput(cur)),
          shapeProgress(cur.progress),
        );
        if (open.length > 0) {
          return c.json(
            {
              error: "invalid_input",
              code: "case_steps_open",
              // Rule 6 — the error gives the fix, by name.
              message: `Cannot close this case yet. Still to do: ${caseCloseBlockerMessage(open)}`,
              open: open.map((s) => ({ step: s.key, label: s.label })),
            },
            422,
          );
        }
      }
    }
  }

  const patch: Record<string, unknown> = {};
  if (parsed.orderId         !== undefined) patch.order_id         = parsed.orderId;
  if (parsed.refNo           !== undefined) patch.ref_no           = parsed.refNo;
  if (parsed.customerName    !== undefined) patch.customer_name    = parsed.customerName;
  if (parsed.customerPhone   !== undefined) patch.customer_phone   = parsed.customerPhone;
  if (parsed.customerAddress !== undefined) patch.customer_address = parsed.customerAddress;
  if (parsed.caseTypeId      !== undefined) patch.case_type_id     = parsed.caseTypeId;
  if (parsed.statusId        !== undefined) patch.status_id        = parsed.statusId;
  if (parsed.whatHappened    !== undefined) patch.what_happened    = parsed.whatHappened;
  if (parsed.carresAction    !== undefined) patch.carres_action    = parsed.carresAction;
  if (parsed.whatAffected    !== undefined) patch.what_affected    = parsed.whatAffected;
  if (parsed.incurredCharges !== undefined) patch.incurred_charges = parsed.incurredCharges;
  if (parsed.openedAt        !== undefined) patch.opened_at        = parsed.openedAt;
  // S1 — same set as create, minus priority (generated).
  if (parsed.reportedBy      !== undefined) patch.reported_by      = parsed.reportedBy;
  if (parsed.orderLineId     !== undefined) patch.order_line_id    = parsed.orderLineId;
  if (parsed.productSku      !== undefined) patch.product_sku      = parsed.productSku;
  if (parsed.productCategory !== undefined) patch.product_category = parsed.productCategory;
  if (parsed.issueType       !== undefined) patch.issue_type       = parsed.issueType;
  if (parsed.usable          !== undefined) patch.usable           = parsed.usable;
  if (parsed.customerWants   !== undefined) patch.customer_wants   = parsed.customerWants;

  const { error } = await sb.from("service_cases").update(patch).eq("id", id);
  if (error) throw new HTTPException(500, { message: error.message });

  return c.json({ id });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /:id/evidence — the ledger + a short-lived signed VIEW url per file.
// The bucket is private (a complaint photo shows a customer's home), so nothing
// renders without a signed url. A case with no evidence answers [].
// ─────────────────────────────────────────────────────────────────────────────
scRouter.get("/:id/evidence", requireOperationOrPrincipal, async (c) => {
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);

  const { data: row, error } = await sb
    .from("service_cases")
    .select("evidence")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new HTTPException(500, { message: error.message });
  if (!row) throw new HTTPException(404, { message: "Service case not found" });

  const entries = shapeEvidence(row.evidence);
  if (entries.length === 0) return c.json({ evidence: [] });

  const admin = adminClient(c.env);
  const evidence = await Promise.all(
    entries.map(async (e) => {
      const { data: signed } = await admin.storage
        .from(CASE_EVIDENCE_BUCKET)
        .createSignedUrl(e.path, 3600);
      // `url: null` rather than dropping the row: a file that cannot be signed
      // right now still EXISTS, and a ledger that quietly shortens is a ledger
      // that lies about what was taken.
      return { ...e, url: signed?.signedUrl ?? null };
    }),
  );
  return c.json({ evidence });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /:id/evidence — append a file to a case already on file (the customer
// sends the photo the next day). Append-only read-modify-write: there is no
// endpoint that removes a file, and 0289 grants the bucket no delete policy.
// ─────────────────────────────────────────────────────────────────────────────
scRouter.post("/:id/evidence", requireOperationOrPrincipal, async (c) => {
  const id     = c.req.param("id");
  const parsed = await parseBody(c, caseEvidenceUploadedSchema);
  const sb     = userClient(c.env, c.var.auth.jwt);

  // The path must sit under THIS case's own prefix — a file can never be
  // attached across cases, and never from a draft prefix.
  if (!parsed.path.startsWith(evidencePrefix("case", id))) {
    return c.json(
      {
        error: "invalid_input",
        code: "evidence_path_mismatch",
        message: "That file does not belong to this case.",
      },
      422,
    );
  }

  const { data: row, error: readErr } = await sb
    .from("service_cases")
    .select("evidence")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw new HTTPException(500, { message: readErr.message });
  if (!row) throw new HTTPException(404, { message: "Service case not found" });

  const existing = Array.isArray(row.evidence) ? (row.evidence as unknown[]) : [];
  const entry    = stampEvidence([parsed], c.var.auth.id, c.var.auth.role)[0];

  const { error } = await sb
    .from("service_cases")
    .update({ evidence: [...existing, entry] })
    .eq("id", id);
  if (error) throw new HTTPException(500, { message: error.message });

  return c.json({ id, added: 1 }, 201);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /:id/progress — record ONE step's outcome.
//
// Append-only, exactly like the evidence ledger: there is no endpoint that
// un-records a step, and the generic PATCH cannot touch `progress` (the update
// schema never had the field). A step recorded by mistake is answered by the
// case's own note, not by rewriting what the system was told happened.
//
// `at` / `by` / `by_role` are stamped HERE and nowhere else — a record of who
// did what is worth nothing if the doer writes it (0293's CHECK refuses an entry
// missing any of them, so a future write path cannot skip this either).
// ─────────────────────────────────────────────────────────────────────────────
scRouter.post("/:id/progress", requireOperationOrPrincipal, async (c) => {
  const id     = c.req.param("id");
  const parsed = await parseBody(c, recordCaseStepInputSchema);
  const sb     = userClient(c.env, c.var.auth.jwt);

  const { data: row, error: readErr } = await sb
    .from("service_cases")
    .select(CASE_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw new HTTPException(500, { message: readErr.message });
  if (!row) throw new HTTPException(404, { message: "Service case not found" });

  const cur      = row as unknown as RawCase;
  const progress = shapeProgress(cur.progress);

  // One outcome per step. A second record would make "when did it happen"
  // ambiguous, and every reader of the ledger takes the first answer.
  if (caseStepDone(progress, parsed.step)) {
    return c.json(
      {
        error: "invalid_input",
        code: "step_already_recorded",
        message: "That step is already on file. Open the case to see what was recorded.",
      },
      422,
    );
  }

  // The step is looked up in the CATALOGUE, not in this case's plan: editing the
  // intake answers can shrink a plan, and refusing to record something that has
  // physically happened would leave the case lying about itself. What the plan
  // decides is which steps are still OWED — that is the close gate's question.
  const def = caseStepDefinition(followUpInput(cur), parsed.step);
  if (def?.noteRequired && !parsed.note) {
    return c.json(
      {
        error: "invalid_input",
        code: "note_required",
        message: `Write down what you found before recording "${def.label}".`,
      },
      422,
    );
  }

  const entry: Record<string, unknown> = {
    step:    parsed.step,
    on:      parsed.on,
    at:      new Date().toISOString(),
    by:      c.var.auth.id,
    by_role: c.var.auth.role,
  };
  if (parsed.note) entry.note = parsed.note;

  const existing = Array.isArray(cur.progress) ? (cur.progress as unknown[]) : [];
  const { error } = await sb
    .from("service_cases")
    .update({ progress: [...existing, entry] })
    .eq("id", id);
  if (error) throw new HTTPException(500, { message: error.message });

  return c.json({ id, step: parsed.step }, 201);
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface OrderRow {
  id: string;
  so: number;
  source_ref: string[] | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  delivery_date: string | null;
}

interface RawCase {
  id: string;
  case_no: string;
  order_id: string | null;
  ref_no: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string | null;
  case_type_id: string | null;
  status_id: string | null;
  what_happened: string | null;
  carres_action: string | null;
  what_affected: string | null;
  incurred_charges: string | null;
  opened_at: string;
  source_service_note_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** S1 (0285) — the guided intake. Optional on the type as well as nullable:
   *  a Worker built after 0285 but pointed at a database before it would
   *  otherwise read `undefined` off every row and crash the mapper. */
  reported_by?: string | null;
  order_line_id?: string | null;
  product_sku?: string | null;
  product_category?: string | null;
  issue_type?: string | null;
  usable?: string | null;
  priority?: string | null;
  customer_wants?: string[] | null;
  /** S2 (0289) — the evidence ledger. Optional for the same reason as above. */
  evidence?: unknown;
  /** S3 (0293) — the follow-up chain's recorded outcomes, and the factory the
   *  chain names. Optional for the same degrade-don't-crash reason. */
  progress?: unknown;
  supplier_id?: string | null;
  suppliers?: { name: string } | { name: string }[] | null;
  service_case_types:    { label: string } | null;
  service_case_statuses: { label: string; is_closed: boolean } | null;
  /** J2 — embedded `orders(so)`. A to-one embed, but PostgREST has been seen
   *  to hand back an array shape, so both are tolerated. */
  orders: { so: number } | { so: number }[] | null;
}

function shapeCase(r: RawCase) {
  return {
    id:                  r.id,
    caseNo:              r.case_no,
    orderId:             r.order_id,
    refNo:               r.ref_no,
    customerName:        r.customer_name,
    customerPhone:       r.customer_phone,
    customerAddress:     r.customer_address,
    caseTypeId:          r.case_type_id,
    statusId:            r.status_id,
    whatHappened:        r.what_happened,
    carresAction:        r.carres_action,
    whatAffected:        r.what_affected,
    incurredCharges:     r.incurred_charges,
    openedAt:            r.opened_at,
    sourceServiceNoteId: r.source_service_note_id,
    createdBy:           r.created_by,
    createdAt:           r.created_at,
    updatedAt:           r.updated_at,
    caseTypeLabel:       r.service_case_types?.label ?? null,
    statusLabel:         r.service_case_statuses?.label ?? null,
    statusIsClosed:      r.service_case_statuses?.is_closed ?? false,
    so:                  embeddedSo(r.orders),

    // S1 — the guided intake's answers travel back so the case can be READ the
    // way it was filed (list badge, case view). `?? null` rather than a spread
    // so the shape is stable whether or not the row predates 0285.
    reportedBy:      r.reported_by      ?? null,
    orderLineId:     r.order_line_id    ?? null,
    productSku:      r.product_sku      ?? null,
    productCategory: r.product_category ?? null,
    issueType:       r.issue_type       ?? null,
    usable:          r.usable           ?? null,
    priority:        r.priority         ?? null,
    customerWants:   r.customer_wants   ?? [],

    // S2 — the ledger travels with the case so the list and the case view can
    // say "3 files" without a second round-trip. The signed VIEW urls do NOT:
    // they expire in an hour and are only worth minting for the case actually
    // being looked at (GET /:id/evidence).
    evidence:        shapeEvidence(r.evidence),

    // S3 — the recorded outcomes travel too, because the STEPS are derived from
    // fields already on this row: the list can name every case's next step
    // without a single extra query.
    progress:        shapeProgress(r.progress),
    supplierId:      r.supplier_id ?? null,
    supplierName:    embeddedSupplier(r.suppliers),
  };
}

/** Unwrap the `suppliers(name)` embed. Null when the case names no product we
 *  can trace to a factory — the follow-up then says "the supplier". */
function embeddedSupplier(s: RawCase["suppliers"]): string | null {
  if (!s) return null;
  const row = Array.isArray(s) ? s[0] : s;
  return row?.name ?? null;
}

/** Unwrap the `orders(so)` embed to a plain number. Null when the case has no
 *  linked order — the live state of every case on file today. */
function embeddedSo(o: RawCase["orders"]): number | null {
  if (!o) return null;
  const row = Array.isArray(o) ? o[0] : o;
  return row?.so ?? null;
}

async function parseBody<S extends import("zod").ZodTypeAny>(
  c: import("hono").Context<AppEnv>,
  schema: S,
): Promise<import("zod").infer<S>> {
  let body: unknown;
  try { body = await c.req.json(); }
  catch { throw new HTTPException(400, { message: "Body must be valid JSON" }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: "Invalid input: " + parsed.error.issues[0]?.message });
  }
  return parsed.data;
}

export default scRouter;
