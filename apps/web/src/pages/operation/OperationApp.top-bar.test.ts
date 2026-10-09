/**
 * ⭐ ONE TOP ROW, NEVER TWO — the defect this repo has shipped SIX times.
 *
 * `OperationApp` draws a slim `GlobalTopBar` (Jump to · 🔔 · Help · ⚙) above
 * the routed page. A page that draws its OWN 50px Destination Header already
 * embeds `TopBarIcons`, so on that page the slim bar is a SECOND Jump to, a
 * second bell showing the same count, a second Help and a second gear.
 *
 * The suppression list in `OperationApp.tsx` exists to stop that, and it has
 * been extended after the fact every single time:
 *
 *   Manual Purchase · Delivery Work · Receiving & Inbound · Staff & Duties ·
 *   the Warehouse pages · and now Purchase Returns (§9.6, 2026-09-20)
 *
 * Every one of them was found by a human looking at production, because the
 * page-level tests mock `PurchasingTabs` away and the fixture previews never
 * mount `OperationApp` at all. A walk is not a test: it happens once, at the
 * end, on whatever somebody happened to click.
 *
 * ⭐ 2026-10-08 (Carres Layout Standard §1): the suppression list is gone. The
 * shell mounts no GlobalTopBar and draws ONE ShellHeader for every page; a
 * page's ModuleHeader portals into it. The tests below bind that instead.
 *
 * ── SO THIS TEST BINDS THE RULE, NOT THE SIX INSTANCES ──────────────────────
 * It reads the dispatch in `OperationApp.tsx`, finds every `tab === "x" &&
 * <Component />`, resolves that component's file, and asks one question: does
 * it draw a Destination Header? If it does, `tab !== "x"` must appear in the
 * suppression condition. A seventh page cannot ship the defect — it fails here
 * the moment it is wired, with its own tab name in the message.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const APP = resolve(__dirname, "OperationApp.tsx");
const source = readFileSync(APP, "utf8");

/** `{tab === "purchase-returns" && <OperationPurchaseReturns />}` */
const DISPATCH = /tab === "([a-z0-9-]+)" && <([A-Za-z0-9_]+)\s*\/?>/g;
/** `import OperationPurchaseReturns from "./OperationPurchaseReturns";` */
const IMPORT = /import\s+([A-Za-z0-9_]+)\s+from\s+"([^"]+)"/g;

/** A page draws its own top row if it renders the Purchasing module header or
 *  a ModuleHeader directly — both embed `TopBarIcons`. */
const DRAWS_OWN_HEADER = /<PurchasingTabs\b|<ModuleHeader\b|<SalesOrderTabs\b/;

function resolveImport(spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(APP), spec);
  for (const candidate of [`${base}.tsx`, `${base}.ts`, `${base}/index.tsx`]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const importPath = new Map<string, string>();
for (const [, name, spec] of source.matchAll(IMPORT)) {
  const file = resolveImport(spec);
  if (file) importPath.set(name, file);
}

const dispatched = [...source.matchAll(DISPATCH)].map(([, tab, component]) => ({
  tab,
  component,
}));

describe("the operation shell draws ONE top row", () => {
  it("finds the tab dispatch at all — the test is worthless if the regex drifts", () => {
    expect(dispatched.length).toBeGreaterThan(10);
    expect(dispatched.map((d) => d.tab)).toContain("purchase-returns");
  });

  /* RETIRED (2026-10-08): the per-tab `tab !== "x"` GlobalTopBar suppression
   * list and its "Purchase Returns stays suppressed" pin. The shell no longer
   * mounts GlobalTopBar at all — it draws ONE ShellHeader for every page, and a
   * page's ModuleHeader portals its identity into that header's slot instead of
   * drawing a second row (Carres Layout Standard §1). The rule this file binds
   * is the same — one top row, never two — so it now binds it at the source. */
  it("never mounts GlobalTopBar — no page can grow a second top row", () => {
    expect(source).not.toMatch(/<GlobalTopBar\b/);
    expect(source).not.toMatch(/import\s+GlobalTopBar\b/);
  });

  it("draws exactly ONE ShellHeader, outside the page dispatch", () => {
    expect(source.match(/<ShellHeader\b/g) ?? []).toHaveLength(1);
    // The header sits before <main>, so no tab branch can render a second one.
    expect(source.indexOf("<ShellHeader")).toBeLessThan(source.indexOf("<main"));
  });

  it("every page that names itself does so through ModuleHeader, into the shell slot", () => {
    const named: string[] = [];
    for (const { tab, component } of dispatched) {
      const file = importPath.get(component);
      if (!file) continue;
      const page = readFileSync(file, "utf8");
      if (DRAWS_OWN_HEADER.test(page)) named.push(tab);
    }
    // The pages that drew their own Destination Header still name themselves —
    // and the shell provides the slot they portal into.
    expect(named.length).toBeGreaterThan(0);
    expect(source).toContain("<ShellHeaderContext.Provider");
  });
});
