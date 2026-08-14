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
  { slug: "sales-orders", label: "Sales Orders" },
  { slug: "purchasing", label: "Purchasing" },
] as const;

export default function SettingsWorkspace() {
  return (
    <div className="flex h-full min-h-0" data-testid="settings-workspace">
      <nav className="w-56 shrink-0 border-r border-base-200 bg-white py-4">
        <div className="px-4 pb-2 text-label text-base-500">System Settings</div>
        {SECTIONS.map((s) => (
          <NavLink
            key={s.slug}
            to={`/operation/settings/${s.slug}`}
            className={({ isActive }) =>
              `block px-4 py-1.5 text-body ${
                isActive ? "text-base-900 font-medium" : "text-base-600 hover:text-base-900"
              }`
            }
            data-testid={`settings-section-${s.slug}`}
          >
            {s.label}
          </NavLink>
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
