import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(
  join(here, "../../../../../supabase/migrations/0385_sales_order_revision_promo_parity.sql"),
  "utf8",
);

describe("0385 sales_order_save_revision promo parity", () => {
  it("wraps the latest 0354 writer instead of replacing its contract", () => {
    expect(migration).toMatch(
      /rename to sales_order_save_revision_unchecked_0354/i,
    );
    expect(migration).toMatch(
      /return public\.sales_order_save_revision_unchecked_0354\(/i,
    );
    expect(migration).toMatch(
      /p_order_id uuid[\s\S]*p_header\s+jsonb[\s\S]*p_lines\s+jsonb[\s\S]*p_change\s+jsonb/i,
    );
  });

  it("guards every protected marker, including the reported Promo/PWP case", () => {
    expect(migration).toMatch(
      /v_attrs \?\| array\['free_gift', 'free_item', 'pwp', 'bundle_group', 'combo_key'\]/i,
    );
    expect(migration).toMatch(/detail = 'line_not_editable'/i);
    expect(migration).toMatch(/unit_price[\s\S]*is distinct from v_old\.unit_price/i);
    expect(migration).toMatch(/if v_line is null[\s\S]*line_not_editable/i);
  });

  it("does not add a release or delete path for a spent voucher", () => {
    expect(migration).not.toMatch(/pwp_release|delete from public\.pwp_codes|update public\.pwp_codes/i);
    expect(migration).toMatch(/remains USED/i);
  });
});
