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
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import StaffDuties from "./StaffDuties";
import ActivitySettings from "./staff-duties/ActivitySettings";
import OperationPurchasingSettings from "./OperationPurchasingSettings";
import SalesOrderSettings from "./SalesOrderSettings";
import IssueTrackerSettings from "./IssueTrackerSettings";
import PaymentSettings from "./PaymentSettings";
import WarehouseSettings, { WAREHOUSE_SETTINGS_SECTIONS } from "./WarehouseSettings";
import DeliverySettings from "./DeliverySettings";
import AppearanceSettings from "./AppearanceSettings";
import CompanySettings from "./settings-core/CompanySettings";
import OfficeSettings from "./settings-core/OfficeSettings";
import SettingsEditors from "./settings-core/SettingsEditors";
import { DELIVERY_SETTINGS_SECTIONS } from "@carres/shared";

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
  /* Personal · Appearance — each person's own theme and focus outline (01 §9,
     COPY "Personal Appearance"). */
  { group: "Personal", items: [{ slug: "appearance", label: "Appearance" }] },
  /* Carres Settings List COM · OFF · TEAM-02 (owner confirmed 9 Oct 2026):
     the company identity, the one Office calendar, and who may edit which
     section. */
  { group: "Company", items: [{ slug: "company", label: "Company" }] },
  { group: "Office", items: [{ slug: "office", label: "Office" }] },
  { group: "Team and access", items: [{ slug: "settings-editors", label: "Settings editors" }] },
  { group: "Staff & Duties", items: [{ slug: "staff-duties", label: "Staff & Duties" }] },
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
  /* 【DELIVERY】 CARD 12 — one `Delivery` group of four rows (Delivery MASTER
     §11): `Logistics Partners` · `Delivery Rules` · `Message Templates` ·
     `Access`, on the Warehouse Settings grammar. */
  {
    group: "Delivery",
    items: DELIVERY_SETTINGS_SECTIONS.map((s) => ({
      slug: `delivery/${s.slug}`,
      label: s.label,
    })),
  },
] as const;

/** The section a Settings address names, for the shell header's
 *  `Settings / {section}` (Layout Standard §1). */
export function settingsSectionLabel(pathname: string): string | null {
  const rest = pathname.replace(/^\/operation\/settings\/?/, "");
  for (const group of SECTIONS) {
    for (const item of group.items) {
      if (rest === item.slug || rest.startsWith(`${item.slug}/`)) return item.label;
    }
  }
  return null;
}

/** One browser's own choice. Never a server preference — it is a view state. */
const SETTINGS_RAIL_STORAGE_KEY = "ops-settings-rail";

export default function SettingsWorkspace() {
  const location = useLocation();
  const dutiesPage = location.pathname.endsWith("/staff-duties");
  const [dutyRailOpen, setDutyRailOpen] = useState(false);
  const [savedRailOpen, setRailOpen] = useState(() => {
    try {
      return localStorage.getItem(SETTINGS_RAIL_STORAGE_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const railOpen = dutiesPage ? dutyRailOpen : savedRailOpen;
  const setRailVisible = (open: boolean) => {
    if (dutiesPage) { setDutyRailOpen(open); return; }
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
          className={`relative flex ${dutiesPage ? "w-full lg:w-[240px]" : "w-[240px]"} min-h-0 shrink-0 flex-col gap-5 overflow-y-auto border-r border-kit-slate-5 bg-white p-3`}
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
                  to={`/operation/settings/${item.slug}${dutiesPage && item.slug === "staff-duties" ? location.search : ""}`}
                  state={item.slug === "staff-duties" ? location.state : undefined}
                  onClick={() => setDutyRailOpen(false)}
                  className={({ isActive }) =>
                    [
                      "relative flex min-h-[36px] w-full items-start gap-2 rounded-control px-2 py-[9px] text-left text-body",
                      isActive
                        ? "bg-c-select-bg text-c-select-fg font-semibold"
                        : "text-kit-slate-11 hover:bg-kit-slate-3 hover:text-kit-slate-12",
                    ].join(" ")
                  }
                  data-testid={`settings-section-${item.slug.replace("/", "-")}`}
                >
                  {() => (
                    <>
                      <span className="min-w-0 flex-1">{item.label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      )}

      <div className={`min-w-0 min-h-0 flex-1 overflow-auto ${dutiesPage && railOpen ? "hidden lg:block" : ""}`}>
        {!railOpen && !dutiesPage && (
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
          <Route path="staff-duties" element={<StaffDuties activitySettings={<ActivitySettings />} settingsNavigation={!railOpen ? (
            <button type="button" aria-label="Show settings" title="Show settings" data-testid="settings-show-rail"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-control border border-kit-slate-6 bg-white text-kit-slate-11 hover:bg-kit-slate-3 hover:text-kit-slate-12"
              onClick={() => setRailVisible(true)}>
              <PanelLeftOpen size={16} strokeWidth={1.75} aria-hidden />
            </button>
          ) : undefined} />} />
          <Route index element={<Navigate to="sales-orders" replace />} />
          <Route path="appearance" element={<AppearanceSettings />} />
          <Route path="company" element={<CompanySettings />} />
          <Route path="office" element={<OfficeSettings />} />
          <Route path="settings-editors" element={<SettingsEditors />} />
          <Route path="sales-orders" element={<SalesOrderSettings />} />
          <Route path="purchasing" element={<OperationPurchasingSettings embedded />} />
          <Route path="payment" element={<PaymentSettings />} />
          <Route path="issue-tracker" element={<IssueTrackerSettings />} />
          <Route path="warehouse" element={<Navigate to="details" replace />} />
          <Route path="warehouse/:section" element={<WarehouseSettings />} />
          <Route path="delivery" element={<Navigate to="partners" replace />} />
          <Route path="delivery/partners/:partnerId/:partnerSection?" element={<DeliverySettings />} />
          <Route path="delivery/:section" element={<DeliverySettings />} />
        </Routes>
      </div>
    </div>
  );
}
