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
    // …and the one that replaced it is there.
    expect(pos).toMatch(/operationPosRouter\.post\("\/:id\/office-receive"/);
  });

  it("every Office receiving call in the web app goes through office-receive", () => {
    const officeCallers = SOURCES.filter((f) => /office-receive/.test(code(f)));
    // The hook that owns the door, and nothing else in pages/**.
    expect(officeCallers.map((f) => f.replace(WEB_SRC + "/", "")).sort()).toEqual([
      "lib/queries.ts",
    ]);
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

  it("only the three Session-opening RPCs may move received_qty from the API", () => {
    // `operation_receive_po_with_do` is the ONE receive engine and stays —
    // but nothing may call it except the doors that open a Session first, plus
    // the PARTNER leg, which is not an Office path.
    const api = slash(join(REPO, "apps/api/src"));
    const files = walk(api).filter((f) => /\.ts$/.test(f));
    const direct = files.filter((f) =>
      /rpc\("operation_receive_po_with_do"/.test(code(f)),
    );
    expect(direct.map((f) => f.replace(api + "/", "")).sort()).toEqual([
      // The partner confirming goods AT a warehouse — a different leg, and
      // out of Card C1's frozen scope (Office only). Named here so the next
      // chat inherits the fact instead of re-deriving it.
      "routes/partner/pickups.ts",
    ]);
  });
});
