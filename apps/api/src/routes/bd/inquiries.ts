import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Phase 8 Sprint 2 — BD inquiries CRUD + convert to new_dealer approval.
 *
 * Mounted at `/api/bd/inquiries`. Routes:
 *   GET    /                list inquiries (RLS-scoped via inquiries_internal)
 *   POST   /                create inquiry
 *   PATCH  /:id             update stage / note / contact
 *   POST   /:id/convert     bd_convert_inquiry RPC — converts qualified
 *                           inquiry + creates new_dealer approval atomically.
 *
 * Role gate: bd or principal. RLS on inquiries (0002:316) admits is_internal()
 * which includes both. The /convert RPC re-validates the role internally.
 */
const bdInquiriesRouter = new Hono<AppEnv>();

const inquiryCreateSchema = z.object({
  kind:    z.enum(["new_dealer", "expansion", "product"]),
  company: z.string().trim().min(1).max(200),
  region:  z.string().trim().max(120).optional().nullable(),
  contact: z.string().trim().max(200).optional().nullable(),
  note:    z.string().trim().max(2000).optional().nullable(),
});

// PATCH stage enum INTENTIONALLY excludes 'converted'. Conversion has a
// side effect (creates a new_dealer approval row) and must go through the
// dedicated /convert RPC. Allowing PATCH stage='converted' would skip the
// approval creation and silently violate Phase 8 acceptance #3.
const inquiryUpdateSchema = z.object({
  stage:   z.enum(["new", "contacted", "qualified", "lost"]).optional(),
  contact: z.string().trim().max(200).optional().nullable(),
  region:  z.string().trim().max(120).optional().nullable(),
  note:    z.string().trim().max(2000).optional().nullable(),
});

function requireBd(role: string | undefined) {
  if (role !== "bd" && role !== "principal") {
    throw new HTTPException(403, { message: "BD or principal only" });
  }
}

bdInquiriesRouter.get("/", async (c) => {
  const auth = c.var.auth;
  requireBd(auth.role);
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("inquiries")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data ?? []);
});

bdInquiriesRouter.post("/", async (c) => {
  const auth = c.var.auth;
  requireBd(auth.role);
  const raw = await c.req.json().catch(() => ({}));
  const parsed = inquiryCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid input" },
      422,
    );
  }
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("inquiries")
    .insert({
      kind:          parsed.data.kind,
      company:       parsed.data.company,
      region:        parsed.data.region ?? null,
      contact:       parsed.data.contact ?? null,
      note:          parsed.data.note ?? null,
      stage:         "new",
      owner_user_id: auth.id,
    })
    .select("*")
    .single();
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data);
});

bdInquiriesRouter.patch("/:id", async (c) => {
  const auth = c.var.auth;
  requireBd(auth.role);
  const id = c.req.param("id");
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return c.json({ error: "invalid_id", code: "invalid_param", message: "id must be a uuid" }, 422);
  }
  const raw = await c.req.json().catch(() => ({}));
  const parsed = inquiryUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid input" },
      422,
    );
  }
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("inquiries")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new HTTPException(500, { message: error.message });
  if (!data) return c.json({ error: "not_found", code: "not_found", message: "Inquiry not found" }, 404);
  return c.json(data);
});

bdInquiriesRouter.post("/:id/convert", async (c) => {
  const auth = c.var.auth;
  requireBd(auth.role);
  const id = c.req.param("id");
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return c.json({ error: "invalid_id", code: "invalid_param", message: "id must be a uuid" }, 422);
  }
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("bd_convert_inquiry", { p_inquiry_id: id });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

export default bdInquiriesRouter;
