import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * POST /api/storage/dos/sign-upload — Phase 4.5 Chunk 1 (Task 37).
 *
 * Returns a short-lived signed upload URL for the `delivery-orders` Storage
 * bucket so the browser can `uploadToSignedUrl(path, token, file)` directly to
 * Supabase without leaking service_role and without proxying file bytes
 * through Workers.
 *
 * Codex F11 — RED LINE: this endpoint signs with the caller's USER JWT
 * (`userClient(env, jwt)`), NEVER `adminClient`. Storage RLS from migration
 * 0042 (operation + principal write to `delivery-orders/<po_id>/...`) is the
 * security boundary — Hono only enforces caller role, mime/size validation,
 * and path shape. If we used service_role here we'd bypass RLS and lose the
 * per-PO scoping that 0042 provides.
 *
 * Validation:
 *   - Allowed mimes: application/pdf, image/jpeg, image/png
 *   - Max size: 10 MiB (matches `delivery-orders` bucket file_size_limit)
 *   - po_id: any non-empty string (PO ids are externally-formatted, not UUIDs)
 *   - do_number: 3-50 chars (matches existing DO number format constraints)
 *
 * Path generation: `<po_id>/<uuid>-<sanitized do_number>.<ext>`
 *   - randomUUID prevents collision/guessing
 *   - sanitization strips path traversal and special chars
 *   - extension reflects mime, not user input (avoids spoofed MIME via filename)
 */
const dosRouter = new Hono<AppEnv>();

const ALLOWED_MIMES = ["application/pdf", "image/jpeg", "image/png"] as const;
// 0426 — arrival evidence supports both photo and VIDEO (owner instruction
// 2026-09-04 §5C). Video joins for the `arrival` kind only; the signed DO and
// claim photos stay documents/images. The bucket's own 10 MiB file_size_limit
// still governs, so an arrival video is a short clip, not a film.
const ARRIVAL_MIMES = [
  "image/jpeg",
  "image/png",
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;
const MAX_SIZE = 10 * 1024 * 1024; // 10 MiB

// R2 (0288) — `kind: "claim"` names the file `<po_id>/<uuid>-claim-<do>.<ext>`
// instead of the DO-number scheme. Same bucket, same RLS, same per-PO prefix:
// a supplier-claim photo IS a document about that PO, so giving it its own
// bucket would have meant a second storage policy for no gain. The default is
// "do", so every existing caller is byte-for-byte unchanged.
const signUploadSchema = z
  .object({
    po_id: z.string().min(1).max(100),
    do_number: z.string().min(3).max(50),
    mime_type: z.enum([...ALLOWED_MIMES, ...ARRIVAL_MIMES] as [string, ...string[]]),
    size_bytes: z.number().int().positive().max(MAX_SIZE),
    kind: z.enum(["do", "claim", "arrival"]).default("do"),
  })
  .superRefine((v, ctx) => {
    const pool: readonly string[] = v.kind === "arrival" ? ARRIVAL_MIMES : ALLOWED_MIMES;
    if (!pool.includes(v.mime_type)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mime_type"],
        message: `mime ${v.mime_type} is not allowed for kind ${v.kind}`,
      });
    }
  });

// Order-level DO uploads (operation → customer final delivery). Path prefix
// `order-<order_uuid>/...` keeps these distinct from PO-level files at
// `<po_id>/...`. Bucket + RLS unchanged from PO uploads — operation +
// principal short-circuit both read and write; the partner branch's
// purchase_orders lookup fails for the `order-*` prefix so partner reads are
// correctly denied for order DOs. Migration 0087 (Loo 2026-05-11).
const signOrderUploadSchema = z.object({
  order_id:   z.string().uuid(),
  do_number:  z.string().min(3).max(50),
  mime_type:  z.enum(ALLOWED_MIMES),
  size_bytes: z.number().int().positive().max(MAX_SIZE),
  // 0151 — `kind: "signature"` names the file order-<id>/<uuid>-signature.<ext>
  // (the captured customer e-signature PNG) instead of the DO-number scheme.
  kind:       z.enum(["do", "signature"]).default("do"),
});

function extForMime(mime: string): string {
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "video/mp4") return "mp4";
  if (mime === "video/quicktime") return "mov";
  if (mime === "video/webm") return "webm";
  return "png";
}

