import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import CarresLockup from "@/components/CarresLockup";
import NavBadge from "@/components/NavBadge";
import { useOperationBadges, useMarkOperationBadgeSeen } from "@/lib/queries";

/**
 * operation sidebar — Jess redesign 2026-06-08.
 *
 * Collapsed to **6 top-level menus** (Dashboard · Orders · Receiving · Stock ·
 * Catalog · Cases). Sub-views are shown as a nested list under the ACTIVE menu
 * only — so by default the rail reads as 6 items instead of the old 8-group /
 * 16-entry wall. The underlying routing keys are UNCHANGED (OperationApp still
 * dispatches on the same keys), so this is a pure navigation reorg with no
 * routing risk. Renames per the agreed model: Procurement→Receiving,
 * Repair→Defective, Warehouse→On Hand, AutoCount/Klang-Stock/Network groups
 * dissolved into Orders / Stock / Catalog.
 *
 * NOTE: deeper consolidation (Orders → one control grid with status tabs;
 * Stock → On Hand + Movements with Ready/Reserved/Defective as filters; Cases →
 * Issues/Refunds) lands when each page is rebuilt. This step only reframes nav.
 */
interface Leaf {
  /** routing key consumed by OperationApp (unchanged) */
  key: string;
  label: string;
}
interface Section {
  /** stable id for expand state (top-level row) */
  id: string;
  label: string;
  icon: string;
  /** leaf section: a single routing key; parent section: children */
  key?: string;
  children?: Leaf[];
  /** extra routing keys that belong to this section for highlight purposes but
   *  aren't shown as their own nav rows (e.g. the AutoCount import page lives
   *  under Orders but is reached via an in-page button, not a sidebar child). */
  extraKeys?: string[];
  /** badge counter key, if this menu carries an unread count */
  badge?: "orders" | "procurement" | "service-notes";
}

const SECTIONS: Section[] = [
  { id: "dashboard", label: "Dashboard", icon: "◆", key: "dashboard" },
  {
    // Jess redesign step 2 — Orders is now ONE control table
    // (OperationOrdersControl). Status filtering (Placed/Proceed/Pending/
    // Scheduled/Completed/All) + AutoCount import live in-page, so the old
    // Inbox / All orders / Import sub-rows are gone. extraKeys keeps the Orders
    // row highlighted when the import page (or legacy inbox/all-orders routes)
    // mounts.
    id: "orders",
    label: "Orders",
    icon: "▣",
    key: "orders",
    badge: "orders",
    extraKeys: ["ops-import", "ops-inbox", "all-orders"],
  },
  {
    id: "receiving",
    label: "Receiving",
    icon: "▦",
    key: "procurement",
    badge: "procurement",
  },
  {
    // Jess redesign step 3 — Stock is now On Hand (one per-unit list with
    // Ready/Reserved/Defective filter CHIPS) + Movements. The old Ready /
    // Reserved / Defective / Inventory sub-rows collapse into On Hand's chips
    // (Inventory → the "All" chip, dropped as a standalone). The per-SKU
    // "On Hand"(warehouse) + "All warehouses"(stock) views are de-routed but
    // kept mounted — the dashboard low-stock tile still deep-links to
    // `warehouse`. extraKeys keeps the Stock highlight when any mount.
    id: "stock",
    label: "Stock",
    icon: "□",
    children: [
      { key: "stock-onhand", label: "On Hand" },
      { key: "movements", label: "Movements" },
    ],
    extraKeys: [
      "warehouse",
      "ops-ready",
      "ops-reserved",
      "ops-repair",
      "ops-inventory",
      "stock",
    ],
  },
  {
    id: "catalog",
    label: "Catalog",
    icon: "▭",
    children: [
      { key: "catalog", label: "SKU" },
      { key: "suppliers", label: "Suppliers" },
    ],
  },
  {
    id: "cases",
    label: "Cases",
    icon: "✎",
    badge: "service-notes",
    children: [{ key: "service-notes", label: "Service Notes" }],
  },
];

/** All routing keys that belong to a section (leaf key + children keys). */
function sectionKeys(s: Section): string[] {
  const ks: string[] = [];
  if (s.key) ks.push(s.key);
  if (s.children) ks.push(...s.children.map((c) => c.key));
  if (s.extraKeys) ks.push(...s.extraKeys);
  return ks;
}

interface Props {
  active: string;
  onChange: (k: string) => void;
}

