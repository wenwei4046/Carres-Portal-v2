/**
 * ⭐ THE SALES ORDER'S DOOR INTO THE COLLECTIONS DESK — owner ruling 2026-08-15.
 *
 * A door, never a duplicate (ownership Law C): the Sales Order SUMMARISES
 * money and may never gain a form for it, so the one thing its MONEY card adds
 * is the way OUT — to the desk that owns collection, already scoped.
 *
 * This is a SOURCE contract, held here because the desk is a 1,600-line page
 * whose data hook talks to the network: mounting it to assert a URL parameter
 * would test the mock, not the rule. What must not drift is (a) the scope is
 * read from the URL and narrows rows, (b) it beats the `To collect` view, and
 * (c) it is clearable through the same chip every other narrowing uses.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const payments = readFileSync(join(here, "OperationPayments.tsx"), "utf8");
const workspace = readFileSync(join(here, "SalesOrderWorkspace.tsx"), "utf8");

describe("Payments · the Sales Order scope", () => {
  it("reads the scope from the URL and narrows the desk to that order", () => {
    expect(payments).toContain('const scopedSo = params.get("so")');
    expect(payments).toContain("rows.filter((r) => String(r.so) === scopedSo)");
  });

  it("overrides `To collect` — a settled order must not open to an empty desk", () => {
    /* The scope is checked BEFORE the view, so an order that owes nothing
       still appears. "The order you asked for is not here" is the one answer
       a door may not give. */
    const scopeLine = payments.indexOf("if (scopedSo) return rows.filter");
    const viewLine = payments.indexOf('return view === "all" ? rows : rows.filter(isOwingRow)');
    expect(scopeLine).toBeGreaterThan(-1);
    expect(viewLine).toBeGreaterThan(scopeLine);
  });

  it("is clearable through the same chip as every other narrowing", () => {
    expect(payments).toContain("label: `Sales Order SO-${scopedSo}`");
    expect(payments).toContain('next.delete("so")');
  });

  it("is the door the Sales Order MONEY card opens, and it carries the SO number", () => {
    expect(workspace).toContain("`/operation?tab=payments&so=${order.so}`");
  });
});
