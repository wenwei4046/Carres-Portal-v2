import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ClipboardList } from "lucide-react";
import ModuleHeader from "./components/ModuleHeader";

/**
 * SalesOrderTabs — the ONE fixed header row of the Sales Order module
 * (STAGE 2 MODULE SHELL, decided in BUILD-QUEUE; the Purchasing pattern,
 * copied not re-invented: "壳画头" — the shell draws the header, pages never
 * do).
 *
 * The module word is **`Sales Order`** (singular) — verified against 2990's
 * own breadcrumb (`Home > Sales Order > Sales Orders`): SALES ORDER is the
 * module / document-family name. Never shortened to "Sales". The left
 * navigation keeps saying "Sales Orders"; only this in-page word changes.
 *
 * TAB ROW, today: `[Sales Orders]` alone. Amendments joins in Stage 3.
 * **Do NOT pre-create** Delivery Orders / Sales Invoices / Delivery Returns
 * tabs — whether Carres becomes document-family navigation or keeps module
 * ownership is NOT frozen; decide when the matching lifecycle is built.
 *
 * The `right` slot is the page-meta slot — the workspace parks `Print PDF` /
 * `Back to register` here, BEFORE the global icons, so the cluster order is
 * stable on every tab.
 */
export default function SalesOrderTabs({
  right,
  docTitle,
}: {
  right?: ReactNode;
  /** Page-specific browser-tab title; defaults to the register's. */
  docTitle?: string;
} = {}) {
  return (
    <ModuleHeader
      testId="sales-order-tabs"
      icon={ClipboardList}
      word="Sales Order"
      docTitle={docTitle ?? "Sales Orders · Sales Order — Carres"}
      right={right}
    >
      <div
        className="flex gap-1 h-full min-w-0 overflow-x-auto"
        role="tablist"
        aria-label="Sales Order"
      >
        <Link
          to="/operation/orders"
          role="tab"
          aria-selected={true}
          data-testid="sales-order-tab-sales-orders"
          className="relative flex items-center gap-1.5 px-4 h-full whitespace-nowrap text-body transition-colors border-b-2 -mb-px border-kit-blue-9 text-base-900 font-semibold"
        >
          <ClipboardList size={14} strokeWidth={2} className="text-kit-blue-9" />
          Sales Orders
        </Link>
      </div>
    </ModuleHeader>
  );
}