export default function OperationSidebar({ active, onChange }: Props) {
  const session = useAuth((s) => s.session);
  const email = session?.user?.email ?? "";
  const initials = email.slice(0, 2).toUpperCase();

  // Badge counts (Loo 2026-05-10/0152) — failures degrade silently to 0.
  const badgesQ = useOperationBadges();
  const lpRejected = badgesQ.data?.lpRejected ?? 0;
  const badgeCount: Record<string, number> = {
    orders: (badgesQ.data?.orders ?? 0) + lpRejected,
    procurement: badgesQ.data?.procurement ?? 0,
    "service-notes": badgesQ.data?.serviceNotes ?? 0,
  };
  const markSeen = useMarkOperationBadgeSeen();

  function fireMarkSeen(key: string) {
    if (key === "orders" || key === "procurement") {
      if ((badgeCount[key] ?? 0) > 0)
        markSeen.mutate(key as "orders" | "procurement");
    }
    // 0152 — clicking into Orders also clears the LP-rejected unread count.
    if (key === "orders" && lpRejected > 0) markSeen.mutate("lp_rejected");
  }

  // Which section owns the currently-active routing key → that one expands.
  const activeSectionId =
    SECTIONS.find((s) => sectionKeys(s).includes(active))?.id ?? "dashboard";

  function clickSection(s: Section) {
    if (s.key) {
      onChange(s.key);
      if (s.badge) fireMarkSeen(s.badge === "service-notes" ? "service-notes" : s.badge);
    } else if (s.children && s.children.length > 0) {
      const first = s.children[0].key;
      onChange(first);
      if (s.badge) fireMarkSeen(s.badge === "service-notes" ? "service-notes" : s.badge);
    }
  }

  return (
    <aside
      className="bg-white border-r border-base-200 py-5 flex flex-col h-screen sticky top-0"
      style={{ width: 232 }}
    >
      <div className="px-[22px] pb-[18px]">
        <button
          onClick={() => onChange("dashboard")}
          className="block text-left bg-transparent border-0 p-0 cursor-pointer"
          title="Back to dashboard"
        >
          <CarresLockup showPortal={false} />
        </button>
      </div>

      <nav className="flex-1 px-3 pt-3 pb-1 flex flex-col gap-0.5 overflow-auto">
        {SECTIONS.map((s) => {
          const isActiveSection = activeSectionId === s.id;
          const isLeafActive = s.key != null && active === s.key;
          const baseCls =
            "relative w-full text-left px-3.5 py-[9px] rounded text-[13px] flex items-center gap-[11px]";
          const cls =
            isActiveSection
              ? `${baseCls} bg-base-100 text-base-900 font-semibold cursor-pointer`
              : `${baseCls} text-base-600 font-medium hover:bg-base-50 cursor-pointer`;
          return (
            <div key={s.id}>
              <button type="button" onClick={() => clickSection(s)} className={cls}>
                {(isActiveSection || isLeafActive) && (
                  <span
                    className="absolute left-0 top-[7px] bottom-[7px] bg-primary rounded-r-sm"
                    style={{ width: 3 }}
                  />
                )}
                <span
                  className={`w-4 text-center text-[13px] ${
                    isActiveSection ? "text-primary" : "text-base-400"
                  }`}
                >
                  {s.icon}
                </span>
                <span className="flex-1">{s.label}</span>
                {s.badge && <NavBadge count={badgeCount[s.badge] ?? 0} label={s.label} />}
              </button>

              {/* Children of the active parent section only. */}
              {isActiveSection && s.children && (
                <div className="mt-0.5 mb-1 ml-[26px] flex flex-col gap-px border-l border-base-200 pl-2">
                  {s.children.map((c) => {
                    const childActive = active === c.key;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => onChange(c.key)}
                        className={`text-left px-2.5 py-[7px] rounded text-[12.5px] ${
                          childActive
                            ? "bg-base-100 text-base-900 font-semibold"
                            : "text-base-600 font-medium hover:bg-base-50"
                        }`}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <Link
        to="/me"
        title="Profile · Sign out"
        className="px-[22px] py-4 border-t border-base-100 flex items-center gap-2.5 hover:bg-base-50 transition-colors"
      >
        <div className="w-[34px] h-[34px] rounded-full bg-base-900 text-white grid place-items-center text-[11px] font-semibold">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-base-900 truncate">{email}</div>
          <div className="text-[9.5px] text-base-500 uppercase tracking-[0.1em] mt-px">
            operation
          </div>
        </div>
      </Link>
    </aside>
  );
}
