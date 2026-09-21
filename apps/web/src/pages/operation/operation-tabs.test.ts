/**
 * The not-found answer is only honest while `OPERATION_TABS` names exactly the
 * pages OperationApp draws. A source scan, because a render test sees only the
 * tab its fixture opens.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { OPERATION_TABS, isOperationTab } from "./operation-tabs";
import { PORTAL_NAV, navItemHref } from "@/pages/portal/portal-nav";

const here = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(join(here, "OperationApp.tsx"), "utf8");
const PATH_DRIVEN = new Set(["procurement", "orders"]);

describe("OPERATION_TABS", () => {
  it("names exactly the tabs OperationApp renders", () => {
    const rendered = new Set(
      [...appSource.matchAll(/tab === "([a-z0-9-]+)"/g)].map((m) => m[1]!),
    );
    const listed = [...OPERATION_TABS].filter((t) => !PATH_DRIVEN.has(t)).sort();
    expect(listed).toEqual([...rendered].filter((t) => !PATH_DRIVEN.has(t)).sort());
  });

  it("covers every sidebar link into /operation?tab=", () => {
    /* A `soon` entry is a non-control with no link (`Coming soon`). */
    const hrefs = PORTAL_NAV.flatMap((g) =>
      g.items.filter((i) => !i.soon).map((i) => navItemHref(g, i)),
    );
    const tabs = hrefs
      .filter((h) => h.startsWith("/operation?tab="))
      .map((h) => new URL(h, "https://erp.test").searchParams.get("tab")!);
    expect(tabs.length).toBeGreaterThan(0);
    for (const tab of tabs) expect(isOperationTab(tab), tab).toBe(true);
  });

  it("does not answer an address no page owns", () => {
    expect(isOperationTab("purchase-orders")).toBe(false);
    expect(isOperationTab("")).toBe(false);
  });
});
