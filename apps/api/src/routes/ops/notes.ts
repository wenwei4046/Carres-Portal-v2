import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  createOpsNoteInputSchema,
  updateOpsNoteInputSchema,
} from "@carres/shared";
import { requireOperationOrPrincipal } from "../../lib/auth-guards";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Keep notes (migration 0162) — every operation staff member keeps their own
 * notes; principal/COO can read all (RLS). Behind the operation right rail.
 *
 *   GET    /            — own notes (pinned first), principal sees all
 *   POST   /            — create (author = authed user)
 *   PATCH  /:id         — edit / pin / recolour
 *   DELETE /:id         — delete own
 */
const notesRouter = new Hono<AppEnv>();

notesRouter.get("/", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("ops_notes")
    .select("*")
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false });
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json({ notes: (data ?? []).map(shape) });
});

notesRouter.post("/", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseBody(c, createOpsNoteInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("ops_notes")
    .insert({
      author_id: c.var.auth.id,
      title: parsed.title ?? null,
      content: parsed.content ?? "",
      color: parsed.color ?? null,
      pinned: parsed.pinned ?? false,
    })
    .select()
    .single();
  if (error || !data)
    throw new HTTPException(500, { message: error?.message ?? "Insert failed" });
  return c.json(shape(data), 201);
});

notesRouter.patch("/:id", requireOperationOrPrincipal, async (c) => {
  const id = c.req.param("id");
  const parsed = await parseBody(c, updateOpsNoteInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);
  const patch: Record<string, unknown> = {};
  if (parsed.title !== undefined) patch.title = parsed.title;
  if (parsed.content !== undefined) patch.content = parsed.content;
  if (parsed.color !== undefined) patch.color = parsed.color;
  if (parsed.pinned !== undefined) patch.pinned = parsed.pinned;
  const { data, error } = await sb
    .from("ops_notes")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error || !data)
    throw new HTTPException(error ? 500 : 404, {
      message: error?.message ?? "Note not found",
    });
  return c.json(shape(data));
});

notesRouter.delete("/:id", requireOperationOrPrincipal, async (c) => {
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.from("ops_notes").delete().eq("id", id);
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json({ id });
});

interface RawNote {
  id: string;
  author_id: string;
  title: string | null;
  content: string;
  color: string | null;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

function shape(r: RawNote) {
  return {
    id: r.id,
    authorId: r.author_id,
    authorName: null as string | null,
    title: r.title,
    content: r.content,
    color: r.color,
    pinned: r.pinned,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

async function parseBody<S extends import("zod").ZodTypeAny>(
  c: import("hono").Context<AppEnv>,
  schema: S,
): Promise<import("zod").infer<S>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Body must be valid JSON" });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw new HTTPException(400, {
      message: "Invalid input: " + parsed.error.issues[0]?.message,
    });
  return parsed.data;
}

export default notesRouter;
