import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !serviceKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars are required");
}
const sb = createClient(url, serviceKey);

const PARTNER_ID = "00000000-0000-0000-0000-0000000001f1";
const EMAIL = "lp-test@x.com";
const PASSWORD = "lp-test-password";

async function main() {
  const { data: existing } = await sb.auth.admin.listUsers();
  const exists = existing?.users.find((u) => u.email === EMAIL);
  if (exists) {
    console.log("LP test user already exists:", exists.id);
    return;
  }

  const { data, error } = await sb.auth.admin.createUser({
    email: EMAIL, password: PASSWORD, email_confirm: true,
  });
  if (error || !data?.user) throw error || new Error("createUser failed");

  const { error: appErr } = await sb.from("app_users").insert({
    id: data.user.id, email: EMAIL, name: "Test LP Alpha",
    role: "partner", partner_id: PARTNER_ID,
  });
  if (appErr) throw appErr;

  console.log("LP test user created:", data.user.id);
}
main().catch((e) => { console.error(e); process.exit(1); });
