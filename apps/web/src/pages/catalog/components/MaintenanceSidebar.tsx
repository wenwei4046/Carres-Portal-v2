/**
 * MaintenanceSidebar (0201) — the left rail shared by the Maintenance and
 * Special Add-ons tabs, mirroring the 2990s Products reference layout: grouped
 * nav items with per-section counts; the active item inverts to ink. The right
 * panel is owned by the tab (only ONE section renders at a time).
 */
export interface MaintenanceSidebarItem<K extends string> {
  key: K;
  label: string;
  /** Shown as “(n)” after the label; omit for sections without a natural count. */
  count?: number;
}

export interface MaintenanceSidebarGroup<K extends string> {
  title: string;
  items: MaintenanceSidebarItem<K>[];
}

export default function MaintenanceSidebar<K extends string>({
  groups,
  active,
  onChange,
}: {
  groups: MaintenanceSidebarGroup<K>[];
  active: K;
  onChange: (key: K) => void;
}) {
  return (
    <aside className="w-[250px] shrink-0 bg-white border border-base-200 rounded-[4px] p-3">
      {groups.map((g) => (
        <div key={g.title} className="mb-3 last:mb-0">
          <div className="t-micro text-base-400 uppercase tracking-[0.18em] px-2 pt-1.5 pb-1.5">
            {g.title}
          </div>
          <div className="flex flex-col gap-0.5">
            {g.items.map((it) => {
              const isActive = active === it.key;
              return (
                <button
                  key={it.key}
                  type="button"
                  onClick={() => onChange(it.key)}
                  aria-current={isActive ? "true" : undefined}
                  className={`flex items-center justify-between w-full text-left px-3 py-2 rounded-[4px] text-[13px] transition-colors ${
                    isActive
                      ? "bg-base-900 text-white font-medium"
                      : "text-base-700 hover:bg-base-100"
                  }`}
                  data-testid={`maint-nav-${it.key}`}
                >
                  <span className="truncate">{it.label}</span>
                  {it.count != null && (
                    <span
                      className={`t-tiny tabular-nums ml-2 shrink-0 ${
                        isActive ? "text-white/70" : "text-base-400"
                      }`}
                    >
                      ({it.count})
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </aside>
  );
}
