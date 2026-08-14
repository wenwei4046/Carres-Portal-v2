/**
 * SettingsWorkspace — the ERP's ONE full-page Settings Workspace.
 *
 * `docs/ui/MASTER.md` GLOBAL SETTINGS ENTRY (APPROVED / LOCKED, 2026-08-11):
 * the Page Header gear is the one Settings entry on every page; it opens a
 * compact permission-filtered launcher, **not an editing form**; and either
 * choice navigates into this Workspace at the relevant section. Business
 * values, permissions and workflow options are edited only here, where the
 * change is auditable — never inside the launcher.
 *
 * A section is a MODULE's settings, and the module owns what is in it. This
 * shell owns only the navigation between them, so a module gaining a setting
 * never has to negotiate with a second page.
 */
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import OperationPurchasingSettings from "./OperationPurchasingSettings";
import SalesOrderSettings from "./SalesOrderSettings";

const SECTIONS = [
  { slug: "sales-orders", group: "Sales Orders", label: "Sales Order Settings" },
  { slug: "purchasing", group: "Purchasing", label: "Purchasing Settings" },
] as const;

export default function SettingsWorkspace() {
  return (
    <div className="flex h-full min-h-0 bg-base-50" data-testid="settings-workspace">
      <nav className="m-5 mr-0 w-[280px] shrink-0 self-start rounded-card border border-base-200 bg-white p-3 shadow-sm" aria-label="Settings sections">
        <div className="px-3 pb-2 pt-1 text-label uppercase tracking-[0.16em] text-base-500">Settings</div>
        {SECTIONS.map((s) => (
          <div key={s.slug}>
            <div data-settings-group className="px-3 pb-1 pt-3 text-label uppercase tracking-[0.16em] text-base-500">{s.group}</div>
          <NavLink
            to={`/operation/settings/${s.slug}`}
            className={({ isActive }) =>
              `flex w-full items-center justify-between rounded-control px-3 py-2 text-left text-body transition-colors ${
                isActive ? "bg-base-900 font-medium text-white" : "text-base-800 hover:bg-base-50"
              }`
            }
            data-testid={`settings-section-${s.slug}`}
          >
            {s.label}
          </NavLink>
          </div>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-auto">
        <Routes>
          <Route index element={<Navigate to="sales-orders" replace />} />
          <Route path="sales-orders" element={<SalesOrderSettings />} />
          <Route path="purchasing" element={<OperationPurchasingSettings embedded />} />
        </Routes>
      </div>
    </div>
  );
}
