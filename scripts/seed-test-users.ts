/**
 * Comprehensive E2E test-user scaffold. Creates the `*-test@x.com` users that
 * the e2e/*.spec.ts files expect. Idempotent — re-running is safe.
 *
 * Replaces the older `seed-lp-test-user.ts` (kept for backward compat).
 *
 * Closes the structural gap surfaced 2026-05-09: the 14 fixme'd Playwright
 * specs were authored against `*-test@x.com` test users that don't exist
 * in `supabase/seed.sql`. Without this scaffold, only `phase-6-supplier-happy`
 * (which uses the seeded `supplier@carres.com`) is runnable.
 *
 * Usage (from repo root):
 *
 *   pnpm seed:test-users
 *
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from process.env. The
 * `pnpm seed:test-users` script preloads them from `apps/api/.dev.vars`
 * via a tiny inline loader below (so the user doesn't need to export
 * env vars manually).
 *
 * Test users created:
 *   dealer-test@x.com     / dealer-test-password    / role=dealer    / dealer=BedHouse KL
 *   logistics-test@x.com  / logistics-test-password / role=logistics
 *   finance-test@x.com    / finance-test-password   / role=finance
 *   lp-test@x.com         / lp-test-password        / role=partner   / partner=JT Express
 *
 * Why only 4 users (vs the 8+ users some specs reference like lp-a, lp-x, lp-y)?
 * Per audit on 2026-05-09 the more exotic test users (cross-tenant lp-a/lp-b,
 * cross-leg lp-x/lp-y) need accompanying fixture POs (PO-FIXTURE-LP, PO-LP-A-1,
 * PO-FIXTURE-LEG-X) that this script doesn't seed. Those specs stay fixme'd
 * pending a richer fixture pass — tracked as carry-forward
 * `phase-7-e2e-fixture-pos`.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

// ----- Inline .dev.vars loader (so `pnpm seed:test-users` works without
//        the caller pre-exporting env vars). Wrangler's .dev.vars format is
//        plain `KEY=VALUE` per line, comments with `#`. -----
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEV_VARS_PATH = path.resolve(__dirname, "..", "apps", "api", ".dev.vars");
if (fs.existsSync(DEV_VARS_PATH)) {
  for (const line of fs.readFileSync(DEV_VARS_PATH, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes if present (Wrangler accepts both).
    if (
      (v.startsWith('"') && v.endsWith('"'))
      || (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars are required.",
  );
  console.error(
    "They should auto-load from apps/api/.dev.vars; check that file exists.",
  );
  process.exit(1);
}
const sb = createClient(url, serviceKey);

// ----- Existing seeded entity IDs (mirror supabase/seed.sql) -----
const DEALER_ID_BEDHOUSE_KL = "00000000-0000-0000-0000-000000000d01";
const PARTNER_ID_JT_EXPRESS = "00000000-0000-0000-0000-0000000000f1";

// ----- E2E test partner IDs (synthetic; created via SQL fallback below) -----
const PARTNER_ID_LP_A = "11111111-aaaa-aaaa-aaaa-000000000001";
const PARTNER_ID_LP_B = "11111111-bbbb-bbbb-bbbb-000000000002";

async function ensureDeliveryPartner(id: string, name: string): Promise<void> {
  // Idempotent: insert if missing. supabase-js doesn't have a clean UPSERT
  // for primary-key conflicts; we just check first.
  const { data, error: selErr } = await sb
    .from("delivery_partners")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (selErr) throw selErr;
  if (data) {
    console.log(`  [exists]  delivery_partner ${name}  id=${id}`);
    return;
  }
  const { error: insErr } = await sb.from("delivery_partners").insert({
    id,
    name,
    contact: `${name} contact`,
  });
  if (insErr) throw insErr;
  console.log(`  [created] delivery_partner ${name}  id=${id}`);
}

interface TestUser {
  email:      string;
  password:   string;
  name:       string;
  role:       "dealer" | "logistics" | "finance" | "partner";
  dealerId?:  string | null;
  partnerId?: string | null;
}

const USERS: TestUser[] = [
  {
    email:    "dealer-test@x.com",
    password: "dealer-test-password",
    name:     "E2E Test · Dealer",
    role:     "dealer",
    dealerId: DEALER_ID_BEDHOUSE_KL,
  },
  {
    email:    "logistics-test@x.com",
    password: "logistics-test-password",
    name:     "E2E Test · Logistics",
    role:     "logistics",
  },
  {
    email:    "finance-test@x.com",
    password: "finance-test-password",
    name:     "E2E Test · Finance",
    role:     "finance",
  },
  {
    email:     "lp-test@x.com",
    password:  "lp-test-password",
    name:      "E2E Test · LP",
    role:      "partner",
    partnerId: PARTNER_ID_JT_EXPRESS,
  },
  // lp-a / lp-b: cross-tenant isolation tests. Each gets its own
  // delivery_partner row so RLS scopes them apart.
  {
    email:     "lp-a@x.com",
    password:  "lp-a-password",
    name:      "E2E Test · LP-A",
    role:      "partner",
    partnerId: PARTNER_ID_LP_A,
  },
  {
    email:     "lp-b@x.com",
    password:  "lp-b-password",
    name:      "E2E Test · LP-B",
    role:      "partner",
    partnerId: PARTNER_ID_LP_B,
  },
];

async function ensureUser(u: TestUser): Promise<void> {
  // Step 1: auth.users — list + match by email (admin.listUsers paginates;
  // for our small fixture set the first page is plenty).
  const { data: existing, error: listErr } = await sb.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listErr) throw listErr;

  let userId: string;
  const found = existing?.users.find((x) => x.email === u.email);
  if (found) {
    userId = found.id;
    console.log(`  [exists] ${u.email}  id=${userId}`);
  } else {
    const { data, error } = await sb.auth.admin.createUser({
      email:         u.email,
      password:      u.password,
      email_confirm: true,
      app_metadata: {
        role:        u.role,
        dealer_id:   u.dealerId ?? null,
        partner_id:  u.partnerId ?? null,
      },
    });
    if (error || !data?.user) throw error ?? new Error("createUser failed");
    userId = data.user.id;
    console.log(`  [created] ${u.email}  id=${userId}`);
  }

  // Step 2: app_users row — upsert. Some auth.users rows (existing) may
  // already have an app_users row from a prior run; skip if present.
  const { data: appRow, error: selErr } = await sb
    .from("app_users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (selErr) throw selErr;
  if (appRow) {
    console.log(`            app_users row present`);
    return;
  }
  const { error: insErr } = await sb.from("app_users").insert({
    id:         userId,
    email:      u.email,
    name:       u.name,
    role:       u.role,
    status:     "active",
    dealer_id:  u.dealerId ?? null,
    partner_id: u.partnerId ?? null,
  });
  if (insErr) throw insErr;
  console.log(`            app_users row inserted`);
}

/**
 * Existing seed.sql `<role>@carres.com` users have raw_app_meta_data set to
 * just `{provider:'email',providers:['email']}` — no role / entity ids. The
 * `custom_access_token_hook` (migration 0004) is supposed to inject those
 * but it's a manual Dashboard enable step that may not be live on staging.
 *
 * Without role in JWT, after sign-in the React `useAuth` store can't pick a
 * role and `HomeRedirect` falls through to `/me`. That breaks every E2E
 * spec that asserts `/<role>/dashboard`.
 *
 * Workaround: PATCH the seed users' app_metadata via admin API. This is
 * idempotent (admin.updateUserById merges; we only update if missing).
 * The hook (when enabled) would re-inject on every sign-in and overwrite
 * with the same values from app_users, so this stays consistent.
 */