dosRouter.post("/sign-upload", async (c) => {
  const auth = c.var.auth;
  // 2026-05-11 (Loo): partner role added — the new partner-side receive flow
  // collapses "Arrived at WH" + "operation Receive" into one step, so the
  // partner driver uploads the DO directly. Storage RLS (migration 0084)
  // scopes partner writes to POs where procurement_partner_id matches their
  // JWT app_partner_id, so cross-partner uploads still 403 at the RLS layer
  // even though the API gate admits them.
  // 2026-05-11 later (Loo, phase-6-storage-do-upload close): supplier role
  // added — supplier_mark_delivered now requires the signed DO file (migration
  // 0094). Storage RLS scopes supplier writes to POs whose supplier_id matches
  // app_supplier_id(); cross-supplier uploads 403 at the RLS layer.
  // R6 (0302): warehouse role added — the third-party warehouse files its own
  // receiving, and a receiving is a DO photo plus (when something is wrong) the
  // claim photos R2 demands. Storage RLS scopes warehouse writes to POs whose
  // `warehouse_id` matches `app_warehouse_id()`, so a warehouse cannot upload
  // against a PO that was never coming to them even though this gate admits
  // them — the same shape as the partner and supplier branches above.
  if (
    !["operation", "principal", "partner", "supplier", "warehouse"].includes(
      auth.role,
    )
  ) {
    throw new HTTPException(403, {
      message:
        "operation, principal, partner, supplier, or warehouse role required",
    });
  }
  if (auth.role === "warehouse" && !auth.warehouseId) {
    throw new HTTPException(403, {
      message: "Warehouse role requires warehouse_id in JWT",
    });
  }
  if (auth.role === "partner" && !auth.partnerId) {
    throw new HTTPException(403, {
      message: "Partner role requires partner_id in JWT",
    });
  }
  if (auth.role === "supplier" && !auth.supplierId) {
    throw new HTTPException(403, {
      message: "Supplier role requires supplier_id in JWT",
    });
  }

  const raw = await c.req.json().catch(() => ({}));
  const parsed = signUploadSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: issue?.message ?? "invalid input",
        field: issue?.path.join(".") ?? "unknown",
      },
      422,
    );
  }

  const { po_id, do_number, mime_type, kind } = parsed.data;
  const safeDo = do_number.replace(/[^a-zA-Z0-9._-]/g, "_");
  const ext = extForMime(mime_type);
  const slug =
    kind === "claim"
      ? `claim-${safeDo}`
      : kind === "arrival"
        ? `arrival-${safeDo}`
        : safeDo;
  const path = `${po_id}/${crypto.randomUUID()}-${slug}.${ext}`;

  // F11 — USER JWT, never service_role. Storage RLS (migration 0042) gates
  // writes; we just defer to it.
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.storage
    .from("delivery-orders")
    .createSignedUploadUrl(path);
  if (error) throw new HTTPException(500, { message: error.message });

  return c.json({ token: data.token, path: data.path });
});

// ----------------------------------------------------------------------------
// POST /api/storage/dos/sign-order-upload — order-level DO upload (operation
// final-delivery flow, migration 0087 Loo 2026-05-11).
//
// Same bucket (`delivery-orders`), different path prefix: `order-<order_id>`
// instead of `<po_id>`. Partner role is intentionally excluded — the partner
// uploads POD via `/api/partner/pod/sign-upload` to a different bucket
// (`proof-of-delivery`); the final order-level DO is operation' artefact.
// ----------------------------------------------------------------------------
dosRouter.post("/sign-order-upload", async (c) => {
  const auth = c.var.auth;
  if (!["operation", "principal"].includes(auth.role)) {
    throw new HTTPException(403, {
      message: "operation or principal role required",
    });
  }

  const raw = await c.req.json().catch(() => ({}));
  const parsed = signOrderUploadSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: issue?.message ?? "invalid input",
        field: issue?.path.join(".") ?? "unknown",
      },
      422,
    );
  }

  const { order_id, do_number, mime_type, kind } = parsed.data;
  const safeDo = do_number.replace(/[^a-zA-Z0-9._-]/g, "_");
  const ext = extForMime(mime_type);
  const slug = kind === "signature" ? "signature" : safeDo;
  const path = `order-${order_id}/${crypto.randomUUID()}-${slug}.${ext}`;

  // USER JWT — Storage RLS (0042 + 0084 operation/principal short-circuit)
  // gates writes; this endpoint only enforces caller role + path shape.
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.storage
    .from("delivery-orders")
    .createSignedUploadUrl(path);
  if (error) throw new HTTPException(500, { message: error.message });

  return c.json({ token: data.token, path: data.path });
});

export default dosRouter;
