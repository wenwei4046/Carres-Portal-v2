import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Card C1 (Jess, 2026-08-03) — **Data Integrity, not UX.**
 *
 * Her frozen requirement was not "remove a button", it was a PROOF:
 *
 * > 全库搜索所有 Office 收货入口 · 全库搜索所有 `received_qty` 写入入口 ·
 * > 证明没有绕过 Receiving Session 的路径
 *
 * A proof written in a PR body decays the moment somebody adds a door. This
 * file is the same proof as a guard that runs on every commit.
 *
 * A SOURCE SCAN, not a render test, for the reason Portal Core C1 already
 * found in this exact area: `OrderDetailDrawer.tsx` is 7,000 lines of
 * branches, and a render test only ever sees the branches its fixture
 * reaches. The API half of the proof lives beside the routes it guards, in
 * `apps/api/src/routes/operation/pos.test.ts`.
 */

/**
 * WINDOWS. `join` yields backslashes here, so a `replace(WEB_SRC + "/", "")`
 * strips nothing and the assertion compares an absolute C:… path against a
 * repo-relative one. This scan is about WHICH FILES call a door, and a path
 * separator is not part of that question — so every path this file builds is
 * normalised to forward slashes once, at the source.
 */
const slash = (p: string) => p.split("\\").join("/");
const WEB_SRC = slash(join(__dirname, "..", ".."));
const REPO = slash(join(WEB_SRC, "..", "..", ".."));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const full = slash(join(dir, name));
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const SOURCES = walk(WEB_SRC);
const read = (f: string) => readFileSync(f, "utf8");

/**
 * Comments stripped BEFORE scanning. A tombstone comment naming the retired
 * door is exactly what a future reader needs and exactly what a naive scan
 * reports as a live caller — this guard failed on its own first run for that
 * reason (the same trap UI-KIT D0.5b hit).
 */
