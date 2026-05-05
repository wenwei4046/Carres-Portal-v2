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
 * 0042 (logistics + principal write to `delivery-orders/<po_id>/...`) is the
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
const MAX_SIZE = 10 * 1024 * 1024; // 10 MiB

const signUploadSchema = z.object({
  po_id: z.string().min(1).max(100),
  do_number: z.string().min(3).max(50),
  mime_type: z.enum(ALLOWED_MIMES),
  size_bytes: z.number().int().positive().max(MAX_SIZE),
});

function extForMime(mime: (typeof ALLOWED_MIMES)[number]): string {
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/jpeg") return "jpg";
  return "png";
}

dosRouter.post("/sign-upload", async (c) => {
  const auth = c.var.auth;
  if (!["logistics", "principal"].includes(auth.role)) {
    throw new HTTPException(403, { message: "Logistics or principal role required" });
  }

  const raw = await c.req.json().catch(() => ({}));
  const parsed = signUploadSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: parsed.error.issues[0]?.message ?? "invalid input",
      },
      422,
    );
  }

  const { po_id, do_number, mime_type } = parsed.data;
  const safeDo = do_number.replace(/[^a-zA-Z0-9._-]/g, "_");
  const ext = extForMime(mime_type);
  const path = `${po_id}/${crypto.randomUUID()}-${safeDo}.${ext}`;

  // F11 — USER JWT, never service_role. Storage RLS (migration 0042) gates
  // writes; we just defer to it.
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.storage
    .from("delivery-orders")
    .createSignedUploadUrl(path);
  if (error) throw new HTTPException(500, { message: error.message });

  return c.json({ token: data.token, path: data.path });
});

export default dosRouter;
