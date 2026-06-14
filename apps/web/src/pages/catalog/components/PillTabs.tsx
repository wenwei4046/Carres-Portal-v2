/**
 * Segmented pill tab switcher (iOS-style). Used by the Product & Maintenance
 * shell for SKU Master / Modular / Maintenance. The active pill lifts to white
 * on a base-100 track; inactive pills are muted text. v17 tokens throughout.
 */
export interface PillTab<K extends string> {
  key: K;
  label: string;
}

export function PillTabs<K extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
}: {
  tabs: readonly PillTab<K>[];
  active: K;
  onChange: (key: K) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-1 p-1 bg-base-100 rounded-full"
    >
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            data-testid={`pm-tab-${t.key}`}
            onClick={() => onChange(t.key)}
            className={`t-small font-semibold px-4 py-1.5 rounded-full transition-colors ${
              isActive
                ? "bg-white text-base-900 shadow-sm"
                : "text-base-600 hover:text-base-900"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