const code = (f: string) =>
  read(f)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("Card C1 · the Office has exactly ONE receiving door", () => {
  it("ReceivePOModal is gone from the repo — the component, not just its callers", () => {
    // Deleted rather than orphaned: a component nobody mounts is a door
    // somebody re-mounts. `PartnerReceiveAtWhModal` is a FORK, not an import,
    // and is a different leg (a partner confirming goods at a warehouse).
    expect(
      existsSync(join(WEB_SRC, "pages/operation/components/ReceivePOModal.tsx")),
    ).toBe(false);
    const mounts = SOURCES.filter((f) => /<ReceivePOModal/.test(code(f)));
    expect(mounts, `still mounted in:\n${mounts.join("\n")}`).toEqual([]);
  });

  it("no page posts to the retired /receive route", () => {
    // The Office's legacy door: it called `operation_receive_po_with_do`
    // straight, so stock moved and the delivery left NO Session, no event and
    // no GRN. Its own tooltip in the order drawer promised "records the GRN".
    const callers = SOURCES.filter((f) =>
      /useReceivePoWithDoMutation|\/pos\/\$\{[^}]+\}\/receive["`]/.test(code(f)),
    );
    expect(callers, `still calling the retired door:\n${callers.join("\n")}`).toEqual(
      [],
    );
  });

  it("the API no longer serves the retired route", () => {
    const pos = read(join(REPO, "apps/api/src/routes/operation/pos.ts"));
    expect(pos).not.toMatch(/operationPosRouter\.post\("\/:id\/receive"/);
    expect(pos).not.toMatch(/operationPosRouter\.post\("\/:id\/office-receive"/);
  });

  it("every Office receiving call in the web app goes through the Receiving Session routes", () => {
    const officeCallers = SOURCES.filter((f) => /office-receive/.test(code(f)));
    expect(officeCallers).toEqual([]);
    const sessionCallers = SOURCES.filter((f) => /\/operation\/warehouse-receipts/.test(code(f)));
    expect(sessionCallers.map((f) => f.replace(WEB_SRC + "/", "")).sort()).toEqual(["lib/queries.ts"]);
  });

  it("the order drawer hands over instead of receiving in place", () => {
    const drawerPath = join(
      WEB_SRC,
      "pages/operation/components/OrderDetailDrawer.tsx",
    );
    const drawer = read(drawerPath);
    const codeOf = (t: string) =>
      t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(drawer).toMatch(/tab=receiving&po=\$\{encodeURIComponent\(po\.id\)\}/);
    // No local receive state survives to be re-wired to something.
    expect(codeOf(drawer)).not.toMatch(/setReceivePo/);
  });

  it("no API route calls the retired direct receive RPC", () => {
    const api = slash(join(REPO, "apps/api/src"));
    const files = walk(api).filter((f) => /\.ts$/.test(f));
    const direct = files.filter((f) =>
      /rpc\("operation_receive_po_with_do"/.test(code(f)),
    );
    expect(direct).toEqual([]);
  });
});

/**
 * Card C1b (Jess, 2026-08-03) — the database half of the same door.
 *
 * C1 removed the last Office BUTTON. The audit it required then found a wider
 * hole: `purchase_order_lines` granted table-level UPDATE to `authenticated`,
 * so an Office login could PATCH `received_qty` straight through PostgREST —
 * proven on prod in a rolled-back transaction (received_qty 0 → 1, Sessions 0,
 * events 0, no stock movement).
 *
 * **Jess corrected the fix**: a column-level revoke cannot subtract from a
 * table-level grant in PostgreSQL, so 0316 revokes the TABLE grant and grants
 * nothing back — the audit found ZERO legitimate client writers.
 *
 * A test cannot reach prod, so what it guards is the thing that could undo the
 * fix: a LATER migration handing the privilege back. The assertions she asked
 * for permanently — table UPDATE false, and the three quantities false — live
 * inside 0316's own sanity block, which runs at apply time.
 */
describe("Card C1b · a PO line's quantities are RPC-only", () => {
  const MIGRATIONS = join(REPO, "supabase/migrations");
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  const FIX = "0316_po_lines_quantities_are_rpc_only.sql";

  /** SQL comments stripped: 0316's own header QUOTES the rejected column-level
   *  revoke so the next reader knows why it is wrong, and a naive scan reads
   *  that quotation as the shipped statement. (This guard failed on its own
   *  first run for exactly that reason — the second time today.) */
  const sqlOf = (f: string) =>
    readFileSync(join(MIGRATIONS, f), "utf8")
      .replace(/--.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");

  it("0316 revokes the TABLE grant, not a column subset", () => {
    const sql = sqlOf(FIX);
    expect(sql).toMatch(
      /revoke\s+update\s+on\s+public\.purchase_order_lines\s+from[^;]*authenticated/i,
    );
    expect(sql).toMatch(/revoke\s+update\s+on[^;]*anon/i);
    // The correction itself: a column-scoped revoke would be a no-op against
    // the table grant, and shipping one would have looked like a fix.
    expect(sql).not.toMatch(/revoke\s+update\s*\(/i);
  });

  it("no later migration hands client roles UPDATE on purchase_order_lines back", () => {
    const after = files.filter((f) => f > FIX);
    const offenders = after.filter((f) => {
      const sql = readFileSync(join(MIGRATIONS, f), "utf8")
        .replace(/--.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "");
      return /grant[^;]*update[^;]*\bpurchase_order_lines\b[^;]*\b(authenticated|anon|public)\b/is.test(
        sql,
      );
    });
    expect(
      offenders,
      `these migrations re-open the hole 0316 closed:\n${offenders.join("\n")}\n` +
        "A PO line's quantities may only change inside an RPC that carries the " +
        "full business side-effects.",
    ).toEqual([]);
  });

  it("0316 keeps the reads and the service key — it closes a door, it does not brick the portal", () => {
    const sql = readFileSync(join(MIGRATIONS, FIX), "utf8");
    expect(sql).toMatch(/has_table_privilege\('authenticated'[^)]*'SELECT'\)/);
    expect(sql).toMatch(/has_table_privilege\('service_role'[^)]*'UPDATE'\)/);
    for (const col of ["received_qty", "damaged_qty", "wrong_item_qty"]) {
      expect(sql, `${col} must be asserted by name`).toMatch(new RegExp(col));
    }
  });
});
