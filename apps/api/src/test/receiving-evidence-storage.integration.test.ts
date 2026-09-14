import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import app from "../index";

/**
 * THE SIX EVIDENCE ROUND-TRIPS ON A REAL, NON-PRODUCTION SUPABASE.
 *
 * upload → record through the door → close → reopen through the API route →
 * sign → download, for Damaged / Wrong Item / Extra × Photos / Videos, plus
 * the truthful states: a recorded file the bucket no longer holds (`missing`),
 * a viewer with no permission (403), a line that carries no such exception
 * (refused by name), and a foreign line key (an empty, VERIFIED answer).
 *
 * This is NOT the stubbed preview and NOT PGlite: real Storage, real RLS, the
 * real JWT verified against the project's JWKS, the real route. It needs a
 * project that is not production — the repository has none today (ENGINEERING:
 * "staging IS production"), so every case SKIPS until these are set:
 *
 *   CARRES_NONPROD_SUPABASE_URL                 a project that is NOT kfprgpjpaffedghytstl
 *   CARRES_NONPROD_SUPABASE_ANON_KEY
 *   CARRES_NONPROD_SUPABASE_SERVICE_ROLE_KEY
 *   CARRES_NONPROD_OPERATION_EMAIL / _PASSWORD  an operation account that may save receivings
 *   CARRES_NONPROD_RECEIPT_ID                   a POSTED receiving there whose lines carry a
 *                                               damaged unit, a wrong-item unit and an extra line
 *   CARRES_NONPROD_WAREHOUSE_EMAIL / _PASSWORD  (optional) a warehouse account, for the 403 case
 *
 * A skipped run is reported as skipped — never as passed.
 */
const E = (k: string) => process.env[k] ?? "";
const URL = E("CARRES_NONPROD_SUPABASE_URL");
const READY =
  !!URL && !!E("CARRES_NONPROD_SUPABASE_ANON_KEY") && !!E("CARRES_NONPROD_SUPABASE_SERVICE_ROLE_KEY") &&
  !!E("CARRES_NONPROD_OPERATION_EMAIL") && !!E("CARRES_NONPROD_OPERATION_PASSWORD") && !!E("CARRES_NONPROD_RECEIPT_ID");
const PRODUCTION_REF = "kfprgpjpaffedghytstl";
const BUCKET = "delivery-orders";
const TYPES = ["damaged", "wrong_item", "extra"] as const;
const KINDS = ["photo", "video"] as const;

/* Real bytes, not names: a 1×1 JPEG and the smallest MP4 container (ftyp +
   empty moov). Storage stores them, signs them and serves them back; the byte
   equality is the round-trip. Whether a player renders the MP4 is a browser
   walk on the same project, not this file's claim. */
const JPEG = Uint8Array.from(atob(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
), (ch) => ch.charCodeAt(0));
const MP4 = Uint8Array.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00, 0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x31,
  0x00, 0x00, 0x00, 0x08, 0x6d, 0x6f, 0x6f, 0x76,
]);

type Env = { SUPABASE_URL: string; SUPABASE_ANON_KEY: string; SUPABASE_SERVICE_ROLE_KEY: string; SUPABASE_JWT_SECRET: string };

