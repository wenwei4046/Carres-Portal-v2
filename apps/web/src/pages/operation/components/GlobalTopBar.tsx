/**
 * GlobalTopBar — the slim site-wide utility bar pinned to the top of every
 * operation page (Jess 2026-07-13). Right-aligned cluster only; the account menu
 * deliberately STAYS at the bottom-left of the sidebar (not moved up here).
 *
 *   Search · Jump to… — the ERP's ONE global navigate-only command surface
 *                 (ui/MASTER `JUMP TO… INTERACTION`, APPROVED / LOCKED
 *                 2026-08-11). FIRST in the cluster, because that is the order
 *                 the locked Page Header states: `Jump to…` with its keyboard
 *                 hint · Notifications · Help · System Settings.
 *   Bell · Alerts   — REAL. Derives system alerts from the live order book + tasks
 *                 feed (overdue orders · deliveries with no ETA to chase ·
 *                 escalations for Jess); the badge shows the total count.
 *   HelpCircle · Help — two-item menu (Help · Training/SOP), placeholders.
 *   Settings — the ERP's ONE Settings entry. A compact permission-filtered
 *                 launcher (current module's settings, then All System
 *                 Settings); both choices navigate into the one Settings
 *                 Workspace. It is never an editing form.
 *
 * Token classes only (design-standard §2: no raw hex in a new file).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { Bell, GraduationCap, HelpCircle, Settings } from "lucide-react";
import { useOperationOrders, type operationOrderListRow } from "@/lib/queries";
import { apiFetch } from "@/lib/api";
import { buildInfo, checkForUpdate, shortCommit, type UpdateCheck } from "@/lib/build-info";
import { TASKS_KEY } from "./rail/TasksPanel";
import JumpTo from "./JumpTo";
import type { OpsTasksListResponse } from "@carres/shared";

/** ops_order_control is sometimes an array (embed) — normalise to the row. */
function ovlOf(o: operationOrderListRow) {
  const raw = o.ops_order_control;
  return Array.isArray(raw) ? raw[0] : raw;
}
function isCompleted(o: operationOrderListRow) {
  return o.status === "delivered" || o.operation_stage === "delivered";
}
/** Days from today to the customer deadline (negative = overdue); null = TBD. */
function daysToDue(o: operationOrderListRow): number | null {
  if (o.delivery_date_tbd || !o.delivery_date) return null;
  const d = new Date(`${o.delivery_date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

/** The slim site-wide bar (other operation pages). The Orders list instead
 *  embeds <TopBarIcons /> directly in its own white header surface, so
 *  OperationApp hides this bar on /operation/orders. */
export default function GlobalTopBar() {
  return (
    <div className="shrink-0 h-11 px-4 flex items-center justify-end gap-1 border-b border-base-200 bg-white">
      <TopBarIcons />
    </div>
  );
}

/** Which module's settings the launcher offers first. A module appears only
 *  when it actually OWNS settings — an entry that opens an empty page is a
 *  promise about the product, which is the thing the old placeholder did. */
/** The Warehouse map is four `?tab=` destinations, not four pathnames
 *  (`portal-nav.ts`: Monitor · Inbound · Inventory · Outbound). The launcher
 *  reads the tab, because reading only the pathname would offer Warehouse
 *  Settings on every Operations page or on none. */
const WAREHOUSE_TABS = new Set([
  "warehouse-monitor",
  "warehouse-inbound",
  "warehouse-outbound",
  "warehouse-dashboard",
  "stock-onhand",
]);

function moduleSettingsFor(
  pathname: string,
  search = "",
): { label: string; href: string } | null {
  if (pathname.startsWith("/operation/issues")) return { label: "Issue Tracker Settings", href: "/operation/settings/issue-tracker" };
  if (pathname.startsWith("/operation/orders")) {
    return { label: "Sales Order Settings", href: "/operation/settings/sales-orders" };
  }
  if (pathname.startsWith("/operation/purchasing") || pathname.startsWith("/operation/to-order")) {
    return { label: "Purchasing Settings", href: "/operation/settings/purchasing" };
  }
  const tab = new URLSearchParams(search).get("tab") ?? "";
  if (WAREHOUSE_TABS.has(tab)) {
    return { label: "Warehouse Settings", href: "/operation/settings/warehouse/details" };
  }
  return null;
}

/** The Bell / HelpCircle / Settings cluster (Lucide, no emoji) with popovers —
 *  reusable: sits in the slim bar on most pages, and inline in the Orders
 *  header's right cluster. */
export function TopBarIcons() {
  const navigate = useNavigate();
  const location = useLocation();
  const moduleSettings = moduleSettingsFor(location.pathname, location.search);
  const { data } = useOperationOrders({});
  const orders = useMemo(() => data?.orders ?? [], [data]);
  const tasksQ = useQuery<OpsTasksListResponse>({
    queryKey: TASKS_KEY,
    queryFn: () => apiFetch("/api/ops/tasks"),
    refetchInterval: 60_000,
  });

  const alerts = useMemo(() => {
    const overdue: operationOrderListRow[] = [];
    const chase: operationOrderListRow[] = [];
    for (const o of orders) {
      if (isCompleted(o)) continue;
      const dd = daysToDue(o);
      if (dd === null) continue;
      if (dd < 0) {
        overdue.push(o);
        continue;
      }
      // "to chase" = deadline within a week + the logistic hasn't committed an ETA.
      if (dd <= 7 && !ovlOf(o)?.logistic_eta) chase.push(o);
    }
    const escalated = (tasksQ.data?.tasks ?? []).filter(
      (t) => t.escalatedAt && t.status !== "done" && t.status !== "cancelled",
    );
    return {
      overdue,
      chase,
      escalated,
      total: overdue.length + chase.length + escalated.length,
    };
  }, [orders, tasksQ.data]);

  const [open, setOpen] = useState<null | "alerts" | "help" | "settings">(null);
  /* 0430 — the Help menu's version check. null = not asked this open. */
  const [update, setUpdate] = useState<UpdateCheck | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const goOrders = () => {
    setOpen(null);
    navigate("/operation/orders");
  };

  return (
    <div ref={barRef} className="flex items-center gap-1">
      {/* Jump to… — the ONE global command surface, and the first utility in
          the locked Page Header order. It owns its own overlay and its own ⌘K
          listener, so it needs nothing from this bar's popover state: the
          three menus below are mutually exclusive with each other, never with
          a surface that takes the screen. */}
      <JumpTo />

      {/* Bell · Alerts — real counts from the order book + tasks feed. */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => (o === "alerts" ? null : "alerts"))}
          aria-label="Alerts"
          title="Alerts"
          aria-haspopup="menu"
          aria-expanded={open === "alerts"}
          className="relative p-2 rounded-md text-base-500 hover:text-base-900 hover:bg-hovertint transition-colors"
        >
          <Bell size={18} />
          {alerts.total > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-danger text-white text-label font-semibold leading-[16px] text-center">
              {alerts.total > 99 ? "99+" : alerts.total}
            </span>
          )}
        </button>
        {open === "alerts" && (
          <div className="absolute right-0 top-full mt-1 z-40 w-80 bg-card text-card-foreground border border-base-200 rounded-lg shadow-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-base-100 flex items-center justify-between">
              <span className="text-strong">Alerts</span>
              <span className="text-meta text-base-400 tabular-nums">
                {alerts.total} to action
              </span>
            </div>
            <div className="max-h-[380px] overflow-auto">
              <AlertGroup
                title="Overdue"
                tone="text-danger"
                rows={alerts.overdue}
                onOpen={goOrders}
                empty="Nothing overdue"
              />
              <AlertGroup
                title="Confirm delivery date — no date yet"
                tone="text-warning"
                rows={alerts.chase}
                onOpen={goOrders}
                empty="Every near delivery has a date"
              />
              <button
                type="button"
                onClick={goOrders}
                className="w-full px-3 py-2 flex items-center justify-between hover:bg-hovertint"
              >
                <span className="text-label uppercase tracking-[0.05em] text-info">Escalated to Jess</span>
                <span className="text-meta text-base-400 tabular-nums">
                  {alerts.escalated.length}
                </span>
              </button>
            </div>
            <button
              type="button"
              onClick={goOrders}
              className="w-full text-center py-2 text-body text-primary hover:bg-hovertint border-t border-base-100"
            >
              Open Orders
            </button>
          </div>
        )}
      </div>

      {/* HelpCircle — a two-item menu: Help · Training / SOP (both placeholders;
          the SOP library fills in later). */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => (o === "help" ? null : "help"))}
          aria-label="Help"
          title="Help"
          aria-haspopup="menu"
          aria-expanded={open === "help"}
          className="p-2 rounded-md text-base-500 hover:text-base-900 hover:bg-hovertint transition-colors"
        >
          <HelpCircle size={18} />
        </button>
        {open === "help" && (
          <div className="absolute right-0 top-full mt-1 z-40 w-56 bg-card text-card-foreground border border-base-200 rounded-lg shadow-lg py-1">
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-hovertint"
            >
              <HelpCircle size={16} className="shrink-0 text-base-400" />
              <span className="min-w-0">
                <span className="text-body text-base-800 block">Help</span>
                <span className="text-meta text-base-400 block">Coming soon</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-hovertint"
            >
              <GraduationCap size={16} className="shrink-0 text-base-400" />
              <span className="min-w-0">
                <span className="text-body text-base-800 block">Training · SOP</span>
                <span className="text-meta text-base-400 block">
                  Standard operating procedures — coming soon
                </span>
              </span>
            </button>
            {/* 0430 — the running version is IDENTIFIABLE, and updating is the
                operator's own safe click: nothing reloads on its own, so an
                unfinished form is never thrown away by a version check. */}
            <div className="border-t border-base-100 px-3 py-2" data-testid="help-version">
              <span className="text-body text-base-800 block">
                Version {shortCommit(buildInfo.commit)}
              </span>
              {buildInfo.builtAt ? (
                <span className="text-meta text-base-400 block">
                  Built {new Date(buildInfo.builtAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                </span>
              ) : null}
              {update?.state === "available" ? (
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  data-testid="help-update-reload"
                  className="mt-1.5 h-7 rounded-md border border-base-200 px-2 text-meta text-primary hover:bg-hovertint"
                >
                  Reload to update
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="help-update-check"
                  onClick={() => {
                    setUpdate(null);
                    void checkForUpdate().then(setUpdate);
                  }}
                  className="mt-1.5 h-7 rounded-md border border-base-200 px-2 text-meta text-base-600 hover:bg-hovertint"
                >
                  Check for update
                </button>
              )}
              {update?.state === "latest" ? (
                <span className="text-meta text-base-400 block mt-1">You are on the latest version</span>
              ) : update?.state === "available" ? (
                <span className="text-meta text-base-400 block mt-1">A newer version is ready</span>
              ) : update?.state === "unreachable" ? (
                <span className="text-meta text-base-400 block mt-1">The version check did not reach the server</span>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* Settings — the ERP's ONE Settings entry (docs/ui/MASTER.md GLOBAL
          SETTINGS ENTRY, APPROVED / LOCKED). A compact launcher, never an
          editing form: both choices navigate into the one Settings Workspace,
          where a change to a business value is auditable. It replaces the
          "Coming soon." placeholder that used to make a promise about the
          product on an operator's screen. */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => (o === "settings" ? null : "settings"))}
          aria-label="Settings"
          title="Settings"
          aria-haspopup="menu"
          aria-expanded={open === "settings"}
          className="p-2 rounded-md text-base-500 hover:text-base-900 hover:bg-hovertint transition-colors"
        >
          <Settings size={18} />
        </button>
        {open === "settings" && (
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 z-40 w-56 bg-card text-card-foreground border border-base-200 rounded-lg shadow-lg py-1"
            data-testid="settings-launcher"
          >
            {/* The current module's own settings come FIRST — the operator is
                already inside that module, so it is the likely destination. */}
            {moduleSettings && (
              <button
                type="button"
                role="menuitem"
                className="block w-full text-left px-3 py-1.5 text-body text-base-700 hover:bg-hovertint hover:text-base-900"
                onClick={() => {
                  setOpen(null);
                  navigate(moduleSettings.href);
                }}
                data-testid="settings-launcher-module"
              >
                {moduleSettings.label}
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className="block w-full text-left px-3 py-1.5 text-body text-base-700 hover:bg-hovertint hover:text-base-900"
              onClick={() => {
                setOpen(null);
                navigate("/operation/settings");
              }}
              data-testid="settings-launcher-all"
            >
              All System Settings
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** One alert category — a coloured label + count, then up to 5 clickable SO rows
 *  (click → the Orders list). */
function AlertGroup({
  title,
  tone,
  rows,
  onOpen,
  empty,
}: {
  title: string;
  tone: string;
  rows: operationOrderListRow[];
  onOpen: () => void;
  empty: string;
}) {
  return (
    <div className="px-3 py-2 border-b border-base-100">
      <div className="flex items-center justify-between mb-1">
        <span className={`text-label uppercase tracking-[0.05em] ${tone}`}>{title}</span>
        <span className="text-meta text-base-400 tabular-nums">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <div className="text-meta text-base-400">{empty}</div>
      ) : (
        <ul className="space-y-0.5">
          {rows.slice(0, 5).map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={onOpen}
                className="w-full text-left px-1 py-0.5 rounded hover:bg-hovertint"
              >
                <span className="text-body text-base-700 truncate block">
                  <span className="font-mono tabular-nums">SO-{o.so}</span>
                  {o.customer_name ? ` · ${o.customer_name}` : ""}
                </span>
              </button>
            </li>
          ))}
          {rows.length > 5 && (
            <li className="text-meta text-base-400 px-1">+{rows.length - 5} more</li>
          )}
        </ul>
      )}
    </div>
  );
}
