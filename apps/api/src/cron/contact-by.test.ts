import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

// The cron runs at 01:00 UTC (09:00 KL). Between 00:00 and 08:00 KL the
// database's current_date is still yesterday, so the scan compared against the
// wrong day on a manual run. 0521 spells today as KL today.
describe("the Contact-by scan's today is Kuala Lumpur's (0521)", () => {
  const sql = readFileSync(
    resolve(here, "../../../../supabase/migrations/0521_contact_by_tasks_scan_uses_kl_today.sql"),
    "utf8",
  );
  const body = sql.slice(sql.indexOf("-- 1. Contact-by scan"));

  it("replays ops_generate_contact_by_tasks with no UTC-clock day", () => {
    expect(body).toContain("create or replace function public.ops_generate_contact_by_tasks()");
    expect(body).not.toContain("current_date");
    const kl = body.match(/\(timezone\('Asia\/Kuala_Lumpur', now\(\)\)\)::date/g) ?? [];
    expect(kl).toHaveLength(2); // delivery_date >= today, delivery_date - N <= today
  });

  it("stays cron-only", () => {
    expect(body).toContain("from authenticated, anon;");
  });
});