describe.skipIf(!READY)("exception evidence round-trips on a real non-production Supabase", () => {
  let env: Env;
  let admin: SupabaseClient;
  let user: SupabaseClient;
  let jwt: string;
  let receipt: { id: string; po_id: string; lines: Array<Record<string, unknown>>; extra_lines: Array<Record<string, unknown>> };
  const lineFor: Partial<Record<(typeof TYPES)[number], string>> = {};
  const uploaded: string[] = [];
  const tag = Date.now().toString(36);
  const pathFor = (type: string, kind: string) => `${receipt.po_id}/it-${tag}-${type}.${kind === "photo" ? "jpg" : "mp4"}`;

  beforeAll(async () => {
    if (URL.includes(PRODUCTION_REF)) throw new Error("refusing to run the evidence round-trips against the production project");
    env = {
      SUPABASE_URL: URL,
      SUPABASE_ANON_KEY: E("CARRES_NONPROD_SUPABASE_ANON_KEY"),
      SUPABASE_SERVICE_ROLE_KEY: E("CARRES_NONPROD_SUPABASE_SERVICE_ROLE_KEY"),
      SUPABASE_JWT_SECRET: "",
    };
    admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    user = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const signIn = await user.auth.signInWithPassword({ email: E("CARRES_NONPROD_OPERATION_EMAIL"), password: E("CARRES_NONPROD_OPERATION_PASSWORD") });
    if (signIn.error || !signIn.data.session) throw new Error(`operation sign-in failed: ${signIn.error?.message}`);
    jwt = signIn.data.session.access_token;
    const { data, error } = await admin
      .from("warehouse_receipts")
      .select("id, po_id, status, lines, extra_lines")
      .eq("id", E("CARRES_NONPROD_RECEIPT_ID"))
      .single();
    if (error || !data) throw new Error(`receipt not readable: ${error?.message}`);
    if (data.status !== "posted") throw new Error(`receipt ${data.id} is ${data.status}; the round-trips need a posted receiving`);
    receipt = data as typeof receipt;
    lineFor.damaged = (receipt.lines.find((l) => Number(l.damaged_qty ?? 0) > 0)?.id as string | undefined) ?? undefined;
    lineFor.wrong_item = (receipt.lines.find((l) => Number(l.wrong_item_qty ?? 0) > 0)?.id as string | undefined) ?? undefined;
    lineFor.extra = (receipt.extra_lines?.find((x) => Number(x.qty ?? 0) > 0)?.id as string | undefined) ?? undefined;
    for (const t of TYPES) if (!lineFor[t]) throw new Error(`receipt ${receipt.id} carries no ${t} line — the six round-trips need one of each`);
  });

  afterAll(async () => {
    if (!admin || !receipt) return;
    if (uploaded.length) {
      await admin.from("receiving_line_evidence").delete().eq("receipt_id", receipt.id).in("path", uploaded);
      await admin.storage.from(BUCKET).remove(uploaded);
    }
  });

  const route = (type: string, kind: string, line: string, token = jwt) =>
    app.fetch(
      new Request(
        `http://api.test/api/operation/warehouse-receipts/${receipt.id}/evidence?type=${type}&kind=${kind}&line=${encodeURIComponent(line)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      ),
      env,
    );

  for (const type of TYPES) {
    for (const kind of KINDS) {
      it(`${type} · ${kind}: upload → door → reopen through the route → signed download of the same bytes; a foreign line key sees nothing`, async () => {
        const path = pathFor(type, kind);
        const bytes = kind === "photo" ? JPEG : MP4;
        const up = await user.storage.from(BUCKET).upload(path, bytes, { contentType: kind === "photo" ? "image/jpeg" : "video/mp4", upsert: false });
        expect(up.error).toBeNull();
        uploaded.push(path);
        const added = await user.rpc("receiving_line_evidence_add", {
          p_receipt_id: receipt.id,
          p_entries: [{ line_key: lineFor[type], exception_type: type, kind, path }],
          p_reason: "integration round-trip",
        });
        expect(added.error).toBeNull();
        expect((added.data as { added: number }).added).toBe(1);
        // close → reopen: a fresh request through the real route
        const res = await route(type, kind, lineFor[type]!);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { verified: boolean; files: Array<{ path: string; status: string; url: string | null; line_key: string; kind: string }> };
        expect(body.verified).toBe(true);
        const mine = body.files.find((f) => f.path === path);
        expect(mine).toMatchObject({ status: "ok", line_key: lineFor[type], kind });
        const download = await fetch(mine!.url!);
        expect(download.status).toBe(200);
        expect(new Uint8Array(await download.arrayBuffer())).toEqual(bytes);
        // scoping: another line key on the same GRN does not see this file
        const foreign = await route(type, kind, "00000000-0000-0000-0000-000000000000");
        const other = (await foreign.json()) as { verified: boolean; files: unknown[] };
        expect(other).toEqual({ receipt_id: receipt.id, verified: true, files: [] });
      });
    }
  }

  it("a recorded file the bucket no longer holds is named `missing`, not hidden and not `ok`", async () => {
    const path = pathFor("damaged", "photo");
    const removed = await admin.storage.from(BUCKET).remove([path]);
    expect(removed.error).toBeNull();
    const res = await route("damaged", "photo", lineFor.damaged!);
    const body = (await res.json()) as { files: Array<{ path: string; status: string; url: string | null }> };
    expect(body.files.find((f) => f.path === path)).toMatchObject({ status: "missing", url: null });
  });

  it("a line that carries no such exception is refused by name; a kind that does not match the file is refused by name", async () => {
    const lineWithoutWrong = receipt.lines.find((l) => Number(l.wrong_item_qty ?? 0) === 0)?.id as string | undefined;
    if (lineWithoutWrong) {
      const r = await user.rpc("receiving_line_evidence_add", {
        p_receipt_id: receipt.id,
        p_entries: [{ line_key: lineWithoutWrong, exception_type: "wrong_item", kind: "photo", path: pathFor("wrong_item", "photo") }],
        p_reason: null,
      });
      expect(r.error?.details ?? r.error?.message).toMatch(/evidence_exception_zero|records no wrong item/);
    }
    const mismatch = await user.rpc("receiving_line_evidence_add", {
      p_receipt_id: receipt.id,
      p_entries: [{ line_key: lineFor.damaged, exception_type: "damaged", kind: "photo", path: pathFor("damaged", "video") }],
      p_reason: null,
    });
    expect(mismatch.error?.details ?? mismatch.error?.message).toMatch(/evidence_kind_mismatch|not a photo/);
  });

  it.skipIf(!E("CARRES_NONPROD_WAREHOUSE_EMAIL"))("a warehouse account is refused the viewer (403), not shown an empty list", async () => {
    const wh = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const signIn = await wh.auth.signInWithPassword({ email: E("CARRES_NONPROD_WAREHOUSE_EMAIL"), password: E("CARRES_NONPROD_WAREHOUSE_PASSWORD") });
    expect(signIn.error).toBeNull();
    const res = await route("damaged", "photo", lineFor.damaged!, signIn.data.session!.access_token);
    expect(res.status).toBe(403);
  });
});
