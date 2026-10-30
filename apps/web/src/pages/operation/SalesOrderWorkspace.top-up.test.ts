/**
 * A PLACED ORDER CAN BE TOPPED UP FROM ITS OWN PAGE (full-cycle prod test,
 * 30 Oct 2026: SO-1374 sat at Placed with a 21% deposit and the Sales Order
 * page offered no way to record more money; the Payments desk records only
 * against an invoice, and a Placed order has none).
 *
 * The page opens the ONE payment form the old drawer already uses — same
 * fields, same proof upload, same `useRecordPayment` door — so there is still
 * one path (Law C). Who may record is the API's rule: operation, principal,
 * finance.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canTopUpPayment } from "./SalesOrderWorkspace";

const here = dirname(fileURLToPath(import.meta.url));
const workspace = readFileSync(join(here, "SalesOrderWorkspace.tsx"), "utf8");
const drawer = readFileSync(join(here, "components/OrderDetailDrawer.tsx"), "utf8");

describe("SalesOrderWorkspace — top-up payment on a Placed order", () => {
  it("offers it to the roles the payment API admits, while money is owed", () => {
    for (const role of ["operation", "principal", "finance"] as const) {
      expect(canTopUpPayment(role, { known: true, outstanding: 790 })).toBe(true);
    }
  });

  it("never to a role the API refuses", () => {
    for (const role of ["warehouse", "dealer", null] as const) {
      expect(canTopUpPayment(role, { known: true, outstanding: 790 })).toBe(false);
    }
  });

  it("not when nothing is owed or the price is unknown", () => {
    expect(canTopUpPayment("operation", { known: true, outstanding: 0 })).toBe(false);
    expect(canTopUpPayment("operation", { known: false, outstanding: 790 })).toBe(false);
  });

  it("reuses the drawer's one payment form, never a second one", () => {
    expect(drawer).toMatch(/export function AddPaymentModal\(/);
    expect(workspace).toMatch(/import \{ AddPaymentModal \} from "\.\/components\/OrderDetailDrawer";/);
    expect(workspace).toMatch(/<AddPaymentModal orderId=\{order\.id\}/);
    expect(workspace).not.toMatch(/useRecordPayment/);
    expect(workspace).toMatch(/data-testid="so-add-payment"/);
  });
});