const SEED_USER_PATCHES: Array<{ email: string; meta: Record<string, string | null> }> = [
  { email: "principal@carres.com",   meta: { role: "principal"   } },
  { email: "dealer@carres.com",      meta: { role: "dealer",      dealer_id: "00000000-0000-0000-0000-000000000d01" } },
  { email: "salesperson@carres.com", meta: { role: "salesperson", dealer_id: "00000000-0000-0000-0000-000000000d01", outlet_id: "00000000-0000-0000-0000-0000000000a1" } },
  { email: "logistics@carres.com",   meta: { role: "logistics"   } },
  { email: "finance@carres.com",     meta: { role: "finance"     } },
  { email: "supplier@carres.com",    meta: { role: "supplier",    supplier_id: "00000000-0000-0000-0000-0000000000e1" } },
  { email: "partner@carres.com",     meta: { role: "partner",     partner_id:  "00000000-0000-0000-0000-0000000000f1" } },
  { email: "supplier-nf@carres.com", meta: { role: "supplier",    supplier_id: "00000000-0000-0000-0000-0000000000e2" } },
  { email: "showroom@carres.com",    meta: { role: "showroom",    dealer_id: "00000000-0000-0000-0000-000000000d99", outlet_id: "00000000-0000-0000-0000-0000000000a9" } },
  { email: "bd@carres.com",          meta: { role: "bd"          } },
];

async function patchSeedUsers(): Promise<void> {
  const { data: existing, error: listErr } = await sb.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listErr) throw listErr;

  for (const patch of SEED_USER_PATCHES) {
    const found = existing?.users.find((u) => u.email === patch.email);
    if (!found) {
      console.log(`  [skip]    ${patch.email}  (not in seed)`);
      continue;
    }
    const current = (found.app_metadata ?? {}) as Record<string, unknown>;
    const need = Object.entries(patch.meta).some(([k, v]) => current[k] !== v);
    if (!need) {
      console.log(`  [ok]      ${patch.email}  app_metadata already has ${patch.meta.role}`);
      continue;
    }
    const merged = { ...current, ...patch.meta };
    const { error: updErr } = await sb.auth.admin.updateUserById(found.id, {
      app_metadata: merged,
    });
    if (updErr) throw updErr;
    console.log(`  [patched] ${patch.email}  → ${patch.meta.role}`);
  }
}

async function main(): Promise<void> {
  console.log(`Seeding ${USERS.length} E2E test users into ${url}`);

  // Ensure E2E delivery_partners exist (lp-a + lp-b users link to these).
  console.log("\nEnsuring E2E delivery_partners rows");
  await ensureDeliveryPartner(PARTNER_ID_LP_A, "E2E LP-A");
  await ensureDeliveryPartner(PARTNER_ID_LP_B, "E2E LP-B");

  for (const u of USERS) {
    console.log(`\n${u.role.padEnd(10)} ${u.email}`);
    await ensureUser(u);
  }
  console.log("\nPatching seed.sql @carres.com user app_metadata (role + entity ids)");
  await patchSeedUsers();
  console.log("\nDone. Test users ready for Playwright.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
