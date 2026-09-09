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
 *
 * THE RAIL IS THE GOVERNED CARRES RAIL (owner correction, 2026-09-09).
 * It used to be a 280px floating rounded card with a shadow and a near-black
 * active pill — a fifth visual language for a row that does exactly what every
 * other Carres rail row does. It now draws the locked shell and `NavRow`
 * treatment of `docs/ui/MASTER.md` LOCAL FILTER RAIL / LOCAL RAIL ACTIVE ROW:
 * 240px, flush left, one straight right divider, no card and no radius on the
 * container, `blue-3` wash with a straight 2px `blue-9` line inset left on the
 * active row, slate hover on the rest.
 *
 * It also HIDES, under the same law: hiding gives the whole width to the
 * settings page and leaves NO second 60px icon strip beside the Portal
 * sidebar; the content then carries `Show settings`; and the choice is
 * remembered for that staff browser. The icon family is the Portal sidebar's
 * governed panel-left pair, never a chevron, an `X` or a text link.
 */
import { useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import OperationPurchasingSettings from "./OperationPurchasingSettings";
import SalesOrderSettings from "./SalesOrderSettings";
import IssueTrackerSettings from "./IssueTrackerSettings";
import PaymentSettings from "./PaymentSettings";
import WarehouseSettings, { WAREHOUSE_SETTINGS_SECTIONS } from "./WarehouseSettings";

/**
 * A GROUP MAY OWN MORE THAN ONE ROW (Warehouse, 2026-09-09).
 *
 * Every module before Warehouse had exactly one settings page, so the rail was
 * written as one row per group. Warehouse Settings is five sections of ONE
 * page — `Warehouse Details · Working Hours · Public Holidays · Special Dates
 * · Access` — and they are sections of the module's settings, not five module
 * settings pages. So the group carries its rows; the shell still owns nothing
 * but the navigation between them.
 */
const SECTIONS = [
  { group: "Sales Orders", items: [{ slug: "sales-orders", label: "Sales Order Settings" }] },
  { group: "Purchasing", items: [{ slug: "purchasing", label: "Purchasing Settings" }] },
  { group: "Payment", items: [{ slug: "payment", label: "Payment Settings" }] },
  { group: "Issue Tracker", items: [{ slug: "issue-tracker", label: "Issue Tracker Settings" }] },
  {
    group: "Warehouse",
    items: WAREHOUSE_SETTINGS_SECTIONS.map((s) => ({
      slug: `warehouse/${s.slug}`,
      label: s.label,
    })),
  },
] as const;

/** One browser's own choice. Never a server preference — it is a view state. */
const SETTINGS_RAIL_STORAGE_KEY = "ops-settings-rail";

export default function SettingsWorkspace() {
  const [railOpen, setRailOpen] = useState(() => {
    try {
      return localStorage.getItem(SETTINGS_RAIL_STORAGE_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const setRailVisible = (open: boolean) => {
    setRailOpen(open);
    try {
      localStorage.setItem(SETTINGS_RAIL_STORAGE_KEY, open ? "1" : "0");
    } catch {
      /* Storage may be unavailable; the live state still works. */
    }
  };

  return (
    <div className="flex h-full min-h-0 bg-base-50" data-testid="settings-workspace">
      {railOpen && (
        <nav
          className="relative flex w-[240px] min-h-0 shrink-0 flex-col gap-5 overflow-y-auto border-r border-kit-slate-5 bg-white p-3"
          aria-label="Settings sections"
          data-testid="settings-rail"
        >
          <button
            type="button"
            onClick={() => setRailVisible(false)}
            aria-label="Hide settings"
            title="Hide settings"
            data-testid="settings-hide-rail"
            className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-control border border-kit-slate-6 bg-white text-kit-slate-11 hover:bg-kit-slate-3 hover:text-kit-slate-12"
          >
            <PanelLeftClose size={16} strokeWidth={1.75} aria-hidden />
          </button>

          <div>
            <div className="flex items-center px-1.5">
              <span className="text-label font-semibold uppercase tracking-wide text-kit-slate-9">
                Settings
              </span>
            </div>
          </div>

          {SECTIONS.map((s) => (
            <div key={s.group}>
              <div className="flex items-center px-1.5 pb-1">
                {/* `data-settings-group` stays on the element that CARRIES the
                    text — the shipped navigation test selects on it. */}
                <span
                  data-settings-group
                  className="text-label font-semibold uppercase tracking-wide text-kit-slate-9"
                >
                  {s.group}
                </span>
              </div>
              {s.items.map((item) => (
                <NavLink
                  key={item.slug}
                  to={`/operation/settings/${item.slug}`}
                  className={({ isActive }) =>
                    [
                      "relative flex min-h-[36px] w-full items-start gap-2 rounded-control px-2 py-[9px] text-left text-body",
                      isActive
                        ? "bg-kit-blue-3 text-kit-slate-12 font-semibold"
                        : "text-kit-slate-11 hover:bg-kit-slate-3 hover:text-kit-slate-12",
                    ].join(" ")
                  }
                  data-testid={`settings-section-${item.slug.replace("/", "-")}`}
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span
                          aria-hidden
                          className="absolute left-0 top-1 bottom-1 w-0.5 bg-kit-blue-9"
                        />
                      )}
                      <span className="min-w-0 flex-1">{item.label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {!railOpen && (
          <div className="px-9 pt-6">
            <button
              type="button"
              aria-label="Show settings"
              title="Show settings"
              data-testid="settings-show-rail"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-control border border-kit-slate-6 bg-white text-kit-slate-11 hover:bg-kit-slate-3 hover:text-kit-slate-12"
              onClick={() => setRailVisible(true)}
            >
              <PanelLeftOpen size={16} strokeWidth={1.75} aria-hidden />
            </button>
          </div>
        )}
        <Routes>
          <Route index element={<Navigate to="sales-orders" replace />} />
          <Route path="sales-orders" element={<SalesOrderSettings />} />
          <Route path="purchasing" element={<OperationPurchasingSettings embedded />} />
          <Route path="payment" element={<PaymentSettings />} />
          <Route path="issue-tracker" element={<IssueTrackerSettings />} />
          <Route path="warehouse" element={<Navigate to="details" replace />} />
          <Route path="warehouse/:section" element={<WarehouseSettings />} />
        </Routes>
      </div>
    </div>
  );
}
